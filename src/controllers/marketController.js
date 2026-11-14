const market = require('../services/marketData');
const { parseClock } = require('../services/marketClock');
const ApiError = require('../utils/ApiError');

function quote(req, res) {
  res.json(market.getQuote(req.valid.params.symbol));
}

function expiries(req, res) {
  res.json({ symbol: req.valid.params.symbol, expiries: market.getExpiries(req.valid.params.symbol) });
}

function optionChain(req, res) {
  const { symbol, expiry, strikes } = req.valid.query;
  const resolvedExpiry = expiry || market.getExpiries(symbol)[0].date;
  res.json(market.getOptionChain(symbol, resolvedExpiry, { strikeCount: strikes }));
}

function oiChange(req, res) {
  const { symbol, expiries: expiryList, from, to, strikeMin, strikeMax } = req.valid.query;
  const fromMinute = from ? parseClock(from) : undefined;
  const toMinute = to ? parseClock(to) : undefined;
  if (fromMinute !== undefined && toMinute !== undefined && fromMinute >= toMinute) {
    throw ApiError.badRequest('"from" must be earlier than "to"');
  }

  const resolvedExpiries = expiryList.length ? expiryList : [market.getExpiries(symbol)[0].date];
  const spot = market.getQuote(symbol).ltp;
  const index = market.requireIndex(symbol);
  const span = index.strikeStep * 10;

  res.json(
    market.getOiChange({
      symbol,
      expiries: resolvedExpiries,
      from: fromMinute,
      to: toMinute,
      strikeMin: strikeMin ?? spot - span,
      strikeMax: strikeMax ?? spot + span,
    }),
  );
}

function candles(req, res) {
  res.json(market.getCandles(req.valid.query.symbol, req.valid.query.interval));
}

function depth(req, res) {
  res.json(market.getMarketDepth(req.valid.params.symbol));
}

function fundamentals(req, res) {
  res.json(market.getFundamentals(req.valid.params.symbol));
}

function nifty50(_req, res) {
  res.json({ items: market.getNifty50() });
}

function sectors(_req, res) {
  res.json({ items: market.getSectorBreakdown() });
}

function search(req, res) {
  res.json({ items: market.searchSymbols(req.valid.query.q) });
}

module.exports = { quote, expiries, optionChain, oiChange, candles, depth, fundamentals, nifty50, sectors, search };
