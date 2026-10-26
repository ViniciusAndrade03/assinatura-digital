'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { User } = require('../models/User');
const { signToken, authenticate, optionalAuth } = require('../middleware/auth');
const { issueCsrfToken, csrfProtection, subjectOf } = require('../middleware/csrf');
const { loginLimiter } = require('../middleware/security');
const { validate, z, password } = require('../middleware/validate');

const router = express.Router();

// Hash fixo para comparar quando o e-mail não existe → tempo de resposta igual (evita enumeração de usuários)
const DUMMY_HASH = bcrypt.hashSync('dummy-password-0', 12);

router.get('/csrf-token', optionalAuth, (req, res) => {
  res.json({ csrfToken: issueCsrfToken(subjectOf(req)) });
});

router.post(
  '/login',
  loginLimiter,
  csrfProtection,
  validate({ body: z.object({ email: z.string().trim().toLowerCase().email().max(160), password: z.string().min(1).max(128) }) }),
  async (req, res) => {
    const { email, password: pwd } = req.body;
    const user = await User.findOne({ email }).select('+passwordHash');
    const ok = await bcrypt.compare(pwd, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !ok || !user.active) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos' }); // mensagem genérica
    }
    user.lastLoginAt = new Date();
    await user.save();
    const token = signToken(user);
    res.json({ token, user: user.toPublic(), csrfToken: issueCsrfToken(user._id.toString()) });
  }
);

router.get('/me', authenticate, (req, res) => res.json({ user: req.user.toPublic() }));

router.post(
  '/change-password',
  authenticate,
  csrfProtection,
  validate({ body: z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }) }),
  async (req, res) => {
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
      return res.status(400).json({ error: 'Senha atual incorreta' });
    }
    user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    await user.save();
    res.json({ ok: true });
  }
);

module.exports = router;
