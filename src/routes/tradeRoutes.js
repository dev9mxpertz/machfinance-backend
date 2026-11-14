const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const controller = require('../controllers/tradeController');
const { z, tradeFilters } = require('./schemas');

const router = express.Router();

router.get(
  '/',
  validate({
    query: z.object({
      ...tradeFilters,
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(5).max(100).default(20),
    }),
  }),
  asyncHandler(controller.list),
);

router.get(
  '/heatmap',
  validate({
    query: z.object({
      segment: tradeFilters.segment,
      underlying: tradeFilters.underlying,
      from: tradeFilters.from,
      to: tradeFilters.to,
    }),
  }),
  asyncHandler(controller.heatmap),
);

router.get(
  '/export',
  validate({ query: z.object({ ...tradeFilters, format: z.enum(['csv', 'xlsx']).default('csv') }) }),
  asyncHandler(controller.exportTrades),
);

module.exports = router;
