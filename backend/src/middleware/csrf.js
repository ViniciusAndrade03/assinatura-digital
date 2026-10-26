'use strict';
/**
 * Proteção CSRF (padrão "synchronizer token" sem estado, assinado com HMAC).
 *
 * - GET /api/auth/csrf-token devolve um token = nonce.expiração.HMAC(segredo, sujeito|nonce|expiração)
 *   onde "sujeito" é o id do usuário autenticado (ou "anon" antes do login).
 * - Toda requisição que altera estado (POST/PUT/PATCH/DELETE) precisa enviar o token
 *   no cabeçalho X-CSRF-Token. Um site malicioso não consegue ler esse token (CORS restrito),
 *   portanto não consegue forjar requisições em nome do usuário.
 */
const config = require('../config');
const { randomToken, hmac, safeEqual } = require('../services/crypto');

const TTL_MS = 2 * 60 * 60 * 1000; // 2 h
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function subjectOf(req) {
  return req.user ? req.user._id.toString() : 'anon';
}

function issueCsrfToken(subject) {
  const nonce = randomToken(16);
  const exp = Date.now() + TTL_MS;
  return `${nonce}.${exp}.${hmac(config.csrfSecret, `${subject}|${nonce}|${exp}`)}`;
}

function isValid(token, subject) {
  if (typeof token !== 'string') return false;
  const [nonce, exp, mac] = token.split('.');
  if (!nonce || !exp || !mac || Number(exp) < Date.now()) return false;
  return safeEqual(mac, hmac(config.csrfSecret, `${subject}|${nonce}|${exp}`));
}

/** Verifica o token. Deve rodar DEPOIS da autenticação (para saber o sujeito). */
function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!isValid(req.get('x-csrf-token'), subjectOf(req))) {
    return res.status(403).json({ error: 'Token CSRF inválido ou ausente' });
  }
  next();
}

module.exports = { issueCsrfToken, csrfProtection, subjectOf };
