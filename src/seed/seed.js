/* eslint-disable no-console */
/**
 * Seeds a demo account with trade history, open positions and strategy code.
 * Safe to re-run: the demo user's data is replaced each time.
 *
 *   npm run seed
 */
const config = require('../config/env');
const { connectDatabase, disconnectDatabase } = require('../config/db');
const { User, Strategy, Position, Trade, StrategyCode, CodeRun } = require('../models');
const totp = require('../utils/totp');
const { createRng } = require('../utils/random');
const market = require('../services/marketData');
const tradingService = require('../services/tradingService');
const { runSimulatedBacktest } = require('../services/backtestSimulator');
const { tradingDaysUntil, getSession } = require('../services/marketClock');
const { NIFTY50 } = require('../services/instruments');

const DEMO_EMAIL = 'john.doe@example.com';
const DEMO_PASSWORD = 'Demo@1234';
const TRADE_COUNT = 1279;

const SAMPLE_CODES = [
  {
    title: 'strategy',
    version: 'v1',
    filename: 'strategy_v1.py',
    description: 'Opening range breakout on NIFTY with fixed stop loss.',
    content: `"""Opening range breakout."""\n\ndef on_bar(ctx, bar):\n    if ctx.minute == 30:\n        ctx.range_high = ctx.high_since_open\n        ctx.range_low = ctx.low_since_open\n    if bar.close > ctx.range_high and not ctx.position:\n        ctx.buy("NIFTY", qty=ctx.lot_size, sl=ctx.params["sl"])\n`,
  },
  {
    title: 'strategy',
    version: 'v2',
    filename: 'strategy_v2.py',
    description: 'v1 with a profit target and trailing stop.',
    content: `"""Opening range breakout with target."""\n\ndef on_bar(ctx, bar):\n    if bar.close > ctx.range_high and not ctx.position:\n        ctx.buy("NIFTY", qty=ctx.lot_size, sl=ctx.params["sl"], target=ctx.params["target"])\n    ctx.trail_stop(pct=ctx.params["sl"])\n`,
  },
  {
    title: 'ml_model',
    version: 'v1',
    filename: 'ml_model_v1.py',
    description: 'Gradient boosted direction classifier on 5 minute bars.',
    content: `"""Direction classifier."""\n\ndef on_bar(ctx, bar):\n    signal = ctx.model.predict(ctx.features(bar))\n    if signal > 0.6:\n        ctx.buy("NIFTY", qty=ctx.lot_size)\n    elif signal < 0.4:\n        ctx.sell("NIFTY", qty=ctx.lot_size)\n`,
  },
];

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function buildTrades(userId, rng) {
  const session = getSession(new Date());
  const days = tradingDaysUntil(session.dateKey, 90);
  const trades = [];
  let sequence = 99218000;

  for (let i = 0; i < TRADE_COUNT; i += 1) {
    const day = pick(rng, days);
    const minutes = 9 * 60 + 15 + Math.floor(rng() * 375);
    const tradedAt = new Date(
      `${day}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(
        Math.floor(rng() * 60),
      ).padStart(2, '0')}+05:30`,
    );

    const isOption = rng() < 0.8;
    sequence += 1 + Math.floor(rng() * 40);

    if (isOption) {
      const underlying = rng() < 0.7 ? 'NIFTY' : 'BANKNIFTY';
      const index = market.requireIndex(underlying);
      const expiryDate = new Date(new Date(`${day}T00:00:00Z`).getTime() + (2 + Math.floor(rng() * 20)) * 864e5);
      const expiry = expiryDate.toISOString().slice(0, 10);
      const strike =
        Math.round((index.basePrice * (1 + (rng() - 0.5) * 0.06)) / index.strikeStep) * index.strikeStep;
      const optionType = rng() < 0.5 ? 'CE' : 'PE';
      trades.push({
        user: userId,
        tradingSymbol: tradingService.tradingSymbolFor({ underlying, expiry, strike, optionType }),
        underlying,
        segment: 'FO',
        side: rng() < 0.5 ? 'BUY' : 'SELL',
        quantity: index.lotSize * (1 + Math.floor(rng() * 4)),
        price: Math.round((20 + rng() * 400) * 20) / 20,
        expiry,
        orderId: `${rng() < 0.5 ? '13' : '10'}${String(Math.floor(rng() * 1e14)).padStart(14, '0')}`,
        tradeId: `TR_${sequence}`,
        tradedAt,
      });
    } else {
      const stock = pick(rng, NIFTY50);
      trades.push({
        user: userId,
        tradingSymbol: stock.symbol,
        underlying: stock.symbol,
        segment: 'EQ',
        side: rng() < 0.55 ? 'BUY' : 'SELL',
        quantity: 1 + Math.floor(rng() * 250),
        price: Math.round(stock.basePrice * (1 + (rng() - 0.5) * 0.08) * 20) / 20,
        orderId: `${rng() < 0.5 ? '13' : '10'}${String(Math.floor(rng() * 1e14)).padStart(14, '0')}`,
        tradeId: `TR_${sequence}`,
        tradedAt,
      });
    }
  }
  return trades;
}

async function seed() {
  await connectDatabase();
  const rng = createRng(20260401);

  const existing = await User.findOne({ email: DEMO_EMAIL });
  if (existing) {
    await Promise.all([
      Strategy.deleteMany({ user: existing._id }),
      Position.deleteMany({ user: existing._id }),
      Trade.deleteMany({ user: existing._id }),
      StrategyCode.deleteMany({ user: existing._id }),
      CodeRun.deleteMany({ user: existing._id }),
      User.deleteOne({ _id: existing._id }),
    ]);
  }

  const totpSecret = config.demoTotpSecret || totp.generateSecret();
  const user = new User({
    name: 'John Doe',
    email: DEMO_EMAIL,
    totpSecret,
    clientId: 'MF12345',
    supportCode: '4821',
    ckycNumber: '12345678901234',
    mobile: '+919876547890',
    pan: 'ABCDE1234F',
    panVerified: true,
    dateOfBirth: new Date('1985-01-15T00:00:00Z'),
    address: {
      line1: '402, Trade Tower, Bandra-Kurla Complex',
      city: 'Mumbai',
      state: 'MH',
      pincode: '400051',
    },
    funds: { deposited: 1020000, realisedPnl: 0 },
    nominees: [
      { name: 'Jane Doe', relation: 'Spouse', sharePct: 60 },
      { name: 'Sam Doe', relation: 'Son', sharePct: 40 },
    ],
    bankAccounts: [
      { bankName: 'HDFC Bank', accountNumberMasked: 'XXXXXXXX4521', ifsc: 'HDFC0000123', primary: true },
      { bankName: 'ICICI Bank', accountNumberMasked: 'XXXXXXXX9934', ifsc: 'ICIC0000456', primary: false },
    ],
    demat: { depository: 'CDSL', dpId: '12081600', boId: '1208160012345678' },
    segments: [
      { name: 'NSE Equity', enabled: true },
      { name: 'BSE Equity', enabled: true },
      { name: 'NSE F&O', enabled: true },
      { name: 'Currency', enabled: false },
      { name: 'Commodity (MCX)', enabled: false },
    ],
    marginTrading: { enabled: true, limit: 500000 },
    documents: [
      { name: 'PAN Card', status: 'verified', uploadedAt: new Date('2024-03-02') },
      { name: 'Aadhaar', status: 'verified', uploadedAt: new Date('2024-03-02') },
      { name: 'Income Proof (ITR)', status: 'pending', uploadedAt: new Date('2026-05-11') },
    ],
    commodityDeclaration: { category: 'Not applicable', declaredAt: new Date('2024-03-02') },
    family: [{ name: 'Jane Doe', relation: 'Spouse', clientId: 'MF12346' }],
  });
  await user.setPassword(DEMO_PASSWORD);
  await user.save();

  await Trade.insertMany(buildTrades(user._id, rng), { ordered: false });

  // Open a couple of strategies so Positions / History are populated.
  const expiries = market.getExpiries('NIFTY');
  const spot = market.getQuote('NIFTY').ltp;
  const atm = Math.round(spot / 50) * 50;
  await tradingService.executeStrategy(user, {
    underlying: 'NIFTY',
    strategyName: 'Bull Call Spread',
    multiplier: 1,
    product: 'NRML',
    legs: [
      { side: 'B', optionType: 'CE', expiry: expiries[0].date, strike: atm, lots: 1, price: 0 },
      { side: 'S', optionType: 'CE', expiry: expiries[0].date, strike: atm + 200, lots: 1, price: 0 },
    ],
  });
  await tradingService.executeStrategy(user, {
    underlying: 'NIFTY',
    strategyName: 'Short Strangle',
    multiplier: 1,
    product: 'NRML',
    legs: [
      { side: 'S', optionType: 'PE', expiry: expiries[1].date, strike: atm - 300, lots: 1, price: 0 },
      { side: 'S', optionType: 'CE', expiry: expiries[1].date, strike: atm + 300, lots: 1, price: 0 },
    ],
  });

  await Strategy.create([
    {
      user: user._id,
      name: 'Weekly iron condor',
      underlying: 'NIFTY',
      kind: 'saved',
      legs: [
        { side: 'S', optionType: 'CE', expiry: expiries[0].date, strike: atm + 200, lots: 1, price: 0 },
        { side: 'B', optionType: 'CE', expiry: expiries[0].date, strike: atm + 400, lots: 1, price: 0 },
        { side: 'S', optionType: 'PE', expiry: expiries[0].date, strike: atm - 200, lots: 1, price: 0 },
        { side: 'B', optionType: 'PE', expiry: expiries[0].date, strike: atm - 400, lots: 1, price: 0 },
      ],
    },
    {
      user: user._id,
      name: 'Draft straddle',
      underlying: 'NIFTY',
      kind: 'draft',
      legs: [
        { side: 'S', optionType: 'CE', expiry: expiries[0].date, strike: atm, lots: 1, price: 0 },
        { side: 'S', optionType: 'PE', expiry: expiries[0].date, strike: atm, lots: 1, price: 0 },
      ],
    },
  ]);

  const codes = await StrategyCode.insertMany(
    SAMPLE_CODES.map((code) => ({
      ...code,
      user: user._id,
      sizeBytes: Buffer.byteLength(code.content),
    })),
  );

  const params = { sl: 0.02, target: 0.05 };
  await CodeRun.create({
    user: user._id,
    code: codes[1]._id,
    mode: 'paper',
    initialCapital: 100000,
    params,
    ...runSimulatedBacktest({ content: SAMPLE_CODES[1].content, params, initialCapital: 100000 }),
  });

  console.log('\nDemo account ready');
  console.log('------------------');
  console.log(`Email      : ${DEMO_EMAIL}`);
  console.log(`Password   : ${DEMO_PASSWORD}`);
  console.log(`TOTP secret: ${totpSecret}`);
  console.log(`TOTP URI   : ${totp.keyUri({ secret: totpSecret, account: DEMO_EMAIL, issuer: config.totpIssuer })}`);
  console.log('Add the secret to an authenticator app, or run `npm run totp` for the current code.\n');

  await disconnectDatabase();
}

seed().catch(async (error) => {
  console.error('[seed] failed:', error);
  await disconnectDatabase();
  process.exit(1);
});
