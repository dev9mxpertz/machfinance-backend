const express = require('express');
const validate = require('../middleware/validate');
const controller = require('../controllers/marketController');
const { z, symbol, indexSymbol, dateKey, csvList } = require('./schemas');

const router = express.Router();

const symbolParam = validate({ params: z.object({ symbol }) });
const clockTime = z.string().regex(/^\d{1,2}:\d{2}$/, 'Use HH:mm').optional();

router.get('/search', validate({ query: z.object({ q: z.string().max(40).optional() }) }), controller.search);
router.get('/nifty50', controller.nifty50);
router.get('/sectors', controller.sectors);
router.get('/quote/:symbol', symbolParam, controller.quote);
router.get('/depth/:symbol', symbolParam, controller.depth);
router.get('/fundamentals/:symbol', symbolParam, controller.fundamentals);
router.get('/expiries/:symbol', validate({ params: z.object({ symbol: indexSymbol }) }), controller.expiries);

router.get(
  '/candles',
  validate({ query: z.object({ symbol, interval: z.enum(['1D', '1W']).default('1D') }) }),
  controller.candles,
);

router.get(
  '/option-chain',
  validate({
    query: z.object({
      symbol: indexSymbol,
      expiry: dateKey.optional(),
      strikes: z.coerce.number().int().min(3).max(30).default(10),
    }),
  }),
  controller.optionChain,
);

router.get(
  '/oi-change',
  validate({
    query: z.object({
      symbol: indexSymbol,
      expiries: csvList.pipe(z.array(dateKey).max(6)),
      from: clockTime,
      to: clockTime,
      strikeMin: z.coerce.number().positive().optional(),
      strikeMax: z.coerce.number().positive().optional(),
    }),
  }),
  controller.oiChange,
);

module.exports = router;
