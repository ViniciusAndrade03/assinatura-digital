/** @type {import('next').NextConfig} */
// Export estático → publicável no GitHub Pages (HTTPS com certificado TLS do próprio GitHub).
// NEXT_PUBLIC_BASE_PATH = "/<nome-do-repositorio>" quando publicado em usuario.github.io/<repo>
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

module.exports = {
  output: 'export',
  basePath,
  trailingSlash: true, // gera /login/index.html (funciona no GH-Pages)
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
};
