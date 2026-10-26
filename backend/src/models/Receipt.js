'use strict';
const { Schema, model, Types } = require('mongoose');

// Recibos ficam no próprio MongoDB (Atlas em produção) — sem disco local no servidor.
// O hash SHA-256 de cada arquivo entra no documento assinado (integridade dos anexos).
const receiptSchema = new Schema(
  {
    expense: { type: Types.ObjectId, ref: 'Expense', index: true },
    uploadedBy: { type: Types.ObjectId, ref: 'User', required: true },
    filename: { type: String, required: true, maxlength: 200 },
    mimeType: { type: String, enum: ['application/pdf', 'image/png', 'image/jpeg'], required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true },
    data: { type: Buffer, required: true, select: false },
  },
  { timestamps: true }
);

receiptSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    filename: this.filename,
    mimeType: this.mimeType,
    size: this.size,
    sha256: this.sha256,
  };
};

module.exports = { Receipt: model('Receipt', receiptSchema) };
