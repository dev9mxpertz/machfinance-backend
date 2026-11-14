const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const REQUIRED = ['MONGODB_URI', 'JWT_SECRET'];
const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const nodeEnv = process.env.NODE_ENV || 'development';

module.exports = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI,
  jwt: {
    secret: process.env.JWT_SECRET,
    accessTtl: process.env.JWT_ACCESS_TTL || '8h',
    challengeTtl: '5m',
  },
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  totpIssuer: 'MachFinance',
  demoTotpSecret: process.env.DEMO_TOTP_SECRET || '',
  allowStaticTotp: process.env.ALLOW_STATIC_TOTP === 'true',
};
