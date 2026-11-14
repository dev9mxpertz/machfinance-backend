const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const controller = require('../controllers/strategyController');
const { z, objectId, strategyBody, leg, indexSymbol } = require('./schemas');

const router = express.Router();
const idParam = validate({ params: z.object({ id: objectId }) });

router.get('/templates', controller.templates);

router.get(
  '/',
  validate({ query: z.object({ kind: z.enum(['saved', 'draft']).default('saved') }) }),
  asyncHandler(controller.list),
);

router.post('/', validate({ body: strategyBody }), asyncHandler(controller.create));
router.put('/:id', idParam, validate({ body: strategyBody }), asyncHandler(controller.update));
router.delete('/:id', idParam, asyncHandler(controller.remove));

router.post(
  '/execute',
  validate({
    body: z.object({
      underlying: indexSymbol,
      strategyName: z.string().trim().max(80).optional(),
      multiplier: z.number().int().min(1).max(50).default(1),
      product: z.enum(['NRML', 'MIS']).default('NRML'),
      legs: z.array(leg).min(1, 'Select at least one leg').max(12),
    }),
  }),
  asyncHandler(controller.execute),
);

module.exports = router;
