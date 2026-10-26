'use strict';
const mongoose = require('mongoose');
const config = require('./config');

// Ignora campos não declarados no schema ao montar filtros (defesa extra contra NoSQL injection;
// a defesa principal é express-mongo-sanitize + validação Zod nas rotas)
mongoose.set('strictQuery', true);

async function connect(uri = config.mongoUri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  return mongoose.connection;
}

module.exports = { connect, mongoose };
