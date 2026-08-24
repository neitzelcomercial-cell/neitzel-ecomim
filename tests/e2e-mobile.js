'use strict';
const puppeteer = require('puppeteer-core');
(async () => {
  let falhas = 0;
  const ok = (cond, nome) => { console.log((cond ? 'OK   ' : 'FALHOU ') + nome); if (!cond) falhas++; };
  const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new', args: ['--no-first-run', '--mute-audio'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('ecomim_os_security_v1', JSON.stringify({ onboarding: true })); } catch (e) {} });
    const erros = [];
    page.on('pageerror', (e) => erros.push(String(e && e.message || e)));
    await page.goto('http://localhost:8088/', { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 3000));
    await page.evaluate(() => window.ECOMIM_APP.renderApp(true));
    await new Promise((r) => setTimeout(r, 800));

    // Sem scroll horizontal na página
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sem estouro horizontal no painel');

    // Burger visível e menu abre com véu
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('.ecomim-burger')).display !== 'none'), 'botão de menu visível');
    await page.tap('.ecomim-burger');
    await new Promise((r) => setTimeout(r, 350));
    ok(await page.evaluate(() => document.querySelector('.ecomim-sidebar').classList.contains('mobile-open') && !!document.querySelector('.nav-veu')), 'menu abre com véu de fundo');

    // Navega por um item e o menu fecha
    await page.evaluate(() => Array.from(document.querySelectorAll('.ecomim-nav-item')).find((b) => b.dataset.view === 'leads')?.click());
    await new Promise((r) => setTimeout(r, 450));
    ok(await page.evaluate(() => !document.querySelector('.ecomim-sidebar').classList.contains('mobile-open') && !document.querySelector('.nav-veu')), 'navegar fecha o menu');
    ok(await page.evaluate(() => document.querySelector('.ecomim-content').dataset.view === 'leads'), 'view leads carregou no mobile');

    // Tabela dentro do trilho rolável
    const tabelaOk = await page.evaluate(() => {
      const t = document.querySelector('.tbl-scroll .table');
      if (!t) return 'sem-tabela';
      return t.parentElement.scrollWidth >= t.scrollWidth ? true : ('trilho-menor-que-tabela');
    });
    ok(tabelaOk === true || tabelaOk === 'sem-tabela', 'tabelas rolam no trilho (' + tabelaOk + ')');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sem estouro horizontal nos leads');

    // Kanban vira corrediça
    await page.evaluate(() => window.ECOMIM_APP.renderView('funil'));
    await new Promise((r) => setTimeout(r, 450));
    ok(await page.evaluate(() => {
      const k = document.querySelector('.kanban');
      if (!k) return false;
      const col = k.querySelector('.kanban-col');
      return col && col.getBoundingClientRect().width < window.innerWidth * 0.95;
    }), 'kanban em colunas deslizantes');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sem estouro horizontal no funil');

    // Modal cabe na tela
    await page.evaluate(() => window.ECOMIM_APP.renderView('agenda'));
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(() => document.querySelector('#btn-agenda-novo')?.click());
    await new Promise((r) => setTimeout(r, 350));
    const modalOk = await page.evaluate(() => {
      const m = document.querySelector('.modal-box');
      if (!m) return false;
      const r = m.getBoundingClientRect();
      return r.width <= innerWidth + 1 && r.height <= innerHeight + 1;
    });
    ok(modalOk, 'modal do evento cabe na tela');
    await page.evaluate(() => document.querySelector('.modal [data-close]')?.click());

    // Configurações sem estouro
    await page.evaluate(() => window.ECOMIM_APP.renderView('config'));
    await new Promise((r) => setTimeout(r, 400));
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sem estouro horizontal nas configurações');

    // Screenshot para conferência visual
    await page.evaluate(() => window.ECOMIM_APP.renderView('dashboard'));
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: 'C:/Users/neitz/AppData/Local/Temp/opencode/mobile-dashboard.png', fullPage: false });

    // Véu fecha ao tocar fora da sidebar (à direita dela)
    await page.tap('.ecomim-burger');
    await new Promise((r) => setTimeout(r, 300));
    ok(await page.evaluate(() => document.documentElement.style.overflow === 'hidden'), 'fundo trava a rolagem com menu aberto');
    await page.touchscreen.tap(340, 520);
    await new Promise((r) => setTimeout(r, 250));
    ok(await page.evaluate(() => !document.querySelector('.ecomim-sidebar').classList.contains('mobile-open')), 'tocar no véu fecha o menu');
    ok(await page.evaluate(() => document.documentElement.style.overflow === ''), 'rolagem do fundo destravada');

    ok(erros.length === 0, 'sem erros JS' + (erros.length ? ' → ' + erros.slice(0, 3).join(' | ') : ''));
  } finally { await browser.close().catch(() => {}); }
  console.log(falhas ? '\nMOBILE COM FALHAS: ' + falhas : '\nMOBILE EXPANSIVO PASSOU ✔');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('ERRO FATAL:', e.message); process.exit(1); });
