/**
 * Criptografia no navegador com a Web Cryptography API (window.crypto.subtle).
 *
 * - Par de chaves ECDSA P-256 gerado NO NAVEGADOR do signatário.
 * - Chave privada exportada (PKCS#8) e CIFRADA com AES-256-GCM; a chave AES é derivada
 *   do PIN de assinatura com PBKDF2-SHA-256 (310.000 iterações). Só o "cofre" cifrado vai ao servidor.
 * - Assinatura: ECDSA com SHA-256 sobre o documento canônico (JSON).
 * - Verificação: ECDSA verify com a chave pública + conferência de hashes SHA-256.
 */
const ITERATIONS = 310000;
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN_ALG = { name: 'ECDSA', hash: 'SHA-256' };
const enc = new TextEncoder();

function subtle() {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('Web Crypto API indisponível. Acesse o sistema por HTTPS (ou localhost).');
  }
  return window.crypto.subtle;
}

export const toB64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
export const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(data) {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  return toHex(await subtle().digest('SHA-256', bytes));
}

export async function fileSha256(file) {
  return sha256Hex(await file.arrayBuffer());
}

/** Impressão digital da chave pública = SHA-256 do SPKI (igual ao calculado no servidor com Node crypto). */
export async function jwkFingerprint(jwk) {
  const key = await subtle().importKey('jwk', jwk, ECDSA, true, ['verify']);
  return sha256Hex(await subtle().exportKey('spki', key));
}

async function deriveAesKey(pin, salt, iterations, usage) {
  const base = await subtle().importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

/** Gera o par de chaves e devolve o "cofre" para registrar no servidor. */
export async function generateKeyBundle(pin) {
  const pair = await subtle().generateKey(ECDSA, true, ['sign', 'verify']);
  const publicKeyJwk = await subtle().exportKey('jwk', pair.publicKey);
  const pkcs8 = await subtle().exportKey('pkcs8', pair.privateKey);
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const aes = await deriveAesKey(pin, salt, ITERATIONS, 'encrypt');
  const encrypted = await subtle().encrypt({ name: 'AES-GCM', iv }, aes, pkcs8);
  return {
    publicKeyJwk: { kty: publicKeyJwk.kty, crv: publicKeyJwk.crv, x: publicKeyJwk.x, y: publicKeyJwk.y },
    encryptedPrivateKey: toB64(encrypted),
    salt: toB64(salt),
    iv: toB64(iv),
    iterations: ITERATIONS,
    fingerprint: await jwkFingerprint(publicKeyJwk),
  };
}

/** Abre o cofre com o PIN. A chave privada importada é NÃO exportável. */
export async function unlockPrivateKey(bundle, pin) {
  try {
    const aes = await deriveAesKey(pin, fromB64(bundle.salt), bundle.iterations, 'decrypt');
    const pkcs8 = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(bundle.iv) }, aes, fromB64(bundle.encryptedPrivateKey));
    return await subtle().importKey('pkcs8', pkcs8, ECDSA, false, ['sign']);
  } catch {
    throw new Error('PIN de assinatura incorreto');
  }
}

export async function signDocument(privateKey, canonical) {
  return toB64(await subtle().sign(SIGN_ALG, privateKey, enc.encode(canonical)));
}

export async function verifySignature(publicKeyJwk, canonical, signatureB64) {
  try {
    const key = await subtle().importKey('jwk', publicKeyJwk, ECDSA, false, ['verify']);
    return await subtle().verify(SIGN_ALG, key, fromB64(signatureB64), enc.encode(canonical));
  } catch {
    return false;
  }
}

/** Verificação independente (só no navegador) de um pacote de assinatura .json. */
export async function verifyPackage(pkg) {
  const checks = {
    assinaturaValida: await verifySignature(pkg.chavePublicaJwk, pkg.documento, pkg.assinatura),
    hashDocumentoConfere: (await sha256Hex(pkg.documento)) === pkg.documentoSha256,
    fingerprintConfere: (await jwkFingerprint(pkg.chavePublicaJwk)) === pkg.chaveFingerprint,
  };
  let doc = null;
  try {
    doc = JSON.parse(pkg.documento);
    checks.signatarioConfere = doc.signatario?.chaveFingerprint === pkg.chaveFingerprint && doc.signatario?.id === pkg.signatario?.id;
  } catch {
    checks.signatarioConfere = false;
  }
  return { valid: Object.values(checks).every(Boolean), checks, doc };
}
