/* eslint-disable no-console */
/**
 * Live NSE prices from Yahoo Finance's public chart endpoints (no account or key).
 *
 * A background poller keeps an in-memory cache so the rest of the market service
 * can stay synchronous:
 *   - quotes for NIFTY, BANKNIFTY, India VIX and the NIFTY 50 stocks
 *     (every 15s while NSE is open, every 5 min otherwise)
 *   - 5 years of daily candles per symbol (refreshed every 6 hours)
 *
 * Everything degrades gracefully: when a value is missing, callers fall back to
 * the simulated model, so the API keeps working if Yahoo is slow or blocks us.
 * Yahoo's data is unofficial and may be delayed; it is not a licensed exchange feed.
 */
const clock = require('./marketClock');
const { INDICES, NIFTY50 } = require('./instruments');

const BASE_URL = 'https://query1.finance.yahoo.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const BATCH_SIZE = 20;
const REQUEST_TIMEOUT_MS = 10000;
const OPEN_REFRESH_MS = 15 * 1000;
const CLOSED_REFRESH_MS = 5 * 60 * 1000;
const BACKOFF_MS = 60 * 1000;
const DAILY_REFRESH_MS = 6 * 60 * 60 * 1000;
const DAILY_STAGGER_MS = 400;

const INDEX_SYMBOLS = { NIFTY: '^NSEI', BANKNIFTY: '^NSEBANK', INDIAVIX: '^INDIAVIX' };
const ALL_SYMBOLS = [...Object.keys(INDICES), 'INDIAVIX', ...NIFTY50.map((stock) => stock.symbol)];

const state = {
  quotes: new Map(),
  daily: new Map(),
  quotesUpdatedAt: null,
  dailyUpdatedAt: null,
  lastError: null,
  started: false,
};

const round2 = (value) => Math.round(value * 100) / 100;

function toYahoo(symbol) {
  return INDEX_SYMBOLS[symbol] || `${symbol}.NS`;
}

function fromYahoo(yahooSymbol) {
  const index = Object.entries(INDEX_SYMBOLS).find(([, value]) => value === yahooSymbol);
  if (index) return index[0];
  return yahooSymbol.replace(/\.NS$/, '');
}

/** IST date key and minute-of-day for a unix timestamp in seconds. */
function istParts(seconds) {
  const wall = clock.toIstWallClock(new Date(seconds * 1000));
  return { dateKey: clock.dateKeyOf(wall), minute: wall.getUTCHours() * 60 + wall.getUTCMinutes() };
}

async function getJson(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const error = new Error(`Yahoo responded ${response.status} for ${path.split('?')[0]}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function reportError(error) {
  const message = error.message || String(error);
  if (state.lastError !== message) console.warn(`[market] live feed: ${message}`);
  state.lastError = message;
}

// --- Quotes ----------------------------------------------------------------------

function parseSpark(entry) {
  if (!entry || !Array.isArray(entry.timestamp) || !Array.isArray(entry.close)) return null;
  const series = [];
  entry.timestamp.forEach((ts, i) => {
    const price = entry.close[i];
    if (price !== null && price !== undefined) series.push({ ts, price: round2(price) });
  });
  if (!series.length) return null;

  const last = series[series.length - 1];
  const { dateKey } = istParts(last.ts);
  const prices = series.map((point) => point.price);
  return {
    ltp: last.price,
    open: series[0].price,
    high: Math.max(...prices),
    low: Math.min(...prices),
    prevClose: round2(entry.chartPreviousClose ?? entry.previousClose ?? series[0].price),
    asOf: last.ts * 1000,
    dateKey,
    minute: istParts(last.ts).minute,
    series: series.map((point) => ({ minute: istParts(point.ts).minute, price: point.price })),
  };
}

async function refreshQuotes() {
  const batches = [];
  for (let i = 0; i < ALL_SYMBOLS.length; i += BATCH_SIZE) batches.push(ALL_SYMBOLS.slice(i, i + BATCH_SIZE));

  const results = await Promise.allSettled(
    batches.map((batch) =>
      getJson(
        `/v8/finance/spark?symbols=${batch.map((s) => encodeURIComponent(toYahoo(s))).join(',')}&range=1d&interval=1m`,
      ),
    ),
  );

  let updated = 0;
  results.forEach((result) => {
    if (result.status !== 'fulfilled') {
      reportError(result.reason);
      return;
    }
    Object.entries(result.value || {}).forEach(([yahooSymbol, entry]) => {
      const quote = parseSpark(entry);
      if (quote) {
        state.quotes.set(fromYahoo(yahooSymbol), quote);
        updated += 1;
      }
    });
  });

  if (updated) {
    state.quotesUpdatedAt = Date.now();
    if (results.every((r) => r.status === 'fulfilled')) state.lastError = null;
  }
  const throttled = results.some((r) => r.status === 'rejected' && r.reason && r.reason.status === 429);
  return { updated, throttled };
}

// --- Daily candles ---------------------------------------------------------------

async function refreshDaily(symbol) {
  const data = await getJson(`/v8/finance/chart/${encodeURIComponent(toYahoo(symbol))}?range=5y&interval=1d`);
  const result = data && data.chart && data.chart.result && data.chart.result[0];
  const ohlc = result && result.indicators && result.indicators.quote && result.indicators.quote[0];
  if (!result || !ohlc || !Array.isArray(result.timestamp)) throw new Error(`No daily data for ${symbol}`);

  const candles = [];
  result.timestamp.forEach((ts, i) => {
    const [open, high, low, close] = [ohlc.open[i], ohlc.high[i], ohlc.low[i], ohlc.close[i]];
    if ([open, high, low, close].some((v) => v === null || v === undefined)) return;
    candles.push({
      time: istParts(ts).dateKey,
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume: Math.round(ohlc.volume[i] || 0),
    });
  });
  if (candles.length) state.daily.set(symbol, candles);
}

async function refreshAllDaily() {
  const chartSymbols = ALL_SYMBOLS.filter((symbol) => symbol !== 'INDIAVIX');
  for (const symbol of chartSymbols) {
    try {
      await refreshDaily(symbol);
    } catch (error) {
      reportError(error);
    }
    await new Promise((resolve) => setTimeout(resolve, DAILY_STAGGER_MS));
  }
  state.dailyUpdatedAt = Date.now();
}

// --- Scheduler -------------------------------------------------------------------

function scheduleQuotes(delay) {
  setTimeout(async () => {
    let next = clock.getSession(new Date()).isOpen ? OPEN_REFRESH_MS : CLOSED_REFRESH_MS;
    try {
      const { throttled } = await refreshQuotes();
      if (throttled) next = Math.max(next, BACKOFF_MS);
    } catch (error) {
      reportError(error);
      next = Math.max(next, BACKOFF_MS);
    }
    scheduleQuotes(next);
  }, delay);
}

function scheduleDaily(delay) {
  setTimeout(async () => {
    await refreshAllDaily();
    scheduleDaily(DAILY_REFRESH_MS);
  }, delay);
}

/** Starts background polling. Resolves after the first quote fetch (or its failure). */
async function start() {
  if (state.started) return;
  state.started = true;
  try {
    const { updated } = await refreshQuotes();
    console.log(`[market] live feed: ${updated}/${ALL_SYMBOLS.length} quotes loaded from Yahoo Finance`);
  } catch (error) {
    reportError(error);
  }
  scheduleQuotes(clock.getSession(new Date()).isOpen ? OPEN_REFRESH_MS : CLOSED_REFRESH_MS);
  scheduleDaily(0);
}

// --- Read access -----------------------------------------------------------------

function getQuote(symbol) {
  return state.quotes.get(symbol) || null;
}

function getDaily(symbol) {
  return state.daily.get(symbol) || null;
}

/** Last traded price at or before `minute` (IST) in the latest session, if known. */
function priceAtMinute(symbol, minute) {
  const quote = state.quotes.get(symbol);
  if (!quote) return null;
  let price = null;
  for (const point of quote.series) {
    if (point.minute > minute) break;
    price = point.price;
  }
  return price ?? quote.series[0].price;
}

function status() {
  return {
    source: state.quotes.size ? 'yahoo' : 'simulated',
    quotes: state.quotes.size,
    dailyHistories: state.daily.size,
    quotesUpdatedAt: state.quotesUpdatedAt ? new Date(state.quotesUpdatedAt).toISOString() : null,
    dailyUpdatedAt: state.dailyUpdatedAt ? new Date(state.dailyUpdatedAt).toISOString() : null,
    lastError: state.lastError,
  };
}

module.exports = { start, refreshQuotes, getQuote, getDaily, priceAtMinute, status };
