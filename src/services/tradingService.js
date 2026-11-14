const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const market = require('./marketData');
const { Position, Trade, User } = require('../models');

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Approximate SPAN + exposure for short options, as a share of notional.
const SHORT_OPTION_MARGIN_RATE = 0.11;

function tradingSymbolFor({ underlying, expiry, strike, optionType }) {
  const [year, month, day] = expiry.split('-');
  return `${underlying}${year.slice(2)}${MONTHS[Number(month) - 1]}${day}${strike}${optionType}`;
}

function newOrderId() {
  return `1${String(crypto.randomInt(0, 1e9)).padStart(9, '0')}${String(crypto.randomInt(0, 1e6)).padStart(6, '0')}`;
}

function newTradeId() {
  return `TR_${crypto.randomInt(10000000, 99999999)}`;
}

function legMargin({ side, quantity, price, spot }) {
  if (side === 'B') return price * quantity;
  return spot * quantity * SHORT_OPTION_MARGIN_RATE;
}

/** Attaches live LTP and P&L figures to a position document. */
function markPosition(position, now = new Date(), spotCache = new Map()) {
  const json = position.toJSON();
  const direction = position.side === 'B' ? 1 : -1;
  const quantity = position.lots * position.lotSize;

  if (position.status === 'closed') {
    const booked = (position.exitPrice - position.entryPrice) * quantity * direction;
    return { ...json, ltp: position.exitPrice, bookedPnl: round2(booked), unbookedPnl: 0, pnl: round2(booked) };
  }

  if (!spotCache.has(position.underlying)) {
    spotCache.set(position.underlying, market.getQuote(position.underlying, now).ltp);
  }
  const { ltp } = market.optionPrice({
    symbol: position.underlying,
    expiry: position.expiry,
    strike: position.strike,
    type: position.optionType,
    spot: spotCache.get(position.underlying),
    now,
  });
  const unbooked = (ltp - position.entryPrice) * quantity * direction;
  return { ...json, ltp, bookedPnl: 0, unbookedPnl: round2(unbooked), pnl: round2(unbooked) };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

async function getFunds(user, now = new Date()) {
  const open = await Position.find({ user: user._id, status: 'open' });
  const spotCache = new Map();
  let marginUsed = 0;
  let unrealisedPnl = 0;

  open.forEach((position) => {
    const marked = markPosition(position, now, spotCache);
    unrealisedPnl += marked.unbookedPnl;
    marginUsed += legMargin({
      side: position.side,
      quantity: position.lots * position.lotSize,
      price: position.entryPrice,
      spot: spotCache.get(position.underlying),
    });
  });

  const standaloneFunds = user.funds.deposited + user.funds.realisedPnl;
  return {
    standaloneFunds: round2(standaloneFunds),
    realisedPnl: round2(user.funds.realisedPnl),
    unrealisedPnl: round2(unrealisedPnl),
    marginUsed: round2(marginUsed),
    marginAvailable: round2(standaloneFunds + Math.min(unrealisedPnl, 0) - marginUsed),
  };
}

async function executeStrategy(user, { underlying, strategyName, multiplier, legs, product }, now = new Date()) {
  const index = market.requireIndex(underlying);
  const spot = market.getQuote(index.symbol, now).ltp;

  const fills = legs.map((leg) => {
    market.assertExpiry(index.symbol, leg.expiry, now);
    if (leg.strike % index.strikeStep !== 0) {
      throw ApiError.badRequest(`Strike ${leg.strike} is not a valid ${index.symbol} strike`);
    }
    const { ltp } = market.optionPrice({
      symbol: index.symbol,
      expiry: leg.expiry,
      strike: leg.strike,
      type: leg.optionType,
      spot,
      now,
    });
    const lots = leg.lots * multiplier;
    return { ...leg, lots, price: ltp, quantity: lots * index.lotSize };
  });

  const requiredMargin = fills.reduce((sum, fill) => sum + legMargin({ ...fill, spot }), 0);
  const funds = await getFunds(user, now);
  if (requiredMargin > funds.marginAvailable) {
    throw ApiError.unprocessable(
      `Insufficient margin. Required ₹${Math.round(requiredMargin).toLocaleString('en-IN')}, available ₹${Math.round(
        funds.marginAvailable,
      ).toLocaleString('en-IN')}`,
    );
  }

  const batchId = crypto.randomUUID();
  const capitalAtEntry = funds.standaloneFunds + funds.unrealisedPnl;

  const positions = await Position.insertMany(
    fills.map((fill) => ({
      user: user._id,
      batchId,
      strategyName: strategyName || 'Custom',
      underlying: index.symbol,
      tradingSymbol: tradingSymbolFor({ underlying: index.symbol, ...fill }),
      expiry: fill.expiry,
      strike: fill.strike,
      optionType: fill.optionType,
      side: fill.side,
      lots: fill.lots,
      lotSize: index.lotSize,
      product,
      entryPrice: fill.price,
      capitalAtEntry,
      openedAt: now,
    })),
  );

  try {
    await Trade.insertMany(
      positions.map((position) => ({
        user: user._id,
        tradingSymbol: position.tradingSymbol,
        underlying: position.underlying,
        segment: 'FO',
        side: position.side === 'B' ? 'BUY' : 'SELL',
        quantity: position.lots * position.lotSize,
        price: position.entryPrice,
        expiry: position.expiry,
        orderId: newOrderId(),
        tradeId: newTradeId(),
        tradedAt: now,
      })),
    );
  } catch (error) {
    // No multi-document transactions on a standalone mongod: compensate manually.
    await Position.deleteMany({ batchId });
    throw error;
  }

  return { batchId, requiredMargin: round2(requiredMargin), positions: positions.map((p) => markPosition(p, now)) };
}

async function exitPositions(user, positionIds, now = new Date()) {
  const filter = { user: user._id, status: 'open' };
  if (positionIds && positionIds.length) filter._id = { $in: positionIds };

  const open = await Position.find(filter);
  if (!open.length) throw ApiError.notFound('No open positions to exit');

  const spotCache = new Map();
  let realised = 0;
  const trades = [];

  open.forEach((position) => {
    const marked = markPosition(position, now, spotCache);
    realised += marked.unbookedPnl;
    position.status = 'closed';
    position.exitPrice = marked.ltp;
    position.closedAt = now;
    trades.push({
      user: user._id,
      tradingSymbol: position.tradingSymbol,
      underlying: position.underlying,
      segment: 'FO',
      side: position.side === 'B' ? 'SELL' : 'BUY',
      quantity: position.lots * position.lotSize,
      price: marked.ltp,
      expiry: position.expiry,
      orderId: newOrderId(),
      tradeId: newTradeId(),
      tradedAt: now,
    });
  });

  await Promise.all(open.map((position) => position.save()));
  await Trade.insertMany(trades);
  await User.updateOne({ _id: user._id }, { $inc: { 'funds.realisedPnl': round2(realised) } });

  return { closed: open.length, realisedPnl: round2(realised) };
}

module.exports = {
  tradingSymbolFor,
  newOrderId,
  newTradeId,
  markPosition,
  getFunds,
  executeStrategy,
  exitPositions,
};
