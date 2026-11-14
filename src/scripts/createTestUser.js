/* eslint-disable no-console */
/**
 * Creates (or recreates) a QA account that logs in with a fixed TOTP code.
 * Profile, trades, positions, strategies and codes are copied from the seeded
 * demo user so every screen has data. Run "npm run seed" first.
 *
 *   npm run create-test-user
 *
 * The fixed code is only accepted while ALLOW_STATIC_TOTP=true in .env.
 */
const bcrypt = require('bcryptjs');
const config = require('../config/env');
const { connectDatabase, disconnectDatabase } = require('../config/db');
const { User, Strategy, Position, Trade, StrategyCode, CodeRun } = require('../models');
const totp = require('../utils/totp');

const SOURCE_EMAIL = 'john.doe@example.com';
const TEST_USER = {
  name: 'Test User',
  email: 'test.user@example.com',
  password: 'Test@1234',
  staticCode: '343434',
  clientId: 'MF10001',
};

function cloneFor(docs, userId, extra = () => ({})) {
  return docs.map((doc) => {
    const { _id, __v, createdAt, updatedAt, ...rest } = doc;
    return { ...rest, ...extra(doc), user: userId };
  });
}

async function removeExisting() {
  const existing = await User.findOne({ email: TEST_USER.email });
  if (!existing) return;
  await Promise.all([
    Strategy.deleteMany({ user: existing._id }),
    Position.deleteMany({ user: existing._id }),
    Trade.deleteMany({ user: existing._id }),
    StrategyCode.deleteMany({ user: existing._id }),
    CodeRun.deleteMany({ user: existing._id }),
    User.deleteOne({ _id: existing._id }),
  ]);
}

async function main() {
  if (config.isProd) throw new Error('Test accounts cannot be created in production');

  await connectDatabase();
  const source = await User.findOne({ email: SOURCE_EMAIL }).lean();
  if (!source) throw new Error(`Demo user ${SOURCE_EMAIL} not found. Run "npm run seed" first.`);

  await removeExisting();

  const { _id, __v, createdAt, updatedAt, passwordHash, totpSecret, lastTotpCounter, lastLoginAt, ...profile } =
    source;
  const user = new User({
    ...profile,
    name: TEST_USER.name,
    email: TEST_USER.email,
    clientId: TEST_USER.clientId,
    family: [],
    totpSecret: totp.generateSecret(),
    staticTotpHash: await bcrypt.hash(TEST_USER.staticCode, 10),
  });
  await user.setPassword(TEST_USER.password);
  await user.save();

  const [trades, positions, strategies, codes, runs] = await Promise.all([
    Trade.find({ user: source._id }).lean(),
    Position.find({ user: source._id }).lean(),
    Strategy.find({ user: source._id }).lean(),
    StrategyCode.find({ user: source._id }).select('+content').lean(),
    CodeRun.find({ user: source._id }).lean(),
  ]);

  const codeIdMap = new Map();
  const newCodes = await StrategyCode.insertMany(cloneFor(codes, user._id));
  codes.forEach((code, index) => codeIdMap.set(String(code._id), newCodes[index]._id));

  await Promise.all([
    Trade.insertMany(cloneFor(trades, user._id, (trade) => ({ tradeId: `QA_${trade.tradeId}` })), { ordered: false }),
    Position.insertMany(cloneFor(positions, user._id)),
    Strategy.insertMany(cloneFor(strategies, user._id)),
    CodeRun.insertMany(cloneFor(runs, user._id, (run) => ({ code: codeIdMap.get(String(run.code)) }))),
  ]);

  console.log('\nTest account ready');
  console.log('------------------');
  console.log(`Email    : ${TEST_USER.email}`);
  console.log(`Password : ${TEST_USER.password}`);
  console.log(`TOTP     : ${TEST_USER.staticCode} (fixed)`);
  console.log(`Copied   : ${trades.length} trades, ${positions.length} positions, ${strategies.length} strategies`);
  if (!config.allowStaticTotp) {
    console.log('\nNote: set ALLOW_STATIC_TOTP=true in .env and restart the API to accept the fixed code.');
  }
  await disconnectDatabase();
}

main().catch(async (error) => {
  console.error(error.message);
  await disconnectDatabase();
  process.exit(1);
});
