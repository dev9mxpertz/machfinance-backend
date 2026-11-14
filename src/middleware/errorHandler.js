const mongoose = require('mongoose');
const multer = require('multer');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

function notFound(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

function normalise(err) {
  if (err instanceof ApiError) return err;

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return ApiError.badRequest(details[0]?.message || 'Validation failed', details);
  }
  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for ${err.path}`);
  }
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    return ApiError.conflict(field ? `A record with this ${field} already exists` : 'Duplicate record');
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message;
    return ApiError.badRequest(message);
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return ApiError.badRequest('Malformed JSON body');
  }
  // Errors thrown by services with an explicit status (e.g. unknown symbol)
  if (err && Number.isInteger(err.statusCode) && err.statusCode < 500) {
    return new ApiError(err.statusCode, err.message);
  }
  return null;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const apiError = normalise(err);

  if (!apiError) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    return res.status(500).json({
      error: {
        message: 'Something went wrong. Please try again.',
        ...(config.isProd ? {} : { debug: err.message }),
      },
    });
  }

  return res.status(apiError.statusCode).json({
    error: { message: apiError.message, ...(apiError.details ? { details: apiError.details } : {}) },
  });
}

module.exports = { notFound, errorHandler };
