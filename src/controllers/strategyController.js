const ApiError = require('../utils/ApiError');
const { Strategy } = require('../models');
const { TEMPLATES } = require('../services/strategyTemplates');
const tradingService = require('../services/tradingService');

function templates(_req, res) {
  res.json({ categories: TEMPLATES });
}

async function list(req, res) {
  const { kind } = req.valid.query;
  const items = await Strategy.find({ user: req.user._id, kind }).sort({ updatedAt: -1 }).limit(100);
  res.json({ items });
}

async function create(req, res) {
  const strategy = await Strategy.create({ ...req.valid.body, user: req.user._id });
  res.status(201).json(strategy);
}

async function update(req, res) {
  const strategy = await Strategy.findOneAndUpdate(
    { _id: req.valid.params.id, user: req.user._id },
    req.valid.body,
    { new: true, runValidators: true },
  );
  if (!strategy) throw ApiError.notFound('Strategy not found');
  res.json(strategy);
}

async function remove(req, res) {
  const result = await Strategy.deleteOne({ _id: req.valid.params.id, user: req.user._id });
  if (!result.deletedCount) throw ApiError.notFound('Strategy not found');
  res.status(204).end();
}

async function execute(req, res) {
  const result = await tradingService.executeStrategy(req.user, req.valid.body);
  res.status(201).json(result);
}

module.exports = { templates, list, create, update, remove, execute };
