'use strict';
const express = require('express');
const { Expense, CATEGORIES, STATUSES } = require('../models/Expense');
const { Receipt } = require('../models/Receipt');
const { Signature } = require('../models/Signature');
const { User } = require('../models/User');
const { authorize } = require('../middleware/auth');
const { validate, z, idParam } = require('../middleware/validate');
const { upload, checkMagicBytes, safeFilename } = require('../middleware/upload');
const { sha256Hex, verifyEcdsa, jwkFingerprint, serverStamp, verifyServerStamp } = require('../services/crypto');
const { canonicalDocument } = require('../services/document');
const { notify } = require('../services/mailer');
const { xssMiddleware, mongoSanitizeMiddleware } = require('../middleware/security');

const router = express.Router();
const REVIEWERS = ['aprovador', 'gerente'];

function isReviewer(user) {
  return REVIEWERS.includes(user.role);
}

function toPublicExpense(e) {
  return {
    id: e._id.toString(),
    employee: { id: (e.employee._id || e.employee).toString(), name: e.employeeSnapshot?.name, email: e.employeeSnapshot?.email },
    title: e.title,
    description: e.description,
    category: e.category,
    amountCents: e.amountCents,
    expenseDate: e.expenseDate,
    status: e.status,
    receipts: (e.receipts || []).map((r) => (r.toPublic ? r.toPublic() : { id: r.toString() })),
    validation: e.validation?.at ? { byName: e.validation.byName, at: e.validation.at, approved: e.validation.approved, comment: e.validation.comment } : null,
    signatureId: e.signature ? e.signature.toString() : null,
    history: e.history,
    createdAt: e.createdAt,
  };
}

async function loadExpense(req, res) {
  const expense = await Expense.findById(req.params.id).populate('receipts');
  if (!expense) {
    res.status(404).json({ error: 'Relatório não encontrado' });
    return null;
  }
  // Colaborador só enxerga os próprios relatórios
  if (!isReviewer(req.user) && !expense.employee.equals(req.user._id)) {
    res.status(403).json({ error: 'Acesso negado' });
    return null;
  }
  return expense;
}

/* ------------------------------ Envio (submitExpense) ------------------------------ */

const createSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).optional().default(''),
  category: z.enum(CATEGORIES),
  amount: z.coerce.number().positive().max(1_000_000),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
});

router.post('/', upload.array('receipts', 5), checkMagicBytes, mongoSanitizeMiddleware, xssMiddleware, validate({ body: createSchema }), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'Anexe pelo menos um recibo (PDF, PNG ou JPG)' });
  const date = new Date(`${req.body.expenseDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date > new Date()) return res.status(400).json({ error: 'Data da despesa inválida ou futura' });

  const expense = new Expense({
    employee: req.user._id,
    employeeSnapshot: { name: req.user.name, email: req.user.email },
    title: req.body.title,
    description: req.body.description,
    category: req.body.category,
    amountCents: Math.round(req.body.amount * 100),
    expenseDate: date,
    history: [{ action: 'ENVIADO', by: req.user._id, byName: req.user.name }],
  });
  const receipts = await Receipt.insertMany(
    req.files.map((f) => ({
      expense: expense._id,
      uploadedBy: req.user._id,
      filename: safeFilename(f.originalname),
      mimeType: f.mimetype,
      size: f.size,
      sha256: sha256Hex(f.buffer),
      data: f.buffer,
    }))
  );
  expense.receipts = receipts.map((r) => r._id);
  await expense.save();
  await expense.populate('receipts');
  notify.expenseSubmitted(expense);
  res.status(201).json({ expense: toPublicExpense(expense) });
});

/* ------------------------------ Listagens ------------------------------ */

router.get(
  '/',
  validate({ query: z.object({ scope: z.enum(['mine', 'all']).optional().default('mine'), status: z.enum(STATUSES).optional() }) }),
  async (req, res) => {
    const { scope, status } = req.validQuery;
    const filter = {};
    if (scope === 'mine' || !isReviewer(req.user)) filter.employee = req.user._id;
    if (status) filter.status = status;
    const list = await Expense.find(filter).sort({ createdAt: -1 }).limit(500).populate('receipts');
    res.json({ expenses: list.map(toPublicExpense) });
  }
);

router.get('/stats', async (req, res) => {
  const match = isReviewer(req.user) ? {} : { employee: req.user._id };
  const agg = await Expense.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amountCents' } } }]);
  const stats = Object.fromEntries(STATUSES.map((s) => [s, { count: 0, totalCents: 0 }]));
  agg.forEach((a) => (stats[a._id] = { count: a.count, totalCents: a.total }));
  res.json({ stats });
});

router.get('/:id', validate({ params: idParam }), async (req, res) => {
  const expense = await loadExpense(req, res);
  if (!expense) return;
  res.json({ expense: toPublicExpense(expense) });
});

/* ------------------------------ Anexos ------------------------------ */

router.get('/:id/receipts/:receiptId', validate({ params: z.object({ id: idParam.shape.id, receiptId: idParam.shape.id }) }), async (req, res) => {
  const expense = await loadExpense(req, res);
  if (!expense) return;
  const receipt = await Receipt.findOne({ _id: req.params.receiptId, expense: expense._id }).select('+data');
  if (!receipt) return res.status(404).json({ error: 'Recibo não encontrado' });
  res.set({
    'Content-Type': receipt.mimeType,
    'Content-Disposition': `inline; filename="${receipt.filename}"`,
    'X-Content-SHA256': receipt.sha256,
    'Cache-Control': 'no-store',
  });
  res.send(receipt.data);
});

/* ------------------------------ Validação (validateExpense) ------------------------------ */

router.post(
  '/:id/validate',
  authorize(...REVIEWERS),
  validate({ params: idParam, body: z.object({ approved: z.boolean(), comment: z.string().trim().max(1000).optional().default('') }) }),
  async (req, res) => {
    const expense = await loadExpense(req, res);
    if (!expense) return;
    if (expense.employee.equals(req.user._id)) return res.status(403).json({ error: 'Segregação de funções: você não pode validar o próprio relatório' });
    if (expense.status !== 'PENDENTE') return res.status(409).json({ error: `Relatório está ${expense.status}, não pode ser validado` });
    if (!req.body.approved && !req.body.comment) return res.status(400).json({ error: 'Informe o motivo da rejeição' });

    expense.status = req.body.approved ? 'VALIDADO' : 'REJEITADO';
    expense.validation = { by: req.user._id, byName: req.user.name, at: new Date(), approved: req.body.approved, comment: req.body.comment };
    expense.history.push({ action: expense.status, by: req.user._id, byName: req.user.name, comment: req.body.comment });
    await expense.save();
    notify.expenseValidated(expense);
    res.json({ expense: toPublicExpense(expense) });
  }
);

/* ------------------------------ Assinatura (signExpense) ------------------------------ */

async function signerContext(req, res) {
  const user = await User.findById(req.user._id).select('+signingKey');
  if (!user.signingKey) {
    res.status(409).json({ error: 'Você ainda não gerou sua chave de assinatura', code: 'NO_KEY' });
    return null;
  }
  return { id: user._id.toString(), name: user.name, email: user.email, role: user.role, fingerprint: user.signingKey.fingerprint, publicKeyJwk: user.signingKey.publicKeyJwk };
}

/** Devolve o documento canônico que o navegador vai assinar com a chave privada do usuário. */
router.get('/:id/sign-payload', authorize(...REVIEWERS), validate({ params: idParam }), async (req, res) => {
  const expense = await loadExpense(req, res);
  if (!expense) return;
  if (expense.status !== 'VALIDADO') return res.status(409).json({ error: 'Somente relatórios VALIDADOS podem ser assinados' });
  if (expense.employee.equals(req.user._id)) return res.status(403).json({ error: 'Segregação de funções: você não pode assinar o próprio relatório' });
  const signer = await signerContext(req, res);
  if (!signer) return;
  const { canonical, hash } = canonicalDocument(expense, expense.receipts, signer);
  res.json({ canonical, documentHash: hash, keyFingerprint: signer.fingerprint });
});

router.post(
  '/:id/sign',
  authorize(...REVIEWERS),
  validate({
    params: idParam,
    body: z.object({
      signature: z.string().regex(/^[A-Za-z0-9+/=]+$/).max(200),
      documentHash: z.string().regex(/^[a-f0-9]{64}$/),
      keyFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  }),
  async (req, res) => {
    const expense = await loadExpense(req, res);
    if (!expense) return;
    if (expense.status !== 'VALIDADO') return res.status(409).json({ error: 'Somente relatórios VALIDADOS podem ser assinados' });
    if (expense.employee.equals(req.user._id)) return res.status(403).json({ error: 'Segregação de funções: você não pode assinar o próprio relatório' });
    const signer = await signerContext(req, res);
    if (!signer) return;
    if (req.body.keyFingerprint !== signer.fingerprint) return res.status(400).json({ error: 'A chave usada não é a chave ativa do usuário' });

    // O servidor recalcula o documento: se algo mudou desde que o navegador o recebeu, rejeita
    const { canonical, hash } = canonicalDocument(expense, expense.receipts, signer);
    if (hash !== req.body.documentHash) return res.status(409).json({ error: 'O documento mudou durante a assinatura. Recarregue e tente novamente.' });

    // Verificação com Node.js crypto da assinatura feita no navegador (Web Crypto API)
    if (!verifyEcdsa(signer.publicKeyJwk, canonical, req.body.signature)) {
      return res.status(400).json({ error: 'Assinatura digital inválida (não confere com a chave pública registrada)' });
    }

    const signedAt = new Date();
    const stamp = await serverStamp({ documentHash: hash, signature: req.body.signature, signerId: signer.id, signedAt: signedAt.toISOString() });
    const signature = await Signature.create({
      expense: expense._id,
      signer: req.user._id,
      signerName: signer.name,
      signerEmail: signer.email,
      signerRole: signer.role,
      documentCanonical: canonical,
      documentHash: hash,
      signature: req.body.signature,
      publicKeyJwk: signer.publicKeyJwk,
      keyFingerprint: signer.fingerprint,
      signedAt,
      ip: req.ip,
      userAgent: String(req.get('user-agent') || '').slice(0, 300),
      serverStamp: stamp,
    });
    expense.status = 'ASSINADO';
    expense.signature = signature._id;
    expense.history.push({ action: 'ASSINADO', by: req.user._id, byName: req.user.name, comment: `SHA-256 ${hash}` });
    await expense.save();
    notify.expenseSigned(expense, signature);
    res.status(201).json({ expense: toPublicExpense(expense), signature: { id: signature._id, documentHash: hash, signedAt } });
  }
);

/* ------------------------------ Verificação (verifySignature) ------------------------------ */

async function runVerification(expense) {
  const sig = await Signature.findById(expense.signature);
  if (!sig) return null;
  const receipts = await Receipt.find({ expense: expense._id }).select('+data');
  const signerSnapshot = { id: sig.signer.toString(), name: sig.signerName, email: sig.signerEmail, role: sig.signerRole, fingerprint: sig.keyFingerprint };
  const current = canonicalDocument(expense, receipts, signerSnapshot);
  const signerUser = await User.findById(sig.signer);

  let stampMatches = false;
  try {
    const p = JSON.parse(sig.serverStamp?.payload || '{}');
    stampMatches = p.documentHash === sig.documentHash && p.signature === sig.signature && p.signerId === sig.signer.toString() && p.signedAt === sig.signedAt.toISOString();
  } catch {
    stampMatches = false;
  }

  const checks = {
    // AUTENTICIDADE: a assinatura confere com a chave pública do signatário
    assinaturaValida: verifyEcdsa(sig.publicKeyJwk, sig.documentCanonical, sig.signature),
    chavePertenceAoSignatario:
      jwkFingerprint(sig.publicKeyJwk) === sig.keyFingerprint && !!signerUser?.keyHistory.some((k) => k.fingerprint === sig.keyFingerprint),
    // INTEGRIDADE: dados atuais do banco geram o mesmo hash que foi assinado
    hashDocumentoConfere: current.hash === sig.documentHash && current.canonical === sig.documentCanonical,
    anexosIntegros: receipts.length === expense.receipts.length && receipts.every((r) => sha256Hex(r.data) === r.sha256),
    // NÃO REPÚDIO / TEMPORALIDADE: carimbo do servidor válido e coerente
    carimboServidorValido: (await verifyServerStamp(sig.serverStamp)) && stampMatches,
  };
  return { sig, checks, valid: Object.values(checks).every(Boolean), currentHash: current.hash };
}

function signaturePackage(sig, expense) {
  return {
    formato: 'assinatura-digital-despesa/v1',
    algoritmo: sig.algorithm,
    despesaId: expense._id.toString(),
    documento: sig.documentCanonical,
    documentoSha256: sig.documentHash,
    assinatura: sig.signature,
    chavePublicaJwk: sig.publicKeyJwk,
    chaveFingerprint: sig.keyFingerprint,
    signatario: { id: sig.signer.toString(), nome: sig.signerName, email: sig.signerEmail, papel: sig.signerRole },
    assinadoEm: sig.signedAt,
    carimboServidor: sig.serverStamp,
  };
}

router.post('/:id/verify', authorize(...REVIEWERS), validate({ params: idParam }), async (req, res) => {
  const expense = await loadExpense(req, res);
  if (!expense) return;
  if (!expense.signature) return res.status(409).json({ error: 'Relatório ainda não foi assinado' });
  const result = await runVerification(expense);
  if (!result) return res.status(404).json({ error: 'Assinatura não encontrada' });
  result.sig.verifications.push({ by: req.user._id, byName: req.user.name, valid: result.valid, checks: result.checks });
  await result.sig.save();
  expense.history.push({ action: result.valid ? 'VERIFICADO_OK' : 'VERIFICADO_FALHA', by: req.user._id, byName: req.user.name });
  await expense.save();
  res.json({
    valid: result.valid,
    checks: result.checks,
    currentHash: result.currentHash,
    package: signaturePackage(result.sig, expense),
    verifications: result.sig.verifications.slice(-10),
  });
});

/** Pacote de assinatura (JSON) para download e verificação independente/offline. */
router.get('/:id/signature-package', authorize(...REVIEWERS), validate({ params: idParam }), async (req, res) => {
  const expense = await loadExpense(req, res);
  if (!expense) return;
  const sig = expense.signature && (await Signature.findById(expense.signature));
  if (!sig) return res.status(404).json({ error: 'Relatório ainda não foi assinado' });
  res.json(signaturePackage(sig, expense));
});

module.exports = router;
