'use strict';
const { canonicalize, sha256Hex } = require('./crypto');

function isoDate(d) {
  return d ? new Date(d).toISOString() : null;
}

/**
 * Monta o documento que é efetivamente assinado.
 * Inclui todos os dados do relatório, o hash SHA-256 de cada recibo, a validação
 * e a identificação do signatário + impressão digital da chave dele.
 * Qualquer alteração em qualquer campo (ou em um byte de um anexo) muda o hash
 * e invalida a assinatura → INTEGRIDADE.
 */
function buildSignableDocument(expense, receipts, signer) {
  return {
    tipo: 'RELATORIO_DE_DESPESA',
    versao: 1,
    despesa: {
      id: expense._id.toString(),
      titulo: expense.title,
      descricao: expense.description || '',
      categoria: expense.category,
      valorCentavos: expense.amountCents,
      moeda: 'BRL',
      dataDespesa: isoDate(expense.expenseDate).slice(0, 10),
      enviadoEm: isoDate(expense.createdAt),
    },
    colaborador: {
      id: expense.employee._id ? expense.employee._id.toString() : expense.employee.toString(),
      nome: expense.employeeSnapshot?.name,
      email: expense.employeeSnapshot?.email,
    },
    recibos: [...receipts]
      .sort((a, b) => a._id.toString().localeCompare(b._id.toString()))
      .map((r) => ({ id: r._id.toString(), nome: r.filename, tipo: r.mimeType, tamanho: r.size, sha256: r.sha256 })),
    validacao: {
      validadoPorId: expense.validation?.by?.toString(),
      validadoPor: expense.validation?.byName,
      validadoEm: isoDate(expense.validation?.at),
      parecer: expense.validation?.comment || '',
    },
    signatario: {
      id: signer.id,
      nome: signer.name,
      email: signer.email,
      papel: signer.role,
      chaveFingerprint: signer.fingerprint,
    },
  };
}

function canonicalDocument(expense, receipts, signer) {
  const canonical = canonicalize(buildSignableDocument(expense, receipts, signer));
  return { canonical, hash: sha256Hex(canonical) };
}

module.exports = { buildSignableDocument, canonicalDocument };
