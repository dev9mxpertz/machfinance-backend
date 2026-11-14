const ApiError = require('../utils/ApiError');
const { StrategyCode, CodeRun } = require('../models');
const { runSimulatedBacktest } = require('../services/backtestSimulator');

async function list(req, res) {
  const items = await StrategyCode.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100);
  res.json({ items });
}

async function upload(req, res) {
  if (!req.file) throw ApiError.badRequest('Please attach a .py file');

  const content = req.file.buffer.toString('utf8');
  if (!content.trim()) throw ApiError.badRequest('The uploaded file is empty');
  if (content.includes('\u0000')) throw ApiError.badRequest('Binary files are not supported');

  const code = await StrategyCode.create({
    user: req.user._id,
    ...req.valid.body,
    filename: req.file.originalname,
    sizeBytes: req.file.size,
    content,
  });
  res.status(201).json(code);
}

async function download(req, res) {
  const code = await StrategyCode.findOne({ _id: req.valid.params.id, user: req.user._id }).select('+content');
  if (!code) throw ApiError.notFound('Code not found');

  const safeName = code.filename.replace(/[^\w.-]/g, '_');
  res.setHeader('Content-Type', 'text/x-python; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.send(code.content);
}

async function remove(req, res) {
  const result = await StrategyCode.deleteOne({ _id: req.valid.params.id, user: req.user._id });
  if (!result.deletedCount) throw ApiError.notFound('Code not found');
  await CodeRun.deleteMany({ code: req.valid.params.id, user: req.user._id });
  res.status(204).end();
}

async function run(req, res) {
  const { codeId, mode, initialCapital, params } = req.valid.body;
  if (mode === 'live') {
    throw ApiError.unprocessable('Live mode needs a connected broker account. Run in Paper mode for now.');
  }

  const code = await StrategyCode.findOne({ _id: codeId, user: req.user._id }).select('+content');
  if (!code) throw ApiError.notFound('Code not found');

  const result = runSimulatedBacktest({ content: code.content, params, initialCapital });
  const codeRun = await CodeRun.create({
    user: req.user._id,
    code: code._id,
    mode,
    initialCapital,
    params,
    ...result,
  });
  await codeRun.populate('code', 'title version filename');
  res.status(201).json(codeRun);
}

async function listRuns(req, res) {
  const items = await CodeRun.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('code', 'title version filename');
  res.json({ items });
}

module.exports = { list, upload, download, remove, run, listRuns };
