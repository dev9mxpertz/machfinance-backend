const jwt = require('jsonwebtoken');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { User } = require('../models');

const TOKEN_PURPOSE = {
  ACCESS: 'access',
  TOTP_CHALLENGE: 'totp-challenge',
};

function signToken(userId, purpose, expiresIn) {
  return jwt.sign({ sub: String(userId), purpose }, config.jwt.secret, { expiresIn });
}

function verifyToken(token, expectedPurpose) {
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    if (payload.purpose !== expectedPurpose) return null;
    return payload;
  } catch {
    return null;
  }
}

const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized();

  const payload = verifyToken(token, TOKEN_PURPOSE.ACCESS);
  if (!payload) throw ApiError.unauthorized('Session expired, please log in again');

  const user = await User.findById(payload.sub);
  if (!user || user.status !== 'active') throw ApiError.unauthorized('Account is not active');

  req.user = user;
  next();
});

module.exports = { TOKEN_PURPOSE, signToken, verifyToken, requireAuth };
