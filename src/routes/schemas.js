// Shared zod schemas for request validation.
const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const symbol = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .transform((value) => value.toUpperCase());
const indexSymbol = z.enum(['NIFTY', 'BANKNIFTY']);

const csvList = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(',').map((item) => item.trim()).filter(Boolean) : []));

const leg = z.object({
  side: z.enum(['B', 'S']),
  optionType: z.enum(['CE', 'PE']),
  expiry: dateKey,
  strike: z.number().int().positive(),
  lots: z.number().int().min(1).max(500),
  price: z.number().min(0).default(0),
});

const strategyBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  underlying: indexSymbol,
  kind: z.enum(['saved', 'draft']).default('saved'),
  multiplier: z.number().int().min(1).max(50).default(1),
  legs: z.array(leg).min(1, 'Add at least one leg').max(12),
});

const tradeFilters = {
  segment: z.enum(['ALL', 'FO', 'EQ']).default('ALL'),
  underlying: symbol.optional(),
  from: dateKey.optional(),
  to: dateKey.optional(),
  q: z.string().trim().max(40).optional(),
  sort: z.enum(['tradedAt', 'symbol', 'quantity', 'price', 'expiry']).default('tradedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
};

module.exports = {
  z,
  objectId,
  dateKey,
  symbol,
  indexSymbol,
  csvList,
  leg,
  strategyBody,
  tradeFilters,
};
