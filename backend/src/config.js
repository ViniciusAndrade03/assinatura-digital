'use strict';
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

function required(name, devDefault) {
  const value = process.env[name];
  if (value) return value;
  if (!isProd && devDefault !== undefined) return devDefault;
  throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
}

const config = {
  isProd,
  // Em produção recusa requisições que não vieram por HTTPS (desligue só no Docker local sem TLS)
  forceHttps: process.env.FORCE_HTTPS ? process.env.FORCE_HTTPS === 'true' : isProd,
  port: Number(process.env.PORT || 4000),
  mongoUri: required('MONGODB_URI', 'mongodb://localhost:27017/assinatura'),
  jwt: {
    secret: required('JWT_SECRET', 'dev-only-jwt-secret-troque-em-producao-0123456789'),
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    issuer: 'assinatura-digital-api',
    audience: 'assinatura-digital-web',
  },
  csrfSecret: required('CSRF_SECRET', 'dev-only-csrf-secret-troque-em-producao-0123456789'),
  // Senha usada para cifrar (AES-256-GCM) a chave privada do servidor (carimbo de tempo)
  serverKeySecret: required('SERVER_KEY_SECRET', 'dev-only-server-key-secret-0123456789'),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:8080')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  mail: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Assinatura Digital <no-reply@assinatura.local>',
  },
  upload: {
    maxFileSize: 5 * 1024 * 1024, // 5 MB por arquivo
    maxFiles: 5,
  },
};

if (isProd) {
  for (const [name, value] of Object.entries({
    JWT_SECRET: config.jwt.secret,
    CSRF_SECRET: config.csrfSecret,
    SERVER_KEY_SECRET: config.serverKeySecret,
  })) {
    if (value.length < 32) throw new Error(`${name} deve ter pelo menos 32 caracteres`);
  }
}

module.exports = config;
