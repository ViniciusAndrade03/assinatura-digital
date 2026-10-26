/**
 * Pós-build: calcula o SHA-256 de cada <script> inline gerado pelo Next.js e o inclui na CSP
 * de cada página. Assim a CSP continua SEM 'unsafe-inline' — qualquer script injetado por
 * um atacante (XSS) tem outro hash e é bloqueado pelo navegador.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = path.join(__dirname, '..', 'out');
const PLACEHOLDER = '__CSP_INLINE_HASHES__';

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
  });
}

let files = 0;
for (const file of walk(OUT)) {
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes(PLACEHOLDER)) continue;
  const hashes = new Set();
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const attrs = m[1];
    if (/\bsrc=/.test(attrs) || /type="application\/json"/.test(attrs) || !m[2]) continue;
    hashes.add(`'sha256-${crypto.createHash('sha256').update(m[2], 'utf8').digest('base64')}'`);
  }
  html = html.replace(PLACEHOLDER, [...hashes].join(' '));
  fs.writeFileSync(file, html);
  files += 1;
}
console.log(`CSP: hashes de scripts inline aplicados em ${files} página(s).`);
