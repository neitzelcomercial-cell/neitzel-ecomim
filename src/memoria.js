/* ============================================================================
 * NEITZEL — MEMÓRIA INTELIGENTE
 * Ciclo mensal automático:
 *   1) SNAPSHOT — todo último dia do mês às 23:59 (com recuperação de falhas
 *      no boot), guarda a matéria-prima do mês em neitzel_memoria_bruta_v1.
 *   2) CONSOLIDAÇÃO — 30 dias depois, no mesmo horário, transforma o snapshot
 *      em um RELATÓRIO organizado/legível e o arquiva em neitzel_memoria_pdf_v1
 *      (lugar separado), com Ver / Baixar PDF / Excluir.
 *   3) LIMPEZA SEGURA — após arquivar, remove apenas RUÍDO dos registros do
 *      mês (observações longas, detalhe de itens, telefones/endereço, logs
 *      antigos). NUNCA mexe em Financeiro, Clientes, nem nos campos que
 *      alimentam índices (status/preço/data permanecem ⇒ números contínuos).
 * ========================================================================== */

'use strict';

(function () {
  const KEY_BRUTA = 'neitzel_memoria_bruta_v1';
  const KEY_ARQ = 'neitzel_memoria_pdf_v1';
  const DIAS_PARA_CONSOLIDAR = 30;

  const lsGet = (k, f) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : f; } catch (e) { return f; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const uid = () => 'm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const mesDe = (iso) => String(iso || '').slice(0, 7);
  const hojeISO = () => new Date().toISOString();
  const fmtMoney = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  const O = () => window.NEITZEL_OPS || null;
  const E = () => window.ECOMIM || null;

  /* ============================ 1. SNAPSHOT ============================ */
  function coletarMes(mesAlvo) {
    const atds = (O() ? O().atendimentos.list() : lsGet('neitzel_atendimentos_v1', []))
      .filter((a) => mesDe(a.inicio) === mesAlvo);
    let contas = [];
    try { contas = (E() && E().modules.financeiro.contas) || []; } catch (e) { contas = []; }
    const contasMes = contas.filter((c) => mesDe(c.criadaEm || c.vencimento) === mesAlvo);
    let leads = [], fila = [];
    try { const db = E().db.get(); leads = db.leads || []; fila = db.fila || []; } catch (e) {}
    let clientes = [];
    try { clientes = (E() && E().modules.clientes.clientes) || []; } catch (e) {}
    let tarefas = [];
    try { tarefas = (E() && E().modules.tarefas && (E().modules.tarefas.tarefas || [])) || []; } catch (e) {}

    const receitaMes = atds.filter((a) => a.status === 'concluido')
      .reduce((s, a) => s + (a.servicoPreco || 0) + (a.itensProdutos || []).reduce((x, i) => x + (i.precoUnitario || 0) * (i.quantidade || 1), 0), 0);
    const porStatus = {};
    atds.forEach((a) => { porStatus[a.status] = (porStatus[a.status] || 0) + 1; });

    return {
      mes: mesAlvo,
      geradoEm: hojeISO(),
      atendimentos: {
        total: atds.length,
        porStatus,
        receitaConcluidaCentavos: receitaMes,
        lista: atds.map((a) => ({
          id: a.id, cliente: a.cliente, clienteId: a.clienteId || null,
          inicio: a.inicio, fim: a.fim, status: a.status,
          servicoNome: a.servicoNome || '', servicoPreco: a.servicoPreco || 0,
          responsavel: a.responsavel || '',
        })),
      },
      financeiro: {
        totalContas: contasMes.length,
        aReceber: contasMes.filter((c) => c.tipo === 'receber' && c.status === 'pendente').length,
        recebido: contasMes.filter((c) => c.tipo === 'receber' && c.status === 'paga').length,
        aPagar: contasMes.filter((c) => c.tipo === 'pagar' && c.status === 'pendente').length,
      },
      crm: {
        leadsTotal: leads.length,
        novosLeads: leads.filter((l) => mesDe(l.created) === mesAlvo).length,
        filaAguardando: fila.length,
        clientesTotal: clientes.length,
        novosClientes: clientes.filter((c) => mesDe(c.created) === mesAlvo).length,
        tarefasPendentes: tarefas.filter((t) => t.status !== 'concluida' && t.status !== 'done').length,
      },
      catalogo: {
        servicosAtivos: (O() ? O().servicos.ativos() : []).map((s) => ({ nome: s.nome, preco: s.preco })),
        produtosEstoqueBaixo: (O() ? O().produtos.estoqueBaixo() : []).map((p) => ({ nome: p.nome, saldo: p.estoqueAtual, min: p.estoqueMinimo })),
      },
    };
  }

  function capturarSnapshot(forcar) {
    const agora = new Date();
    const mesCorrente = agora.toISOString().slice(0, 7);
    const brutas = lsGet(KEY_BRUTA, []);
    if (!forcar && brutas.some((b) => b.mes === mesCorrente)) return null;
    // No fim do mês capturamos o mês CORRENTE (dia 28-31); retroativo no boot
    // captura o mês anterior caso a máquina estivesse desligada às 23:59.
    const alvo = (agora.getDate() >= 28) ? mesCorrente
      : new Date(agora.getFullYear(), agora.getMonth() - 1, 1).toISOString().slice(0, 7);
    if (!forcar && brutas.some((b) => b.mes === alvo)) return null;
    const snap = Object.assign({ id: uid() }, coletarMes(alvo));
    brutas.unshift(snap);
    if (brutas.length > 36) brutas.length = 36;
    lsSet(KEY_BRUTA, brutas);
    return snap;
  }

  /* ========================== 2. CONSOLIDAÇÃO ========================== */
  function consolidarPendentes() {
    const limite = Date.now() - DIAS_PARA_CONSOLIDAR * 86400000;
    const brutas = lsGet(KEY_BRUTA, []);
    const arq = lsGet(KEY_ARQ, []);
    let consolidados = 0;
    brutas.forEach((snap) => {
      if (new Date(snap.geradoEm).getTime() > limite) return;
      if (arq.some((a) => a.mes === snap.mes)) return;
      arq.unshift({ id: uid(), mes: snap.mes, titulo: 'Relatório Mensal — ' + rotuloMes(snap.mes), geradoEm: hojeISO(), relatorio: montarRelatorio(snap), stats: resumoStats(snap) });
      consolidados++;
    });
    if (consolidados) {
      lsSet(KEY_ARQ, arq.slice(0, 60));
      limparRuido(brutas.filter((b) => arq.some((a) => a.mes === b.mes)));
    }
    return consolidados;
  }

  function rotuloMes(m) {
    const [y, mm] = m.split('-');
    const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    return nomes[Number(mm) - 1] + ' de ' + y;
  }
  function resumoStats(s) {
    return {
      atendimentos: s.atendimentos.total,
      receita: s.atendimentos.receitaConcluidaCentavos,
      novosClientes: s.crm.novosClientes,
      novosLeads: s.crm.novosLeads,
    };
  }

  function montarRelatorio(s) {
    const st = ['agendado','confirmado','em_andamento','concluido','cancelado','nao_compareceu'];
    const nomes = { agendado:'Agendados', confirmado:'Confirmados', em_andamento:'Em andamento', concluido:'Concluídos', cancelado:'Cancelados', nao_compareceu:'Não compareceram' };
    let linhas = '';
    st.forEach((k) => { if (s.atendimentos.porStatus[k]) linhas += `<tr><td>${nomes[k]}</td><td><b>${s.atendimentos.porStatus[k]}</b></td></tr>`; });

    const topServ = {};
    (function coletar() {
      const bruta = lsGet(KEY_BRUTA, []).find((b) => b.mes === s.mes);
      (bruta ? bruta.atendimentos.lista : []).forEach((a) => { if (a.servicoNome) topServ[a.servicoNome] = (topServ[a.servicoNome] || 0) + 1; });
    })();
    const rank = Object.entries(topServ).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return `
      <section class="mr-sec"><h3>Visão geral</h3>
        <div class="mr-kpis">
          <div class="mr-kpi"><span>${s.atendimentos.total}</span>Atendimentos</div>
          <div class="mr-kpi"><span>${fmtMoney(s.atendimentos.receitaConcluidaCentavos)}</span>Receita concluída</div>
          <div class="mr-kpi"><span>${s.crm.novosClientes}</span>Novos clientes</div>
          <div class="mr-kpi"><span>${s.crm.novosLeads}</span>Novos leads</div>
          <div class="mr-kpi"><span>${s.financeiro.aReceber}</span>Contas a receber abertas</div>
        </div>
      </section>
      <section class="mr-sec"><h3>Atendimentos por status</h3>
        ${linhas ? `<table class="mr-tab"><tbody>${linhas}</tbody></table>` : '<p class="mr-vazio">Nenhum atendimento registrado neste mês.</p>'}
      </section>
      ${rank.length ? `<section class="mr-sec"><h3>Serviços mais realizados</h3>
        <table class="mr-tab"><thead><tr><th>Serviço</th><th>Vezes</th></tr></thead><tbody>
        ${rank.map(([n, q]) => `<tr><td>${esc(n)}</td><td><b>${q}</b></td></tr>`).join('')}
        </tbody></table></section>` : ''}
      <section class="mr-sec"><h3>Financeiro (continuidade)</h3>
        <p class="mr-p">Contas criadas no período: <b>${s.financeiro.totalContas}</b> · a receber: <b>${s.financeiro.aReceber}</b> · recebidas: <b>${s.financeiro.recebido}</b> · a pagar: <b>${s.financeiro.aPagar}</b>.<br>
        <small>O arquivo NÃO altera financeiro, clientes ou índices — os valores continuam valendo no sistema.</small></p>
      </section>
      <section class="mr-sec"><h3>Catálogo no fechamento</h3>
        <p class="mr-p">Serviços ativos: ${s.catalogo.servicosAtivos.length}${s.catalogo.produtosEstoqueBaixo.length ? ` · Produtos abaixo do mínimo: <b>${s.catalogo.produtosEstoqueBaixo.map((p) => esc(p.nome)).join(', ')}</b>` : ''}</p>
      </section>`;
  }

  /* ====================== 3. LIMPEZA SEGURA DE RUÍDO ==================== */
  /** Remove apenas campos verbosos dos atendimentos JÁ ARQUIVADOS. Preserva
   *  id/datas/status/preço/serviço/cliente ⇒ todos os índices continuam válidos.
   *  Também poda logs de auditoria e movimentações antigas. NUNCA toca em
   *  contas financeiras nem cadastros de clientes. */
  function limparRuido(arquivadas) {
    const meses = new Set(arquivadas.map((a) => a.mes));
    try {
      const lista = lsGet('neitzel_atendimentos_v1', []);
      let tocado = false;
      lista.forEach((a, i) => {
        if (!meses.has(mesDe(a.inicio))) return;
        const enxuto = {
          id: a.id, cliente: a.cliente, clienteId: a.clienteId || null,
          inicio: a.inicio, fim: a.fim, status: a.status,
          servicoNome: a.servicoNome || '', servicoId: a.servicoId || null,
          servicoPreco: a.servicoPreco || 0, servicoCusto: a.servicoCusto || 0,
          responsavel: a.responsavel || '', origem: a.origem || null,
          criadoEm: a.criadoEm || null, arquivado: true,
          itensResumo: { qtdItens: (a.itensProdutos || []).length, totalCentavos: (a.itensProdutos || []).reduce((x, it) => x + (it.precoUnitario || 0) * (it.quantidade || 1), 0) },
        };
        lista[i] = enxuto; tocado = true;
      });
      if (tocado) lsSet('neitzel_atendimentos_v1', lista);
    } catch (e) {}
    try {
      const movs = lsGet('neitzel_estoque_mov_v1', []);
      if (movs.length > 500) lsSet('neitzel_estoque_mov_v1', movs.slice(-500));
    } catch (e) {}
  }

  /* ============================== AGENDADOR ============================= */
  function tickAgenda() {
    const agora = new Date();
    const ehJanela = agora.getHours() === 23 && agora.getMinutes() >= 59;
    const ultimoTick = parseInt(localStorage.getItem('neitzel_memoria_tick') || '0', 10);
    const passouUmDia = Date.now() - ultimoTick > 20 * 3600000;
    if ((ehJanela && passouUmDia) || (!ultimoTick)) {
      localStorage.setItem('neitzel_memoria_tick', String(Date.now()));
      const snap = capturarSnapshot(false);
      const n = consolidarPendentes();
      if (snap || n) {
        try {
          const Em = E();
          if (Em && Em.modules && Em.modules.notificacoes) Em.modules.notificacoes.add({ tipo: 'info', titulo: 'Memória Inteligente', corpo: (snap ? 'Snapshot mensal salvo. ' : '') + (n ? n + ' relatório(s) arquivado(s).' : '').trim(), aviso: 'Memória' });
        } catch (e) {}
        if (window.ECOMIM_APP && document.querySelector('[data-view="memoria"].active')) window.ECOMIM_APP.renderView('memoria');
      }
    } else if (!lsGet(KEY_BRUTA, []).some((b) => b.mes === new Date(Date.now() - 86400000).toISOString().slice(0, 7))) {
      // Recuperação silenciosa: se o mês anterior nunca foi capturado, captura
      capturarSnapshot(false);
    }
  }

  /* ================================ UI ================================= */
  function render(c) {
    c.innerHTML = '';
    c.appendChild(Object.assign(document.createElement('div'), { className: 'page-header', innerHTML: '<h1>Memória Inteligente</h1><p>Fechamento mensal automático: snapshot às 23:59 do fim do mês, relatório organizado aos 30 dias, arquivado aqui em PDF.</p>' }));

    const brutas = lsGet(KEY_BRUTA, []);
    const arq = lsGet(KEY_ARQ, []);

    const statusCard = document.createElement('div'); statusCard.className = 'card';
    statusCard.innerHTML = `
      <h4>Status do ciclo</h4>
      <div class="text-muted" style="margin-bottom:10px">
        Snapshots brutos aguardando consolidação: <b>${brutas.length}</b> · Relatórios arquivados: <b>${arq.length}</b><br>
        <small>Próxima verificação automática na janela de 23:59. Consolidação acontece 30 dias após cada snapshot.</small>
      </div>
      <div class="btn-group">
        <button class="btn btn-sm btn-primary" id="mm-cap"> Capturar snapshot agora</button>
        <button class="btn btn-sm" id="mm-cons"> Consolidar pendentes (30d)</button>
      </div>`;
    c.appendChild(statusCard);

    const lista = document.createElement('div'); lista.className = 'card';
    lista.innerHTML = '<h4>Relatórios mensais arquivados</h4>';
    if (!arq.length) {
      lista.innerHTML += '<div class="empty">Nenhum relatório ainda. O primeiro nasce 30 dias após o primeiro snapshot — ou teste com os botões acima.</div>';
    } else {
      arq.forEach((r) => {
        const row = document.createElement('div');
        row.className = 'mm-file';
        row.innerHTML = `
          <div class="mm-info"><b>${esc(r.titulo)}</b>
            <div class="text-muted" style="font-size:11.5px">Arquivado em ${new Date(r.geradoEm).toLocaleString('pt-BR')} · ${r.stats.atendimentos} atendimentos · ${fmtMoney(r.stats.receita)}</div></div>
          <div class="btn-group">
            <button class="btn btn-sm" data-ver="${r.id}">Ver</button>
            <button class="btn btn-sm btn-primary" data-pdf="${r.id}">Baixar PDF</button>
            <button class="btn btn-sm btn-danger" data-del="${r.id}">Excluir</button>
          </div>`;
        lista.appendChild(row);
      });
      lista.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => verRelatorio(b.dataset.ver, false)));
      lista.querySelectorAll('[data-pdf]').forEach((b) => b.addEventListener('click', () => verRelatorio(b.dataset.pdf, true)));
      lista.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
        if (!confirm('Excluir este relatório arquivado? Isso não afeta os dados vivos do sistema.')) return;
        lsSet(KEY_ARQ, lsGet(KEY_ARQ, []).filter((x) => x.id !== b.dataset.del));
        render(c);
      }));
    }
    c.appendChild(lista);

    statusCard.querySelector('#mm-cap').addEventListener('click', () => {
      const s = capturarSnapshot(true);
      toast(s ? ('Snapshot de ' + rotuloMes(s.mes) + ' capturado.') : 'Snapshot deste mês já existia.', s ? 'success' : 'info');
      render(c);
    });
    statusCard.querySelector('#mm-cons').addEventListener('click', () => {
      const n = consolidarPendentes();
      toast(n ? n + ' relatório(s) gerado(s) e ruído limpo.' : 'Nada pendente de consolidação (aguarde 30 dias).', n ? 'success' : 'info');
      render(c);
    });
  }

  function verRelatorio(id, imprimir) {
    const r = lsGet(KEY_ARQ, []).find((x) => x.id === id);
    if (!r) return;
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(r.titulo)} — NEITZEL</title>
      <style>
        body{font-family:'Segoe UI',system-ui,sans-serif;color:#15181c;margin:0;padding:34px;background:#f5f6f8}
        .folha{max-width:820px;margin:0 auto;background:#fff;border-radius:14px;padding:40px 46px;box-shadow:0 10px 40px rgba(0,0,0,.08)}
        header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #166a43;padding-bottom:16px;margin-bottom:26px}
        .logo{width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,#0b0d0c,#166a43);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:19px;font-family:Georgia,serif}
        h1{font-size:21px;margin:0} header small{color:#68707c;display:block;margin-top:3px}
        h3{font-size:13px;text-transform:uppercase;letter-spacing:.09em;color:#166a43;margin:26px 0 10px}
        .mr-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
        .mr-kpi{border:1px solid #e4e6ea;border-radius:10px;padding:12px 14px;font-size:11px;color:#68707c;text-transform:uppercase;letter-spacing:.05em}
        .mr-kpi span{display:block;font-size:19px;font-weight:700;color:#101216;margin-bottom:2px}
        table{width:100%;border-collapse:collapse;font-size:13.5px}
        td,th{padding:8px 10px;border-bottom:1px solid #eceef1;text-align:left}
        th{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#80858e}
        p,li{line-height:1.6;font-size:13.5px} .mr-p small{color:#80858e}
        footer{margin-top:30px;padding-top:14px;border-top:1px solid #eceef1;color:#98a0aa;font-size:11px;display:flex;justify-content:space-between}
        @media print{body{background:#fff}.folha{box-shadow:none;max-width:none}header{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
      </style></head><body><div class="folha">
      <header><div class="logo">N</div><div><h1>${esc(r.titulo)}</h1><small>NEITZEL — Sistema Digital · Memória Inteligente · arquivado em ${new Date(r.geradoEm).toLocaleDateString('pt-BR')}</small></div></header>
      ${r.relatorio}
      <footer><span>Documento gerado localmente — confidencial.</span><span>Fonte única: sistema NEITZEL</span></footer>
      </div>${imprimir ? '<script>window.onload=()=>setTimeout(()=>window.print(),350)<\/script>' : ''}</body></html>`;
    const w = window.open('', '_blank');
    if (!w) {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'NEITZEL-Memoria-' + r.mes + '.html';
      a.click();
      toast('Pop-up bloqueado — baixei o arquivo do relatório.', 'warn');
      return;
    }
    w.document.open(); w.document.write(html); w.document.close();
    if (!imprimir) toast('Relatório aberto — use "Baixar PDF" para gerar o arquivo.', 'info');
  }

  /* =============================== BOOT ================================ */
  setTimeout(tickAgenda, 2500);
  setInterval(tickAgenda, 60 * 1000);

  window.NEITZEL_MEMORIA = { capturarSnapshot, consolidarPendentes, render };
})();
