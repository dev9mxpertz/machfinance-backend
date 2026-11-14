const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const controller = require('../controllers/positionController');
const { z, objectId, symbol } = require('./schemas');

const router = express.Router();

router.get(
  '/',
  validate({
    query: z.object({
      status: z.enum(['open', 'closed', 'all']).default('open'),
      underlying: symbol.optional(),
    }),
  }),
  asyncHandler(controller.list),
);

router.get('/history', asyncHandler(controller.history));
router.get('/funds', asyncHandler(controller.funds));

router.post(
  '/exit',
  validate({ body: z.object({ ids: z.array(objectId).max(100).default([]) }) }),
  asyncHandler(controller.exit),
);

module.exports = router;
