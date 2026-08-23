/* Teste de UI do Caçador de Leads com jsdom real.
 * Renderiza o app completo num DOM que imita o navegador e valida que o
 * Caçador constrói a árvore sem exceções e sem artefatos como "[object ...]". */
'use strict';

const path = require('path');
const { JSDOM } = require('C:/Users/neitz/AppData/Roaming/npm/node_modules/jsdom');
const cryptoNode = require('crypto');

const basePath = path.join(__dirname);
const html = `<!doctype html><html lang="pt-BR" data-theme="dark"><head><meta charset="utf-8"/></head>
<body><div id="app-root"></div><div class="toast-container" id="toast-container"></div>
<script src="src/core.js"></script><script src="src/core-extra.js"></script>
<script src="src/hunter.js"></script><script src="src/hunter-ui.js"></script>
<script src="src/onboarding.js"></script>
<script src="src/app.js"></script></body></html>`;

const dom = new JSDOM(html, {
  url: 'file://' + basePath + '/index.html',
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(w) {
    w.HTMLElement.prototype.scrollIntoView = function() {};
    w.alert = function() {};
    w.confirm = function() { return true; };
    try { Object.defineProperty(w, 'crypto', { configurable: true, value: cryptoNode.webcrypto }); } catch (e) {}
  },
});

function assert(cond, msg) {
  if (!cond) { console.error('✗ ' + msg); process.exitCode = 1; }
  else console.log('✓ ' + msg);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

dom.window.addEventListener('load', async () => {
  try {
    await sleep(2000);

    const win = dom.window;
    const doc = win.document;
    const E = win.ECOMIM;
    const H = win.ECOMIM_HUNTER;
    const UI = win.__ECOMIM_HUNTER_UI;

    assert(!!E && !!H && !!UI, 'módulos core/hunter/UI carregados');

    // Conclui onboarding para chegar ao app
    if (!win.ECOMIM_EXT.security.isOnboardingDone()) {
      const sec = win.ECOMIM_EXT.security;
      await sec.setupPassword('123456');
      await sec.setupRecovery({ whatsapp: '47999999999', email: 't@e.com' });
      await sec.setupGoogle({ nome: 'Teste', email: 't@gmail.com' });
      sec.completeOnboarding(true);
    }
    win.ECOMIM_APP.renderApp(true);
    await sleep(150);

    // renderCacador não lança e não gera artefato de objeto
    win.ECOMIM_APP.renderView('cacador');
    await sleep(300);
    const txt = (doc.querySelector('.ecomim-content') || { textContent: '' }).textContent || '';
    assert(!txt.includes('HTMLButtonElement') && !txt.includes('[object '), 'renderCacador sem artefato "[object ...]"');
    assert(txt.includes('Nova pesquisa'), 'renderCacador monta o formulário de pesquisa');

    assert(typeof UI.openExportModal === 'function', 'openExportModal exportada');
    assert(typeof UI.openLeadHunterDetail === 'function', 'openLeadHunterDetail exportada');
    assert(typeof H.executarPesquisa === 'function', 'executarPesquisa exportada');
    assert(typeof H.limparHistorico === 'function', 'limparHistorico exportada');

    // Pesquisa + exportação em memória (sem download)
    const r = await H.executarPesquisa({ tipo: 'empresa', cidade: 'Joinville', segmento: 'academias', quantidade: 20 });
    assert(r.ok, 'pesquisa executa ok');
    assert(H.DB.leads.length > 0, 'pesquisa gera leads p/ export');
    assert(H.DB.pesquisas.length === 1, 'histórico com 1 item');
    const r2 = H.limparHistorico();
    assert(r2.ok && r2.removidos === 1, 'limparHistórico remove 1');
    assert(H.DB.pesquisas.length === 0, 'histórico vazio após limpar');

    console.log(process.exitCode ? '\nCOM FALHAS' : '\nTODOS OS TESTES DE UI PASSARAM ✔');
    process.exit(0);
  } catch (e) {
    console.error('ERRO no teste: ' + e.message);
    process.exitCode = 1;
    console.log('\nCOM FALHAS');
    process.exit(0);
  }
});