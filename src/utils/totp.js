// RFC 6238 TOTP (SHA-1, 6 digits, 30s step). Compatible with Google
// Authenticator, Microsoft Authenticator, Authy and similar apps.
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input) {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 secret');
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateSecret(byteLength = 20) {
  return base32Encode(crypto.randomBytes(byteLength));
}

function hotp(secret, counter) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(code).padStart(DIGITS, '0');
}

function currentCounter(timestamp = Date.now()) {
  return Math.floor(timestamp / 1000 / STEP_SECONDS);
}

function generateToken(secret, timestamp = Date.now()) {
  return hotp(secret, currentCounter(timestamp));
}

/**
 * Returns the matched time-step counter when the token is valid within
 * +/- `window` steps, otherwise null. Callers persist the counter so the
 * same code cannot be replayed.
 */
function verifyToken(secret, token, { window = 1, timestamp = Date.now() } = {}) {
  if (!/^\d{6}$/.test(String(token))) return null;
  const counter = currentCounter(timestamp);
  const provided = Buffer.from(String(token));
  for (let drift = -window; drift <= window; drift += 1) {
    const expected = Buffer.from(hotp(secret, counter + drift));
    if (crypto.timingSafeEqual(expected, provided)) return counter + drift;
  }
  return null;
}

function keyUri({ secret, account, issuer }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

module.exports = {
  STEP_SECONDS,
  generateSecret,
  generateToken,
  verifyToken,
  keyUri,
};
