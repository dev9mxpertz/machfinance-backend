const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const controller = require('../controllers/accountController');
const { z } = require('./schemas');

const router = express.Router();

router.get('/', asyncHandler(controller.getAccount));

router.patch(
  '/contact',
  validate({
    body: z
      .object({
        email: z.string().trim().toLowerCase().email('Enter a valid email address').optional(),
        mobile: z
          .string()
          .trim()
          .regex(/^\+91\d{10}$/, 'Mobile must be in the format +91XXXXXXXXXX')
          .optional(),
      })
      .refine((body) => body.email || body.mobile, 'Nothing to update'),
  }),
  asyncHandler(controller.updateContact),
);

module.exports = router;
