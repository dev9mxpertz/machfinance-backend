/* eslint-disable no-console */
// Development helper: prints the current TOTP for a user so you can log in
// without an authenticator app.  Usage: npm run totp [-- email]
const { connectDatabase, disconnectDatabase } = require('../config/db');
const config = require('../config/env');
const { User } = require('../models');
const totp = require('../utils/totp');

async function main() {
  if (config.isProd) throw new Error('This helper is disabled in production');

  const email = (process.argv[2] || 'john.doe@example.com').toLowerCase();
  await connectDatabase();
  const user = await User.findOne({ email }).select('+totpSecret');
  if (!user) throw new Error(`No user found for ${email}. Did you run "npm run seed"?`);

  const secondsLeft = totp.STEP_SECONDS - (Math.floor(Date.now() / 1000) % totp.STEP_SECONDS);
  console.log(`TOTP for ${email}: ${totp.generateToken(user.totpSecret)} (valid for ~${secondsLeft}s)`);
  await disconnectDatabase();
}

main().catch(async (error) => {
  console.error(error.message);
  await disconnectDatabase();
  process.exit(1);
});
