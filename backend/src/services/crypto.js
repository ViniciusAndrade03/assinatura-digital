'use strict';
/**
 * Operações criptográficas do servidor com o módulo nativo Node.js `crypto`:
 *  - SHA-256 de documentos e anexos (integridade)
 *  - Geração do par de chaves ECDSA P-256 do servidor (carimbo de tempo)
 *  - Cifragem AES-256-GCM da chave privada do servidor (chave derivada com scrypt)
 *  - Verificação de assinaturas ECDSA feitas no navegador com a Web Crypto API
 */
const crypto = require('crypto');
const config = require('../config');
const { ServerKey } = require('../models/ServerKey');

const SIGN_OPTS = { dsaEncoding: 'ieee-p1363' }; // mesmo formato (r||s) que a Web Crypto API produz

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** JSON canônico: chaves em ordem alfabética, sem espaços → mesmo texto = mesmo hash. */
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}

/** Aceita apenas chave PÚBLICA EC P-256 (rejeita JWK com componente privado "d"). */
function sanitizePublicJwk(jwk) {
  if (!jwk || typeof jwk !== 'object') throw new Error('JWK inválido');
  if (jwk.d) throw new Error('A chave enviada contém material privado');
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
    throw new Error('Somente chaves ECDSA P-256 são aceitas');
  }
  const clean = { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
  crypto.createPublicKey({ key: clean, format: 'jwk' }); // lança erro se o ponto não for válido
  return clean;
}

/** Impressão digital = SHA-256 da chave pública no formato SPKI (DER). Igual ao calculado no navegador. */
function jwkFingerprint(jwk) {
  const der = crypto.createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'der' });
  return sha256Hex(der);
}

function verifyEcdsa(publicKeyJwk, data, signatureB64) {
  try {
    const key = crypto.createPublicKey({ key: publicKeyJwk, format: 'jwk' });
    return crypto.verify('sha256', Buffer.from(data, 'utf8'), { key, ...SIGN_OPTS }, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}

/* ------------------------- Chave do servidor (carimbo) ------------------------- */

let cachedServerKey = null;

function deriveKey(salt) {
  return crypto.scryptSync(config.serverKeySecret, salt, 32);
}

async function ensureServerKey() {
  if (cachedServerKey) return cachedServerKey;
  let doc = await ServerKey.findOne({ active: true });
  if (!doc) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(salt), iv);
    const enc = Buffer.concat([cipher.update(privPem, 'utf8'), cipher.final()]);
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
    doc = await ServerKey.create({
      publicKeyPem,
      encryptedPrivateKey: enc.toString('base64'),
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      fingerprint: sha256Hex(publicKey.export({ type: 'spki', format: 'der' })),
    });
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(Buffer.from(doc.salt, 'base64')), Buffer.from(doc.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(doc.authTag, 'base64'));
  const privPem = Buffer.concat([decipher.update(Buffer.from(doc.encryptedPrivateKey, 'base64')), decipher.final()]).toString('utf8');
  cachedServerKey = {
    privateKey: crypto.createPrivateKey(privPem),
    publicKey: crypto.createPublicKey(doc.publicKeyPem),
    publicKeyPem: doc.publicKeyPem,
    fingerprint: doc.fingerprint,
  };
  return cachedServerKey;
}

async function serverStamp(payloadObj) {
  const key = await ensureServerKey();
  const payload = canonicalize(payloadObj);
  const signature = crypto.sign('sha256', Buffer.from(payload, 'utf8'), { key: key.privateKey, ...SIGN_OPTS }).toString('base64');
  return { payload, signature, serverKeyFingerprint: key.fingerprint };
}

async function verifyServerStamp(stamp) {
  if (!stamp || !stamp.payload) return false;
  const doc = await ServerKey.findOne({ fingerprint: stamp.serverKeyFingerprint });
  if (!doc) return false;
  try {
    return crypto.verify('sha256', Buffer.from(stamp.payload, 'utf8'), { key: crypto.createPublicKey(doc.publicKeyPem), ...SIGN_OPTS }, Buffer.from(stamp.signature, 'base64'));
  } catch {
    return false;
  }
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hmac(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

module.exports = {
  sha256Hex,
  canonicalize,
  sanitizePublicJwk,
  jwkFingerprint,
  verifyEcdsa,
  ensureServerKey,
  serverStamp,
  verifyServerStamp,
  randomToken,
  hmac,
  safeEqual,
};
