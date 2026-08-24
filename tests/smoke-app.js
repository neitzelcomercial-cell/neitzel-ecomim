/* Smoke test: carrega o sistema no Chrome headless e valida pontos-chave. */
'use strict';
const path = require('path');
const puppeteer = require('puppeteer-core');
const chromeMod = require('../backend/chrome');

(async () => {
  let falhas = 0;
  const ok = (cond, nome) => { console.log((cond ? 'OK   ' : 'FALHOU ') + nome); if (!cond) falhas++; };

  const exe = process.env.NEITZEL_CHROME
    || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    || null;
  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: 'new',
    args: ['--no-first-run', '--disable-crash-reporter', '--mute-audio', '--allow-file-access-from-files'],
  });
  try {
    const page = await browser.newPage();
        await page.evaluateOnNewDocument(() => { try { localStorage.setItem('ecomim_os_security_v1', JSON.stringify({ onboarding: true, createdAt: new Date().toISOString() })); } catch (e) {} });
    await page.setViewport({ width: 1400, height: 900 });
    const erros = [];
    page.on('pageerror', (e) => erros.push(String(e && e.message || e)));
    const alvo = 'http://localhost:8088/';
    await page.goto(alvo, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 3500));

    // Fecha possÃ­veis overlays de login/onboarding para inspecionar a navegaÃ§Ã£o
    const temLogin = await page.evaluate(() => !!(document.querySelector('.ecomim-login') || document.querySelector('.nz-onboarding')));
    // Perfil com senha: forÃ§a desbloqueio programÃ¡tico (renderApp(true) roda initApp)
    await page.evaluate(() => {
      document.querySelectorAll('.ecomim-login, .nz-onboarding').forEach((n) => n.remove());
      if (window.ECOMIM_APP && window.ECOMIM_APP.renderApp) window.ECOMIM_APP.renderApp(true);
    });
    await new Promise((r) => setTimeout(r, 1200));
    const temShell2 = await page.evaluate(() => !!document.querySelector('.ecomim-sidebar'));
    ok(temShell2, 'app inicializado apÃ³s desbloqueio');

    const temShell = await page.evaluate(() => !!document.querySelector('.ecomim-shell'));
    const temSidebar = await page.evaluate(() => !!document.querySelector('.ecomim-sidebar'));
    ok(temShell, 'shell montou');
    ok(temSidebar, 'sidebar montou');

    // Botões removidos não podem existir na sidebar
    const navTexto = await page.evaluate(() => Array.from(document.querySelectorAll('.nav-label')).map((n) => n.textContent));
    const norm = (s) => String(s).normalize('NFC');
    ok(!navTexto.some((t) => /Ca.ador/i.test(norm(t))), 'Caçador de Leads fora da navegação');
    ok(!navTexto.some((t) => /Fila de aprova/i.test(norm(t))), 'Fila de aprovação fora da navegação');
    ok(navTexto.some((t) => /Estrat.gia & Previs.o/i.test(norm(t))), 'Estratégia & Previsão na navegação');
    ok(navTexto.some((t) => /Atividades & Mem.ria/i.test(norm(t))), 'Atividades & Memória na navegação');
    ok(navTexto.some((t) => /Seguran.a & Diagn.stico/i.test(norm(t))), 'Segurança & Diagnóstico na navegação');

    // Navega pelas views principais
    if (temShell2) {
      const views = ['leads', 'funil', 'estrategia', 'memoria', 'seguranca', 'config', 'bi', 'clientes'];
      for (const v of views) {
        await page.evaluate((id) => window.ECOMIM_APP.renderView(id), v);
        await new Promise((r) => setTimeout(r, 350));
        const okRender = await page.evaluate((id) => document.querySelector('.ecomim-content').dataset.view === id && document.querySelector('.ecomim-content').children.length > 0, v);
        ok(okRender, 'view renderiza: ' + v);
      }
      // Modal do cenÃ¡rio abre
      await page.evaluate(() => { if (window.NEITZEL_CENARIO) window.NEITZEL_CENARIO.open(); });
      await new Promise((r) => setTimeout(r, 500));
      const modalCen = await page.evaluate(() => !!document.querySelector('.cen-overlay'));
      ok(modalCen, 'palco do PossÃ­vel CenÃ¡rio abre');
      const canvasVivo = await page.evaluate(() => { const c = document.querySelector('.cen-canvas'); return c && c.width > 0; });
      ok(canvasVivo, 'animaÃ§Ã£o do cenÃ¡rio rodando');
    }

    ok(erros.length === 0, 'sem erros JS na pÃ¡gina' + (erros.length ? ' â†’ ' + erros.slice(0, 3).join(' | ') : ''));
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(falhas ? '\nSMOKE TEST COM FALHAS: ' + falhas : '\nSMOKE TEST PASSOU âœ”');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('ERRO FATAL:', e.message); process.exit(1); });
