const config = require('./config/env');
const { connectDatabase, disconnectDatabase } = require('./config/db');
const createApp = require('./app');

async function start() {
  if (config.allowStaticTotp) {
    console.warn('[api] ALLOW_STATIC_TOTP is on: test accounts can log in with a fixed code. Keep it off in production.');
  }
  await connectDatabase();
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port} (${config.nodeEnv})`);
  });

  server.on('error', async (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`[api] port ${config.port} is already in use. Stop the other server or set a different PORT in .env.`);
    } else {
      console.error('[api] server error:', error.message);
    }
    await disconnectDatabase();
    process.exit(1);
  });

  const shutdown = (signal) => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error) => {
  console.error('[api] failed to start:', error.message);
  process.exit(1);
});
