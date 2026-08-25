/* Teste: exclusões (projetos/tarefas/campanhas/RH/tickets/serviços/produtos/atendimentos)
 * + view Tarefas (fonte unificada) — roda no mesmo JSDOM do test-core. */
'use strict';
const path = require('path');
const { JSDOM } = require('C:/Users/neitz/AppData/Roaming/npm/node_modules/jsdom');
const cryptoNode = require('crypto');

const basePath = 'C:/Users/neitz/OneDrive/ECOMIM';
const html = `<!doctype html><html lang="pt-BR" data-theme="dark"><head><meta charset="utf-8"/></head>
<body><div id="app-root"></div><div class="toast-container" id="toast-container"></div>
<script src="src/core.js"></script><script src="src/core-extra.js"></script>
<script src="src/operacional-core.js"></script><script src="src/operacional-ui.js"></script>
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
    /* jsdom em file:// não persiste localStorage — polyfill em memória
       para os módulos que gravam de verdade (operacional/core). */
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
    await new Promise((r) => setTimeout(r, 1500));
    const w = dom.window;
    const E = w.ECOMIM;
    const O = w.NEITZEL_OPS;
    assert(!!E && !!O && !!w.ECOMIM_APP, 'módulos carregados');

    // ---- PROJETOS ----
    const pj = E.modules.projetos;
    const rp = pj.addProjeto({ nome: 'Projeto Alfa', cliente: 'ACME', tipo: 'implantacao', responsavel: 'Bob' });
    assert(rp.ok, 'projeto criado');
    const pid = rp.projeto.id;
    pj.addTarefa(pid, { nome: 'Tarefa 1' });
    assert(pj.projetos[0].tarefas.length === 1, 'tarefa adicionada ao projeto');
    const rEt = pj.excluirTarefa(pid, pj.projetos[0].tarefas[0].id);
    assert(rEt.ok && pj.projetos[0].tarefas.length === 0, 'excluirTarefa remove a tarefa');
    const rEp = pj.excluirProjeto(pid);
    assert(rEp.ok && !pj.projetos.some((x) => x.id === pid), 'excluirProjeto remove o projeto');

    // ---- MARKETING ----
    const mk = E.modules.marketing;
    const rc = mk.addCampanha({ nome: 'Campanha X', canal: 'instagram', orcamento: 100 });
    assert(rc.ok, 'campanha criada');
    const cid = rc.campanha.id;
    assert(mk.excluirCampanha(cid).ok && !mk.campanhas.some((c) => c.id === cid), 'excluirCampanha ok');

    // ---- RH ----
    const rr = rh_add(E);
    assert(rr.ok, 'colaborador criado');
    assert(E.modules.rh.excluirColaborador(rr.colaborador.id).ok, 'excluirColaborador ok');

    // ---- TICKETS ----
    const at = E.modules.atendimento;
    const rt = at.addTicket({ assunto: 'Problema login', cliente: 'Zeca' });
    assert(rt.ok || rt.ticket, 'ticket criado');
    const tid = (rt.ticket || rt).id;
    assert(at.excluirTicket(tid).ok, 'excluirTicket ok');

    // ---- OPS: serviços/produtos/atendimentos ----
    const rs = O.servicos.add({ nome: 'Serv A', preco: 1000, custo: 200 });
    if (process.env.HDBG) console.log('[HDBG] servicos.add →', JSON.stringify(rs).slice(0, 140));
    assert(rs.ok, 'serviço criado');
    const rrem = O.servicos.remove((rs.servico || rs).id);
    if (process.env.HDBG) console.log('[HDBG] servicos.remove →', JSON.stringify(rrem).slice(0, 140));
    assert(rrem && rrem.ok !== false, 'serviços.remove ok');
    const rp2 = O.produtos.add({ nome: 'Prod A', preco: 500, custo: 100 });
    if (process.env.HDBG) console.log('[HDBG] produtos.add →', JSON.stringify(rp2).slice(0, 160));
    const prodId = (rp2.produto || rp2).id;
    const rpex = O.produtos.excluir(prodId);
    if (process.env.HDBG) console.log('[HDBG] produtos.excluir →', JSON.stringify(rpex).slice(0, 120));
    assert(rpex.ok, 'produtos.excluir ok');
    const ra = O.atendimentos.add({ cliente: 'Cli Atend', inicio: new Date().toISOString(), fim: new Date(Date.now() + 3600000).toISOString(), servicoPreco: 50 });
    if (process.env.HDBG) console.log('[HDBG] atend.add →', JSON.stringify(ra).slice(0, 140));
    const aid = ra.atendimento.id;
    const raex = O.atendimentos.excluir(aid);
    if (process.env.HDBG) console.log('[HDBG] atend.excluir →', JSON.stringify(raex).slice(0, 120));
    assert(raex.ok, 'atendimento.excluir ok');
    // concluído exige forcar
    const rb = O.atendimentos.add({ cliente: 'Cli Conc', inicio: new Date().toISOString(), fim: new Date(Date.now() + 3600000).toISOString(), status: 'concluido' });
    const bid = rb.atendimento.id;
    const bloqueio = O.atendimentos.excluir(bid);
    assert(bloqueio.ok === false && bloqueio.code === 'CONCLUIDO', 'excluir concluído sem forcar é bloqueado');
    assert(O.atendimentos.excluir(bid, { forcar: true }).ok, 'forcar:true permite excluir concluído');

    // ---- TAREFAS (view fonte unificada) ----
    const tf1 = E.modules.tarefas.add({ titulo: 'Tarefa Geral 1', due: new Date().toISOString() });
    assert(tf1.ok, 'tarefa geral criada');
    assert(typeof w.__nzContagemTarefas === 'function', 'contagem exposta p/ IA');
    // renderiza a view e confere DOM
    w.ECOMIM_APP.renderApp(true);
    await new Promise((r) => setTimeout(r, 300));
    w.ECOMIM_APP.renderView('tarefas');
    await new Promise((r) => setTimeout(r, 400));
    const txt = (w.document.querySelector('.ecomim-content') || {}).textContent || '';
    assert(txt.includes('Tarefa'), 'view Tarefas lista as tarefas');
    assert(!!w.document.querySelector('[data-toggle]'), 'checkbox concluir presente');
    assert(!!w.document.querySelector('[data-del]'), 'lixeira com confirmação presente');

    console.log(falhas ? '\nCOM FALHAS' : '\nEXCLUSÕES + TAREFAS: TUDO OK ✔');
    process.exit(falhas ? 2 : 0);
  } catch (e) {
    console.error('ERRO no teste:', e.message);
    process.exit(2);
  }
});

// helper RH local (add direto pelo módulo)
function rh_add(E) {
  return E.modules.rh.addColaborador({ nome: 'Colab Y', cargo: 'Tech', departamento: 'Ops', salario: 2000 });
}
