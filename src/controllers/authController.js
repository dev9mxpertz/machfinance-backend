const bcrypt = require('bcryptjs');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const totp = require('../utils/totp');
const { User } = require('../models');
const { TOKEN_PURPOSE, signToken, verifyToken } = require('../middleware/auth');

const INVALID_CREDENTIALS = 'Invalid email or password';
const TIMING_GUARD_HASH = bcrypt.hashSync('timing-guard-not-a-password', 12);

async function login(req, res) {
  const { email, password } = req.valid.body;
  const user = await User.findOne({ email }).select('+passwordHash');

  // Compare even when the user is missing to keep response timing uniform.
  const passwordOk = user ? await user.verifyPassword(password) : await bcrypt.compare(password, TIMING_GUARD_HASH);
  if (!user || !passwordOk) throw ApiError.unauthorized(INVALID_CREDENTIALS);
  if (user.status !== 'active') throw ApiError.forbidden('This account is not active');

  res.json({
    challengeToken: signToken(user.id, TOKEN_PURPOSE.TOTP_CHALLENGE, config.jwt.challengeTtl),
    user: { name: user.name, initials: user.initials, clientId: user.clientId },
  });
}

async function verifyTotp(req, res) {
  const { challengeToken, code } = req.valid.body;
  const payload = verifyToken(challengeToken, TOKEN_PURPOSE.TOTP_CHALLENGE);
  if (!payload) throw ApiError.unauthorized('Login session expired, please sign in again');

  const user = await User.findById(payload.sub).select('+totpSecret +lastTotpCounter +staticTotpHash');
  if (!user || user.status !== 'active') throw ApiError.unauthorized('Login session expired, please sign in again');

  if (config.allowStaticTotp && user.staticTotpHash && (await bcrypt.compare(code, user.staticTotpHash))) {
    user.lastLoginAt = new Date();
    await user.save();
    return res.json({
      token: signToken(user.id, TOKEN_PURPOSE.ACCESS, config.jwt.accessTtl),
      user: user.toSessionUser(),
    });
  }

  const counter = totp.verifyToken(user.totpSecret, code);
  if (counter === null) throw ApiError.unauthorized('Invalid TOTP. Please check your authenticator app.');
  if (counter <= user.lastTotpCounter) {
    throw ApiError.unauthorized('This TOTP has already been used. Wait for the next code.');
  }

  user.lastTotpCounter = counter;
  user.lastLoginAt = new Date();
  await user.save();

  res.json({
    token: signToken(user.id, TOKEN_PURPOSE.ACCESS, config.jwt.accessTtl),
    user: user.toSessionUser(),
  });
}

async function me(req, res) {
  res.json({ user: req.user.toSessionUser() });
}

module.exports = { login, verifyTotp, me };
