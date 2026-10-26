'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { User } = require('../models/User');
const { authorize } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');
const { sanitizePublicJwk, jwkFingerprint } = require('../services/crypto');

const router = express.Router();
router.use(authorize('aprovador', 'gerente')); // apenas quem assina possui chave de assinatura

const b64 = z.string().regex(/^[A-Za-z0-9+/=]+$/, 'base64 inválido');

/** Devolve o "cofre" da chave: pública + privada CIFRADA (só o PIN do usuário a abre, no navegador). */
router.get('/me', async (req, res) => {
  const user = await User.findById(req.user._id).select('+signingKey');
  if (!user.signingKey) return res.json({ key: null });
  const k = user.signingKey;
  res.json({
    key: {
      algorithm: k.algorithm,
      publicKeyJwk: k.publicKeyJwk,
      fingerprint: k.fingerprint,
      encryptedPrivateKey: k.encryptedPrivateKey,
      salt: k.salt,
      iv: k.iv,
      iterations: k.iterations,
      createdAt: k.createdAt,
    },
  });
});

/** Registra (ou substitui) o par de chaves gerado no navegador. Exige a senha de login (reautenticação). */
router.post(
  '/',
  validate({
    body: z.object({
      currentPassword: z.string().min(1).max(128),
      publicKeyJwk: z.object({ kty: z.string(), crv: z.string(), x: z.string(), y: z.string() }).passthrough(),
      encryptedPrivateKey: b64.max(4000),
      salt: b64.max(64),
      iv: b64.max(64),
      iterations: z.number().int().min(100000).max(5000000),
    }),
  }),
  async (req, res) => {
    const user = await User.findById(req.user._id).select('+passwordHash +signingKey');
    if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
      return res.status(400).json({ error: 'Senha de login incorreta' });
    }
    let publicKeyJwk;
    try {
      publicKeyJwk = sanitizePublicJwk(req.body.publicKeyJwk);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    const fingerprint = jwkFingerprint(publicKeyJwk);
    const now = new Date();
    // Chave anterior é revogada para novas assinaturas, mas continua no histórico para verificar as antigas
    user.keyHistory.forEach((k) => {
      if (!k.revokedAt) k.revokedAt = now;
    });
    user.keyHistory.push({ fingerprint, publicKeyJwk, createdAt: now });
    user.signingKey = {
      publicKeyJwk,
      fingerprint,
      encryptedPrivateKey: req.body.encryptedPrivateKey,
      salt: req.body.salt,
      iv: req.body.iv,
      iterations: req.body.iterations,
      createdAt: now,
    };
    await user.save();
    res.status(201).json({ fingerprint, createdAt: now });
  }
);

module.exports = router;
