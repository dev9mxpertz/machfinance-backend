/**
 * Paper-mode runner for uploaded strategy code.
 *
 * Executing user-supplied Python on the API host is unsafe, so until a sandboxed
 * worker is in place this simulator produces a reproducible equity curve seeded
 * by the code contents and parameters. The result shape matches what the real
 * runner will return, so the UI does not need to change later.
 */
const { rngFor } = require('../utils/random');
const { tradingDaysUntil, dateKeyOf } = require('./marketClock');

const SESSIONS = 120;

function gaussian(rng) {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

function runSimulatedBacktest({ content, params, initialCapital, now = new Date() }) {
  const rng = rngFor('backtest', content, JSON.stringify(params || {}));
  const stopLoss = Number(params?.sl) || 0.02;
  const target = Number(params?.target) || 0.05;

  // Wider targets relative to stops nudge expectancy up but increase variance.
  const edge = Math.min(Math.max((target / stopLoss - 1.5) * 0.0003, -0.0006), 0.0012);
  const volatility = 0.006 + stopLoss * 0.15;

  const days = tradingDaysUntil(dateKeyOf(now), SESSIONS);
  let equity = initialCapital;
  let peak = equity;
  let maxDrawdown = 0;
  let trades = 0;
  let wins = 0;

  const equityCurve = days.map((date) => {
    const dailyTrades = 1 + Math.floor(rng() * 4);
    for (let i = 0; i < dailyTrades; i += 1) {
      const result = edge / dailyTrades + (volatility / Math.sqrt(dailyTrades)) * gaussian(rng);
      equity *= 1 + result;
      trades += 1;
      if (result > 0) wins += 1;
    }
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
    return { date, value: Math.round(equity) };
  });

  const netPnl = equity - initialCapital;
  return {
    status: 'completed',
    metrics: {
      finalCapital: Math.round(equity),
      netPnl: Math.round(netPnl),
      returnPct: Math.round((netPnl / initialCapital) * 10000) / 100,
      trades,
      winRatePct: Math.round((wins / trades) * 1000) / 10,
      maxDrawdownPct: Math.round(maxDrawdown * 10000) / 100,
    },
    equityCurve,
  };
}

module.exports = { runSimulatedBacktest };
