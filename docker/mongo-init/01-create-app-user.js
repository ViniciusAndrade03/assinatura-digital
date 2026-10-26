// Executado apenas na primeira inicialização do MongoDB.
// Cria um usuário da aplicação com privilégio MÍNIMO (readWrite só no banco "assinatura"),
// em vez de a API usar o usuário root.
const appDb = db.getSiblingDB('assinatura');
appDb.createUser({
  user: process.env.MONGO_APP_USER,
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [{ role: 'readWrite', db: 'assinatura' }],
});
print('Usuário da aplicação criado com permissão readWrite em "assinatura".');
