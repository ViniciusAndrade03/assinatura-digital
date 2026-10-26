'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');
const { User } = require('../models/User');

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwt.secret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.expiresIn,
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  });
}

/** Autenticação JWT (Authorization: Bearer <token>). */
async function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Não autenticado' });
  try {
    const payload = jwt.verify(token, config.jwt.secret, {
      algorithms: ['HS256'], // impede ataque "alg: none" / troca de algoritmo
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });
    const user = await User.findById(payload.sub);
    if (!user || !user.active) return res.status(401).json({ error: 'Usuário inativo ou inexistente' });
    req.user = user; // papel vem do banco, não do token (alteração de papel vale na hora)
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada' });
  }
}

/** Autentica se houver token; senão segue como anônimo (usado no endpoint do token CSRF). */
function optionalAuth(req, res, next) {
  if (!req.get('authorization')) return next();
  return authenticate(req, res, next);
}

/** Autorização por papel (RBAC). */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado para o seu perfil' });
    }
    next();
  };
}

module.exports = { signToken, authenticate, optionalAuth, authorize };
