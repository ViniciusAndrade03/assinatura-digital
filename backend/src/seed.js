'use strict';
/** Cria usuários iniciais (um de cada perfil) caso o banco esteja vazio. */
const bcrypt = require('bcryptjs');
const { User } = require('./models/User');

const DEFAULT_PASSWORD = process.env.SEED_PASSWORD || 'Senha@123';

const USERS = [
  { name: 'Gerente Demo', email: 'gerente@empresa.com', role: 'gerente', department: 'Diretoria', position: 'Gerente' },
  { name: 'Aprovador Demo', email: 'aprovador@empresa.com', role: 'aprovador', department: 'Financeiro', position: 'Analista Financeiro' },
  { name: 'Colaborador Demo', email: 'colaborador@empresa.com', role: 'colaborador', department: 'Comercial', position: 'Representante' },
];

async function seedIfEmpty() {
  if (await User.estimatedDocumentCount()) return false;
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
  await User.insertMany(USERS.map((u) => ({ ...u, passwordHash })));
  console.log(`Seed: ${USERS.length} usuários criados (senha inicial definida em SEED_PASSWORD)`);
  return true;
}

module.exports = { seedIfEmpty };

if (require.main === module) {
  const { connect, mongoose } = require('./db');
  connect()
    .then(seedIfEmpty)
    .then((created) => console.log(created ? 'Seed concluído.' : 'Banco já possui usuários; nada a fazer.'))
    .finally(() => mongoose.disconnect());
}
