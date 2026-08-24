/* E2E do Possível Cenário v2: passado real + gráfico + mercado + projeção. */
'use strict';
const puppeteer = require('puppeteer-core');
(async () => {
  let falhas = 0;
  const ok = (cond, nome) => { console.log((cond ? 'OK   ' : 'FALHOU ') + nome); if (!cond) falhas++; };
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new', args: ['--no-first-run', '--mute-audio'],
  });
  try {
    const page = await browser.newPage();
        await page.evaluateOnNewDocument(() => { try { localStorage.setItem('ecomim_os_security_v1', JSON.stringify({ onboarding: true, createdAt: new Date().toISOString() })); } catch (e) {} });
    await page.setViewport({ width: 1400, height: 900 });
    const erros = [];
    page.on('pageerror', (e) => erros.push(String(e && e.message || e)));
    await page.goto('http://localhost:8088/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 3500));
    await page.evaluate(() => { document.querySelectorAll('.ecomim-login, .nz-onboarding').forEach((n) => n.remove()); window.ECOMIM_APP.renderApp(true); });
    await new Promise((r) => setTimeout(r, 800));
    await page.evaluate(() => window.NEITZEL_CENARIO.open());
    await new Promise((r) => setTimeout(r, 500));
    await page.evaluate(() => document.querySelector('#cn-iniciar').click());
    let temResultado = false;
    for (let i = 0; i < 70; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      temResultado = await page.evaluate(() => !!document.querySelector('#cg-svg'));
      if (temResultado) break;
    }
    ok(temResultado, 'cenário gerou resultado com gráfico');
    if (temResultado) {
      const checks = await page.evaluate(() => ({
        passadas: document.querySelectorAll('.cw').length,
        futuras: document.querySelectorAll('.cg-line-future').length,
        setas: document.querySelectorAll('.cg-seta').length,
        hoje: !!document.querySelector('.cg-hoje'),
        banda: !!document.querySelector('.cg-band'),
        linhasTabela: document.querySelectorAll('.cen-card tbody tr').length,
        resumo: document.querySelector('.cen-resumo').innerText.replace(/\n/g, ' ').slice(0, 160),
      }));
      ok(checks.passadas === 8, 'revisão das 8 semanas passadas (achadas: ' + checks.passadas + ')');
      ok(checks.futuras >= 1, 'linha de projeção futura presente');
      ok(checks.setas >= 10, 'setas de movimento no gráfico (' + checks.setas + ')');
      ok(checks.hoje, 'marcador HOJE presente');
      ok(checks.banda, 'faixa de confiança presente');
      ok(checks.linhasTabela >= 8, 'tabela detalhada da projeção (' + checks.linhasTabela + ' linhas)');
      console.log('RESUMO: ' + checks.resumo);
    }
    ok(erros.length === 0, 'sem erros JS durante o fluxo' + (erros.length ? ' → ' + erros.slice(0, 3).join(' | ') : ''));
  } finally { await browser.close().catch(() => {}); }
  console.log(falhas ? '\nE2E COM FALHAS: ' + falhas : '\nE2E DO CENÁRIO PASSOU ✔');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('ERRO FATAL:', e.message); process.exit(1); });
