'use strict';
const { Schema, model } = require('mongoose');

const ROLES = ['colaborador', 'aprovador', 'gerente'];

// Chave pública de assinatura do usuário.
// A chave PRIVADA é gerada no navegador (Web Crypto API) e só chega ao servidor
// CIFRADA com AES-256-GCM, usando uma chave derivada (PBKDF2) do PIN de assinatura
// que só o usuário conhece. O servidor nunca vê a chave privada em claro.
const signingKeySchema = new Schema(
  {
    algorithm: { type: String, default: 'ECDSA-P256-SHA256' },
    publicKeyJwk: { type: Object, required: true },
    fingerprint: { type: String, required: true }, // SHA-256 da chave pública (SPKI)
    encryptedPrivateKey: { type: String, required: true }, // base64 (PKCS#8 cifrado)
    salt: { type: String, required: true }, // base64
    iv: { type: String, required: true }, // base64
    iterations: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const keyHistorySchema = new Schema(
  {
    fingerprint: String,
    publicKeyJwk: Object,
    createdAt: Date,
    revokedAt: Date,
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 160 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'colaborador' },
    department: { type: String, trim: true, maxlength: 80, default: '' },
    position: { type: String, trim: true, maxlength: 80, default: '' },
    active: { type: Boolean, default: true },
    signingKey: { type: signingKeySchema, default: null, select: false },
    keyHistory: { type: [keyHistorySchema], default: [] },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    department: this.department,
    position: this.position,
    active: this.active,
    hasSigningKey: this.keyHistory.some((k) => !k.revokedAt),
    createdAt: this.createdAt,
  };
};

module.exports = { User: model('User', userSchema), ROLES };
