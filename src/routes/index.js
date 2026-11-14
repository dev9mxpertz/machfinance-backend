const express = require('express');
const mongoose = require('mongoose');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'up' : 'down' });
});

router.use('/auth', require('./authRoutes'));

// Everything below requires an authenticated session.
router.use(requireAuth);
router.use('/market', require('./marketRoutes'));
router.use('/strategies', require('./strategyRoutes'));
router.use('/positions', require('./positionRoutes'));
router.use('/trades', require('./tradeRoutes'));
router.use('/account', require('./accountRoutes'));
router.use('/codes', require('./codeRoutes'));

module.exports = router;
