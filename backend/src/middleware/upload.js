'use strict';
const multer = require('multer');
const config = require('../config');

const ALLOWED = {
  'application/pdf': (b) => b.slice(0, 5).toString('latin1') === '%PDF-',
  'image/png': (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxFileSize, files: config.upload.maxFiles, fields: 20 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED[file.mimetype]) return cb(new Error('Tipo de arquivo não permitido (use PDF, PNG ou JPG)'));
    cb(null, true);
  },
});

/** Confere a "assinatura mágica" do arquivo: não basta a extensão/MIME declarado pelo navegador. */
function checkMagicBytes(req, res, next) {
  for (const f of req.files || []) {
    if (!ALLOWED[f.mimetype](f.buffer)) {
      return res.status(400).json({ error: `Conteúdo do arquivo "${f.originalname}" não corresponde ao tipo declarado` });
    }
  }
  next();
}

function safeFilename(name) {
  return String(name || 'arquivo')
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '_')
    .slice(0, 150);
}

module.exports = { upload, checkMagicBytes, safeFilename };
