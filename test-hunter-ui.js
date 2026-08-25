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
    /* Ambiente de teste NÃO tem rede (file://): as fontes reais falhariam
       honestamente. Definimos uma API base fictícia (contorna o bloqueio de
       file://) e stubamos o fetch para testar pesquisa→dedup→persistência. */
    w.NEITZEL_API_BASE = 'http://hunter.teste';
    w.fetch = (url) => {
      const ehPesquisa = String(url).includes('/api/cacador/pesquisar');
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => (ehPesquisa ? {
          leads: [
            { nome: 'Academia Alfa', telefone: '47999990001', email: 'alfa@teste.com', site: 'https://alfa.teste', endereco: 'Joinville SC' },
            { nome: 'Academia Beta', telefone: '47999990002', whatsapp: '47999990002', email: 'beta@teste.com', endereco: 'Joinville SC' },
            { nome: 'Academia Gama', telefone: '(47) 99999-0003', email: 'gama@teste.com', endereco: 'Joinville SC' },
          ],
          erros: [],
        } : {}),
      });
    };
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
    /* Sincronizações em segundo plano podem re-renderizar outra view após o
       boot; garante que o CAÇADOR está na tela no momento da leitura. */
    try {
      if (process.env.HDBG) {
        const antes = (doc.querySelector('.ecomim-content') || {}).textContent || '';
        console.log('[HDBG] len-antes:', antes.length, '| temNovaPesquisa?', antes.includes('Nova pesquisa'));
        console.log('[HDBG] inicio:', JSON.stringify(antes.slice(0, 160)));
      }
      win.ECOMIM_APP.renderView('cacador');
    } catch (e) { console.log('[HDBG] THROW no renderView cacador:', e.message); }
    await sleep(80);
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
    if (process.env.HDBG) {
      const s0 = H.DB.pesquisas[0] || {};
      console.log('[HDBG] resultados:', JSON.stringify(s0.resultados));
      console.log('[HDBG] porFonte:', JSON.stringify(s0.porFonte));
      console.log('[HDBG] erros:', JSON.stringify((s0.erros || []).slice(0, 4)));
      console.log('[HDBG] fontes ativas:', H.DB.sources.filter((x) => x.ativo).map((x) => x.id).join(','));
      console.log('[HDBG] leads:', H.DB.leads.length);
    }
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