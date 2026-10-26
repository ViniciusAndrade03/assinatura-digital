'use strict';
/**
 * Notificações por e-mail com Nodemailer.
 * - Produção: SMTP real (ex.: Gmail com senha de app, Brevo, Mailtrap) via variáveis SMTP_*.
 * - Docker local: Mailpit (caixa de e-mail de teste em http://localhost:8025).
 * - Sem SMTP configurado: apenas registra o e-mail no log (jsonTransport).
 */
const nodemailer = require('nodemailer');
const config = require('../config');
const { User } = require('../models/User');

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  const base = { disableFileAccess: true, disableUrlAccess: true };
  if (config.mail.host) {
    transporter = nodemailer.createTransport({
      ...base,
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
      tls: { rejectUnauthorized: config.isProd },
    });
  } else {
    transporter = nodemailer.createTransport({ ...base, jsonTransport: true });
  }
  return transporter;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function brl(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function layout(title, bodyHtml, linkPath) {
  const link = linkPath ? `<p><a href="${esc(config.appUrl + linkPath)}">Abrir no sistema</a></p>` : '';
  return `<div style="font-family:Arial,sans-serif;max-width:560px">
  <h2 style="color:#9b1b30">${esc(title)}</h2>${bodyHtml}${link}
  <hr><small>Módulo de Assinatura Digital — mensagem automática, não responda.</small></div>`;
}

async function send(to, subject, html) {
  const recipients = [...new Set([].concat(to).filter(Boolean))];
  if (!recipients.length) return;
  try {
    const info = await getTransporter().sendMail({ from: config.mail.from, to: recipients, subject, html });
    if (!config.mail.host) console.log(`[e-mail simulado] para=${recipients.join(', ')} assunto="${subject}"`);
    return info;
  } catch (err) {
    // Falha de e-mail não pode derrubar o fluxo principal
    console.error('[e-mail] falha ao enviar:', err.message);
  }
}

async function emailsByRole(roles) {
  const users = await User.find({ role: { $in: roles }, active: true }).select('email');
  return users.map((u) => u.email);
}

function expenseSummary(e) {
  return `<p><b>${esc(e.title)}</b> — ${brl(e.amountCents)}<br>Colaborador: ${esc(e.employeeSnapshot?.name)}</p>`;
}

const notify = {
  async expenseSubmitted(expense) {
    const to = await emailsByRole(['aprovador', 'gerente']);
    await send(to, `Novo relatório de despesa pendente: ${expense.title}`,
      layout('Relatório aguardando validação', expenseSummary(expense), `/validateExpense/?id=${expense._id}`));
  },
  async expenseValidated(expense) {
    const ok = expense.status === 'VALIDADO';
    await send(expense.employeeSnapshot?.email, `Seu relatório foi ${ok ? 'validado' : 'rejeitado'}: ${expense.title}`,
      layout(ok ? 'Relatório validado' : 'Relatório rejeitado',
        `${expenseSummary(expense)}<p>Parecer: ${esc(expense.validation?.comment || '—')}</p>`, '/dashboard/'));
    if (ok) {
      const to = await emailsByRole(['aprovador', 'gerente']);
      await send(to, `Relatório pronto para assinatura: ${expense.title}`,
        layout('Relatório aguardando assinatura digital', expenseSummary(expense), `/signExpense/?id=${expense._id}`));
    }
  },
  async expenseSigned(expense, signature) {
    const managers = await emailsByRole(['gerente']);
    const body = `${expenseSummary(expense)}<p>Assinado por ${esc(signature.signerName)} em ${new Date(signature.signedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}<br>Hash SHA-256: <code>${esc(signature.documentHash)}</code></p>`;
    await send(managers, `Relatório assinado — disponível para verificação: ${expense.title}`,
      layout('Documento assinado digitalmente', body, `/verifySignature/?id=${expense._id}`));
    await send(expense.employeeSnapshot?.email, `Seu relatório foi assinado: ${expense.title}`,
      layout('Relatório assinado digitalmente', body, '/dashboard/'));
  },
  async userCreated(user) {
    await send(user.email, 'Sua conta no Módulo de Assinatura Digital foi criada',
      layout(`Bem-vindo(a), ${user.name}`, `<p>Seu acesso foi criado com o perfil <b>${esc(user.role)}</b>. A senha provisória será entregue pelo gestor; troque-a no primeiro acesso.</p>`, '/login/'));
  },
};

module.exports = { send, notify };
