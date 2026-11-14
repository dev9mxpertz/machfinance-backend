const ApiError = require('../utils/ApiError');

/**
 * Validates request parts against zod schemas. Parsed (and coerced) values are
 * exposed on `req.valid` so handlers never read unvalidated input.
 */
const validate = (schemas) => (req, _res, next) => {
  req.valid = {};
  const issues = [];

  ['params', 'query', 'body'].forEach((part) => {
    if (!schemas[part]) return;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (result.success) {
      req.valid[part] = result.data;
    } else {
      result.error.issues.forEach((issue) => {
        issues.push({ field: [part, ...issue.path].join('.'), message: issue.message });
      });
    }
  });

  if (issues.length) return next(ApiError.badRequest(issues[0].message, issues));
  return next();
};

module.exports = validate;
