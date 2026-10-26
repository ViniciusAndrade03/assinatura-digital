'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { User, ROLES } = require('../models/User');
const { Expense } = require('../models/Expense');
const { Signature } = require('../models/Signature');
const { authorize } = require('../middleware/auth');
const { validate, z, idParam, password } = require('../middleware/validate');
const { notify } = require('../services/mailer');

const router = express.Router();
router.use(authorize('gerente')); // CRUD de funcionários: somente gerente

const baseFields = {
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  role: z.enum(ROLES),
  department: z.string().trim().max(80).optional().default(''),
  position: z.string().trim().max(80).optional().default(''),
};

router.get('/', async (_req, res) => {
  const users = await User.find().sort({ name: 1 });
  res.json({ users: users.map((u) => u.toPublic()) });
});

router.get('/:id', validate({ params: idParam }), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Funcionário não encontrado' });
  res.json({ user: user.toPublic() });
});

router.post('/', validate({ body: z.object({ ...baseFields, password }) }), async (req, res) => {
  if (await User.exists({ email: req.body.email })) return res.status(409).json({ error: 'E-mail já cadastrado' });
  const { password: pwd, ...data } = req.body;
  const user = await User.create({ ...data, passwordHash: await bcrypt.hash(pwd, 12) });
  notify.userCreated(user);
  res.status(201).json({ user: user.toPublic() });
});

router.put(
  '/:id',
  validate({
    params: idParam,
    body: z.object({ ...baseFields, active: z.boolean().optional(), password: password.optional().or(z.literal('')) }),
  }),
  async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Funcionário não encontrado' });
    if (req.body.email !== user.email && (await User.exists({ email: req.body.email }))) {
      return res.status(409).json({ error: 'E-mail já cadastrado' });
    }
    if (user._id.equals(req.user._id) && (req.body.role !== 'gerente' || req.body.active === false)) {
      return res.status(400).json({ error: 'Você não pode remover seu próprio perfil de gerente nem se desativar' });
    }
    const { password: pwd, ...data } = req.body;
    Object.assign(user, data);
    if (pwd) user.passwordHash = await bcrypt.hash(pwd, 12);
    await user.save();
    res.json({ user: user.toPublic() });
  }
);

router.delete('/:id', validate({ params: idParam }), async (req, res) => {
  if (req.user._id.equals(req.params.id)) return res.status(400).json({ error: 'Você não pode excluir a si mesmo' });
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Funcionário não encontrado' });
  // Registros com valor legal (relatórios/assinaturas) não podem perder o vínculo → apenas desativa
  const linked = (await Expense.exists({ employee: user._id })) || (await Signature.exists({ signer: user._id }));
  if (linked) {
    user.active = false;
    await user.save();
    return res.json({ deactivated: true, message: 'Funcionário possui documentos vinculados e foi DESATIVADO (não excluído) para preservar o histórico.' });
  }
  await user.deleteOne();
  res.json({ deleted: true });
});

module.exports = router;
