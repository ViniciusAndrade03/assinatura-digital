import { Html, Head, Main, NextScript } from 'next/document';

// O GitHub Pages não permite configurar cabeçalhos HTTP, então a política de segurança de
// conteúdo (CSP) do frontend é aplicada via <meta>. Ela bloqueia scripts de terceiros/inline
// (mitiga XSS) e só permite conexões com a própria origem e com a API.
function apiOrigin() {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api').origin;
  } catch {
    return '';
  }
}

const isProd = process.env.NODE_ENV === 'production';
const CSP = [
  "default-src 'self'",
  "script-src 'self' __CSP_INLINE_HASHES__", // hashes dos scripts inline do Next (scripts/csp-hashes.js)
  "style-src 'self' 'unsafe-inline'", // estilos inline são necessários para o Material-UI (Emotion)
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin()}`,
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

export default function Document() {
  return (
    <Html lang="pt-BR">
      <Head>
        {isProd && <meta httpEquiv="Content-Security-Policy" content={CSP} />}
        <meta name="referrer" content="no-referrer" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
