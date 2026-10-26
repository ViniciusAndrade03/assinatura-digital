'use strict';
const { Schema, model } = require('mongoose');

// Par de chaves do servidor (gerado com Node.js crypto) usado no carimbo de tempo.
// A chave privada é guardada cifrada com AES-256-GCM (chave derivada via scrypt de SERVER_KEY_SECRET).
const serverKeySchema = new Schema(
  {
    publicKeyPem: { type: String, required: true },
    encryptedPrivateKey: { type: String, required: true },
    salt: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    fingerprint: { type: String, required: true, unique: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = { ServerKey: model('ServerKey', serverKeySchema) };
