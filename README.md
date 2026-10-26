# Módulo de Assinatura Digital — Relatórios de Despesa

**N2 · Segurança da Informação · Prof. Claudinei Dias (Ney) · Católica de Santa Catarina**

Sistema web para enviar, validar, **assinar digitalmente** e **verificar** relatórios de despesa. Ele garante **autenticidade**, **integridade** e **não repúdio**, em conformidade com a legislação brasileira de assinaturas eletrônicas.

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js (Pages Router, export estático) + Material-UI + Tailwind CSS → **GitHub Pages (HTTPS)** |
| Backend | Node.js + Express, JWT, Helmet, Nodemailer → Docker (Render, HTTPS) |
| Banco de dados | MongoDB (**MongoDB Atlas** em nuvem; contêiner no ambiente local) |
| Criptografia | **Web Cryptography API** (navegador) + **Node.js `crypto`** (servidor) |
| Ambiente | Docker / docker-compose com políticas de segurança |

---

## 1. Fluxo do sistema

```
Colaborador ──(1) envia relatório + recibos──▶ PENDENTE ──e-mail──▶ Aprovadores
Aprovador   ──(2) confere recibos e valida───▶ VALIDADO ──e-mail──▶ Colaborador / Aprovadores
Aprovador   ──(3) assina com PIN (ECDSA)─────▶ ASSINADO ──e-mail──▶ Gerente / Colaborador
Gerente     ──(4) verifica autenticidade e integridade (servidor + navegador + offline)
```

| Perfil | Pode |
|---|---|
| **Colaborador** | Enviar relatórios e acompanhar os seus |
| **Aprovador** (financeiro) | Tudo do colaborador + validar/rejeitar, assinar e verificar |
| **Gerente** | Tudo + CRUD de funcionários |

**Segregação de funções:** ninguém valida nem assina o próprio relatório (regra aplicada na API).

---

## 2. Como a assinatura digital funciona

```
NAVEGADOR (Web Crypto API)                                SERVIDOR (Node.js crypto)
─────────────────────────                                 ─────────────────────────
1. generateKey(ECDSA P-256)
2. PIN ─PBKDF2-SHA256 (310 mil iterações)─▶ chave AES-256
3. chave privada (PKCS#8) ─AES-GCM─▶ cofre cifrado ──────▶ guarda só o cofre + chave pública
                                                           (nunca vê a chave privada em claro)
4.                              ◀── documento canônico (JSON ordenado) + SHA-256
5. confere SHA-256 localmente
6. PIN abre o cofre → sign(ECDSA, SHA-256, documento) ───▶ 7. recalcula o documento a partir do banco
                                                           8. verify(ECDSA) com a chave pública
                                                           9. carimbo de tempo: servidor assina
                                                              {hash, assinatura, signatário, data}
                                                              com a PRÓPRIA chave (gerada com Node crypto)
```

**O que é assinado** (`backend/src/services/document.js`): todos os dados do relatório (título, descrição, categoria, valor em centavos, data), o colaborador, o **SHA-256 de cada recibo**, quem validou e quando, e a identificação do signatário com a impressão digital da chave. Se um byte mudar, a verificação falha.

| Propriedade | Como é garantida |
|---|---|
| **Autenticidade** | Assinatura ECDSA P-256 verificada com a chave pública registrada do signatário. A chave pertence ao histórico de chaves do usuário. |
| **Integridade** | O SHA-256 do documento canônico é recalculado a partir dos dados atuais do banco. O SHA-256 de cada arquivo de recibo também é recalculado. |
| **Não repúdio** | Só o signatário tem o PIN que abre a chave privada; nem o administrador do servidor consegue assinar por ele. Há reautenticação (senha) para gerar ou trocar a chave. O carimbo de tempo é assinado pelo servidor. Ficam registrados IP e user-agent, e o histórico é imutável. |
| **Verificação independente** | O pacote `.json` da assinatura pode ser verificado só no navegador, sem o servidor. Também dá para comparar o arquivo do recibo com o hash assinado. |

### Conformidade com a legislação brasileira

- **MP 2.200-2/2001, art. 10, § 2º:** admite outros meios de comprovação de autoria e integridade de documentos eletrônicos, desde que aceitos pelas partes.
- **Lei 14.063/2020, art. 4º, II (assinatura eletrônica avançada):** a assinatura está associada ao signatário de maneira unívoca (chave própria e protegida por PIN). Ela usa dados que o signatário controla com elevado nível de confiança e permite detectar qualquer modificação posterior. Esse é o nível implementado.
- A assinatura **qualificada** (art. 4º, III) exige certificado ICP-Brasil emitido por autoridade certificadora credenciada. Ela fica fora do escopo acadêmico, mas o módulo poderia ser adaptado para usar o par de chaves de um certificado A1/A3.
- **LGPD:** dados mínimos, senhas com hash, acesso por perfil e comunicação apenas por HTTPS.

---

## 3. Checklist dos requisitos do enunciado

| # | Requisito | Onde está |
|---|---|---|
| 1a | Docker com "políticas de segurança" (backend, banco, servidor web) | `docker-compose.yml`: usuários não-root, `read_only`, `cap_drop: ALL`, `no-new-privileges`, rede interna sem internet para o banco, banco sem porta exposta, usuário MongoDB de menor privilégio (`docker/mongo-init`), limites de CPU/memória/processos, segredos em `.env`. Os `Dockerfile`s usam imagens Alpine, multi-stage e NGINX *unprivileged*. |
| 1b | Node.js, MongoDB, Next.js | `backend/`, `frontend/` |
| 2a | Banco com colaboradores, dados diversos e assinaturas | Modelos `User`, `Expense`, `Receipt`, `Signature`, `ServerKey` em `backend/src/models` |
| 2b | Banco em nuvem (transferência de risco) | MongoDB Atlas (seção 5) |
| 3a/b | Interfaces interativas e responsivas, Material-UI + Tailwind | `frontend/pages`, `frontend/components` (menu lateral recolhível no celular) |
| 4a | Regras de negócio no backend | `backend/src/routes/*.js`: fluxo de status, segregação de funções, validações Zod |
| 4b | Autenticação JWT | `backend/src/middleware/auth.js`: HS256 fixo, issuer/audience, expiração de 1 h, papel lido do banco |
| 5a | Geração de chaves com Node.js Crypto e Web Crypto | Navegador: `frontend/lib/signing.js`. Servidor: `backend/src/services/crypto.js` (chave do carimbo, SHA-256, AES-GCM, scrypt) |
| 5b | Assinatura e verificação com Web Crypto | `signDocument` / `verifySignature` / `verifyPackage` em `frontend/lib/signing.js` |
| 6a | Proteção contra injeção (SQL/NoSQL), XSS, CSRF etc. | NoSQL: `express-mongo-sanitize` + Zod + `strictQuery`. XSS: filtro `xss` em todo texto recebido + CSP sem `unsafe-inline` para scripts (hashes) + React escapa a saída. CSRF: token HMAC no cabeçalho `X-CSRF-Token` + CORS restrito. Outras proteções: rate limit no login (força bruta), `hpp`, upload validado pelo conteúdo real (magic bytes) e tamanho, mensagens de erro genéricas, bcrypt custo 12, tempo constante no login. |
| 6b | Helmet para cabeçalhos HTTP | `backend/src/middleware/security.js`: CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, COOP/CORP. O NGINX local e a `<meta>` CSP fazem o mesmo papel no frontend. |
| 6c | Publicar no GH-PAGES com HTTPS/TLS | `.github/workflows/deploy.yml`: testes → build → GitHub Pages com "Enforce HTTPS". API no Render com TLS. A API recusa HTTP em produção. |
| 7 | `login.js` (senhas criptografadas) | `frontend/pages/login.js`: bcrypt no servidor, HTTPS |
| 7 | `dashboard.js` (CRUD funcionários + cadastro de despesas) | `frontend/pages/dashboard.js` |
| 7 | `employees.js` (listar, cadastrar, editar) | `frontend/pages/employees.js`: também exclui (ou desativa quando há documentos vinculados) |
| 7 | `submitExpense.js` (upload de recibos) | `frontend/pages/submitExpense.js`: PDF/PNG/JPG, até 5 arquivos de 5 MB, SHA-256 exibido |
| 7 | Notificação por e-mail (Nodemailer) | `backend/src/services/mailer.js`: envio, validação/rejeição, pronto para assinar, assinado, novo usuário |
| 7 | `pendingExpenses.js` | `frontend/pages/pendingExpenses.js`: abas "aguardando validação" e "aguardando assinatura" |
| 7 | `validateExpense.js` | `frontend/pages/validateExpense.js`: visualiza recibos, confere o hash e valida ou rejeita |
| 7 | `signExpense.js` | `frontend/pages/signExpense.js`: gera a chave, mostra o JSON exato a assinar e assina com PIN |
| 7 | `signedExpenses.js` | `frontend/pages/signedExpenses.js`: lista e permite baixar o pacote `.json` |
| 7 | `verifySignature.js` | `frontend/pages/verifySignature.js`: verificação dupla (servidor + navegador), offline e com histórico |

---

## 4. Executar localmente

### Opção A — Docker (ambiente completo)

```bash
cp .env.example .env          # troque TODOS os segredos
docker compose up -d --build
```

- Sistema: **https://localhost:8443** (o certificado é autoassinado; aceite o aviso do navegador)
- E-mails enviados: **http://localhost:8025** (Mailpit)

### Opção B — Sem Docker (desenvolvimento)

Requer um MongoDB rodando (local ou Atlas).

```bash
cd backend  && cp .env.example .env && npm install && npm run dev     # API em :4000
cd frontend && npm install && npm run dev                              # Web em :3000
```

### Usuários de demonstração

O seed roda quando o banco está vazio. A senha é o valor de `SEED_PASSWORD` (padrão `Senha@123`). **Troque as senhas após o primeiro acesso.**

| E-mail | Perfil |
|---|---|
| gerente@empresa.com | Gerente |
| aprovador@empresa.com | Aprovador |
| colaborador@empresa.com | Colaborador |

---

## 5. Publicação (produção com HTTPS)

1. **MongoDB Atlas:** crie um cluster gratuito (M0) e um usuário de banco com permissão *readWrite*. Em *Network Access*, libere o acesso da API e copie a string `mongodb+srv://...`.
2. **API no Render:** escolha *New → Blueprint* e selecione este repositório (`render.yaml`). Preencha:
   - `MONGODB_URI`: a string do Atlas.
   - `CORS_ORIGINS`: `https://SEU-USUARIO.github.io`.
   - `APP_URL`: `https://SEU-USUARIO.github.io/NOME-DO-REPO`.
   - `SMTP_*`: por exemplo, Gmail com **senha de app**: `smtp.gmail.com`, porta 465, `SMTP_SECURE=true`.
   - `SEED_PASSWORD`.

   O Render fornece o certificado TLS automaticamente.
3. **Frontend no GitHub Pages:**
   - No repositório, defina *Settings → Secrets and variables → Actions → Variables*: `API_URL = https://<api>.onrender.com/api`.
   - Em *Settings → Pages*, escolha *Source: GitHub Actions* e marque **Enforce HTTPS**.
   - Faça push na branch `main`. O workflow roda os testes e o `npm audit`, faz o build e publica.

> O GitHub Pages hospeda apenas arquivos estáticos, por isso o backend fica em outro serviço. Os dois usam HTTPS.

---

## 6. Testes

```bash
cd backend && npm test        # integração + segurança (MongoDB em memória)
npm install && npx playwright install chromium && npm run e2e   # interface, com API e web rodando
```

**Testes automatizados** (`backend/test/fluxo.test.js`):

- CSRF obrigatório.
- Bloqueio de injeção NoSQL (`{"$ne": null}`).
- JWT adulterado é recusado.
- Controle de acesso por perfil.
- Arquivo disfarçado (`.exe` como `.png`) é recusado.
- Remoção de XSS.
- Segregação de funções.
- Chave privada enviada em claro é recusada.
- PIN errado não abre a chave.
- Assinatura forjada é recusada.
- **Adulteração do valor no banco é detectada.**
- **Troca do arquivo do recibo é detectada.**
- CRUD de funcionários e senha fraca recusada.

**Teste ponta a ponta** (`e2e/fluxo.e2e.js`): percorre todas as páginas com os três perfis. Também verifica um pacote adulterado (detectado) e falha se houver qualquer erro no console, inclusive violação de CSP. As capturas de tela ficam em `e2e/screenshots/`.

---

## 7. Estrutura

```
backend/   src/{app,server,config,db,seed}.js · models/ · routes/ · middleware/ · services/{crypto,document,mailer}.js · test/
frontend/  pages/ (as 9 páginas exigidas) · components/ · lib/{api,signing,useAuth,format}.js · scripts/csp-hashes.js · nginx.conf
docker/    mongo-init/ (usuário de menor privilégio)
.github/   workflows/deploy.yml (CI + GH-Pages)
docker-compose.yml · render.yaml · .env.example
```
