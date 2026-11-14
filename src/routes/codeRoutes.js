const path = require('path');
const express = require('express');
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const controller = require('../controllers/codeController');
const { z, objectId } = require('./schemas');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 256 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    if (path.extname(file.originalname).toLowerCase() !== '.py') {
      callback(ApiError.badRequest('Only .py files are supported'));
      return;
    }
    callback(null, true);
  },
});

router.get('/', asyncHandler(controller.list));

router.post(
  '/',
  upload.single('file'),
  validate({
    body: z.object({
      title: z.string().trim().min(1, 'Title is required').max(80),
      description: z.string().trim().max(1000).default(''),
      version: z.string().trim().min(1, 'Version is required').max(20),
    }),
  }),
  asyncHandler(controller.upload),
);

router.get('/runs', asyncHandler(controller.listRuns));

router.post(
  '/runs',
  validate({
    body: z.object({
      codeId: objectId,
      mode: z.enum(['paper', 'live']),
      initialCapital: z.number().min(10000, 'Minimum capital is ₹10,000').max(1e9),
      params: z.record(z.union([z.number(), z.string(), z.boolean()])).default({}),
    }),
  }),
  asyncHandler(controller.run),
);

router.get('/:id/download', validate({ params: z.object({ id: objectId }) }), asyncHandler(controller.download));
router.delete('/:id', validate({ params: z.object({ id: objectId }) }), asyncHandler(controller.remove));

module.exports = router;
