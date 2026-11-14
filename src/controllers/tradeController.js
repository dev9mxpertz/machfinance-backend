const ExcelJS = require('exceljs');
const { Trade } = require('../models');

const SORTABLE_FIELDS = {
  tradedAt: 'tradedAt',
  symbol: 'tradingSymbol',
  quantity: 'quantity',
  price: 'price',
  expiry: 'expiry',
};

const EXPORT_COLUMNS = [
  { header: 'Symbol', key: 'tradingSymbol', width: 28 },
  { header: 'Exchange', key: 'exchange', width: 10 },
  { header: 'Trade Time', key: 'tradedAt', width: 22 },
  { header: 'Order ID', key: 'orderId', width: 22 },
  { header: 'Trade ID', key: 'tradeId', width: 14 },
  { header: 'Type', key: 'side', width: 8 },
  { header: 'Qty', key: 'quantity', width: 8 },
  { header: 'Price', key: 'price', width: 12 },
  { header: 'Expiry', key: 'expiry', width: 12 },
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildFilter(userId, { segment, underlying, from, to, q }) {
  const filter = { user: userId };
  if (segment !== 'ALL') filter.segment = segment;
  if (underlying) filter.underlying = underlying;
  if (from || to) {
    filter.tradedAt = {};
    if (from) filter.tradedAt.$gte = new Date(`${from}T00:00:00+05:30`);
    if (to) filter.tradedAt.$lte = new Date(`${to}T23:59:59.999+05:30`);
  }
  if (q) filter.tradingSymbol = { $regex: escapeRegex(q.toUpperCase()) };
  return filter;
}

function formatIst(date) {
  return new Date(date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
}

async function list(req, res) {
  const { page, limit, sort, order, ...filters } = req.valid.query;
  const filter = buildFilter(req.user._id, filters);
  const sortField = SORTABLE_FIELDS[sort] || 'tradedAt';

  const [items, total, latest] = await Promise.all([
    Trade.find(filter)
      .sort({ [sortField]: order === 'asc' ? 1 : -1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Trade.countDocuments(filter),
    Trade.findOne({ user: req.user._id }).sort({ tradedAt: -1 }).select('tradedAt'),
  ]);

  res.json({
    items,
    page,
    limit,
    total,
    totalPages: Math.max(Math.ceil(total / limit), 1),
    lastUpdated: latest ? latest.tradedAt : null,
  });
}

async function heatmap(req, res) {
  const { from, to, segment, underlying } = req.valid.query;
  const filter = buildFilter(req.user._id, { segment, underlying, from, to });

  const days = await Trade.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$tradedAt', timezone: 'Asia/Kolkata' } },
        count: { $sum: 1 },
      },
    },
    { $project: { _id: 0, date: '$_id', count: 1 } },
    { $sort: { date: 1 } },
  ]);

  res.json({ from, to, days });
}

async function exportTrades(req, res) {
  const { format, sort, order, ...filters } = req.valid.query;
  const filter = buildFilter(req.user._id, filters);
  const sortField = SORTABLE_FIELDS[sort] || 'tradedAt';
  const cursor = Trade.find(filter)
    .sort({ [sortField]: order === 'asc' ? 1 : -1 })
    .lean()
    .cursor();
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tradebook-${stamp}.csv"`);
    res.write(`${EXPORT_COLUMNS.map((c) => c.header).join(',')}\n`);
    for await (const trade of cursor) {
      const row = EXPORT_COLUMNS.map(({ key }) => {
        const value = key === 'tradedAt' ? formatIst(trade.tradedAt) : trade[key] ?? '';
        const text = String(value);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      });
      res.write(`${row.join(',')}\n`);
    }
    res.end();
    return;
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="tradebook-${stamp}.xlsx"`);
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
  const sheet = workbook.addWorksheet('Trade book');
  sheet.columns = EXPORT_COLUMNS;
  sheet.getRow(1).font = { bold: true };
  for await (const trade of cursor) {
    sheet.addRow({ ...trade, tradedAt: formatIst(trade.tradedAt) }).commit();
  }
  sheet.commit();
  await workbook.commit();
}

module.exports = { list, heatmap, exportTrades };
