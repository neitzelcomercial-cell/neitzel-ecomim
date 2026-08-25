/* ============================================================================
 * NEITZEL — MEMÓRIA INTELIGENTE (ligada ao relógio e ao calendário)
 * Ciclo automático, sem intervenção humana:
 *   1) CAPTURA — todos os dias o sistema anota as ATIVIDADES do dia
 *      (auditoria ao vivo) no buffer do mês corrente. Durante o mês tudo
 *      fica capturando sozinho.
 *   2) ARQUIVO (30 dias após o fim do mês) — o mês completo é movido para
 *      um LUGAR SEPARADO (neitzel_memoria_arquivo_v1), fora da área viva.
 *   3) PDF (60 dias após o fim do mês) — o relatório organizado é gerado
 *      automaticamente, pronto para Ver / Baixar PDF / Excluir.
 * O tick roda a cada minuto e se recupera no boot (máquina desligada não
 * perde etapa: o calendário decide, não a sessão).
 * ========================================================================== */

'use strict';

(function () {
  const KEY_MES = 'neitzel_memoria_mes_atual_v1';
  const KEY_ARQ = 'neitzel_memoria_arquivo_v1';
  const KEY_LEGADO_ARQ = 'neitzel_memoria_pdf_v1';
  const DIAS_PARA_ARQUIVAR = 30;
  const DIAS_PARA_PDF = 60;

  const lsGet = (k, f) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : f; } catch (e) { return f; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const uid = () => 'm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const hojeISO = () => new Date().toISOString();
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const E = () => window.ECOMIM || null;

  const CATEGORIAS = ['Lead', 'Cliente', 'Agenda', 'Tarefa', 'Financeiro', 'Serviços', 'Produtos', 'Estoque', 'Projetos', 'Atendimento', 'Marketing', 'RH', 'Sistema', 'Config'];
  function categoriaDe(action) {
    const A = String(action || '');
    if (/^lead\./.test(A)) return 'Lead';
    if (/^cliente\./.test(A)) return 'Cliente';
    if (/^agenda\./.test(A)) return 'Agenda';
    if (/tarefa/.test(A)) return 'Tarefa';
    if (/^financeiro|payment\./.test(A)) return 'Financeiro';
    if (/^servico/.test(A)) return 'Serviços';
    if (/^produto/.test(A)) return 'Produtos';
    if (/estoque/.test(A)) return 'Estoque';
    if (/^projeto/.test(A)) return 'Projetos';
    if (/ticket|^atendimento/.test(A)) return 'Atendimento';
    if (/marketing|campanha/.test(A)) return 'Marketing';
    if (/rh\.|colaborador/.test(A)) return 'RH';
    if (/^config/.test(A)) return 'Config';
    return 'Sistema';
  }

  /* ============================ 1. CAPTURA ============================== */
  /** Garante que o dia de hoje está anotado no buffer do mês corrente. */
  function capturarHoje(forcar) {
    const Em = E();
    const agora = new Date();
    const mesCorrente = agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0');
    const dataHoje = agora.toISOString().slice(0, 10);
    let buf = lsGet(KEY_MES, null);
    if (!buf || buf.mes !== mesCorrente) {
      // Mês virou: o antigo é arquivado pelo ciclo; este é o novo buffer vivo.
      buf = { id: uid(), mes: mesCorrente, criadoEm: hojeISO(), dias: [] };
    }
    const cfg = (Em && Em.db && Em.db.get().config && Em.db.get().config.sistema) || {};
    if (cfg.capturaAutoAtividades === false && !forcar) { lsSet(KEY_MES, buf); return buf; }
    if (!forcar && (buf.dias || []).some((x) => x.data === dataHoje)) { lsSet(KEY_MES, buf); return buf; }

    // Conta os eventos de hoje na auditoria (fonte única das atividades)
    const eventos = ((Em && Em.audit && Em.audit.list()) || []).filter((ev) => String(ev.ts).slice(0, 10) === dataHoje);
    const porCategoria = {};
    eventos.forEach((ev) => { const c = categoriaDe(ev.action); porCategoria[c] = (porCategoria[c] || 0) + 1; });
    const destaque = eventos.slice(-3).reverse().map((ev) => {
      const after = ev.after || {};
      return { action: ev.action, nome: String(after.nome || after.descricao || '').slice(0, 60), ts: ev.ts };
    });
    buf.dias = (buf.dias || []).filter((x) => x.data !== dataHoje);
    buf.dias.push({ data: dataHoje, totalEventos: eventos.length, porCategoria, destaques: destaque, capturadoEm: hojeISO() });
    buf.dias.sort((a, b) => (a.data < b.data ? -1 : 1));
    lsSet(KEY_MES, buf);
    return buf;
  }

  /* ======================= 2. ARQUIVO (30 dias) ========================= */
  /** Fim do mês em ms (última hora do último dia). */
  function fimDoMesMs(mes) {
    const [y, m] = String(mes).split('-').map(Number);
    return new Date(y, m, 0, 23, 59, 59).getTime();
  }
  function arquivo() { return lsGet(KEY_ARQ, []); }
  function legadoArquivo() { return lsGet(KEY_LEGADO_ARQ, []); }

  function arquivarVencidos() {
    let n = 0;
    const buf = lsGet(KEY_MES, null);
    const arq = arquivo();
    if (buf && buf.dias && buf.dias.length) {
      const fimMes = fimDoMesMs(buf.mes);
      if (Date.now() >= fimMes + DIAS_PARA_ARQUIVAR * 86400000) {
        if (!arq.some((a) => a.mes === buf.mes)) {
          arq.unshift({
            id: uid(), mes: buf.mes,
            titulo: 'Memória — ' + rotuloMes(buf.mes),
            arquivadoEm: hojeISO(),
            totalEventos: buf.dias.reduce((s, d2) => s + (d2.totalEventos || 0), 0),
            dias: buf.dias,
            relatorio: null, pdfGeradoEm: null,
          });
          lsSet(KEY_ARQ, arq.slice(0, 60));
          n++;
        }
        lsSet(KEY_MES, { id: uid(), mes: proximoMesDe(buf.mes), criadoEm: hojeISO(), dias: [] });
        capturarHoje(true);
      }
    }
    // Migra relatórios do formato antigo para a nova área (uma vez)
    const legado = legadoArquivo();
    if (legado.length) {
      const atual = arquivo();
      legado.forEach((r) => { if (!atual.some((a) => a.mes === r.mes)) atual.push(Object.assign({ arquivadoEm: r.geradoEm, pdfGeradoEm: r.geradoEm }, r)); });
      lsSet(KEY_ARQ, atual.slice(0, 60));
      try { localStorage.removeItem(KEY_LEGADO_ARQ); } catch (e) {}
    }
    return n;
  }

  function proximoMesDe(mes) {
    const [y, m] = String(mes).split('-').map(Number);
    const dt = new Date(y, m - 1 + 1, 1);
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
  }

  /* ========================== 3. PDF (60 dias) =========================== */
  function gerarPDFsVencidos() {
    let n = 0;
    const arq = arquivo();
    arq.forEach((r) => {
      if (r.relatorio) return;
      if (Date.now() < fimDoMesMs(r.mes) + DIAS_PARA_PDF * 86400000) return;
      r.relatorio = montarRelatorio(r);
      r.pdfGeradoEm = hojeISO();
      n++;
    });
    if (n) lsSet(KEY_ARQ, arq);
    return n;
  }

  function rotuloMes(m) {
    const [y, mm] = String(m).split('-');
    const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    return (nomes[Number(mm) - 1] || mm) + ' de ' + y;
  }

  function montarRelatorio(r) {
    const dias = r.dias || [];
    const totalEventos = dias.reduce((s, d2) => s + (d2.totalEventos || 0), 0);
    const catTot = {};
    dias.forEach((d2) => Object.entries(d2.porCategoria || {}).forEach(([k, v]) => { catTot[k] = (catTot[k] || 0) + v; }));
    const rankCat = Object.entries(catTot).sort((a, b) => b[1] - a[1]);
    const diaMaisMov = dias.slice().sort((a, b) => (b.totalEventos || 0) - (a.totalEventos || 0))[0];
    const mediaDia = dias.length ? (totalEventos / dias.length).toFixed(1) : '0';
    const semanas = [];
    for (let i = 0; i < dias.length; i += 7) {
      const fatia = dias.slice(i, i + 7);
      semanas.push(fatia.reduce((s, d2) => s + (d2.totalEventos || 0), 0));
    }

    return `
      <section class="mr-sec"><h3>Visão geral do mês</h3>
        <div class="mr-kpis">
          <div class="mr-kpi"><span>${totalEventos}</span>atividades registradas</div>
          <div class="mr-kpi"><span>${dias.length}</span>dias com registro</div>
          <div class="mr-kpi"><span>${mediaDia}</span>média de atividades/dia</div>
          ${diaMaisMov ? `<div class="mr-kpi"><span>${diaMaisMov.totalEventos}</span>pico (${new Date(diaMaisMov.data + 'T12:00:00').toLocaleDateString('pt-BR')})</div>` : ''}
          <div class="mr-kpi"><span>${rankCat.length ? rankCat[0][0] : '—'}</span>categoria mais ativa</div>
        </div>
      </section>
      <section class="mr-sec"><h3>Ritmo semanal</h3>
        ${semanas.length ? `<table class="mr-tab"><thead><tr><th>Semana</th><th>Atividades</th></tr></thead><tbody>${
          semanas.map((v, i) => `<tr><td>Semana ${i + 1}</td><td><b>${v}</b></td></tr>`).join('')
        }</tbody></table>` : '<p class="mr-vazio">Sem dados.</p>'}
      </section>
      <section class="mr-sec"><h3>Atividades por categoria</h3>
        ${rankCat.length ? `<table class="mr-tab"><tbody>${rankCat.map(([k, v]) => `<tr><td>${esc(k)}</td><td><b>${v}</b></td></tr>`).join('')}</tbody></table>` : '<p class="mr-vazio">Nenhuma atividade neste mês.</p>'}
      </section>
      <section class="mr-sec"><h3>Destaques registrados durante o mês</h3>
        ${(function () {
          const dests = [];
          dias.forEach((d2) => (d2.destaques || []).forEach((dd) => dests.push(dd)));
          if (!dests.length) return '<p class="mr-vazio">Sem destaques capturados.</p>';
          return '<table class="mr-tab"><tbody>' + dests.slice(0, 20).map((dd) =>
            `<tr><td style="white-space:nowrap">${new Date(dd.ts).toLocaleDateString('pt-BR')}</td><td>${esc(String(dd.action).replace(/[._]/g, ' '))}${dd.nome ? ' — ' + esc(dd.nome) : ''}</td></tr>`
          ).join('') + '</tbody></table>';
        })()}
      </section>`;
  }

  /* ============================= AGENDADOR ============================== */
  function tickAgenda() {
    try {
      capturarHoje(false);
      const arqN = arquivarVencidos();
      const pdfN = gerarPDFsVencidos();
      if (arqN || pdfN) {
        try {
          const Em = E();
          if (Em && Em.modules && Em.modules.notificacoes) {
            Em.modules.notificacoes.add({
              tipo: 'info', titulo: 'Memória Inteligente',
              corpo: (arqN ? arqN + ' mês(es) arquivado(s). ' : '') + (pdfN ? pdfN + ' relatório(s) PDF gerado(s).' : '').trim(),
              aviso: 'Memória',
            });
          }
        } catch (e) {}
        if (window.ECOMIM_APP && document.querySelector('[data-view="memoria"].active')) window.ECOMIM_APP.renderView('memoria');
      }
    } catch (e) { /* nunca travar */ }
  }

  /* ================================ UI ================================== */
  function render(c) {
    const buf = capturarHoje(false);
    const arq = arquivo();

    const secTitulo = document.createElement('div');
    secTitulo.className = 'page-header';
    secTitulo.innerHTML = '<h1 style="font-size:22px">Ciclo automático da memória</h1><p>Ligado ao relógio e ao calendário: captura todo dia · arquiva 30 dias após o fim do mês · gera o PDF aos 60 dias.</p>';
    c.appendChild(secTitulo);

    /* Cartão de LIMPEZA — sempre com DUAS confirmações */
    const cardLimpar = document.createElement('div');
    cardLimpar.className = 'card';
    cardLimpar.innerHTML = `
      <h4>Limpeza de registros</h4>
      <div class="text-muted" style="font-size:12px;margin-bottom:10px">Apaga registros de atividade e memória deste dispositivo. As duas ações pedem <b>duas confirmações</b> e não podem ser desfeitas.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-danger" id="mem-limpar-ativ">Limpar ATIVIDADES (período atual + auditoria)</button>
        <button class="btn btn-sm btn-danger" id="mem-limpar-arq">Limpar MEMÓRIA ARQUIVADA (histórico)</button>
      </div>`;
    c.appendChild(cardLimpar);
    cardLimpar.querySelector('#mem-limpar-ativ').addEventListener('click', () => {
      if (!confirm('Limpar TODAS as ATIVIDADES do período atual e o registro de auditoria?')) return;
      if (!confirm('Segunda confirmação: isso apaga definitivamente o histórico recente de atividades. Continuar?')) return;
      NEITZEL_MEMORIA.limparAtividades();
      toast('Atividades e auditoria limpas.', 'success');
      setTimeout(() => render(c), 80);
    });
    cardLimpar.querySelector('#mem-limpar-arq').addEventListener('click', () => {
      if (!confirm('Limpar toda a MEMÓRIA ARQUIVADA (histórico mensal consolidado)?')) return;
      if (!confirm('Segunda confirmação: o arquivo histórico será apagado para sempre. Continuar?')) return;
      NEITZEL_MEMORIA.limparArquivo();
      toast('Memória arquivada limpa.', 'success');
      setTimeout(() => render(c), 80);
    });

    // Status do mês corrente
    const totalMes = (buf.dias || []).reduce((s, x) => s + (x.totalEventos || 0), 0);
    const fimMes = fimDoMesMs(buf.mes);
    const diasRestantesArq = Math.max(0, Math.ceil(((fimMes + DIAS_PARA_ARQUIVAR * 86400000) - Date.now()) / 86400000));
    const diasRestantesPdf = Math.max(0, Math.ceil(((fimMes + DIAS_PARA_PDF * 86400000) - Date.now()) / 86400000));
    const cfgMem = (() => { try { const Em = E(); return (Em.db.get().config && Em.db.get().config.sistema) || {}; } catch (e) { return {}; } })();
    const capAuto = cfgMem.capturaAutoAtividades !== false;
    const statusCard = document.createElement('div'); statusCard.className = 'card';
    statusCard.innerHTML = `
      <h4>Mês em captura — ${rotuloMes(buf.mes)}</h4>
      <div class="text-muted" style="margin-bottom:10px">
        <b>${totalMes}</b> atividade(s) capturada(s) em <b>${(buf.dias || []).length}</b> dia(s) até agora.<br>
        <small>Vai para o arquivo separado em ~${diasRestantesArq} dia(s) · PDF automático em ~${diasRestantesPdf} dia(s).</small>
      </div>
      <div class="btn-group" style="align-items:center;flex-wrap:wrap">
        <button class="btn btn-sm btn-primary" id="mm-cap">Capturar atividades de hoje agora</button>
        <button class="btn btn-sm" id="mm-ciclo">Rodar ciclo agora (arquivar/PDF)</button>
        <label style="display:inline-flex;align-items:center;gap:7px;font-size:12.5px;margin-left:auto">
          <input type="checkbox" id="mm-capauto" ${capAuto ? 'checked' : ''} style="width:17px;height:17px;accent-color:var(--e-brand)" />
          <span>captura automática todos os dias</span>
        </label>
      </div>`;
    c.appendChild(statusCard);
    statusCard.querySelector('#mm-capauto').addEventListener('change', (ev) => {
      try {
        const Em = E();
        const dbd = Em.db.get();
        dbd.config = dbd.config || {};
        dbd.config.sistema = Object.assign({}, dbd.config.sistema, { capturaAutoAtividades: ev.target.checked });
        Em.db.save();
        Em.audit.record('config.sistema', 'sistema', null, { capturaAutoAtividades: ev.target.checked });
        toast(ev.target.checked ? 'Captura automática ligada — a memória se alimenta sozinha.' : 'Captura automática desligada.', 'info');
      } catch (e) {}
    });

    // Mini-gráfico do mês corrente (barrinhas por dia)
    if ((buf.dias || []).length) {
      const maxV = Math.max(...buf.dias.map((x) => x.totalEventos || 0), 1);
      const graf = document.createElement('div'); graf.className = 'card';
      graf.innerHTML = `<h4>Ritmo diário deste mês</h4><div style="display:flex;gap:3px;align-items:flex-end;height:70px;flex-wrap:wrap">${
        buf.dias.map((x) => `<div title="${x.data}: ${x.totalEventos} atividades" style="width:${Math.max(6, Math.min(26, Math.floor(300 / Math.max(buf.dias.length, 12))))}px;height:${Math.round(((x.totalEventos || 0) / maxV) * 56) + 4}px;background:linear-gradient(180deg,var(--e-brand),var(--e-brand-soft));border-radius:4px 4px 0 0"></div>`).join('')
      }</div>`;
      c.appendChild(graf);
    }

    // Meses arquivados (lugar separado)
    const lista = document.createElement('div'); lista.className = 'card';
    lista.innerHTML = `<h4>Arquivo separado — meses guardados (${arq.length})</h4>
      <p class="text-muted" style="margin:2px 0 10px;font-size:12px">Cada mês fica guardado aqui fora da área viva. O PDF nasce sozinho aos 60 dias do fim do mês.</p>`;
    if (!arq.length) {
      lista.innerHTML += '<div class="empty">Nenhum mês arquivado ainda — o primeiro entra aqui 30 dias depois do fim do mês.</div>';
    } else {
      arq.forEach((r) => {
        const row = document.createElement('div');
        row.className = 'mm-file';
        const faltaPdf = !r.relatorio;
        const quando = faltaPdf
          ? `PDF automático em ~${Math.max(0, Math.ceil(((fimDoMesMs(r.mes) + DIAS_PARA_PDF * 86400000) - Date.now()) / 86400000))} dia(s)`
          : 'PDF pronto desde ' + new Date(r.pdfGeradoEm || r.arquivadoEm).toLocaleDateString('pt-BR');
        row.innerHTML = `
          <div class="mm-info"><b>${esc(r.titulo)}</b>
            <div class="text-muted" style="font-size:11.5px">Arquivado em ${new Date(r.arquivadoEm || r.geradoEm).toLocaleString('pt-BR')} · ${(r.dias || []).length} dia(s) · ${r.totalEventos != null ? r.totalEventos + ' atividades' : ''}<br>${quando}</div></div>
          <div class="btn-group">
            ${faltaPdf
              ? '<button class="btn btn-sm" disabled title="O PDF é gerado automaticamente aos 60 dias">Aguardando PDF</button>'
              : `<button class="btn btn-sm" data-ver="${r.id}">Ver</button>
                 <button class="btn btn-sm btn-primary" data-pdf="${r.id}">Baixar PDF</button>`}
            <button class="btn btn-sm btn-danger" data-del="${r.id}">Excluir</button>
          </div>`;
        lista.appendChild(row);
      });
      lista.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => verRelatorio(b.dataset.ver, false)));
      lista.querySelectorAll('[data-pdf]').forEach((b) => b.addEventListener('click', () => verRelatorio(b.dataset.ver !== undefined ? b.dataset.ver : b.dataset.pdf, true)));
      lista.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
        if (!confirm('Excluir este mês arquivado? Isso não afeta os dados vivos do sistema.')) return;
        lsSet(KEY_ARQ, arquivo().filter((x) => x.id !== b.dataset.del));
        render(c);
      }));
    }
    c.appendChild(lista);

    statusCard.querySelector('#mm-cap').addEventListener('click', () => {
      capturarHoje(true);
      toast('Atividades de hoje capturadas pela memória.', 'success');
      render(c);
    });
    statusCard.querySelector('#mm-ciclo').addEventListener('click', () => {
      const a = arquivarVencidos();
      const p = gerarPDFsVencidos();
      toast(a || p ? `${a} arquivo(s), ${p} PDF(s) gerados pelo ciclo.` : 'Ciclo rodou — nada venceu ainda (o calendário manda).', a || p ? 'success' : 'info');
      render(c);
    });
  }

  function verRelatorio(id, imprimir) {
    const r = arquivo().find((x) => x.id === id);
    if (!r) return;
    if (!r.relatorio) { gerarPDFsVencidos(); }
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
      <header><div class="logo">N</div><div><h1>${esc(r.titulo)}</h1><small>NEITZEL — Sistema Digital · Memória Inteligente · arquivado em ${new Date(r.arquivadoEm || r.geradoEm).toLocaleDateString('pt-BR')}</small></div></header>
      ${r.relatorio || montarRelatorio(r)}
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

  /* =============================== BOOT ================================= */
  setTimeout(tickAgenda, 2500);
  setInterval(tickAgenda, 60 * 1000);

  window.NEITZEL_MEMORIA = { capturarSnapshot: () => capturarHoje(true), consolidarPendentes: tickAgenda, render, tickAgenda,
  /** Limpa as ATIVIDADES capturadas do período + auditoria (chamar com dupla confirmação). */
  limparAtividades() {
    try {
      localStorage.removeItem(KEY_MES);
      if (window.ECOMIM && window.ECOMIM.audit && window.ECOMIM.audit.limpar) window.ECOMIM.audit.limpar();
    } catch (e) {}
    return { ok: true };
  },
  /** Limpa a MEMÓRIA ARQUIVADA (histórico mensal consolidado/PDFs registrados). */
  limparArquivo() {
    try {
      localStorage.removeItem(KEY_ARQ);
      localStorage.removeItem(KEY_PDF);
    } catch (e) {}
    return { ok: true };
  },
 };
})();
