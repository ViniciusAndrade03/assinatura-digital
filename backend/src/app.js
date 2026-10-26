'use strict';
require('express-async-errors'); // propaga erros de handlers async para o middleware de erro
const express = require('express');
const config = require('./config');
const { authenticate } = require('./middleware/auth');
const { csrfProtection } = require('./middleware/csrf');
const sec = require('./middleware/security');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // atrás do proxy HTTPS (Render/NGINX): IP real para rate limit

  app.use(sec.helmetMiddleware);
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // Força HTTPS em produção (o proxy informa o protocolo original)
  if (config.forceHttps) {
    app.use((req, res, next) => {
      if (req.secure || req.get('x-forwarded-proto') === 'https') return next();
      return res.status(403).json({ error: 'Use HTTPS' });
    });
  }

  app.use(sec.corsMiddleware);
  app.use(sec.globalLimiter);
  app.use(express.json({ limit: '100kb' }));
  app.use(sec.mongoSanitizeMiddleware);
  app.use(sec.hppMiddleware);
  app.use(sec.xssMiddleware);

  // Rotas públicas (login e token CSRF)
  app.use('/api/auth', require('./routes/auth'));

  // Rotas protegidas: JWT → CSRF → regras de negócio
  app.use('/api/users', authenticate, csrfProtection, require('./routes/users'));
  app.use('/api/keys', authenticate, csrfProtection, require('./routes/keys'));
  // multipart (upload): o body só existe depois do multer → sanitização repetida dentro da rota
  app.use('/api/expenses', authenticate, csrfProtection, require('./routes/expenses'));

  app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.name === 'MulterError' || /Tipo de arquivo/.test(err.message)) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo maior que 5 MB' : err.message;
      return res.status(400).json({ error: msg });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Requisição muito grande' });
    console.error(err);
    // Nunca vaza stack trace ou detalhes internos para o cliente
    res.status(500).json({ error: 'Erro interno do servidor' });
  });

  return app;
}

module.exports = { createApp };
