'use strict';
const { Schema, model, Types } = require('mongoose');

const verificationSchema = new Schema(
  {
    by: { type: Types.ObjectId, ref: 'User' },
    byName: String,
    at: { type: Date, default: Date.now },
    valid: Boolean,
    checks: Object,
  },
  { _id: false }
);

const signatureSchema = new Schema(
  {
    expense: { type: Types.ObjectId, ref: 'Expense', required: true, unique: true },
    signer: { type: Types.ObjectId, ref: 'User', required: true },
    signerName: String,
    signerEmail: String,
    signerRole: String,
    algorithm: { type: String, default: 'ECDSA-P256-SHA256' },
    // Conteúdo EXATO que foi assinado (JSON canônico) e seu hash
    documentCanonical: { type: String, required: true },
    documentHash: { type: String, required: true }, // SHA-256 hex
    signature: { type: String, required: true }, // base64 (formato IEEE P1363 r||s)
    publicKeyJwk: { type: Object, required: true },
    keyFingerprint: { type: String, required: true },
    signedAt: { type: Date, required: true }, // hora do servidor
    ip: String,
    userAgent: String,
    // Carimbo do servidor: o servidor assina (chave própria gerada com Node.js crypto)
    // {documentHash, signature, signerId, signedAt}, provando QUANDO a assinatura foi recebida.
    serverStamp: {
      payload: String,
      signature: String,
      serverKeyFingerprint: String,
    },
    verifications: { type: [verificationSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = { Signature: model('Signature', signatureSchema) };
