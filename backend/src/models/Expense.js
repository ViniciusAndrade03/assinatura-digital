'use strict';
const { Schema, model, Types } = require('mongoose');

const CATEGORIES = ['transporte', 'hospedagem', 'alimentacao', 'material', 'combustivel', 'outros'];
const STATUSES = ['PENDENTE', 'VALIDADO', 'REJEITADO', 'ASSINADO'];

const historySchema = new Schema(
  {
    action: { type: String, required: true },
    by: { type: Types.ObjectId, ref: 'User' },
    byName: String,
    at: { type: Date, default: Date.now },
    comment: String,
  },
  { _id: false }
);

const expenseSchema = new Schema(
  {
    employee: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    // "Fotografia" dos dados do colaborador no envio: editar o cadastro depois não invalida a assinatura
    employeeSnapshot: { name: String, email: String },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    category: { type: String, enum: CATEGORIES, required: true },
    amountCents: { type: Number, required: true, min: 1 }, // valores em centavos (evita erro de ponto flutuante)
    expenseDate: { type: Date, required: true },
    receipts: [{ type: Types.ObjectId, ref: 'Receipt' }],
    status: { type: String, enum: STATUSES, default: 'PENDENTE', index: true },
    validation: {
      by: { type: Types.ObjectId, ref: 'User' },
      byName: String,
      at: Date,
      approved: Boolean,
      comment: String,
    },
    signature: { type: Types.ObjectId, ref: 'Signature' },
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true }
);

module.exports = { Expense: model('Expense', expenseSchema), CATEGORIES, STATUSES };
