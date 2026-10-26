'use strict';
const helmet = require('helmet');
const cors = require('cors');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const { filterXSS } = require('xss');
const config = require('../config');

/** Helmet: cabeçalhos HTTP de segurança. A API só devolve JSON/arquivos, então a CSP é a mais restritiva possível. */
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'no-referrer' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }, // força HTTPS
  frameguard: { action: 'deny' },
  noSniff: true,
  hidePoweredBy: true,
});

/** CORS: só o(s) frontend(s) autorizado(s) podem chamar a API. */
const corsMiddleware = cors({
  origin(origin, cb) {
    if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  exposedHeaders: ['Content-Disposition'],
  maxAge: 600,
});

/** Remove recursivamente HTML/JS malicioso de todos os textos recebidos (defesa contra XSS armazenado). */
// Campos que não são texto exibível: senhas (alterá-las quebraria o login) e material criptográfico.
const SKIP_FIELDS = new Set(['password', 'currentPassword', 'newPassword', 'publicKeyJwk', 'encryptedPrivateKey', 'salt', 'iv', 'signature']);

function xssClean(value) {
  if (typeof value === 'string') return filterXSS(value, { whiteList: {}, stripIgnoreTag: true, stripIgnoreTagBody: ['script', 'style'] });
  if (Array.isArray(value)) return value.map(xssClean);
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) if (!SKIP_FIELDS.has(k)) value[k] = xssClean(value[k]);
  }
  return value;
}

function xssMiddleware(req, _res, next) {
  // Campos criptográficos (chaves/assinaturas em base64/JWK) não contêm HTML; os demais são limpos.
  if (req.body && typeof req.body === 'object') xssClean(req.body);
  next();
}

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 1000, standardHeaders: 'draft-7', legacyHeaders: false });
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10, // força bruta: no máx. 10 tentativas por IP a cada 15 min
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' },
});

module.exports = {
  helmetMiddleware,
  corsMiddleware,
  hppMiddleware: hpp(),
  // NoSQL injection: remove chaves que começam com "$" ou contêm "." (ex.: {"email": {"$ne": null}})
  mongoSanitizeMiddleware: mongoSanitize({ replaceWith: '_' }),
  xssMiddleware,
  globalLimiter,
  loginLimiter,
};
