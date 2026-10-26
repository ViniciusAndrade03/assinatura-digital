'use strict';
const config = require('./config');
const { connect } = require('./db');
const { createApp } = require('./app');
const { ensureServerKey } = require('./services/crypto');
const { seedIfEmpty } = require('./seed');

async function main() {
  await connect();
  await ensureServerKey();
  if (process.env.SEED_ON_START === 'true') await seedIfEmpty();
  createApp().listen(config.port, () => console.log(`API ouvindo na porta ${config.port}`));
}

main().catch((err) => {
  console.error('Falha ao iniciar:', err.message);
  process.exit(1);
});
