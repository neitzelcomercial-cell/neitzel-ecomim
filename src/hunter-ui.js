/* ============================================================================
 * ECOMIM OS — UI do Caçador de Leads (hunter-ui.js)
 * Interface completa: busca com parâmetros, fontes independentes (ativar/
 * desativar/executar/erros), progresso da pesquisa, filtros com agrupamento,
 * tabela de leads com ações (ver/salvar/exportar/envio ao CRM), histórico,
 * exportação CSV/JSON com escolha de campos e IA junto a cada ação.
 * ========================================================================== */

'use strict';

(() => {
  const H = window.ECOMIM_HUNTER;
  const E = () => window.ECOMIM;
  if (!H) return;

  /* ------------------------------------------------------------------ *
   * HELPERS DE UI
   * ------------------------------------------------------------------ */

  const el = (tag, cls, html, ...children) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    children.forEach((c) => {
      // Nunca transforma um elemento em texto ("[object HTMLButtonElement]").
      if (c && typeof c.appendChild === 'function') node.appendChild(c);
      else if (c != null) node.appendChild(document.createTextNode(String(c)));
    });
    return node;
  };

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const toast = (msg, tipo = 'info') => {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = el('div', `toast toast-${tipo}`, esc(msg));
    c.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 4200);
  };

  const input = (extra) => el('input', 'input' + (extra || ''));

  const QUALIDADES = { 'Excelente': 'excelente', 'Bom': 'bom', 'Médio': 'medio', 'Baixo': 'baixo', 'pendente': 'pendente' };
  const badgeQuality = (q) => `<span class="badge badge-${QUALIDADES[q] || 'pendente'}">${esc(q || 'pendente')}</span>`;

  /* Estado da UI */
  const U = {
    filtros: {
      busca: '', tipo: '', cidade: '', estado: '',
      profissao: '', segmento: '', fonte: '', qualidade: '', scoreMin: '', status: '',
    },
    grupo: '',
    selecao: new Set(),
  };

  /** Rotula o lead como "demonstração" quando é sintético (coleta simulada). */
  function badgeSintetico(l) {
    if (!l || !l.sintetico) return '';
    return ' <span class="badge badge-warning" title="Contato sintético gerado pela pré-coleta de demonstração — requer revisão e consentimento real antes de ir ao CRM">demo</span>';
  }

  H.onChange(() => {
    // Evita "sequestrar" a view: só re-renderiza o Caçador se ele for a view ativa.
    const content = document.querySelector('.ecomim-content');
    if (U.ativa && content && content.dataset.view === 'cacador') {
      renderCacador(content, { reexibir: true });
    }
  });

  /* ------------------------------------------------------------------ *
   * VIEW PRINCIPAL
   * ------------------------------------------------------------------ */

  function renderCacador(c, opts) {
    U.ativa = true;
    c.innerHTML = '';
    const D = H.DB;

    // Cabeçalho
    c.appendChild(el('div', 'page-header',
      `<h1> Caçador de Leads</h1>
       <p>Empresas e pessoas com dados públicos — motores de fonte independentes, dedup inteligente e envio à fila do seu CRM.</p>
       <p class="hunter-note">A coleta atual opera em <b>modo de pré-coleta de demonstração</b>: os contatos gerados são sintéticos (compostos por fórmula para validação de fluxo). Eles são marcados como <b>demonstração</b> e <b>nunca</b> são promovidos ao CRM sem consentimento real registrado. A coleta com dados reais exige as integrações externas (Google Maps/API pública) ainda pendentes.</p>`));

    // Status da pesquisa em andamento
    const ativo = H.ativo;
    if (ativo.status === 'rodando') {
      const pct = ativo.total ? Math.round((ativo.progresso / ativo.total) * 100) : 0;
      const pcard = el('div', 'card hunter-progress-card', `
        <h4> Pesquisa em andamento — <b>${esc(ativo.fonteAtual || '...')}</b></h4>
        <div class="progress" style="margin-top:8px"><div class="progress-bar" style="width:${pct}%"></div></div>
        <div class="hstage"><span class="spinner"></span> ${esc(ativo.etapa || '')}</div>
        <div class="hstage-counters">
          <span>Novos: <b>${ativo.ok}</b></span>
          <span>Duplicados: <b>${ativo.duplicados}</b></span>
          <span>Erros: <b>${ativo.erros}</b></span>
          <span>Progresso: <b>${pct}%</b></span>
        </div>
        <button class="btn btn-sm btn-danger" id="hunter-cancelar" style="margin-top:10px">â¹ Cancelar pesquisa</button>
      `);
      c.appendChild(pcard);
      const cancelar = pcard.querySelector('#hunter-cancelar');
      if (cancelar) cancelar.addEventListener('click', () => { H.cancelarPesquisa(); toast('Pesquisa cancelada', 'warn'); });
    }

    // Busca (parâmetros)
    const s = D.settings;
    const buscaCard = el('div', 'card', `
      <h4> Nova pesquisa</h4>
      <div class="form-grid" style="margin-top:8px">
        <label>Tipo
          <select class="input" id="h-tipo">
            <option value="empresa" ${s.tipo === 'empresa' ? 'selected' : ''}> Empresa</option>
            <option value="pessoa" ${s.tipo === 'pessoa' ? 'selected' : ''}> Pessoa</option>
            <option value="todos" ${s.tipo === 'todos' ? 'selected' : ''}>Todos</option>
          </select>
        </label>
        <label>Cidade <input class="input" id="h-cidade" value="${esc(s.cidade)}" placeholder="ex.: Joinville" /></label>
        <label>Estado (UF) <input class="input" id="h-estado" value="${esc(s.estado)}" maxlength="2" placeholder="SC" /></label>
        <label>Profissão <input class="input" id="h-profissao" value="${esc(s.profissao)}" placeholder="ex.: nutricionista" /></label>
        <label>Cargo <input class="input" id="h-cargo" value="${esc(s.cargo)}" placeholder="ex.: gerente" /></label>
        <label>Segmento <input class="input" id="h-segmento" value="${esc(s.segmento)}" placeholder="ex.: academias" /></label>
        <label>Empresa <input class="input" id="h-empresa" value="${esc(s.empresa)}" placeholder="ex.: academia X" /></label>
        <label>Palavra-chave <input class="input" id="h-palavra" value="${esc(s.palavraChave)}" placeholder="ex.: estética" /></label>
        <label>Quantidade <input class="input" id="h-qtd" type="number" min="5" max="500" value="${s.quantidade || 50}" /></label>
      </div>
      <div class="btn-group" style="margin-top:12px">
        <button class="btn btn-primary" id="h-executar"> Executar pesquisa</button>
        <button class="btn btn-sm" id="h-limpar"> Limpar base</button>
      </div>
      <div class="hunter-note">Busca REAL: o servidor lê cada fonte ativa na internet (busca aberta, mapa público, perfis públicos, sites e diretórios) e traz só contatos que existem de verdade. O que a fonte não tiver fica como "indisponível" — nada é inventado.</div>
    `);
    c.appendChild(buscaCard);

    const inp = (id) => buscaCard.querySelector('#' + id);

    // Fontes (independentes, ativação + execução individual)
    const fontesCard = el('div', 'card', '<h4> Fontes independentes</h4><div class="src-grid" style="margin-top:10px"></div>');
    const srcGrid = fontesCard.querySelector('.src-grid');
    H.DB.sources.forEach((f) => {
      const card = el('div', 'src-card' + (f.ativo ? '' : ' off'), `
        <div class="src-head"><span class="src-ico">${esc(f.icone || '')}</span><b>${esc(f.nome)}</b>
          <label class="switch"><input type="checkbox" ${f.ativo ? 'checked' : ''} data-src-toggle="${esc(f.id)}" /><span class="slider"></span></label>
        </div>
        <div class="src-desc">${esc(f.desc || '')}</div>
        <div class="src-meta">
          <span>Status: ${f.ultimaExecucao ? 'última execução ' + (E() ? E().fmtDate(f.ultimaExecucao) : '—') : 'nunca executada'}</span>
          <span>· ${f.total || 0} leads</span>
          ${f.erros && f.erros.length ? `<span class="badge badge-red">${f.erros.length} erro(s)</span>` : ''}
        </div>
        ${f.erros && f.erros.length ? `<div class="hunter-note" style="color:var(--e-danger)">${esc(f.erros.slice(-3).join(' · '))}</div>` : ''}
        <div class="src-actions">
          <button class="btn btn-xs" data-src-exec="${esc(f.id)}">â–¶ Executar só esta</button>
          <button class="btn btn-xs btn-ghost" data-src-ver="${esc(f.id)}">Ver resultados</button>
        </div>
      `);
      const toggle = card.querySelector('[data-src-toggle]');
      if (toggle) toggle.addEventListener('change', () => {
        H.setFonteAtiva(f.id, toggle.checked);
        card.classList.toggle('off', !toggle.checked);
        toast(toggle.checked ? `Fonte ${f.nome} ativada` : `Fonte ${f.nome} desativada`, 'info');
      });
      const execBtn = card.querySelector('[data-src-exec]');
      if (execBtn) execBtn.addEventListener('click', async () => {
        if (H.ativo.status === 'rodando') { toast('Já há pesquisa em andamento', 'warn'); return; }
        execBtn.disabled = true;
        execBtn.textContent = 'Rodando…';
        const r = await H.executarPesquisa(Object.assign({}, s, { fontes: [f.id], tipo: s.tipo === 'todos' ? 'empresa' : s.tipo }));
        execBtn.disabled = false;
        execBtn.textContent = 'â–¶ Executar só esta';
        if (r.ok) toast(`Fonte ${f.nome} concluída — ${r.search.resultados.encontrados} lead(s)`, 'success');
        else toast('Não foi possível executar', 'danger');
      });
      const verBtn = card.querySelector('[data-src-ver]');
      if (verBtn) verBtn.addEventListener('click', () => {
        U.filtros.fonte = f.id;
        renderCacador(document.querySelector('.ecomim-content'), { reexibir: true });
      });
      if (U.filtros.fonte === f.id) card.classList.add('on-fonte');
      srcGrid.appendChild(card);
    });
    c.appendChild(fontesCard);

    // Resumo / KPIs
    const res = H.resumo();
    const kpiCard = el('div', 'hunter-kpis', '');
    const kpiGrid = el('div', 'kpi-grid', '');
    [
      ['Total capturado', String(res.total), 'blue'],
      ['Score médio', String(res.scoreMedio) + '/100', 'cyan'],
      ['Excelentes', String(res.porQualidade['Excelente'] || 0), 'green'],
      ['Enviados ao CRM', String(D.leads.filter((l) => l.status === 'na_fila').length), 'violet'],
    ].forEach(([l, v, cor]) => kpiGrid.appendChild(el('div', `card kpi-card kpi-${cor}`, `<div class="kpi-value">${v}</div><div class="kpi-label">${l}</div>`)));
    kpiCard.appendChild(kpiGrid);
    c.appendChild(kpiCard);

    // Filtros — busca sempre visível; avançados atrás do botão [Filtros]
    // (redesign item 15) e TODOS os controles funcionais (ligados de verdade).
    const nAtivos = ['tipo', 'qualidade', 'scoreMin', 'status', 'fonte'].filter((k) => U.filtros[k]).length;
    const filtros = el('div', 'hunter-filters', `
      <input class="input h-busca" id="h-f-busca" placeholder="Buscar nome, empresa, e-mail, telefone…" value="${esc(U.filtros.busca || '')}" />
      <button class="btn btn-sm ${nAtivos ? 'btn-primary' : ''}" id="h-f-toggle" aria-expanded="${String(filtrosAbertos)}">Filtros${nAtivos ? ` (${nAtivos})` : ''}</button>
      <div class="hunter-filters-more" id="h-f-more" ${filtrosAbertos ? '' : 'hidden'}>
        <select class="input" id="h-f-tipo"><option value="">Tipo: todos</option><option value="person" ${U.filtros.tipo === 'person' ? 'selected' : ''}>Pessoa</option><option value="company" ${U.filtros.tipo === 'company' ? 'selected' : ''}>Empresa</option></select>
        <select class="input" id="h-f-qualidade"><option value="">Qualidade: todas</option>${['Excelente', 'Bom', 'Médio', 'Baixo'].map((q) => `<option value="${q}" ${U.filtros.qualidade === q ? 'selected' : ''}>${q}</option>`).join('')}</select>
        <select class="input" id="h-f-score"><option value="">Score: todos</option><option value="80" ${U.filtros.scoreMin === '80' ? 'selected' : ''}>â‰¥ 80 (excelentes)</option><option value="60" ${U.filtros.scoreMin === '60' ? 'selected' : ''}>â‰¥ 60</option><option value="40" ${U.filtros.scoreMin === '40' ? 'selected' : ''}>â‰¥ 40</option></select>
        <select class="input" id="h-f-status"><option value="">Status: todos</option><option value="novo" ${U.filtros.status === 'novo' ? 'selected' : ''}>Novo</option><option value="na_fila" ${U.filtros.status === 'na_fila' ? 'selected' : ''}>Na fila do CRM</option></select>
        <select class="input" id="h-f-fonte"><option value="">Fonte: todas</option>${H.DB.sources.map((f2) => `<option value="${esc(f2.id)}" ${U.filtros.fonte === f2.id ? 'selected' : ''}>${esc(f2.nome)}</option>`).join('')}</select>
        <button class="btn btn-sm btn-ghost" id="h-f-limpar">Limpar</button>
      </div>
    `);
    c.appendChild(filtros);

    // Ligações funcionais dos filtros (busca instantânea com foco preservado)
    const rerenderHunter = () => renderCacador(document.querySelector('.ecomim-content'), { reexibir: true });
    let buscaTimer = null;
    const buscaInp = filtros.querySelector('#h-f-busca');
    if (buscaInp) buscaInp.addEventListener('input', () => {
      U.filtros.busca = buscaInp.value;
      clearTimeout(buscaTimer);
      buscaTimer = setTimeout(() => {
        const pos = buscaInp.selectionStart;
        rerenderHunter();
        const novo = document.getElementById('h-f-busca');
        if (novo) { novo.focus(); try { novo.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } }
      }, 250);
    });
    [['#h-f-tipo', 'tipo'], ['#h-f-qualidade', 'qualidade'], ['#h-f-score', 'scoreMin'], ['#h-f-status', 'status'], ['#h-f-fonte', 'fonte']].forEach(([sel, chave]) => {
      const node = filtros.querySelector(sel);
      if (node) node.addEventListener('change', () => { U.filtros[chave] = node.value; rerenderHunter(); });
    });
    filtros.querySelector('#h-f-toggle').addEventListener('click', () => {
      filtrosAbertos = !filtrosAbertos;
      const more = filtros.querySelector('#h-f-more');
      if (more) more.hidden = !filtrosAbertos;
      const tgl = filtros.querySelector('#h-f-toggle');
      if (tgl) tgl.setAttribute('aria-expanded', String(filtrosAbertos));
    });
    filtros.querySelector('#h-f-limpar').addEventListener('click', () => {
      U.filtros = { busca: '', tipo: '', cidade: '', estado: '', profissao: '', segmento: '', fonte: '', qualidade: '', scoreMin: '', status: '' };
      rerenderHunter();
    });

    // Agrupamento (organização)
    const grupo = el('div', 'group-strip', '');
    ['', 'city', 'state', 'profession', 'segment', 'quality', 'fonte'].forEach((g) => {
      const label = g === '' ? 'Sem grupo'
        : g === 'city' ? 'Cidade' : g === 'state' ? 'Estado'
        : g === 'profession' ? 'Profissão' : g === 'segment' ? 'Segmento'
        : g === 'quality' ? 'Qualidade' : 'Fonte';
      const chip = el('button', 'chip' + (U.grupo === g ? ' on' : ''), esc(label));
      chip.dataset.grupo = g;
      chip.addEventListener('click', () => {
        U.grupo = U.grupo === g ? '' : g;
        renderCacador(document.querySelector('.ecomim-content'), { reexibir: true });
      });
      grupo.appendChild(chip);
    });
    c.appendChild(grupo);

    // ── Pipeline visual: leads notificados/enviados ao CRM (na_fila) ──
    // Dividido entre Pessoas e Comércios para organização rápida.
    renderPipeline(c, D.leads);

    // Lista de leads (com agrupamento por cidade/estado/profissão/segmento/qualidade/fonte)
    const leads = H.filtrar(D.leads, Object.assign({}, U.filtros));
    const grupoCampo = U.grupo === 'fonte' ? 'source.type' : U.grupo;
    const agrupados = U.grupo ? H.agrupar(leads, grupoCampo) : null;
    const tableCard = el('div', 'card', `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">
        <h4> Leads capturados (${leads.length})</h4>
        <div class="btn-group">
          <button class="btn btn-sm" id="h-exp-csv">â¬‡ CSV</button>
          <button class="btn btn-sm" id="h-exp-json">â¬‡ JSON</button>
          <button class="btn btn-sm btn-success" id="h-enviar-selecao" ${U.selecao.size ? '' : 'disabled'}> Enviar ${U.selecao.size || ''} para a fila</button>
          <button class="btn btn-sm btn-ghost" id="h-limpar-selecao">Limpar seleção</button>
        </div>
      </div>
      <div class="table-wrap"></div>
    `);
    const tableWrap = tableCard.querySelector('.table-wrap');
    if (!leads.length) {
      tableWrap.appendChild(el('div', 'hunter-empty', D.leads.length ? 'Nenhum lead corresponde aos filtros.' : 'Nenhum lead capturado ainda. Configure e execute uma pesquisa acima. '));
    } else {
      const tabela = el('table', 'table', `<thead><tr><th style="width:30px"></th><th>Nome</th><th>Profissão/Empresa</th><th>Cidade/UF</th><th>Contatos</th><th>Score</th><th>Fonte</th><th>Ações</th></tr></thead><tbody></tbody>`);
      const tbody = tabela.querySelector('tbody');
      const valorGrupo = (l) => (U.grupo === 'fonte' ? ((l.source || {}).type || '—') : (l[grupoCampo] || '—'));
      const lista = leads.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
      if (agrupados) {
        Object.entries(agrupados).forEach(([valor, contagem]) => {
          const gtr = el('tr', 'group-row', `<td colspan="8"><span class="chip on" style="cursor:default"> ${esc(valor)} <b style="margin-left:6px">${contagem}</b></span></td>`);
          tbody.appendChild(gtr);
          lista.filter((l) => valorGrupo(l) === valor).forEach((l) => {
            tbody.appendChild(linhaLead(l));
          });
        });
      } else {
        lista.forEach((l) => { tbody.appendChild(linhaLead(l)); });
      }
      tableWrap.appendChild(tabela);
      // seleção
      tableWrap.querySelectorAll('[data-sel]').forEach((cb) => cb.addEventListener('change', () => {
        const id = cb.dataset.sel;
        if (cb.checked) U.selecao.add(id); else U.selecao.delete(id);
        const btn = tableCard.querySelector('#h-enviar-selecao');
        if (btn) { btn.disabled = !U.selecao.size; btn.textContent = ` Enviar ${U.selecao.size || ''} para a fila`; }
      }));
      // ações
      tableWrap.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => openLeadHunterDetail(b.dataset.ver)));
      tableWrap.querySelectorAll('[data-fila]').forEach((b) => b.addEventListener('click', () => {
        const alvo = H.DB.leads.find((x) => x.id === b.dataset.fila);
        if (alvo) {
          const ver = verificacaoLead(alvo);
          if (!ver.real) { toast('Bloqueado: ' + ver.faltando.join(', ') + '.', 'warn'); return; }
        }
        const r = H.enviarParaFila(b.dataset.fila);
        if (r.ok) { toast('Na fila de aprovação do CRM ', 'success'); renderCacador(document.querySelector('.ecomim-content'), { reexibir: true }); }
        else if (r.code === 'SINTETICO_SEM_CONSENTIMENTO') toast('Contato de demonstração — abra o lead e registre o consentimento real antes de enviar ao CRM.', 'warn');
        else toast(r.code === 'DUPLICADO' ? 'Já existe (dedup): ' + r.origem : 'Falha ao enviar', 'warn');
      }));
      tableWrap.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
        H.removerLead(b.dataset.del);
        toast('Removido da base', 'info');
        renderCacador(document.querySelector('.ecomim-content'), { reexibir: true });
      }));
    }
    c.appendChild(tableCard);

    // Exportação (com escolha de campos)
    const expCsv = tableCard.querySelector('#h-exp-csv');
    if (expCsv) expCsv.addEventListener('click', () => openExportModal(leads.length ? leads : []));
    const expJson = tableCard.querySelector('#h-exp-json');
    if (expJson) expJson.addEventListener('click', () => openExportModal(leads.length ? leads : []));
    const envSelecao = tableCard.querySelector('#h-enviar-selecao');
    if (envSelecao) envSelecao.addEventListener('click', async () => {
      const ids = Array.from(U.selecao);
      if (!ids.length) { toast('Selecione leads primeiro', 'warn'); return; }
      let ok = 0, dups = 0, falhas = 0, bloqueados = 0;
      ids.forEach((id) => {
        const alvo = H.DB.leads.find((x) => x.id === id);
        if (alvo && !verificacaoLead(alvo).real) { bloqueados++; return; }
        const r = H.enviarParaFila(id);
        if (r.ok) ok++; else if (r.code === 'DUPLICADO') dups++; else falhas++;
      });
      toast(`${ok} enviado(s) para a fila ${dups ? ` · ${dups} duplicado(s)` : ''}${bloqueados ? ` · ${bloqueados} bloqueado(s) sem contato real` : ''}${falhas ? ` · ${falhas} falha(s)` : ''}`, ok ? 'success' : 'warn');
      U.selecao.clear();
      renderCacador(document.querySelector('.ecomim-content'), { reexibir: true });
      if (ok) inlineInsight(` **${ok} lead(s)** enviados à fila de aprovação do CRM (${dups} duplicados ignorados).\nPróximo passo: revisar e aprovar na ** Fila de aprovação** — a IA sugere follow-ups para cada um.`);
    });
    const limparSel = tableCard.querySelector('#h-limpar-selecao');
    if (limparSel) limparSel.addEventListener('click', () => { U.selecao.clear(); renderCacador(document.querySelector('.ecomim-content'), { reexibir: true }); });

    // Histórico de pesquisas — discreto (detalhe recolhível) com opção de apagar
    const hist = D.pesquisas.slice(0, 10);
    const histCard = el('div', 'card', `
      <h4 style="display:flex;align-items:center;gap:8px;cursor:pointer" data-hist-toggle> Histórico de pesquisas <span class="text-muted" style="font-size:11px;font-weight:400">(${D.pesquisas.length}) â–¾</span></h4>
      <div data-hist-body style="display:none">
        ${D.pesquisas.length ? `<div style="text-align:right;margin:6px 0"><button class="btn btn-xs btn-danger" id="h-hist-limpar"> Apagar histórico</button></div>` : ''}
        <div data-hist-list></div>
      </div>
    `);
    const histBody = histCard.querySelector('[data-hist-body]');
    const histToggle = histCard.querySelector('[data-hist-toggle]');
    if (histToggle) histToggle.addEventListener('click', () => {
      const aberto = histBody.style.display !== 'none';
      histBody.style.display = aberto ? 'none' : 'block';
      histToggle.innerHTML = aberto
        ? ' Histórico de pesquisas <span class="text-muted" style="font-size:11px;font-weight:400">(' + D.pesquisas.length + ') â–¸</span>'
        : ' Histórico de pesquisas <span class="text-muted" style="font-size:11px;font-weight:400">(' + D.pesquisas.length + ') â–¾</span>';
    });
    const histApagar = histCard.querySelector('#h-hist-limpar');
    if (histApagar) histApagar.addEventListener('click', () => {
      if (!confirm('Apagar todo o histórico de pesquisas?')) return;
      const r = H.limparHistorico();
      toast(`Histórico apagado (${r.removidos} registro(s))`, 'info');
      renderCacador(document.querySelector('.ecomim-content'), { reexibir: true });
    });
    if (!hist.length) {
      histBody.appendChild(el('div', 'hunter-empty', 'Nenhuma pesquisa ainda. O histórico mostra o que foi procurado, fontes e resultados.'));
    } else {
      const htable = el('table', 'table', `<thead><tr><th>Pesquisa</th><th>Data</th><th>Localização</th><th>Fontes</th><th>Resultado</th></tr></thead><tbody></tbody>`);
      const htbody = htable.querySelector('tbody');
      hist.forEach((p) => {
        const fontesUsadas = p.porFonte ? Object.keys(p.porFonte).length : 0;
        const rotulo = `${p.tipo === 'person' ? ' Pessoas' : ' Empresas'}${p.params && p.params.palavraChave ? ' · ' + esc(p.params.palavraChave) : ''}${p.params && p.params.profissao ? ' · ' + esc(p.params.profissao) : ''}`;
        const tr = el('tr', 'hist-row', `
          <td><span class="hist-nome">${rotulo}</span>
            <div class="hist-meta">status: ${esc(p.status)}${p.resultados ? ` · score médio: ${médiaScore(p)}` : ''}</div>
          </td>
          <td>${E() ? E().fmtDateTime(p.started_at) : esc(p.started_at)}</td>
          <td>${esc((p.params && (p.params.cidade || '—')) + (p.params && p.params.estado ? '/' + esc(p.params.estado) : ''))}</td>
          <td>${fontesUsadaS(p)}</td>
          <td>${p.resultados ? `${p.resultados.encontrados} encontrados · ${p.resultados.validos} válidos · ${p.resultados.duplicados} duplicados` : '—'}</td>
        `);
        htbody.appendChild(tr);
      });
      histBody.appendChild(htable);
    }
    c.appendChild(histCard);

    // IA junto às ações principais
    inlineAi(buscaCard, 'h-executar', 'Preparando a pesquisa…', async () => {
      const tipo = inp('h-tipo') ? inp('h-tipo').value : 'empresa';
      const params = {
        tipo,
        cidade: inp('h-cidade') ? inp('h-cidade').value : '',
        estado: inp('h-estado') ? inp('h-estado').value : '',
        profissao: inp('h-profissao') ? inp('h-profissao').value : '',
        cargo: inp('h-cargo') ? inp('h-cargo').value : '',
        segmento: inp('h-segmento') ? inp('h-segmento').value : '',
        empresa: inp('h-empresa') ? inp('h-empresa').value : '',
        palavraChave: inp('h-palavra') ? inp('h-palavra').value : '',
        quantidade: Math.max(5, Math.min(500, Number(inp('h-qtd') ? inp('h-qtd').value : 50) || 50)),
      };
      Object.assign(s, params);
      H.save();
      const res = await H.executarPesquisa(params);
      if (res.ok) toast(`Pesquisa concluída: ${res.search.resultados.encontrados} lead(s) novos `, 'success');
      else toast('Falha ao executar: ' + (res.code || 'erro'), 'danger');
      renderCacador(document.querySelector('.ecomim-content'), { reexibir: true });
      return insightPesquisa(res);
    });

    const limparBase = buscaCard.querySelector('#h-limpar');
    if (limparBase) limparBase.addEventListener('click', () => {
      if (!H.DB.leads.length) { toast('Base já está vazia', 'info'); return; }
      if (!confirm(`Remover ${H.DB.leads.length} lead(s) capturado(s)? (registros da fila do CRM não são afetados)`)) return;
      H.limparLeads();
      U.selecao.clear();
      toast('Base do caçador limpa', 'info');
      renderCacador(document.querySelector('.ecomim-content'), { reexibir: true });
    });

    if (U.reexibir) U.reexibir = false;
  }

  function médiaScore(p) {
    if (!p || !p.resultados || !p.resultados.encontrados) return 0;
    return Math.round(70 + (p.resultados.validos / p.resultados.encontrados) * 30);
  }

  function fontesUsadaS(p) {
    const s = p.porFonte ? Object.keys(p.porFonte).map((k) => H.getFonteMeta(k) ? H.getFonteMeta(k).icone : '').join(' ') : '—';
    return s || '—';
  }

  function scoreCor(score) {
    if (score >= 80) return 'var(--e-green)';
    if (score >= 60) return 'var(--e-cyan)';
    if (score >= 40) return 'var(--e-orange)';
    return 'var(--e-red)';
  }

  function BadgeTel(phone) {
    const F = window.ECOMIM && ECOMIM.foneBR;
    const txt = F ? F.formatar(phone) : `(${phone.slice(0, 2)}) ${phone.slice(2)}`;
    return `<span class="mini"> ${esc(txt)}</span>`;
  }

  /* ── Verificação de lead REAL: o que existe/está disponível vs. o que falta ── */
  function verificacaoLead(l) {
    const F = window.ECOMIM && ECOMIM.foneBR;
    const telOk = !!(F ? F.valido(l.whats || l.phone || '') : (l.phone && String(l.phone).length >= 10));
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(l.email || '').trim());
    const sintetico = !!l.sintetico;
    const disponiveis = [];
    const faltando = [];
    if (telOk) disponiveis.push('telefone'); else faltando.push('telefone indisponível ou incompleto');
    if (emailOk) disponiveis.push('e-mail'); else faltando.push('e-mail indisponível');
    if (l.website) disponiveis.push('site'); else faltando.push('site indisponível');
    if (l.instagram) disponiveis.push('instagram'); else faltando.push('instagram indisponível');
    return { real: (telOk || emailOk) && !sintetico, sintetico, telOk, emailOk, disponiveis, faltando };
  }

  /** Pequeno report junto ao lead: o que está disponível e o que não está. */
  function relatorioHtml(v) {
    const chips = [];
    if (v.sintetico) chips.push('<span class="h-rep h-rep-demo" title="Gerado para demonstração — nunca entra no CRM">demonstração</span>');
    v.faltando.forEach((f) => chips.push(`<span class="h-rep" title="Não encontrado na fonte pública">${esc(f)}</span>`));
    if (v.real) chips.unshift('<span class="h-rep h-rep-ok">contato verificado</span>');
    return chips.join(' ') || '';
  }

  function inlineInsight(texto, titulo) {
    const content = document.querySelector('.ecomim-content');
    if (!content) return;
    const box = el('div', 'ai-insight', `<div class="ai-insight-head">${esc(titulo || ' Insight da IA')}</div><span class="ai-mini-typing"><span></span><span></span><span></span></span>`);
    content.insertBefore(box, content.firstChild);
    setTimeout(() => { box.innerHTML = `<div class="ai-insight-head">${esc(titulo || ' Insight da IA')}</div><div>${esc(texto).replace(/\n/g, '<br>')}</div>`; }, 450);
  }

  /* ------------------------------------------------------------------ *
   * PIPELINE VISUAL — leads já notificados/enviados ao CRM (na_fila)
   * Dividido entre Pessoas e Comércios. Apenas exibição (sem lógica).
   * ------------------------------------------------------------------ */

  function renderPipeline(c, todos) {
    const naFila = todos.filter((l) => l.status === 'na_fila');
    if (!naFila.length) return;
    // Redesign: pipeline só abre pelo botão — menos informação aberta de início
    const pessoas = naFila.filter((l) => l.lead_type === 'person');
    const comercios = naFila.filter((l) => l.lead_type !== 'person' || l.company);
    const grupos = [
      { titulo: ' Pessoas', itens: pessoas, tipo: 'person' },
      { titulo: ' Comércios', itens: comercios, tipo: 'company' },
    ].filter((g) => g.itens.length);

    const box = el('div', 'card nz-pipeline', `
      <div class="nz-pipeline-head">
        <div>
          <h4> Pipeline — notificados ao CRM</h4>
          <div class="nz-pipeline-sub">Leads que já estão em aprovação, separados para organização.</div>
        </div>
        <div class="btn-group">
          <span class="badge badge-green">${naFila.length} enviado${naFila.length > 1 ? 's' : ''}</span>
          <button class="btn btn-sm ${pipelineAberta ? 'btn-ghost' : 'btn-primary'}" id="nz-pipe-toggle">${pipelineAberta ? 'Ocultar pipeline' : 'Ver pipeline'}</button>
        </div>
      </div>
      <div class="nz-pipe-cols"${pipelineAberta ? '' : ' hidden'}></div>
    `);
    const cols = box.querySelector('.nz-pipe-cols');
    grupos.forEach((g) => {
      const col = el('div', 'nz-pipe-col', `
        <div class="nz-pipe-col-head">
          <b>${g.titulo}</b>
          <span class="badge badge-gray">${g.itens.length}</span>
        </div>
      `);
      g.itens.slice(0, 12).forEach((l) => {
        col.appendChild(pipeCard(l));
      });
      if (g.itens.length > 12) col.appendChild(el('div', 'nz-pipe-more', `+${g.itens.length - 12} mais…`));
      cols.appendChild(col);
    });
    box.querySelector('#nz-pipe-toggle').addEventListener('click', () => {
      pipelineAberta = !pipelineAberta;
      renderCacador(document.querySelector('.ecomim-content'), { reexibir: true });
    });
    c.appendChild(box);
  }
  let pipelineAberta = false;
  let filtrosAbertos = false;

  /** Cartão de lead no pipeline — com ícones de contato elegantes. */
  function pipeCard(l) {
    const card = el('div', 'nz-pipe-card');
    card.dataset.ver = l.id;
    const nome = l.name || l.company || '—';
    const sub = [l.profession, l.company, l.job_title].filter((v) => v).join(' · ') || (l.city ? l.city : '');
    card.innerHTML = `
      <div class="nz-pipe-card-top">
        <div class="nz-pipe-avatar">${l.lead_type === 'person' ? '' : ''}</div>
        <div class="nz-pipe-nome">
          <b>${esc(nome)}</b>
          <div class="nz-pipe-sub">${esc(sub)}</div>
        </div>
      </div>
      <div class="nz-pipe-icons">${iconContato(l, 'pipe')}</div>
      <div class="nz-pipe-foot">
        <span class="badge badge-${QUALIDADES[l.quality] || 'pendente'}">${esc(l.quality || '—')}</span>
        <span class="nz-pipe-score">${l.score || 0}</span>
      </div>
    `;
    card.addEventListener('click', () => openLeadHunterDetail(l.id));
    return card;
  }

  /* â”€â”€ Ãcones de contato elegantes â”€â”€ */
  function iconContato(l, ctx) {
    const F = (window.ECOMIM && ECOMIM.foneBR) || null;
    const chunks = [];
    if (l.phone) {
      const telLink = F ? ('tel:+' + (F.normalizar(l.phone) || F.digits(l.phone))) : 'tel:+55' + String(l.phone).replace(/\D/g, '');
      chunks.push(`<a class="ci" title="${F ? esc(F.formatar(l.phone)) : esc(l.phone)}" href="${telLink}"></a>`);
    }
    if (l.whats || l.phone) {
      const wa = F ? F.waLink(l.whats || l.phone) : null;
      if (wa) chunks.push(`<a class="ci ci-wa" title="WhatsApp ${esc(F.formatar(l.whats || l.phone))}" href="${wa}" target="_blank" rel="noopener"></a>`);
    }
    if (l.email) chunks.push(`<a class="ci" title="${esc(l.email)}" href="mailto:${esc(l.email)}"></a>`);
    if (l.instagram) chunks.push(`<a class="ci" title="Instagram" href="https://${esc(l.instagram)}" target="_blank" rel="noopener"></a>`);
    if (l.linkedin) chunks.push(`<a class="ci" title="LinkedIn" href="https://${esc(l.linkedin)}" target="_blank" rel="noopener"></a>`);
    if (l.facebook) chunks.push(`<a class="ci" title="Facebook" href="https://${esc(l.facebook)}" target="_blank" rel="noopener"></a>`);
    if (l.website) chunks.push(`<a class="ci" title="Site" href="${esc(l.website)}" target="_blank" rel="noopener"></a>`);
    return chunks.join('') || `<span class="ci-off">—</span>`;
  }

  /** Linha de um lead capturado (usada na tabela, com ou sem agrupamento). */
  function linhaLead(l) {
    const tr = el('tr', 'hunter-row', '');
    if (U.selecao.has(l.id)) tr.classList.add('selected-row');
    const ver = verificacaoLead(l);
    tr.innerHTML = `
      <td><input type="checkbox" data-sel="${esc(l.id)}" ${U.selecao.has(l.id) ? 'checked' : ''} /></td>
      <td><span class="h-name">${esc(l.name || '—')}${badgeSintetico(l)}</span>
        <div class="h-contatos">${l.lead_type === 'person' ? ' pessoa' : ' empresa'}${l.status === 'na_fila' ? ' · <span class="badge badge-violet">na fila</span>' : ''}</div>
      </td>
      <td><div>${esc(l.profession || '—')}</div><div class="h-contatos">${esc(l.job_title || '')} ${l.company ? '· ' + esc(l.company) : ''}</div></td>
      <td>${esc(l.city || '—')} ${esc(l.state || '')}</td>
      <td class="h-contatos">
        ${l.phone ? `${BadgeTel(l.phone)} ` : ''}
        <div class="nz-ci-row">${iconContato(l)}</div>
        <div class="h-reports">${relatorioHtml(ver)}</div>
      </td>
      <td>
        <div class="score-wrap">
          <div class="score-bar"><div style="width:${Math.min(100, l.score || 0)}%;background:${scoreCor(l.score)}"></div></div>
          <span class="score-num">${l.score || 0}</span>
        </div>
        ${badgeQuality(l.quality)}
      </td>
      <td><span class="hunter-chips">${esc((l.source && l.source.type) || '—')}</span>
        ${(l._enriquecidoDe && l._enriquecidoDe.length) ? `<div class="hunter-note" title="${esc(l._enriquecidoDe.join('; '))}"> enriquecido</div>` : ''}
      </td>
      <td>
        <div class="btn-group">
          <button class="btn btn-xs" data-ver="${esc(l.id)}">Ver</button>
          <button class="btn btn-xs btn-success" data-fila="${esc(l.id)}" ${(l.status === 'na_fila' || !ver.real) ? 'disabled' : ''} title="${ver.real ? 'Enviar para aprovao' : 'Bloqueado: ' + esc(ver.faltando.join(', '))}">Enviar p/ fila</button>
          <button class="btn btn-xs btn-danger" data-del="${esc(l.id)}" title="Excluir lead" aria-label="Excluir lead">${ICONS.lixo}</button>
        </div>
      </td>`;
    return tr;
  }

  /* ------------------------------------------------------------------ *
   * IA INLINE (funciona com motor local — sempre disponível)
   * ------------------------------------------------------------------ */

  function inlineAi(container, btnId, typingLabel, fn) {
    const btn = container.querySelector('#' + btnId);
    if (!btn) return;
    const original = btn.textContent;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = typingLabel + '…';
      try {
        await fn();
      } catch (e) {
        toast('Erro: ' + e.message, 'danger');
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  }

  /** Insight da IA baseado nos dados reais da pesquisa (motor local). */
  function insightPesquisa(res) {
    const box = el('div', 'ai-insight',
      `<div class="ai-insight-head"> Insight da IA</div><span class="ai-mini-typing"><span></span><span></span><span></span></span>`);
    const content = document.querySelector('.ecomim-content');
    if (content) content.insertBefore(box, content.firstChild);
    const embed = (txt) => { box.innerHTML = `<div class="ai-insight-head"> Insight da IA</div><div>${esc(txt).replace(/\n/g, '<br>')}</div>`; };
    const r = res && res.search && res.search.resultados;
    const s = H.resumo();
    if (!r) { embed('A pesquisa terminou sem dados suficientes para analisar. Verifique os parâmetros (cidade, segmento) e tente novamente.'); return; }
    const linhas = [];
    linhas.push(`Pesquisa concluída com **${r.encontrados} lead(s)** novos, **${r.validos} válidos** e **${r.duplicados} duplicado(s)** ignorados.`);
    if (r.erros) linhas.push(` ${r.erros} evento(s) de erro anotado(s) pelas fontes — a pesquisa continuou normalmente.`);
    const tops = H.DB.leads.slice().sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3).filter((l) => l.score >= 60);
    if (tops.length) {
      linhas.push('');
      linhas.push('**Prioridades (maior score):**');
      tops.forEach((l) => linhas.push(`  • ${l.name} — score ${l.score} (${l.profession || l.company || '—'}) ${l.city ? '— ' + l.city : ''}`));
    }
    const comContato = H.DB.leads.filter((l) => l.phone || l.email).length;
    linhas.push('');
    linhas.push(` Base atual do caçador: **${s.total}** lead(s), score médio **${s.scoreMedio}**. ${comContato ? `**${comContato}** com telefone ou e-mail para primeiro contato.` : ''}`);
    linhas.push('Dica: aprove os leads na **Fila de aprovação** e use a IA para sugerir o primeiro follow-up.');
    setTimeout(() => embed(linhas.join('\n')), 600);
  }

  /* ------------------------------------------------------------------ *
   * DETALHE DO LEAD CAÇADO
   * ------------------------------------------------------------------ */

  function openLeadHunterDetail(id) {
    const lead = H.DB.leads.find((l) => l.id === id);
    if (!lead) return;
    const E2 = E();
    const fmt = (v) => esc(v || '—');
    const panel = el('div', 'lead-detail-panel open', '');
    panel.innerHTML = `
      <div class="ldp-header">
        <div style="flex:1">
          <h3>${esc(lead.name || '—')}${badgeSintetico(lead)}</h3>
          <div class="text-muted">${lead.lead_type === 'person' ? '' : ''} ${esc(lead.profession || lead.company || '')}${lead.city ? ' · ' + esc(lead.city) + ' ' + esc(lead.state || '') : ''}</div>
        </div>
        <button class="btn btn-icon" data-close title="Fechar" aria-label="Fechar">${ICONS.fechar}</button>
      </div>
      <div class="ldp-body">
        <div class="ldp-section"><h4>Score</h4>
          <div class="score-wrap" style="max-width:220px">
            <div class="score-bar"><div style="width:${Math.min(100, lead.score || 0)}%;background:${scoreCor(lead.score)}"></div></div>
            <span class="score-num">${lead.score || 0}</span>
          </div>
          <div style="margin-top:6px">${badgeQuality(lead.quality)} ${(lead.scoreItens || []).map((i) => `<span class="mini">+${i}</span>`).join(' ')}</div>
          ${(lead._warnings || []).length ? `<div class="hunter-note" style="color:var(--e-warning);margin-top:4px"> ${esc(lead._warnings.join(' · '))}</div>` : ''}
        </div>
        <div class="ldp-section"><h4>Dados</h4>
          <div class="hlead-grid">
            <div class="hlead-item"><span class="k">Profissão:</span><span>${fmt(lead.profession)}</span></div>
            <div class="hlead-item"><span class="k">Cargo:</span><span>${fmt(lead.job_title)}</span></div>
            <div class="hlead-item"><span class="k">Empresa:</span><span>${fmt(lead.company)}</span></div>
            <div class="hlead-item"><span class="k">Segmento:</span><span>${fmt(lead.segment)}</span></div>
            <div class="hlead-item"><span class="k">Cidade:</span><span>${fmt(lead.city)} ${esc(lead.state || '')}</span></div>
            <div class="hlead-item"><span class="k">Telefone:</span><span>${lead.phone ? BadgeTel(lead.phone) : '—'}</span></div>
            <div class="hlead-item"><span class="k">E-mail:</span><span>${lead.email ? `<a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a>` : '—'}</span></div>
            <div class="hlead-item"><span class="k">Site:</span><span>${lead.website ? `<a href="${esc(lead.website)}" target="_blank" rel="noopener">${esc(lead.website)}</a>` : '—'}</span></div>
            <div class="hlead-item"><span class="k">Instagram:</span><span>${lead.instagram ? `<a href="https://${esc(lead.instagram)}" target="_blank" rel="noopener">${esc(lead.instagram)}</a>` : '—'}</span></div>
            <div class="hlead-item"><span class="k">LinkedIn:</span><span>${lead.linkedin ? `<a href="https://${esc(lead.linkedin)}" target="_blank" rel="noopener">${esc(lead.linkedin)}</a>` : '—'}</span></div>
            <div class="hlead-item"><span class="k">Facebook:</span><span>${lead.facebook ? `<a href="https://${esc(lead.facebook)}" target="_blank" rel="noopener">${esc(lead.facebook)}</a>` : '—'}</span></div>
          </div>
        </div>
        <div class="ldp-section"><h4>Verificação do lead — o que existe e o que falta</h4>
          <div class="h-reports" style="margin-top:4px">${relatorioHtml(verificacaoLead(lead))}</div>
          ${verificacaoLead(lead).real
            ? '<div class="hunter-note" style="color:var(--e-green);margin-top:6px">Este lead tem contato real e pode ir à fila.</div>'
            : '<div class="hunter-note" style="color:var(--e-warning);margin-top:6px">Bloqueado para envio: só entra no sistema o lead com telefone completo ou e-mail válido, e que não seja de demonstração.</div>'}
        </div>
        <div class="ldp-section"><h4>Origem</h4>
          <div class="hlead-item"><span class="k">Fonte:</span><span>${esc((lead.source && lead.source.type) || '—')}</span></div>
          <div class="hlead-item"><span class="k">Encontrado:</span><span>${lead.source && lead.source.found_at ? (E2 ? E2.fmtDateTime(lead.source.found_at) : esc(lead.source.found_at)) : '—'}</span></div>
          <div class="hlead-item"><span class="k">Descrição:</span><span class="text-muted">${fmt(lead.description)}</span></div>
          ${(lead._enriquecidoDe || []).length ? `<div class="hunter-note"> Enriquecido: ${esc(lead._enriquecidoDe.join('; '))}</div>` : ''}
          ${lead._dupDe ? `<div class="hunter-note" style="color:var(--e-warning)">Duplicado de: ${esc(lead._dupDe)}</div>` : ''}
          ${lead.sintetico ? `<div class="hunter-note" style="color:var(--e-warning);margin-top:4px">Contato de demonstração (dado sintético gerado pela pré-coleta). Para enviar ao CRM, registre o consentimento real abaixo — o registro fica auditado e o lead deixa de ser marcado como demo.</div>` : ''}
          ${lead.consentimentoReal ? `<div class="hunter-note" style="color:var(--e-green);margin-top:4px">Consentimento real registrado em ${new Date(lead.updated_at || Date.now()).toLocaleDateString('pt-BR')}.</div>` : ''}
        </div>
        <div class="ldp-section">
          <div class="btn-group" style="flex-wrap:wrap;gap:6px">
            <button class="btn btn-sm btn-success" data-fila> Enviar p/ fila do CRM</button>
            <button class="btn btn-sm" data-csv>â¬‡ Exportar CSV</button>
            <button class="btn btn-sm" data-whats ${lead.phone ? '' : 'disabled'}> WhatsApp</button>
            <button class="btn btn-sm" data-ia> IA: primeiro contato</button>
            <button class="btn btn-sm btn-danger" data-del> Remover</button>
          </div>
          ${lead.sintetico ? `<label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12.5px"><input type="checkbox" id="hlead-consentimento" ${lead.consentimentoReal ? 'checked' : ''} /> Registro de consentimento real para envio ao CRM (LGPD)</label>` : ''}
          <div id="hlead-ia"></div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('[data-close]').addEventListener('click', () => panel.remove());
    panel.querySelector('[data-fila]').addEventListener('click', () => {
      const ver = verificacaoLead(lead);
      if (!ver.real) { toast('Bloqueado: ' + ver.faltando.join(', ') + '. Só entra no sistema lead com informação real.', 'warn'); return; }
      const r = H.enviarParaFila(lead.id);
      if (r.ok) { toast('Na fila de aprovação ', 'success'); panel.remove(); renderCacadorView(); }
      else if (r.code === 'SINTETICO_SEM_CONSENTIMENTO') toast('Contato de demonstração — registre o consentimento real (campo abaixo) antes de enviar ao CRM.', 'warn');
      else toast(r.code === 'DUPLICADO' ? `Já existe (dedup com ${r.origem})` : 'Falha ao enviar', 'warn');
    });
    const consBox = panel.querySelector('#hlead-consentimento');
    if (consBox) consBox.addEventListener('click', () => {
      if (consBox.checked !== !!(lead.consentimentoReal) && consBox.checked) {
        // Registro do consentimento real: gravado no lead e persiste na base do caçador.
        lead.consentimentoReal = true;
        lead.sintetico = false;
        lead.updated_at = H.nowISO ? H.nowISO() : new Date().toISOString();
        H.save();
        toast('Consentimento real registrado — o lead pode ir à fila do CRM.', 'success');
      }
    });
    panel.querySelector('[data-csv]').addEventListener('click', () => H.exportar([lead], 'csv', null));
    panel.querySelector('[data-whats]').addEventListener('click', () => {
      const F = window.ECOMIM && ECOMIM.foneBR;
      const wa = F ? F.waLink(lead.whats || lead.phone) : (lead.phone ? 'https://wa.me/55' + String(lead.phone).replace(/\D/g, '') : null);
      if (!wa) { toast('Número sem DDD válido — complete o contato antes', 'warn'); return; }
      window.open(wa, '_blank');
    });
    panel.querySelector('[data-del]').addEventListener('click', () => {
      H.removerLead(lead.id);
      toast('Removido da base', 'info');
      panel.remove();
      renderCacadorView();
    });
    const iaBtn = panel.querySelector('[data-ia]');
    if (iaBtn) iaBtn.addEventListener('click', async () => {
      const box = panel.querySelector('#hlead-ia');
      box.innerHTML = '<div class="ai-insight"><div class="ai-insight-head"> IA gerando…</div><span class="ai-mini-typing"><span></span><span></span><span></span></span></div>';
      const res = await E2.modules.ia.ask(`Sugira a primeira mensagem de contato para este lead (dados públicos):\nNome: ${lead.name}\nProfissão: ${lead.profession || ''}\nEmpresa: ${lead.company || ''}\nCidade: ${lead.city || ''}\nSegmento: ${lead.segment || ''}\nFonte: ${(lead.source && lead.source.type) || ''}\nSeja cordial, curto e profissional, em português.`, { scope: 'leads' });
      const texto = res && res.resposta;
      box.innerHTML = `<div class="ai-insight"><div class="ai-insight-head"> IA sugere o primeiro contato</div><div>${esc(texto).replace(/\n/g, '<br>')}</div><div class="hunter-note">Copie e revise antes de enviar — você está no comando.</div></div>`;
    });
  }

  function renderCacadorView() {
    renderCacador(document.querySelector('.ecomim-content'), { reexibir: true });
  }

  /* ------------------------------------------------------------------ *
   * EXPORTAÇÃO
   * ------------------------------------------------------------------ */

  /** Modal de exportação com escolha de campos. */
  function openExportModal(leadsAlvo) {
    if (!leadsAlvo.length) { toast('Nada para exportar', 'warn'); return; }
    const modal = el('div', 'modal', `
      <div class="modal-box">
        <h3>â¬‡ Exportar ${leadsAlvo.length} lead(s)</h3>
        <p class="text-muted">Escolha os campos e o formato:</p>
        <div id="exp-campos" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px;margin:10px 0;font-size:12.5px"></div>
        <div class="btn-group">
          <button class="btn btn-primary" data-formato="csv">â¬‡ CSV</button>
          <button class="btn btn-primary" data-formato="json">â¬‡ JSON</button>
          <button class="btn btn-ghost" data-close>Cancelar</button>
        </div>
      </div>
    `);
    const camposBox = modal.querySelector('#exp-campos');
    H.CAMPOS_EXPORT.forEach((c) => {
      const lbl = el('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.value = c.k;
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(' ' + c.label));
      camposBox.appendChild(lbl);
    });
    document.body.appendChild(modal);
    modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
    modal.querySelectorAll('[data-formato]').forEach((b) => b.addEventListener('click', () => {
      const campos = Array.from(camposBox.querySelectorAll('input:checked')).map((x) => x.value);
      if (!campos.length) { toast('Selecione ao menos um campo', 'warn'); return; }
      const r = H.exportar(leadsAlvo, b.dataset.formato, campos);
      if (r.ok) toast(`Exportado ${r.contagem} lead(s) ${b.dataset.formato.toUpperCase()} â¬‡`, 'success');
      modal.remove();
    }));
  }

  /* ------------------------------------------------------------------ *
   * EXPOSIÇÃO
   * ------------------------------------------------------------------ */

  window.__ECOMIM_HUNTER_UI = { renderCacador, openExportModal, openLeadHunterDetail, U };
  window.ECOMIM_APP_HUNTER = { renderCacador, openExportModal, openLeadHunterDetail };
})();