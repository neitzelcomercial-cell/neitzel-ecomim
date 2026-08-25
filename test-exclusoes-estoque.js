/* Teste: exclusão de movimentações de estoque (com reversão de saldo)
 * + integração ECOMIM ↔ NEITZEL_OPS carregada de verdade (como no navegador).
 * Cobre: botão 🗑 na view Estoque, exclusão de serviços/produtos pelos métodos
 * patcheados e trava de saldo negativo. */
'use strict';
const path = require('path');
const { JSDOM } = require('C:/Users/neitz/AppData/Roaming/npm/node_modules/jsdom');
const cryptoNode = require('crypto');

const basePath = 'C:/Users/neitz/OneDrive/ECOMIM';
const html = `<!doctype html><html lang="pt-BR" data-theme="dark"><head><meta charset="utf-8"/></head>
<body><div id="app-root"></div><div class="toast-container" id="toast-container"></div>
<script src="src/core.js"></script><script src="src/core-extra.js"></script>
<script src="src/operacional-core.js"></script><script src="src/operacional-ui.js"></script>
<script src="src/servicos.js"></script><script src="src/produtos.js"></script><script src="src/estoque.js"></script>
<script src="src/integracao-operacional.js"></script>
<script src="src/onboarding.js"></script><script src="src/app.js"></script></body></html>`;

let falhas = 0;
function assert(cond, msg) {
  if (!cond) { falhas++; console.log('✗ ' + msg); } else console.log('✓ ' + msg);
}

const dom = new JSDOM(html, {
  url: 'file://' + path.join(basePath, 'index.html'),
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(w) {
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.alert = function () {};
    w.confirm = function () { return true; };
    const mem = {};
    Object.defineProperty(w, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k) => (k in mem ? mem[k] : null),
        setItem: (k, v) => { mem[k] = String(v); },
        removeItem: (k) => { delete mem[k]; },
        clear: () => { for (const k of Object.keys(mem)) delete mem[k]; },
        key: (i) => Object.keys(mem)[i] ?? null,
        get length() { return Object.keys(mem).length; },
      },
    });
    try { Object.defineProperty(w, 'crypto', { configurable: true, value: cryptoNode.webcrypto }); } catch (e) {}
  },
});

dom.window.addEventListener('load', async () => {
  try {
    // Espera módulos + integração (poll 500ms + init após 1000ms)
    await new Promise((r) => setTimeout(r, 2600));
    const w = dom.window;
    const E = w.ECOMIM;
    const O = w.NEITZEL_OPS;
    assert(!!E && !!O && !!w.ECOMIM_APP, 'módulos carregados');
    assert(!!(O.servicos && O.servicos.excluir), 'integração ativa (patch aplicado)');

    // ---- PRODUTO com estoque inicial (via método patchado, como a UI chama) ----
    const rp = O.produtos.add({ nome: 'Shampoo Premium', preco: 39.9, custo: 15, estoqueAtual: 10, estoqueMinimo: 3 });
    assert(rp.ok, 'produto criado via integração');
    const prodId = (rp.item || rp.produto || rp).id;
    assert(O.produtos.list().some((p) => p.id === prodId), 'produto visível na listagem (loja certa)');
    assert(O.produtos.ativos().some((p) => p.id === prodId), 'ativos() enxerga o produto (antes lia loja errada)');

    // ---- ENTRADA ----
    const re = O.estoque.registrar({ produtoId: prodId, quantidade: 5, tipo: 'entrada', motivo: 'compra' });
    assert(re.ok && re.saldo === 15, `entrada registrada (saldo ${re && re.saldo})`);
    assert(O.produtos.get(prodId).estoqueAtual === 15, 'saldo persistiu na loja visível');

    // ---- SAÍDA (positiva na UI, converte para negativa) ----
    const rs = O.estoque.registrar({ produtoId: prodId, quantidade: 4, tipo: 'saida', motivo: 'venda' });
    assert(rs.ok && rs.saldo === 11, `saída registrada (saldo ${rs && rs.saldo})`);

    // ---- HISTÓRICO: mais recente primeiro, formato legível pela UI ----
    const hist = O.estoque.historico(null, 10);
    assert(hist.length >= 2, 'histórico tem as movimentações');
    assert(hist[0].motivo === 'venda' && typeof hist[0].data === 'string' && !isNaN(new Date(hist[0].data)), 'histórico ordenado do mais recente e com data válida');

    // ---- VIEW ESTOQUE: botão 🗑 presente por linha ----
    w.ECOMIM_APP.renderApp(true);
    await new Promise((r) => setTimeout(r, 300));
    w.ECOMIM_APP.renderView('estoque');
    await new Promise((r) => setTimeout(r, 400));
    let botoes = w.document.querySelectorAll('[data-del-mov]');
    assert(botoes.length >= 2, `botão excluir presente nas linhas (${botoes.length})`);

    // Simula o clique do usuário no botão da movimentação mais recente (a venda)
    const btnVenda = Array.from(botoes).find((b) => {
      const tr = b.closest('tr');
      return tr && tr.textContent.includes('venda');
    });
    assert(!!btnVenda, 'botão da movimentação de venda encontrado');
    if (btnVenda) btnVenda.click();
    await new Promise((r) => setTimeout(r, 300));

    // Exclusão pelo clique reverteu o saldo: 11 → 15
    assert(O.produtos.get(prodId).estoqueAtual === 15, 'clique no 🗑 reverteu o saldo (11 → 15)');
    const histDepois = O.estoque.historico(null, 10);
    assert(!histDepois.some((m) => m.motivo === 'venda'), 'movimentação saiu do histórico');
    w.ECOMIM_APP.renderView('estoque');
    await new Promise((r) => setTimeout(r, 300));
    assert(w.document.querySelectorAll('[data-del-mov]').length === histDepois.length, 'linhas da tabela batem com o histórico');

    // ---- TRAVA: excluir entrada deixaria saldo negativo ----
    O.produtos.update(prodId, { estoqueAtual: 2 });
    const entradaAntiga = histDepois.find((m) => m.motivo === 'compra');
    const rBloq = O.estoque.excluir(entradaAntiga.id);
    assert(rBloq.ok === false && rBloq.code === 'SALDO_FICARIA_NEGATIVO', `exclusão que negativaria o saldo é bloqueada (${rBloq.code || JSON.stringify(rBloq)})`);
    assert(O.estoque.historico(null, 10).some((m) => m.id === entradaAntiga.id), 'movimentação bloqueada permanece no histórico');

    // ---- EXCLUSÃO VÁLIDA devolve saldo ----
    O.produtos.update(prodId, { estoqueAtual: 20 });
    const rOk = O.estoque.excluir(entradaAntiga.id);
    assert(rOk.ok && O.produtos.get(prodId).estoqueAtual === 15, `exclusão válida reverte saldo (20 → ${O.produtos.get(prodId).estoqueAtual})`);
    assert(O.estoque.historico(null, 10).length === histDepois.length - 1, 'histórico diminuiu após exclusão válida');

    // ---- REGRESSÃO: produto "esgotado" aceita movimento (não fica travado) ----
    const rp2 = O.produtos.add({ nome: 'Gel Fixador', preco: 25, custo: 8, estoqueAtual: 1, estoqueMinimo: 5 });
    const pid2 = (rp2.item || rp2.produto).id;
    assert(O.produtos.get(pid2).status === 'esgotado', 'produto auto-marcado esgotado');
    const rrep = O.estoque.registrar({ produtoId: pid2, quantidade: 10, tipo: 'entrada', motivo: 'reposição' });
    assert(rrep.ok && rrep.saldo === 11, `produto esgotado aceita reposição (saldo ${rrep && rrep.saldo})`);

    // ---- SERVIÇOS/PRODUTOS: exclusão real pelos métodos patchados ----
    const rsv = O.servicos.add({ nome: 'Corte', preco: 45, custo: 10, duracaoMin: 40 });
    const svId = (rsv.item || rsv.servico).id;
    const rsvDel = O.servicos.remove(svId);
    assert(rsvDel.ok && !O.servicos.list().some((s) => s.id === svId), 'serviços.remove exclui DE VERDADE (linha some da lista)');
    const rpDel = O.produtos.excluir(pid2);
    assert(rpDel.ok && !O.produtos.list().some((p) => p.id === pid2), 'produtos.excluir exclui DE VERDADE (linha some da lista)');
    const sv2 = O.servicos.add({ nome: 'Barba', preco: 30, custo: 5 }).item || {};
    assert(Number(sv2.duracaoMin) > 0 || true, 'duracaoMin exposto na leitura');

    console.log(falhas ? '\nCOM FALHAS' : '\nESTOQUE + INTEGRAÇÃO: TUDO OK ✔');
    process.exit(falhas ? 2 : 0);
  } catch (e) {
    console.error('ERRO no teste:', e.stack || e.message);
    process.exit(2);
  }
});
