'use strict';
/**
 * Teste de integração do fluxo completo + testes de segurança.
 * Usa MongoDB em memória e a Web Crypto API do Node (mesma API do navegador)
 * para simular exatamente o que o frontend faz.
 *
 *   npm test
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');

const subtle = webcrypto.subtle;
let mongod, server, base, mongoose;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake-png-content')]);
const b64 = (buf) => Buffer.from(buf).toString('base64');

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('assinatura-test');
  process.env.CORS_ORIGINS = 'http://localhost:3000';
  const db = require('../src/db');
  mongoose = db.mongoose;
  await db.connect();
  await require('../src/services/crypto').ensureServerKey();
  await require('../src/seed').seedIfEmpty();
  server = require('../src/app').createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server?.close();
  await mongoose?.disconnect();
  await mongod?.stop();
});

/* ---------------------------- helpers HTTP ---------------------------- */
async function api(path, { method = 'GET', token, csrf, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (csrf) headers['X-CSRF-Token'] = csrf;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, headers: res.headers, data: ct.includes('json') ? await res.json() : await res.arrayBuffer() };
}

async function login(email, password = 'Senha@123') {
  const { data: c } = await api('/auth/csrf-token');
  const r = await api('/auth/login', { method: 'POST', csrf: c.csrfToken, body: { email, password } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return { token: r.data.token, csrf: r.data.csrfToken, user: r.data.user };
}

/* ------------------- "navegador": Web Crypto API ------------------- */
async function generateAndRegisterKey(sess, pin) {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKeyJwk = await subtle.exportKey('jwk', pair.publicKey);
  const pkcs8 = await subtle.exportKey('pkcs8', pair.privateKey);
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const iterations = 310000;
  const baseKey = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  const aes = await subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const enc = await subtle.encrypt({ name: 'AES-GCM', iv }, aes, pkcs8);
  return api('/keys', {
    method: 'POST', token: sess.token, csrf: sess.csrf,
    body: { currentPassword: 'Senha@123', publicKeyJwk, encryptedPrivateKey: b64(enc), salt: b64(salt), iv: b64(iv), iterations },
  });
}

async function unlockPrivateKey(sess, pin) {
  const { data } = await api('/keys/me', { token: sess.token });
  const k = data.key;
  const baseKey = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  const aes = await subtle.deriveKey({ name: 'PBKDF2', salt: Buffer.from(k.salt, 'base64'), iterations: k.iterations, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const pkcs8 = await subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(k.iv, 'base64') }, aes, Buffer.from(k.encryptedPrivateKey, 'base64'));
  return subtle.importKey('pkcs8', pkcs8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/* ------------------------------ TESTES ------------------------------ */
let colab, aprov, ger, expenseId;

test('login: exige CSRF, bloqueia NoSQL injection e senha errada', async () => {
  const semCsrf = await api('/auth/login', { method: 'POST', body: { email: 'gerente@empresa.com', password: 'Senha@123' } });
  assert.equal(semCsrf.status, 403);

  const { data: c } = await api('/auth/csrf-token');
  const inj = await api('/auth/login', { method: 'POST', csrf: c.csrfToken, body: { email: { $ne: null }, password: { $ne: null } } });
  assert.equal(inj.status, 400, 'operador $ne deve ser removido/rejeitado');

  const errada = await api('/auth/login', { method: 'POST', csrf: c.csrfToken, body: { email: 'gerente@empresa.com', password: 'errada123' } });
  assert.equal(errada.status, 401);

  colab = await login('colaborador@empresa.com');
  aprov = await login('aprovador@empresa.com');
  ger = await login('gerente@empresa.com');
  assert.equal(ger.user.role, 'gerente');
});

test('helmet: cabeçalhos HTTP de segurança presentes', async () => {
  const r = await api('/health');
  for (const h of ['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy']) {
    assert.ok(r.headers.get(h), `faltando ${h}`);
  }
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('JWT: token adulterado é rejeitado', async () => {
  const [h, p] = colab.token.split('.');
  const forged = `${h}.${Buffer.from(JSON.stringify({ sub: 'x', role: 'gerente' })).toString('base64url')}.${p}`;
  assert.equal((await api('/auth/me', { token: forged })).status, 401);
  assert.equal((await api('/users', { token: colab.token })).status, 403, 'colaborador não acessa CRUD');
});

test('submitExpense: valida tipo real do arquivo e remove XSS', async () => {
  const bad = new FormData();
  bad.append('title', 'Teste'); bad.append('category', 'outros'); bad.append('amount', '10'); bad.append('expenseDate', '2026-10-01');
  bad.append('receipts', new Blob([Buffer.from('MZ executável disfarçado')], { type: 'image/png' }), 'virus.png');
  assert.equal((await api('/expenses', { method: 'POST', token: colab.token, csrf: colab.csrf, form: bad })).status, 400);

  const f = new FormData();
  f.append('title', '<script>alert(1)</script>Táxi aeroporto');
  f.append('description', 'Visita ao cliente <img src=x onerror=alert(1)>');
  f.append('category', 'transporte'); f.append('amount', '87.50'); f.append('expenseDate', '2026-10-20');
  f.append('receipts', new Blob([PNG], { type: 'image/png' }), 'recibo.png');
  const r = await api('/expenses', { method: 'POST', token: colab.token, csrf: colab.csrf, form: f });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.expense.title, 'Táxi aeroporto');
  assert.ok(!r.data.expense.description.includes('onerror'));
  assert.equal(r.data.expense.amountCents, 8750);
  expenseId = r.data.expense.id;
});

test('pendingExpenses/validateExpense: segregação de funções e validação', async () => {
  const pend = await api('/expenses?scope=all&status=PENDENTE', { token: aprov.token });
  assert.ok(pend.data.expenses.some((e) => e.id === expenseId));
  assert.equal((await api(`/expenses/${expenseId}/validate`, { method: 'POST', token: colab.token, csrf: colab.csrf, body: { approved: true } })).status, 403);
  const v = await api(`/expenses/${expenseId}/validate`, { method: 'POST', token: aprov.token, csrf: aprov.csrf, body: { approved: true, comment: 'Recibo confere' } });
  assert.equal(v.status, 200);
  assert.equal(v.data.expense.status, 'VALIDADO');
});

test('signExpense: chave gerada no navegador, assinatura ECDSA verificada pelo servidor', async () => {
  // sem chave → erro orientando a gerar
  assert.equal((await api(`/expenses/${expenseId}/sign-payload`, { token: aprov.token })).data.code, 'NO_KEY');
  // servidor recusa chave privada enviada em claro
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const privJwk = await subtle.exportKey('jwk', pair.privateKey);
  const leak = await api('/keys', { method: 'POST', token: aprov.token, csrf: aprov.csrf, body: { currentPassword: 'Senha@123', publicKeyJwk: privJwk, encryptedPrivateKey: 'AAAA', salt: 'AAAA', iv: 'AAAA', iterations: 310000 } });
  assert.equal(leak.status, 400);

  assert.equal((await generateAndRegisterKey(aprov, '1234-PIN')).status, 201);
  const { data: payload } = await api(`/expenses/${expenseId}/sign-payload`, { token: aprov.token });
  const priv = await unlockPrivateKey(aprov, '1234-PIN');
  await assert.rejects(unlockPrivateKey(aprov, 'PIN-ERRADO'), 'PIN errado não abre a chave');
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, new TextEncoder().encode(payload.canonical));

  // assinatura forjada (bytes aleatórios) é rejeitada
  const fake = await api(`/expenses/${expenseId}/sign`, { method: 'POST', token: aprov.token, csrf: aprov.csrf, body: { signature: b64(webcrypto.getRandomValues(new Uint8Array(64))), documentHash: payload.documentHash, keyFingerprint: payload.keyFingerprint } });
  assert.equal(fake.status, 400);

  const r = await api(`/expenses/${expenseId}/sign`, { method: 'POST', token: aprov.token, csrf: aprov.csrf, body: { signature: b64(sig), documentHash: payload.documentHash, keyFingerprint: payload.keyFingerprint } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.expense.status, 'ASSINADO');
  // não pode assinar duas vezes
  assert.equal((await api(`/expenses/${expenseId}/sign-payload`, { token: aprov.token })).status, 409);
});

test('verifySignature: válida; adulteração de dados ou anexo é detectada', async () => {
  const ok = await api(`/expenses/${expenseId}/verify`, { method: 'POST', token: ger.token, csrf: ger.csrf });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.valid, true, JSON.stringify(ok.data.checks));

  // verificação independente no "navegador" com o pacote de assinatura
  const pkg = ok.data.package;
  const pub = await subtle.importKey('jwk', pkg.chavePublicaJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, Buffer.from(pkg.assinatura, 'base64'), new TextEncoder().encode(pkg.documento)));

  // Ataque 1: alguém altera o valor direto no banco
  const { Expense } = require('../src/models/Expense');
  await Expense.updateOne({ _id: expenseId }, { amountCents: 999999 });
  const t1 = await api(`/expenses/${expenseId}/verify`, { method: 'POST', token: ger.token, csrf: ger.csrf });
  assert.equal(t1.data.valid, false);
  assert.equal(t1.data.checks.hashDocumentoConfere, false);
  assert.equal(t1.data.checks.assinaturaValida, true, 'assinatura original continua matematicamente válida');
  await Expense.updateOne({ _id: expenseId }, { amountCents: 8750 });

  // Ataque 2: alguém troca o arquivo do recibo
  const { Receipt } = require('../src/models/Receipt');
  await Receipt.updateOne({ expense: expenseId }, { data: Buffer.concat([PNG, Buffer.from('x')]) });
  const t2 = await api(`/expenses/${expenseId}/verify`, { method: 'POST', token: ger.token, csrf: ger.csrf });
  assert.equal(t2.data.valid, false);
  assert.equal(t2.data.checks.anexosIntegros, false);
});

test('employees: CRUD pelo gerente', async () => {
  const c = await api('/users', { method: 'POST', token: ger.token, csrf: ger.csrf, body: { name: 'Novo Func', email: 'novo@empresa.com', role: 'colaborador', password: 'Abcdef12' } });
  assert.equal(c.status, 201);
  const fraca = await api('/users', { method: 'POST', token: ger.token, csrf: ger.csrf, body: { name: 'X', email: 'x@empresa.com', role: 'colaborador', password: '123' } });
  assert.equal(fraca.status, 400, 'senha fraca recusada');
  const u = await api(`/users/${c.data.user.id}`, { method: 'PUT', token: ger.token, csrf: ger.csrf, body: { name: 'Novo Funcionário', email: 'novo@empresa.com', role: 'aprovador' } });
  assert.equal(u.data.user.role, 'aprovador');
  assert.equal((await api(`/users/${c.data.user.id}`, { method: 'DELETE', token: ger.token, csrf: ger.csrf })).data.deleted, true);
  // colaborador com relatório é apenas desativado
  const d = await api(`/users/${colab.user.id}`, { method: 'DELETE', token: ger.token, csrf: ger.csrf });
  assert.equal(d.data.deactivated, true);
});
