const { Position } = require('../models');
const tradingService = require('../services/tradingService');

async function list(req, res) {
  const { status, underlying } = req.valid.query;
  const filter = { user: req.user._id };
  if (status !== 'all') filter.status = status;
  if (underlying) filter.underlying = underlying;

  const now = new Date();
  const spotCache = new Map();
  const positions = await Position.find(filter).sort({ openedAt: -1 }).limit(200);
  const items = positions.map((position) => tradingService.markPosition(position, now, spotCache));

  const summary = items.reduce(
    (acc, item) => ({
      bookedPnl: acc.bookedPnl + item.bookedPnl,
      unbookedPnl: acc.unbookedPnl + item.unbookedPnl,
    }),
    { bookedPnl: 0, unbookedPnl: 0 },
  );

  res.json({ items, summary: { ...summary, totalPnl: summary.bookedPnl + summary.unbookedPnl } });
}

async function history(req, res) {
  const now = new Date();
  const spotCache = new Map();
  const positions = await Position.find({ user: req.user._id }).sort({ openedAt: -1 }).limit(50);
  const items = positions.map((position) => {
    const marked = tradingService.markPosition(position, now, spotCache);
    return { ...marked, presentCapital: Math.round((position.capitalAtEntry + marked.pnl) * 100) / 100 };
  });
  res.json({ items });
}

async function exit(req, res) {
  const result = await tradingService.exitPositions(req.user, req.valid.body.ids);
  res.json(result);
}

async function funds(req, res) {
  res.json(await tradingService.getFunds(req.user));
}

module.exports = { list, history, exit, funds };
