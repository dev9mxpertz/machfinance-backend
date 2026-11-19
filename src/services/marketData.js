/**
 * Market data provider.
 *
 * Spot prices, day ranges, intraday ticks, daily candles and India VIX come from
 * the live feed (services/liveFeed.js, Yahoo Finance) when it has data. Anything
 * the free feed cannot provide - option premiums, OI, market depth - is modelled
 * from the live spot price (Black-Scholes with a VIX-driven volatility smile).
 * If the live feed is unavailable every value falls back to a deterministic
 * simulation, so the API never stops answering.
 */
const { rngFor } = require('../utils/random');
const liveFeed = require('./liveFeed');
const blackScholes = require('../utils/blackScholes');
const clock = require('./marketClock');
const { INDICES, NIFTY50, SECTORS, getInstrument } = require('./instruments');

const RISK_FREE_RATE = 0.065;
const TICK = 0.05;

const round2 = (value) => Math.round(value * 100) / 100;
const roundTick = (value) => round2(Math.round(value / TICK) * TICK);

function gaussian(rng) {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// --- Spot prices ---------------------------------------------------------------

function previousClose(instrument, dateKey) {
  const rng = rngFor('prev-close', instrument.symbol, dateKey);
  const spread = instrument.kind === 'index' ? 0.012 : 0.025;
  return roundTick(instrument.basePrice * (1 + (rng() - 0.5) * spread));
}

function intradayFactor(symbol, dateKey, progress) {
  const rng = rngFor('intraday', symbol, dateKey);
  const trend = (rng() - 0.45) * 0.012;
  const amp1 = 0.0018 + rng() * 0.002;
  const amp2 = 0.0008 + rng() * 0.0008;
  const freq1 = 1.5 + rng() * 2.5;
  const freq2 = 6 + rng() * 6;
  const phase1 = rng() * Math.PI * 2;
  const phase2 = rng() * Math.PI * 2;
  const wave = (x) =>
    amp1 * Math.sin(2 * Math.PI * freq1 * x + phase1) + amp2 * Math.sin(2 * Math.PI * freq2 * x + phase2);
  return 1 + trend * progress + wave(progress) - wave(0);
}

function priceAt(instrument, dateKey, minute) {
  const prevClose = previousClose(instrument, dateKey);
  return roundTick(prevClose * intradayFactor(instrument.symbol, dateKey, clock.progressAt(minute)));
}

function requireInstrument(symbol) {
  const instrument = getInstrument(symbol);
  if (!instrument) {
    const error = new Error(`Unknown symbol "${symbol}"`);
    error.statusCode = 404;
    throw error;
  }
  return instrument;
}

function getQuote(symbol, now = new Date()) {
  const instrument = requireInstrument(symbol);
  const session = clock.getSession(now);

  const live = liveFeed.getQuote(instrument.symbol);
  if (live) {
    const fresh = now.getTime() - live.asOf < 15 * 60 * 1000;
    return {
      symbol: instrument.symbol,
      name: instrument.name,
      ltp: live.ltp,
      open: live.open,
      high: live.high,
      low: live.low,
      prevClose: live.prevClose,
      change: round2(live.ltp - live.prevClose),
      changePct: round2(((live.ltp - live.prevClose) / live.prevClose) * 100),
      sessionDate: live.dateKey,
      sessionTime: clock.formatClock(Math.min(Math.max(live.minute, clock.SESSION_OPEN), clock.SESSION_CLOSE)),
      isMarketOpen: session.isOpen && live.dateKey === session.dateKey && fresh,
      source: 'live',
      asOf: new Date(live.asOf).toISOString(),
    };
  }

  const prevClose = previousClose(instrument, session.dateKey);
  const ltp = priceAt(instrument, session.dateKey, session.minute);

  let high = ltp;
  let low = ltp;
  for (let m = clock.SESSION_OPEN; m <= session.minute; m += 5) {
    const p = priceAt(instrument, session.dateKey, m);
    high = Math.max(high, p);
    low = Math.min(low, p);
  }

  return {
    symbol: instrument.symbol,
    name: instrument.name,
    ltp,
    open: priceAt(instrument, session.dateKey, clock.SESSION_OPEN),
    high,
    low,
    prevClose,
    change: round2(ltp - prevClose),
    changePct: round2(((ltp - prevClose) / prevClose) * 100),
    sessionDate: session.dateKey,
    sessionTime: clock.formatClock(session.minute),
    isMarketOpen: session.isOpen,
    source: 'simulated',
  };
}

// --- Derivatives ---------------------------------------------------------------

function requireIndex(symbol) {
  const index = INDICES[String(symbol || '').toUpperCase()];
  if (!index) {
    const error = new Error(`Derivatives are not available for "${symbol}"`);
    error.statusCode = 404;
    throw error;
  }
  return { ...index, kind: 'index' };
}

function getExpiries(symbol, now = new Date()) {
  const index = requireIndex(symbol);
  const wall = clock.toIstWallClock(now);
  const minutes = wall.getUTCHours() * 60 + wall.getUTCMinutes();
  const today = new Date(`${clock.dateKeyOf(wall)}T00:00:00Z`);

  const tuesdays = [];
  for (let offset = 0; offset < 130; offset += 1) {
    const day = new Date(today.getTime() + offset * clock.DAY_MS);
    if (day.getUTCDay() !== 2) continue;
    if (offset === 0 && minutes > clock.SESSION_CLOSE) continue;
    const nextWeek = new Date(day.getTime() + 7 * clock.DAY_MS);
    tuesdays.push({ day, monthly: nextWeek.getUTCMonth() !== day.getUTCMonth() });
  }

  const selected = index.weeklyExpiry
    ? tuesdays.slice(0, 6)
    : tuesdays.filter((entry) => entry.monthly).slice(0, 3);

  return selected.map(({ day, monthly }) => {
    const date = clock.dateKeyOf(day);
    return {
      date,
      daysToExpiry: Math.max(Math.round((day.getTime() - today.getTime()) / clock.DAY_MS), 0),
      weekly: !monthly,
    };
  });
}

function assertExpiry(symbol, expiry, now) {
  const valid = getExpiries(symbol, now).some((entry) => entry.date === expiry);
  if (!valid) {
    const error = new Error(`Expiry ${expiry} is not available for ${symbol}`);
    error.statusCode = 400;
    throw error;
  }
}

/** India VIX from the live feed, or the static fallback for the index. */
function vixFor(index) {
  const live = liveFeed.getQuote('INDIAVIX');
  if (!live) return { value: index.vix, change: 0.1, live: false };
  return { value: live.ltp, change: round2(live.ltp - live.prevClose), live: true };
}

/** ATM volatility: India VIX when live (BANKNIFTY trades at a premium), else the static base. */
function baseIvFor(index) {
  const vix = vixFor(index);
  if (!vix.live) return index.baseIv;
  const premium = index.symbol === 'BANKNIFTY' ? 1.12 : 1;
  return (vix.value / 100) * premium;
}

function impliedVol(index, spot, strike, years) {
  const moneyness = Math.log(strike / spot);
  const shortDatedPremium = 0.015 * Math.max(0, 1 - years * 24);
  return Math.max(0.07, baseIvFor(index) + shortDatedPremium - 0.22 * moneyness + 2.4 * moneyness ** 2);
}

function openInterestProfile(index, expiry, strike, type, spot, dateKey) {
  const rng = rngFor('oi', index.symbol, expiry, strike, type, dateKey);
  const stepsFromSpot = (strike - spot) / index.strikeStep;
  const centre = type === 'CE' ? 3 : -3;
  const bell = Math.exp(-((stepsFromSpot - centre) ** 2) / 40);
  let roundBoost = 1;
  if (strike % (index.strikeStep * 10) === 0) roundBoost = 1.7;
  else if (strike % (index.strikeStep * 2) === 0) roundBoost = 1.15;
  const oiLakh = (4 + 60 * bell * roundBoost) * (0.6 + rng() * 0.8);
  const changePct = (rng() - 0.42) * 110;
  return { oiLakh: round2(oiLakh), changePct: Math.round(changePct * 10) / 10 };
}

function optionPrice({ symbol, expiry, strike, type, spot, now = new Date() }) {
  const index = requireIndex(symbol);
  const underlying = spot ?? getQuote(index.symbol, now).ltp;
  const years = clock.yearsUntilExpiry(expiry, now);
  const iv = impliedVol(index, underlying, strike, years);
  const value = blackScholes.price({
    spot: underlying,
    strike,
    years,
    rate: RISK_FREE_RATE,
    iv,
    type,
  });
  return { ltp: Math.max(roundTick(value), TICK), iv, years };
}

function getOptionChain(symbol, expiry, { strikeCount = 10 } = {}, now = new Date()) {
  const index = requireIndex(symbol);
  assertExpiry(index.symbol, expiry, now);

  const quote = getQuote(index.symbol, now);
  const session = clock.getSession(now);
  const atm = Math.round(quote.ltp / index.strikeStep) * index.strikeStep;
  const futPrice = roundTick(quote.ltp * Math.exp(RISK_FREE_RATE * clock.yearsUntilExpiry(expiry, now)));

  const rows = [];
  for (let offset = -strikeCount; offset <= strikeCount; offset += 1) {
    const strike = atm + offset * index.strikeStep;
    const side = (type) => {
      const { ltp, iv } = optionPrice({ symbol, expiry, strike, type, spot: quote.ltp, now });
      const oi = openInterestProfile(index, expiry, strike, type, quote.ltp, session.dateKey);
      return { ltp, iv: Math.round(iv * 1000) / 10, oiLakh: oi.oiLakh, oiChangePct: oi.changePct };
    };
    rows.push({ strike, call: side('CE'), put: side('PE') });
  }

  const totals = rows.reduce(
    (acc, row) => ({ callOi: acc.callOi + row.call.oiLakh, putOi: acc.putOi + row.put.oiLakh }),
    { callOi: 0, putOi: 0 },
  );

  return {
    symbol: index.symbol,
    expiry,
    spot: quote.ltp,
    spotChangePct: quote.changePct,
    futPrice,
    atmStrike: atm,
    lotSize: index.lotSize,
    strikeStep: index.strikeStep,
    vix: (({ value, change }) => ({ value, change }))(vixFor(index)),
    source: quote.source,
    ivPercentile: index.ivPercentile,
    pcr: round2(totals.putOi / totals.callOi),
    rows,
  };
}

/**
 * Open-interest change between two times of the current session, summed over
 * the requested expiries. Values are in number of contracts * lot size (shares).
 */
function getOiChange({ symbol, expiries, from, to, strikeMin, strikeMax }, now = new Date()) {
  const index = requireIndex(symbol);
  expiries.forEach((expiry) => assertExpiry(index.symbol, expiry, now));

  const session = clock.getSession(now);
  const fromMinute = Math.min(from ?? clock.SESSION_OPEN, session.minute);
  const toMinute = Math.min(to ?? session.minute, session.minute);
  const quote = getQuote(index.symbol, now);

  const low = Math.ceil(strikeMin / index.strikeStep) * index.strikeStep;
  const high = Math.floor(strikeMax / index.strikeStep) * index.strikeStep;
  const maxStrikes = 80;
  const step = Math.max(index.strikeStep, Math.ceil((high - low) / maxStrikes / index.strikeStep) * index.strikeStep);

  const changeAt = (expiry, strike, type, minute) => {
    const rng = rngFor('oi-change', index.symbol, expiry, strike, type, session.dateKey);
    const distance = Math.abs(strike - quote.ltp) / (index.strikeStep * 10);
    const scale = 9e6 * Math.exp(-distance * distance);
    const dayChange = (rng() - 0.45) * scale;
    const curve = 0.6 + rng() * 1.2;
    return dayChange * clock.progressAt(minute) ** curve;
  };

  const strikes = [];
  for (let strike = low; strike <= high; strike += step) {
    let callOiChange = 0;
    let putOiChange = 0;
    let callOi = 0;
    let putOi = 0;
    expiries.forEach((expiry) => {
      callOiChange += changeAt(expiry, strike, 'CE', toMinute) - changeAt(expiry, strike, 'CE', fromMinute);
      putOiChange += changeAt(expiry, strike, 'PE', toMinute) - changeAt(expiry, strike, 'PE', fromMinute);
      callOi += openInterestProfile(index, expiry, strike, 'CE', quote.ltp, session.dateKey).oiLakh * 1e5;
      putOi += openInterestProfile(index, expiry, strike, 'PE', quote.ltp, session.dateKey).oiLakh * 1e5;
    });
    strikes.push({
      strike,
      callOiChange: Math.round(callOiChange),
      putOiChange: Math.round(putOiChange),
      callOi: Math.round(callOi),
      putOi: Math.round(putOi),
    });
  }

  const totals = strikes.reduce(
    (acc, row) => ({
      callOiChange: acc.callOiChange + row.callOiChange,
      putOiChange: acc.putOiChange + row.putOiChange,
    }),
    { callOiChange: 0, putOiChange: 0 },
  );

  return {
    symbol: index.symbol,
    sessionDate: session.dateKey,
    from: clock.formatClock(fromMinute),
    to: clock.formatClock(toMinute),
    sessionCloses: clock.formatClock(clock.SESSION_CLOSE),
    spot: quote.ltp,
    spotAtFrom: liveFeed.priceAtMinute(index.symbol, fromMinute) ?? priceAt(index, session.dateKey, fromMinute),
    spotAtTo: liveFeed.priceAtMinute(index.symbol, toMinute) ?? priceAt(index, session.dateKey, toMinute),
    atmStrike: Math.round(quote.ltp / index.strikeStep) * index.strikeStep,
    totals,
    strikes,
  };
}

// --- Charts ----------------------------------------------------------------------

/** Real daily candles with today's bar updated from the live quote. */
function liveDailyCandles(instrument, count) {
  const history = liveFeed.getDaily(instrument.symbol);
  if (!history || !history.length) return null;
  const candles = history.slice(-count);
  const live = liveFeed.getQuote(instrument.symbol);
  if (live) {
    const last = candles[candles.length - 1];
    const today = { time: live.dateKey, open: live.open, high: live.high, low: live.low, close: live.ltp };
    if (last.time === live.dateKey) candles[candles.length - 1] = { ...last, ...today };
    else if (last.time < live.dateKey) candles.push({ ...today, volume: 0 });
  }
  return candles.slice(-count);
}

function buildDailyCandles(instrument, now, count) {
  const real = liveDailyCandles(instrument, count);
  if (real) return real;

  const quote = getQuote(instrument.symbol, now);
  const days = clock.tradingDaysUntil(quote.sessionDate, count);
  const rng = rngFor('candles', instrument.symbol);
  const vol = instrument.kind === 'index' ? 0.0085 : 0.016;

  const closes = new Array(count);
  closes[count - 1] = quote.ltp;
  const shocks = Array.from({ length: count }, () => gaussian(rng));
  for (let i = count - 1; i > 0; i -= 1) {
    const regime = Math.sin(i / 55) * 0.0012;
    closes[i - 1] = closes[i] / (1 + 0.0004 + regime + vol * shocks[i]);
  }

  return days.map((date, i) => {
    const close = closes[i];
    const open = i === 0 ? close : closes[i - 1] * (1 + (rng() - 0.5) * vol * 0.6);
    const wick = vol * (0.3 + rng() * 0.9);
    const isLast = i === count - 1;
    return {
      time: date,
      open: roundTick(isLast ? quote.open : open),
      high: roundTick(isLast ? quote.high : Math.max(open, close) * (1 + wick * rng())),
      low: roundTick(isLast ? quote.low : Math.min(open, close) * (1 - wick * rng())),
      close: roundTick(close),
      volume: Math.round((instrument.kind === 'index' ? 2.5e8 : 6e6) * (0.5 + rng())),
    };
  });
}

function aggregateWeekly(daily) {
  const weeks = new Map();
  daily.forEach((candle) => {
    const date = new Date(`${candle.time}T00:00:00Z`);
    const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * clock.DAY_MS);
    const key = clock.dateKeyOf(monday);
    const week = weeks.get(key);
    if (!week) {
      weeks.set(key, { ...candle, time: key });
    } else {
      week.high = Math.max(week.high, candle.high);
      week.low = Math.min(week.low, candle.low);
      week.close = candle.close;
      week.volume += candle.volume;
    }
  });
  return [...weeks.values()];
}

function getCandles(symbol, interval = '1D', now = new Date()) {
  const instrument = requireInstrument(symbol);
  const daily = buildDailyCandles(instrument, now, 1000);
  const candles = interval === '1W' ? aggregateWeekly(daily).slice(-180) : daily.slice(-320);
  const source = liveFeed.getDaily(instrument.symbol) ? 'live' : 'simulated';
  return { symbol: instrument.symbol, name: instrument.name, interval, candles, source };
}

function getMarketDepth(symbol, now = new Date()) {
  const instrument = requireInstrument(symbol);
  const quote = getQuote(instrument.symbol, now);
  const session = clock.getSession(now);
  const rng = rngFor('depth', instrument.symbol, session.dateKey, session.minute);
  const tick = instrument.kind === 'index' ? 0.05 : 0.05;
  const baseQty = instrument.kind === 'index' ? 650 : 400;

  const level = (price) => ({
    price: round2(price),
    quantity: Math.round(baseQty * (0.3 + rng() * 2.5)),
    orders: 1 + Math.floor(rng() * 25),
  });

  const bids = Array.from({ length: 5 }, (_, i) => level(quote.ltp - tick * (i + 1)));
  const asks = Array.from({ length: 5 }, (_, i) => level(quote.ltp + tick * (i + 1)));
  const sum = (rows) => rows.reduce((acc, row) => acc + row.quantity, 0);

  return {
    symbol: instrument.symbol,
    ltp: quote.ltp,
    bids,
    asks,
    totalBidQty: sum(bids),
    totalAskQty: sum(asks),
  };
}

function getFundamentals(symbol, now = new Date()) {
  const instrument = requireInstrument(symbol);
  const quote = getQuote(instrument.symbol, now);
  const yearCandles = buildDailyCandles(instrument, now, 250);
  const high52 = Math.max(...yearCandles.map((c) => c.high));
  const low52 = Math.min(...yearCandles.map((c) => c.low));
  const rng = rngFor('fundamentals', instrument.symbol);

  // With live data, report only real figures instead of modelled valuation ratios.
  if (quote.source === 'live' && liveFeed.getDaily(instrument.symbol)) {
    const recent = yearCandles.slice(-21, -1).filter((c) => c.volume > 0);
    const avgVolume = recent.length ? recent.reduce((sum, c) => sum + c.volume, 0) / recent.length : 0;
    const metrics = [
      { label: 'Prev Close', value: quote.prevClose },
      { label: 'Open', value: quote.open },
      { label: 'Day High', value: quote.high },
      { label: 'Day Low', value: quote.low },
      { label: '52W High', value: round2(high52) },
      { label: '52W Low', value: round2(low52) },
    ];
    if (instrument.kind === 'index') {
      metrics.push({ label: 'Constituents', value: instrument.symbol === 'NIFTY' ? 50 : 12 });
    } else {
      if (avgVolume) metrics.push({ label: 'Avg Volume (20D)', value: Math.round(avgVolume).toLocaleString('en-IN') });
      metrics.push({ label: 'Index Weight', value: `${round2(instrument.weight)}%` });
    }
    return {
      symbol: instrument.symbol,
      name: instrument.name,
      kind: instrument.kind === 'index' ? 'index' : 'stock',
      sector: instrument.sector,
      source: 'live',
      metrics,
    };
  }

  if (instrument.kind === 'index') {
    return {
      symbol: instrument.symbol,
      name: instrument.name,
      kind: 'index',
      metrics: [
        { label: 'P/E', value: round2(20 + rng() * 4) },
        { label: 'P/B', value: round2(3.2 + rng() * 0.8) },
        { label: 'Dividend Yield', value: `${round2(1.1 + rng() * 0.4)}%` },
        { label: '52W High', value: round2(high52) },
        { label: '52W Low', value: round2(low52) },
        { label: 'Constituents', value: instrument.symbol === 'NIFTY' ? 50 : 12 },
      ],
    };
  }

  const sharesCr = 50 + rng() * 1200;
  const pe = 12 + rng() * 55;
  return {
    symbol: instrument.symbol,
    name: instrument.name,
    kind: 'stock',
    sector: instrument.sector,
    metrics: [
      { label: 'Market Cap', value: `₹${Math.round(quote.ltp * sharesCr).toLocaleString('en-IN')} Cr` },
      { label: 'P/E', value: round2(pe) },
      { label: 'EPS (TTM)', value: round2(quote.ltp / pe) },
      { label: 'P/B', value: round2(1.5 + rng() * 9) },
      { label: 'ROE', value: `${round2(8 + rng() * 22)}%` },
      { label: 'Dividend Yield', value: `${round2(rng() * 3)}%` },
      { label: '52W High', value: round2(high52) },
      { label: '52W Low', value: round2(low52) },
      { label: 'Index Weight', value: `${round2(instrument.weight)}%` },
    ],
  };
}

function getNifty50(now = new Date()) {
  return NIFTY50.map((stock) => {
    const quote = getQuote(stock.symbol, now);
    return {
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      weight: Math.round(stock.weight * 10) / 10,
      ltp: quote.ltp,
      change: quote.change,
      changePct: quote.changePct,
    };
  });
}

function getSectorBreakdown(now = new Date()) {
  const stocks = getNifty50(now);
  return SECTORS.map((sector) => {
    const members = stocks.filter((s) => s.sector === sector).sort((a, b) => b.weight - a.weight);
    const weight = members.reduce((sum, s) => sum + s.weight, 0);
    const weightedChange = members.reduce((sum, s) => sum + s.changePct * s.weight, 0);
    const [first, second, ...rest] = members;
    return {
      sector,
      weight: round2(weight),
      changePct: weight ? round2(weightedChange / weight) : 0,
      segments: [
        { label: first ? first.name : '-', weight: first ? first.weight : 0 },
        { label: second ? second.name : '-', weight: second ? second.weight : 0 },
        { label: 'Others', weight: round2(rest.reduce((sum, s) => sum + s.weight, 0)) },
      ],
    };
  });
}

/** Every quote the app shows, plus India VIX, for the live price stream. */
function getSnapshot(now = new Date()) {
  const quotes = {};
  [...Object.keys(INDICES), ...NIFTY50.map((stock) => stock.symbol)].forEach((symbol) => {
    quotes[symbol] = getQuote(symbol, now);
  });
  const vix = liveFeed.getQuote('INDIAVIX');
  return {
    quotes,
    vix: vix ? { value: vix.ltp, change: round2(vix.ltp - vix.prevClose) } : null,
    sentAt: now.toISOString(),
  };
}

function searchSymbols(query = '') {
  const term = String(query).trim().toUpperCase();
  const all = [
    ...Object.values(INDICES).map((i) => ({ symbol: i.symbol, name: i.name, type: 'INDEX' })),
    ...NIFTY50.map((s) => ({ symbol: s.symbol, name: s.name, type: 'EQ' })),
  ];
  if (!term) return all.slice(0, 12);
  return all
    .filter((item) => item.symbol.includes(term) || item.name.toUpperCase().includes(term))
    .slice(0, 12);
}

module.exports = {
  RISK_FREE_RATE,
  getQuote,
  getExpiries,
  assertExpiry,
  optionPrice,
  getOptionChain,
  getOiChange,
  getCandles,
  getMarketDepth,
  getFundamentals,
  getNifty50,
  getSectorBreakdown,
  getSnapshot,
  searchSymbols,
  requireIndex,
};
