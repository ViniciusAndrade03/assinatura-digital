/**
 * Teste ponta a ponta pela interface (Playwright), percorrendo todas as páginas exigidas.
 *   BASE_URL=http://localhost:3000 node e2e/fluxo.e2e.js
 * Requer API + frontend rodando e os usuários do seed.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SHOTS = path.join(__dirname, 'screenshots');
const PWD = process.env.SEED_PASSWORD || 'Senha@123';
const PIN = 'meu-pin-123';
fs.mkdirSync(SHOTS, { recursive: true });

// PDF mínimo válido para usar como recibo
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<<>>>>endobj 4 0 obj<</Length 44>>stream\nBT /F1 18 Tf 40 100 Td (Recibo Taxi R$ 87,50) Tj ET\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF');

const errors = [];
let current = null; // página em uso (para captura em caso de falha)
async function session(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  current = page;
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${email}] ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`[${email}] ${e.message}`));
  await page.goto(`${BASE}/login/`);
  await page.getByLabel('E-mail').fill(email);
  await page.locator('input[autocomplete=current-password]').fill(PWD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/dashboard/');
  await page.getByText('Meus relatórios').waitFor();
  return page;
}
const shot = async (page, name) => {
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
};

(async () => {
  const browser = await chromium.launch();

  // Login (tela)
  const lp = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  await lp.goto(`${BASE}/login/`);
  await shot(lp, '01-login');

  // 1) Colaborador envia relatório com recibo
  const colab = await session(browser, 'colaborador@empresa.com');
  await shot(colab, '02-dashboard-colaborador');
  await colab.goto(`${BASE}/submitExpense/`);
  await colab.getByLabel('Título').fill('Táxi aeroporto - visita cliente');
  await colab.getByLabel('Valor').fill('87,50');
  await colab.getByLabel('Descrição / justificativa').fill('Deslocamento até o cliente ACME.');
  await colab.locator('input[type=file]').setInputFiles({ name: 'recibo-taxi.pdf', mimeType: 'application/pdf', buffer: PDF });
  await colab.getByText('SHA-256:').waitFor();
  await shot(colab, '03-submitExpense');
  await colab.getByRole('button', { name: 'Enviar relatório' }).click();
  await colab.waitForURL('**/dashboard/');
  await colab.getByRole('cell', { name: 'Táxi aeroporto - visita cliente' }).first().waitFor();

  // 2) Aprovador: gera chave, valida e assina
  const apr = await session(browser, 'aprovador@empresa.com');
  await apr.getByRole('button', { name: /Gerar (chave de assinatura|nova chave)/ }).click();
  await apr.getByLabel('PIN de assinatura').fill(PIN);
  await apr.getByLabel('Confirme o PIN').fill(PIN);
  await apr.getByLabel('Senha de login (confirmação)').fill(PWD);
  await apr.getByRole('button', { name: 'Gerar', exact: true }).click();
  await apr.getByText('Impressão digital (SHA-256)').waitFor();
  await shot(apr, '04-dashboard-aprovador-chave');

  await apr.goto(`${BASE}/pendingExpenses/`);
  await apr.locator('main').getByRole('link', { name: 'Validar', exact: true }).first().waitFor();
  await shot(apr, '05-pendingExpenses');
  await apr.locator('main').getByRole('link', { name: 'Validar', exact: true }).first().click();
  await apr.waitForURL('**/validateExpense/**');
  await apr.getByRole('button', { name: 'Abrir e conferir hash' }).click();
  await apr.getByText('Íntegro').waitFor();
  await apr.getByRole('button', { name: 'Fechar' }).click();
  await apr.getByLabel('Comentário (obrigatório para rejeitar)').fill('Recibo confere com o valor.');
  await shot(apr, '06-validateExpense');
  await apr.getByRole('button', { name: 'Validar', exact: true }).click();
  await apr.getByText('Relatório validado').waitFor();

  await apr.getByRole('link', { name: 'Ir para assinatura digital' }).click();
  await apr.waitForURL('**/signExpense/**');
  await apr.getByText('SHA-256 (conferido no navegador)').waitFor();
  await apr.getByLabel('PIN de assinatura').fill('pin-errado');
  await apr.getByRole('button', { name: 'Assinar digitalmente' }).click();
  await apr.getByText('PIN de assinatura incorreto').waitFor();
  await apr.getByLabel('PIN de assinatura').fill(PIN);
  await shot(apr, '07-signExpense');
  await apr.getByRole('button', { name: 'Assinar digitalmente' }).click();
  await apr.getByText('Documento assinado digitalmente').waitFor();
  await shot(apr, '08-signExpense-assinado');

  // 3) Gerente: lista assinados, verifica, baixa pacote e CRUD de funcionários
  const ger = await session(browser, 'gerente@empresa.com');
  await shot(ger, '09-dashboard-gerente');
  await ger.goto(`${BASE}/signedExpenses/`);
  await ger.locator('main').getByRole('link', { name: 'Verificar', exact: true }).first().waitFor();
  await shot(ger, '10-signedExpenses');
  const [download] = await Promise.all([ger.waitForEvent('download'), ger.getByRole('button', { name: '.json' }).first().click()]);
  const pkgPath = path.join(SHOTS, 'pacote-assinatura.json');
  await download.saveAs(pkgPath);

  await ger.locator('main').getByRole('link', { name: 'Verificar', exact: true }).first().click();
  await ger.getByText('ASSINATURA VÁLIDA').waitFor();
  await shot(ger, '11-verifySignature');

  await ger.goto(`${BASE}/verifySignature/`);
  await ger.locator('input[type=file]').first().setInputFiles(pkgPath);
  await ger.getByText('ASSINATURA VÁLIDA').waitFor();
  await ger.locator('input[type=file]').nth(1).setInputFiles({ name: 'recibo-taxi.pdf', mimeType: 'application/pdf', buffer: PDF });
  await ger.getByText('idêntico ao recibo assinado').waitFor();
  await shot(ger, '12-verifySignature-offline');

  // pacote adulterado (valor alterado) → inválido
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.documento = pkg.documento.replace('"valorCentavos":8750', '"valorCentavos":98750');
  const bad = path.join(SHOTS, 'pacote-adulterado.json');
  fs.writeFileSync(bad, JSON.stringify(pkg));
  await ger.reload();
  await ger.locator('input[type=file]').first().setInputFiles(bad);
  await ger.getByText('ASSINATURA INVÁLIDA').waitFor();
  await shot(ger, '13-verifySignature-adulterado');

  await ger.goto(`${BASE}/employees/`);
  await ger.getByRole('button', { name: 'Novo funcionário' }).click();
  await ger.getByLabel('Nome').fill('Maria Souza');
  const mariaEmail = `maria.${Date.now()}@empresa.com`;
  await ger.getByLabel('E-mail').fill(mariaEmail);
  await ger.getByLabel('Senha provisória').fill('Maria2026x');
  await ger.getByRole('button', { name: 'Salvar' }).click();
  await ger.getByRole('cell', { name: mariaEmail }).waitFor();
  await shot(ger, '14-employees');

  await browser.close();
  if (errors.length) {
    console.error('Erros no console do navegador:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log('E2E OK — capturas em e2e/screenshots/');
})().catch(async (e) => {
  console.error(e);
  if (current) await current.screenshot({ path: path.join(SHOTS, 'ERRO.png'), fullPage: true }).catch(() => {});
  console.error(errors.join('\n'));
  process.exit(1);
});
