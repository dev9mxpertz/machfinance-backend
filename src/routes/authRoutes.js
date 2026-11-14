const express = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/authController');
const { z } = require('./schemas');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Please try again in a few minutes.' } },
});

router.post(
  '/login',
  authLimiter,
  validate({
    body: z.object({
      email: z.string().trim().toLowerCase().email('Enter a valid email address'),
      password: z.string().min(1, 'Password is required').max(128),
    }),
  }),
  asyncHandler(controller.login),
);

router.post(
  '/totp',
  authLimiter,
  validate({
    body: z.object({
      challengeToken: z.string().min(1),
      code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6 digit code'),
    }),
  }),
  asyncHandler(controller.verifyTotp),
);

router.get('/me', requireAuth, asyncHandler(controller.me));

module.exports = router;
