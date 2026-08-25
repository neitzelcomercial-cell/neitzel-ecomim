/* ============================================================================
 * NEITZEL — Expansão Operacional (interface)
 * Views: Planner (dia/semana/mês), Serviços, Produtos, Estoque, Atendimento
 * ========================================================================== */

'use strict';

const NEITZEL_OPS_UI = (() => {
  const O = window.NEITZEL_OPS;
  const E = window.ECOMIM;

  if (!O || !E) {
    return { available: false };
  }

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const toast = (msg, tipo = 'info') => {
    const c = document.getElementById('toast-container');
    if (!c) { alert(msg); return; }
    const t = el('div', `toast toast-${tipo}`, esc(msg));
    c.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 4200);
  };
  const fmtMoney = (cents) => {
    if (cents == null || isNaN(cents)) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };
  const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const parseBRL = (s) => {
    const t = String(s == null ? '' : s).trim();
    if (!t) return 0;
    const clean = t.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\.|$))/g, '').replace(',', '.');
    const n = Number(clean);
    return isNaN(n) || n < 0 ? 0 : n;
  };
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const dtLocal = (dateStr, timeStr) => {
    if (!timeStr) timeStr = '09:00';
    const d = new Date(`${dateStr}T${timeStr}:00`);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  };

  /* ------------------------------------------------------------------ *
   * HELPERS DE MODAL
   * ------------------------------------------------------------------ */
  const openModal = (title, bodyHtml, onSave, saveLabel = 'Salvar') => {
    document.querySelectorAll('.modal').forEach((m) => m.remove());
    const modal = el('div', 'modal', '');
    const box = el('div', 'modal-box', `<h3>${esc(title)}</h3>${bodyHtml}<div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-save>${esc(saveLabel)}</button></div>`);
    modal.appendChild(box);
    document.body.appendChild(modal);
    box.querySelector('[data-close]').addEventListener('click', () => modal.remove());
    box.querySelector('[data-save]').addEventListener('click', () => {
      try { onSave(); } catch (err) { toast('Erro: ' + err.message, 'danger'); }
    });
    return modal;
  };
  const field = (id, label, value = '', type = 'text', extra = '') =>
    `<label for="${id}">${esc(label)}</label><input class="input" id="${id}" type="${type}" value="${esc(value)}" ${extra} style="margin-bottom:10px">`;
  const sel = (id, label, options, selected = '') => {
    const opts = options.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(t)}</option>`).join('');
    return `<label for="${id}">${esc(label)}</label><select class="input" id="${id}" style="margin-bottom:10px">${opts}</select>`;
  };
  /** Re-renderiza a view atual do app (após exclusões/criações). */
  function renderViewAtual() {
    const c = document.querySelector('.ecomim-content');
    if (c && window.ECOMIM_APP && window.ECOMIM_APP.renderView) window.ECOMIM_APP.renderView(c.dataset.view || 'planner');
  }

  /* ------------------------------------------------------------------ *
   * VIEW: PLANNER (dia / semana / mês)
   * ------------------------------------------------------------------ */
  const plannerState = { view: 'mes', base: new Date() };

  function renderPlanner(c) {
    c.innerHTML = ''; // nunca duplica: cada renderização parte do zero
    const s = plannerState;
    const head = el('div', 'page-header', '<h1>Planner</h1><p>Agenda operacional de atendimentos, serviços e compromissos.</p>');
    c.appendChild(head);

    const toolbar = el('div', 'planner-toolbar', '');
    const navPrev = el('button', 'btn btn-sm btn-ghost', '‹ Anterior');
    const navNext = el('button', 'btn btn-sm btn-ghost', 'Próximo ›');
    const lbl = el('div', '', `<b>${esc(labelPeriodo(s))}</b>`);
    const viewBtns = el('div', 'planner-views', `
      <button data-v="dia" class="${s.view === 'dia' ? 'active' : ''}">Dia</button>
      <button data-v="semana" class="${s.view === 'semana' ? 'active' : ''}">Semana</button>
      <button data-v="mes" class="${s.view === 'mes' ? 'active' : ''}">Mês</button>
    `);
    const novoBtn = el('button', 'btn btn-primary btn-sm', 'Novo atendimento');
    novoBtn.addEventListener('click', () => openAtendimentoModal());
    toolbar.append(navPrev, lbl, navNext, viewBtns, novoBtn);
    c.appendChild(toolbar);

    navPrev.addEventListener('click', () => { navigar(-1); reRender(); });
    navNext.addEventListener('click', () => { navigar(1); reRender(); });
    viewBtns.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      s.view = b.dataset.v;
      reRender();
    }));

    if (s.view === 'dia') renderPlannerDia(c);
    else if (s.view === 'semana') renderPlannerSemana(c);
    else renderPlannerMes(c);

    function navigar(dir) {
      if (s.view === 'dia') { s.base.setDate(s.base.getDate() + dir); }
      else if (s.view === 'semana') { s.base.setDate(s.base.getDate() + 7 * dir); }
      else {
        /* MÊS: ancora no dia 1º — evita o clássico 31/mar +1 → 1/mai (pula abril) */
        s.base = new Date(s.base.getFullYear(), s.base.getMonth() + dir, 1);
      }
    }
    function reRender() {
      const content = document.querySelector('.ecomim-content');
      if (content) renderPlanner(content);
    }
  }

  function labelPeriodo(s) {
    const opt = { weekday: 'long', day: '2-digit', month: 'long' };
    const opt2 = { month: 'long', year: 'numeric' };
    if (s.view === 'dia') return s.base.toLocaleDateString('pt-BR', opt);
    if (s.view === 'semana') {
      /* MESMA fórmula do grid: segunda-feira da semana da base (domingo → volta 6) */
      const ini = new Date(s.base); ini.setDate(ini.getDate() - ((ini.getDay() + 6) % 7));
      const fim = new Date(ini); fim.setDate(fim.getDate() + 6);
      return `${ini.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} — ${fim.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    }
    return s.base.toLocaleDateString('pt-BR', opt2);
  }

  function renderPlannerDia(c) {
    const diaBase = new Date(plannerState.base);
    const from = new Date(diaBase); from.setHours(0, 0, 0, 0);
    const to = new Date(diaBase); to.setHours(23, 59, 59, 999);
    const evs = O.atendimentos.between(from, to).sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
    const box = el('div', 'card', `<h4>Agenda do dia — ${esc(diaBase.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }))}</h4>`);
    const list = el('div', 'planner-day-list', '');
    if (!evs.length) list.innerHTML = '<div class="empty">Nenhum atendimento neste dia.</div>';
    evs.forEach((a) => list.appendChild(plannerSlot(a)));
    box.appendChild(list);
    c.appendChild(box);
  }

  function renderPlannerSemana(c) {
    const ini = new Date(plannerState.base);
    ini.setDate(ini.getDate() - ((ini.getDay() + 6) % 7)); // segunda-feira
    const fim = new Date(ini); fim.setDate(fim.getDate() + 6);
    const evs = O.atendimentos.between(ini, fim);
    const hoje = todayISO();
    const grid = el('div', 'planner-week', '');
    for (let i = 0; i < 7; i++) {
      const d = new Date(ini); d.setDate(d.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const isToday = iso === hoje;
      const col = el('div', `planner-day-col${isToday ? ' today' : ''}`, '');
      const dayName = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      col.appendChild(el('div', `planner-day-head${isToday ? ' today' : ''}`, `${esc(capitalize(dayName))} ${d.getDate()}`));
      const doDia = evs.filter((a) => (a.inicio || '').slice(0, 10) === iso);
      if (!doDia.length) col.appendChild(el('div', 'empty', '—'));
      doDia.forEach((a) => {
        const pe = el('div', 'planner-event', '');
        pe.innerHTML = `<span class="pe-time">${esc(fmtTime(a.inicio))}</span><div class="pe-status">${statusChip(a.status)}</div><div>${esc(a.cliente)}</div><div class="text-muted">${esc(a.servicoNome || '')}</div>`;
        pe.addEventListener('click', () => openAtendimentoModal(a));
        col.appendChild(pe);
      });
      grid.appendChild(col);
    }
    c.appendChild(grid);
  }

  function renderPlannerMes(c) {
    const ano = plannerState.base.getFullYear();
    const mes = plannerState.base.getMonth();
    const primeiro = new Date(ano, mes, 1);
    const inicioGrid = new Date(ano, mes, 1 - primeiro.getDay()); // domingo antes
    const hoje = todayISO();
    const evs = O.atendimentos.list();
    const grid = el('div', 'planner-month', '');
    const diasSem = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    diasSem.forEach((d) => grid.appendChild(el('div', 'planner-day-head', d)));
    for (let i = 0; i < 42; i++) {
      const d = new Date(inicioGrid); d.setDate(d.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const other = d.getMonth() !== mes;
      const isToday = iso === hoje;
      const cell = el('div', `planner-mday${other ? ' other' : ''}${isToday ? ' today' : ''}`, '');
      cell.appendChild(el('div', 'pm-n', String(d.getDate())));
      const doDia = evs.filter((a) => (a.inicio || '').slice(0, 10) === iso).slice(0, 3);
      if (doDia.length) {
        const evBox = el('div', 'pm-events', '');
        doDia.forEach((a) => evBox.appendChild(el('div', 'pm-event', `${esc(fmtTime(a.inicio))} ${esc(a.cliente)}`)));
        if (evs.filter((a) => (a.inicio || '').slice(0, 10) === iso).length > 3) evBox.appendChild(el('div', 'pm-event', '+ mais'));
        cell.appendChild(evBox);
      }
      cell.addEventListener('click', () => {
        /* Usa a DATA REAL da célula (células cinzas pertencem a meses vizinhos) */
        plannerState.base = new Date(d);
        plannerState.view = 'dia';
        const content = document.querySelector('.ecomim-content');
        if (content && window.ECOMIM_APP) window.ECOMIM_APP.renderView('planner');
      });
      grid.appendChild(cell);
    }
    c.appendChild(grid);
  }

  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function statusChip(status) {
    const m = { agendado: 'Agendado', confirmado: 'Confirmado', em_andamento: 'Em andamento', concluido: 'Concluído', cancelado: 'Cancelado', nao_compareceu: 'Não compareceu' };
    return `<span class="status-chip status-${esc(status)}">${esc(m[status] || status || '—')}</span>`;
  }

  function plannerSlot(a) {
    const slot = el('div', 'planner-slot', '');
    slot.innerHTML = `
      <div class="ps-time">${esc(fmtTime(a.inicio))} — ${esc(fmtTime(a.fim))}</div>
      <div class="ps-body">
        <div class="ps-title">${esc(a.cliente)}</div>
        <div class="ps-meta">${esc(a.servicoNome || 'Sem serviço')} · ${esc(a.responsavel || '—')}</div>
        <div style="margin-top:6px">${statusChip(a.status)}</div>
      </div>
    `;
    slot.addEventListener('click', () => openAtendimentoModal(a));
    return slot;
  }

  /* ------------------------------------------------------------------ *
   * MODAL: ATENDIMENTO (criar/editar + itens + despesas + finalizar)
   * ------------------------------------------------------------------ */
  function openAtendimentoModal(a) {
    const isEdit = !!a;
    const clientes = (E.modules && E.modules.clientes && E.modules.clientes.list ? E.modules.clientes.list() : []);
    const servicos = O.servicos.ativos();
    const leads = (E.db.get() && E.db.get().leads) || [];

    // option value = ID real do cliente; o texto é só a label. Ao salvar, se o
    // usuário escolheu um cliente do select, o atendimento grava clienteId REAL.
    const cliOptions = clientes.map((c) => [c.id, c.nome]);
    const cliOpts = `<option value="">— Selecione —</option>` + cliOptions.map(([v, t]) => `<option value="${esc(v)}" ${a && a.clienteId === v ? 'selected' : ''}>${esc(t)}</option>`).join('');

    const modal = openModal(isEdit ? 'Editar atendimento' : 'Novo atendimento', `
      <div class="form-grid">
        <div>
          <label>Cliente</label>
          <input class="input" id="at-clinome" value="${esc(a ? a.cliente : '')}" placeholder="Digite o nome do cliente" style="margin-bottom:4px">
          <select class="input" id="at-cli" style="margin-bottom:10px">${cliOpts}</select>
        </div>
        ${field('at-data', 'Data', a ? (a.inicio || '').slice(0, 10) : todayISO(), 'date')}
        ${field('at-hini', 'Início', a ? fmtTime(a.inicio) : '09:00', 'time')}
        ${field('at-hfim', 'Fim', a ? fmtTime(a.fim) : '10:00', 'time')}
        ${sel('at-serv', 'Serviço', servicos.map((s) => [s.id, s.nome]), a ? a.servicoId : '')}
        ${field('at-prec', 'Valor cobrado (R$)', a && a.servicoPreco ? (a.servicoPreco / 100).toFixed(2) : '', 'text', 'placeholder="Preenchido automaticamente"')}
        ${field('at-cust', 'Custo do serviço (R$)', a && a.servicoCusto ? (a.servicoCusto / 100).toFixed(2) : '', 'text')}
        ${field('at-resp', 'Responsável', a ? a.responsavel : '')}
        ${field('at-end', 'Endereço', a ? a.endereco : '')}
      </div>
      <label style="margin-top:6px">Observações</label>
      <textarea class="input" id="at-obs" rows="2">${esc(a ? a.observacoes : '')}</textarea>
    `, () => {
      const nome = (document.getElementById('at-clinome').value || '').trim();
      const data = document.getElementById('at-data').value;
      const hIni = document.getElementById('at-hini').value || '09:00';
      const hFim = document.getElementById('at-hfim').value || '10:00';
      if (!nome) { toast('Informe o cliente.', 'warn'); return; }
      if (!data) { toast('Informe a data.', 'warn'); return; }
      const iniDt = new Date(`${data}T${hIni}:00`);
      const fimDt = new Date(`${data}T${hFim}:00`);
      if (isNaN(iniDt.getTime())) { toast('Data ou hora inicial inválida.', 'warn'); return; }
      if (!(fimDt > iniDt)) { toast('O horário de FIM deve ser DEPOIS do INÍCIO.', 'warn'); return; }
      // Se o usuário selecionou um cliente no select (valor = id real), usa esse id;
      // senão mantém apenas o texto digitado.
      const cliIdSel = document.getElementById('at-cli') ? document.getElementById('at-cli').value : '';
      const serv = servicos.find((s) => s.id === (document.getElementById('at-serv').value || ''));
      const servPreco = parseBRL(document.getElementById('at-prec').value) || (serv ? serv.preco / 100 : 0);
      const servCusto = parseBRL(document.getElementById('at-cust').value) || (serv ? serv.custo / 100 : 0);
      const payload = {
        cliente: nome,
        clienteId: cliIdSel || null,
        inicio: dtLocal(data, hIni),
        fim: dtLocal(data, hFim),
        servicoNome: serv ? serv.nome : '',
        servicoId: serv ? serv.id : null,
        servicoPreco: servPreco,
        servicoCusto: servCusto,
        responsavel: document.getElementById('at-resp').value,
        endereco: document.getElementById('at-end').value,
        observacoes: document.getElementById('at-obs').value,
        itensProdutos: a ? (a.itensProdutos || []) : [],
        despesas: a ? (a.despesas || []) : [],
        pagamentos: a ? (a.pagamentos || []) : [],
      };
      /* Aviso suave de sobreposição de agenda — não bloqueia o salvamento */
      const conflitos = O.atendimentos.list().filter((x) => {
        if (isEdit && a && x.id === a.id) return false;
        if (!['agendado', 'confirmado', 'em_andamento'].includes(x.status)) return false;
        const xi = new Date(x.inicio).getTime(), xf = new Date(x.fim).getTime();
        if (!(iniDt.getTime() < xf && fimDt.getTime() > xi)) return false;
        const mesmoResp = payload.responsavel && x.responsavel === payload.responsavel;
        const mesmoCliente = payload.clienteId && x.clienteId === payload.clienteId;
        return mesmoResp || mesmoCliente;
      });
      if (conflitos.length) toast(`Atenção: sobrepõe "${conflitos[0].cliente}" (${fmtTime(conflitos[0].inicio)}).`, 'warn');
      let r;
      if (isEdit) r = O.atendimentos.update(a.id, payload);
      else r = O.atendimentos.add(payload);
      if (r.ok) {
        toast(isEdit ? 'Atendimento atualizado.' : 'Atendimento agendado.', 'success');
        modal.remove();
        const ativos = document.querySelector('.ecomim-content');
        if (ativos && window.ECOMIM_APP) {
          const v = ativos.dataset.view || 'planner';
          window.ECOMIM_APP.renderView(v);
        }
      } else toast(r.message || 'Não foi possível salvar.', 'danger');
    }, 'Salvar');

    // Auto-preenche preço/custo ao trocar o serviço (só quando o usuário ainda não
    // digitou um valor próprio — não sobrescreve edição manual)
    const selServ = modal.querySelector('#at-serv');
    if (selServ) selServ.addEventListener('change', () => {
      const sv = servicos.find((s) => s.id === selServ.value);
      const prc = modal.querySelector('#at-prec');
      const cust = modal.querySelector('#at-cust');
      if (sv && prc && cust) {
        const precoDigitado = prc.value.trim();
        const custoDigitado = cust.value.trim();
        if (!precoDigitado || precoDigitado === (a && a.servicoPreco ? (a.servicoPreco / 100).toFixed(2) : '')) {
          prc.value = (sv.preco / 100).toFixed(2);
        }
        if (!custoDigitado || custoDigitado === (a && a.servicoCusto ? (a.servicoCusto / 100).toFixed(2) : '')) {
          cust.value = (sv.custo / 100).toFixed(2);
        }
      }
    });

    /* Escolher cliente no select sincroniza o nome (evita id apontando p/ nome antigo) */
    const selCli = modal.querySelector('#at-cli');
    if (selCli) selCli.addEventListener('change', () => {
      const c = clientes.find((x) => x.id === selCli.value);
      const nm = modal.querySelector('#at-clinome');
      if (c && nm && c.nome) nm.value = c.nome;
    });
  }

  /* ------------------------------------------------------------------ *
   * VIEW: SERVIÇOS
   * ------------------------------------------------------------------ */
  function renderServicos(c) {
    const head = el('div', 'page-header', '<h1>Serviços</h1><p>Catálogo de serviços com preço, custo e margem automaticamente calculada.</p><div style="margin-top:8px"><button class="btn btn-primary btn-sm" id="btn-novo-servico">Novo serviço</button></div>');
    c.appendChild(head);
    const list = O.servicos.list();
    const box = el('div', 'card', '');
    if (!list.length) { box.appendChild(el('div', 'empty', 'Nenhum serviço cadastrado. Comece criando o primeiro.')); }
    else {
      const table = el('table', 'table', '<thead><tr><th>Serviço</th><th>Categoria</th><th>Preço</th><th>Custo</th><th>Margem</th><th>Duração</th><th>Status</th><th></th></tr></thead><tbody></tbody>');
      const tb = table.querySelector('tbody');
      list.forEach((s) => {
        const tr = el('tr', '', '');
        tr.innerHTML = `
          <td><b>${esc(s.nome)}</b><div class="text-muted">${esc(s.descricao || '')}</div></td>
          <td>${esc(s.categoria || '—')}</td>
          <td>${fmtMoney(s.preco)}</td>
          <td>${fmtMoney(s.custo)}</td>
          <td><span class="badge ${O.servicos.margem(s) >= 40 ? 'badge-green' : O.servicos.margem(s) >= 15 ? 'badge-orange' : 'badge-red'}">${O.servicos.margem(s)}%</span></td>
          <td>${s.duracaoMin ? s.duracaoMin + ' min' : '—'}</td>
          <td>${s.status === 'inativo' ? '<span class="badge badge-gray">Inativo</span>' : '<span class="badge badge-green">Ativo</span>'}</td>
          <td style="text-align:right"><button class="btn btn-sm btn-ghost" data-edit="${s.id}">Editar</button> <button class="btn btn-sm btn-ghost" data-del="${s.id}" title="Excluir serviço">🗑</button></td>
        `;
        tr.querySelector('[data-edit]').addEventListener('click', () => openServicoModal(s));
        tr.querySelector('[data-del]').addEventListener('click', () => {
          if (!confirm(`Excluir o serviço "${s.nome}"?\nAtendimentos antigos mantêm o nome no histórico. Esta ação não pode ser desfeita.`)) return;
          const r = O.servicos.remove(s.id);
          if (r.ok) { toast('Serviço excluído.', 'success'); renderViewAtual(); }
          else toast(r.message || 'Não foi possível excluir.', 'danger');
        });
        tb.appendChild(tr);
      });
      box.appendChild(table);
    }
    c.appendChild(box);
    const novo = c.querySelector('#btn-novo-servico');
    if (novo) novo.addEventListener('click', () => openServicoModal());
  }

  function openServicoModal(s) {
    const isEdit = !!s;
    openModal(isEdit ? 'Editar serviço' : 'Novo serviço', `
      ${field('sv-nome', 'Nome', s ? s.nome : '')}
      ${field('sv-cat', 'Categoria', s ? s.categoria : '')}
      <div class="form-grid">
        ${field('sv-prec', 'Preço (R$)', s ? (s.preco / 100).toFixed(2) : '', 'text', 'placeholder="0,00"')}
        ${field('sv-cust', 'Custo estimado (R$)', s ? (s.custo / 100).toFixed(2) : '', 'text', 'placeholder="0,00"')}
        ${field('sv-dur', 'Duração (min)', s ? s.duracaoMin : 60, 'number')}
      </div>
      ${sel('sv-status', 'Status', [['ativo', 'Ativo'], ['inativo', 'Inativo']], s ? s.status : 'ativo')}
      <label>Descrição</label><textarea class="input" id="sv-desc" rows="2">${esc(s ? s.descricao : '')}</textarea>
    `, () => {
      const nome = document.getElementById('sv-nome').value.trim();
      if (!nome) { toast('Informe o nome.', 'warn'); return; }
      const payload = { nome, categoria: document.getElementById('sv-cat').value, descricao: document.getElementById('sv-desc').value, preco: parseBRL(document.getElementById('sv-prec').value), custo: parseBRL(document.getElementById('sv-cust').value), duracaoMin: Number(document.getElementById('sv-dur').value) || 0, status: document.getElementById('sv-status').value };
      let r;
      if (isEdit) r = O.servicos.update(s.id, payload);
      else r = O.servicos.add(payload);
      if (r.ok) { toast(isEdit ? 'Serviço atualizado.' : 'Serviço criado.', 'success'); const modal = document.querySelector('.modal'); if (modal) modal.remove(); if (window.ECOMIM_APP) window.ECOMIM_APP.renderView('servicos'); }
      else toast(r.message || 'Erro ao salvar.', 'danger');
    });
  }

  /* ------------------------------------------------------------------ *
   * VIEW: PRODUTOS
   * ------------------------------------------------------------------ */
  function renderProdutos(c) {
    const head = el('div', 'page-header', '<h1>Produtos</h1><p>Catálogo com custo, preço de venda e saldo de estoque.</p><div style="margin-top:8px"><button class="btn btn-primary btn-sm" id="btn-novo-produto">Novo produto</button></div>');
    c.appendChild(head);
    const list = O.produtos.list();
    const box = el('div', 'card', '');
    if (!list.length) { box.appendChild(el('div', 'empty', 'Nenhum produto cadastrado.')); }
    else {
      const table = el('table', 'table', '<thead><tr><th>Produto</th><th>SKU</th><th>Categoria</th><th>Custo</th><th>Preço</th><th>Margem</th><th>Estoque</th><th>Status</th><th></th></tr></thead><tbody></tbody>');
      const tb = table.querySelector('tbody');
      list.forEach((p) => {
        const tr = el('tr', '', '');
        const baixo = p.estoqueMinimo > 0 && p.estoqueAtual < p.estoqueMinimo;
        tr.innerHTML = `
          <td><b>${esc(p.nome)}</b><div class="text-muted">${esc(p.descricao || '')}</div></td>
          <td>${esc(p.sku || '—')}</td>
          <td>${esc(p.categoria || '—')}</td>
          <td>${fmtMoney(p.custo)}</td>
          <td>${fmtMoney(p.preco)}</td>
          <td><span class="badge ${O.produtos.margem(p) >= 40 ? 'badge-green' : O.produtos.margem(p) >= 15 ? 'badge-orange' : 'badge-red'}">${O.produtos.margem(p)}%</span></td>
          <td><div class="stock-mini"><div class="sm-bar"><div style="width:${Math.min(100, (p.estoqueAtual / Math.max(p.estoqueMinimo, 1)) * 100)}%;background:${baixo ? 'var(--e-red)' : 'var(--e-green)'}"></div></div><span class="sm-qty ${baixo ? 'stock-low' : 'stock-ok'}">${p.estoqueAtual} ${esc(p.unidade)}</span></div>${baixo ? '<div class="text-muted" style="font-size:11px;color:var(--e-red)">Abaixo do mínimo (' + p.estoqueMinimo + ')</div>' : ''}</td>
          <td>${p.status === 'inativo' ? '<span class="badge badge-gray">Inativo</span>' : '<span class="badge badge-green">Ativo</span>'}</td>
          <td style="text-align:right"><button class="btn btn-sm btn-ghost" data-edit="${p.id}">Editar</button> <button class="btn btn-sm btn-ghost" data-del="${p.id}" title="Excluir produto">🗑</button></td>
        `;
        tr.querySelector('[data-edit]').addEventListener('click', () => openProdutoModal(p));
        tr.querySelector('[data-del]').addEventListener('click', () => {
          if (!confirm(`Excluir o produto "${p.nome}"?\nO histórico de estoque permanece. Esta ação não pode ser desfeita.`)) return;
          const r = O.produtos.excluir(p.id);
          if (r.ok) { toast('Produto excluído.', 'success'); renderViewAtual(); }
          else toast(r.message || 'Não foi possível excluir.', 'danger');
        });
        tb.appendChild(tr);
      });
      box.appendChild(table);
    }
    c.appendChild(box);
    const novo = c.querySelector('#btn-novo-produto');
    if (novo) novo.addEventListener('click', () => openProdutoModal());
  }

  function openProdutoModal(p) {
    const isEdit = !!p;
    openModal(isEdit ? 'Editar produto' : 'Novo produto', `
      ${field('pd-nome', 'Nome', p ? p.nome : '')}
      <div class="form-grid">
        ${field('pd-sku', 'SKU/Código', p ? p.sku : '')}
        ${field('pd-cat', 'Categoria', p ? p.categoria : '')}
        ${field('pd-forn', 'Fornecedor', p ? p.fornecedor : '')}
        ${field('pd-cust', 'Custo (R$)', p ? (p.custo / 100).toFixed(2) : '', 'text', 'placeholder="0,00"')}
        ${field('pd-prec', 'Preço de venda (R$)', p ? (p.preco / 100).toFixed(2) : '', 'text', 'placeholder="0,00"')}
        ${field('pd-min', 'Estoque mínimo', p ? p.estoqueMinimo : 0, 'number')}
        ${field('pd-un', 'Unidade', p ? p.unidade : 'un')}
      </div>
      ${isEdit ? '' : field('pd-ini', 'Estoque inicial', '0', 'number')}
      ${sel('pd-status', 'Status', [['ativo', 'Ativo'], ['inativo', 'Inativo']], p ? p.status : 'ativo')}
      <label>Descrição</label><textarea class="input" id="pd-desc" rows="2">${esc(p ? p.descricao : '')}</textarea>
    `, () => {
      const nome = document.getElementById('pd-nome').value.trim();
      if (!nome) { toast('Informe o nome.', 'warn'); return; }
      const payload = { nome, sku: document.getElementById('pd-sku').value, categoria: document.getElementById('pd-cat').value, fornecedor: document.getElementById('pd-forn').value, custo: parseBRL(document.getElementById('pd-cust').value), preco: parseBRL(document.getElementById('pd-prec').value), estoqueMinimo: Number(document.getElementById('pd-min').value) || 0, unidade: document.getElementById('pd-un').value, status: document.getElementById('pd-status').value, descricao: document.getElementById('pd-desc').value };
      const ini = document.getElementById('pd-ini');
      if (ini) payload.estoqueAtual = Number(ini.value) || 0;
      let r;
      if (isEdit) r = O.produtos.update(p.id, payload);
      else r = O.produtos.add(payload);
      if (r.ok) { toast(isEdit ? 'Produto atualizado.' : 'Produto criado.', 'success'); const modal = document.querySelector('.modal'); if (modal) modal.remove(); if (window.ECOMIM_APP) window.ECOMIM_APP.renderView('produtos'); }
      else toast(r.message || 'Erro ao salvar.', 'danger');
    });
  }

  /* ------------------------------------------------------------------ *
   * VIEW: ESTOQUE
   * ------------------------------------------------------------------ */
  function renderEstoque(c) {
    const head = el('div', 'page-header', '<h1>Estoque</h1><p>Movimentações, saldos e alertas de reposição.</p>');
    c.appendChild(head);

    // Alertas de estoque baixo
    const baixo = O.produtos.estoqueBaixo();
    if (baixo.length) {
      const alertBox = el('div', 'card', `<h4>Estoque baixo (${baixo.length})</h4>`);
      baixo.forEach((p) => {
        alertBox.appendChild(el('div', '', `<b>${esc(p.nome)}</b> — <span class="stock-low">${p.estoqueAtual} ${esc(p.unidade)} disponível, mínimo ${p.estoqueMinimo}</span>`));
      });
      c.appendChild(alertBox);
    }

    const toolbar = el('div', 'planner-toolbar', '<button class="btn btn-primary btn-sm" id="btn-mov">Registrar movimentação</button><button class="btn btn-sm" id="btn-ajuste">Ajuste de inventário</button>');
    c.appendChild(toolbar);
    const t1 = toolbar.querySelector('#btn-mov');
    if (t1) t1.addEventListener('click', () => openMovModal());
    const t2 = toolbar.querySelector('#btn-ajuste');
    if (t2) t2.addEventListener('click', () => openMovModal('ajuste'));

    // Histórico
    const hist = O.estoque.historico(null, 150);
    const box = el('div', 'card', '<h4>Histórico de movimentações</h4>');
    if (!hist.length) box.appendChild(el('div', 'empty', 'Nenhuma movimentação registrada.'));
    else {
      const table = el('table', 'table', '<thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th>Qtd</th><th>Motivo</th></tr></thead><tbody></tbody>');
      const tb = table.querySelector('tbody');
      const tipoLabel = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste', venda: 'Venda', utilizado_servico: 'Usado em serviço' };
      const tipoBadge = { entrada: 'badge-green', saida: 'badge-red', ajuste: 'badge-orange', venda: 'badge-cyan', utilizado_servico: 'badge-blue' };
      hist.forEach((m) => {
        const tr = el('tr', '', '');
        tr.innerHTML = `<td>${esc(fmtDateTime(m.data))}</td><td><b>${esc(m.produtoNome)}</b></td><td><span class="badge ${tipoBadge[m.tipo] || 'badge-gray'}">${esc(tipoLabel[m.tipo] || m.tipo)}</span></td><td><b>${m.tipo === 'entrada' || m.tipo === 'ajuste' ? '+' : '−'}${m.quantidade}</b></td><td class="text-muted">${esc(m.motivo || '—')}</td>`;
        tb.appendChild(tr);
      });
      box.appendChild(table);
    }
    c.appendChild(box);
  }

  function openMovModal(tipo = 'mov') {
    const prods = O.produtos.ativos();
    if (!prods.length) { toast('Cadastre um produto primeiro.', 'warn'); return; }
    openModal('Registrar movimentação', `
      ${sel('mv-prod', 'Produto', prods.map((p) => [p.id, p.nome + ' (' + p.estoqueAtual + ' ' + p.unidade + ')']), prods[0].id)}
      ${sel('mv-tipo', 'Tipo', [
        ['entrada', 'Entrada (compra/recebimento)'],
        ['saida', 'Saída (venda/descarte)'],
        ['ajuste', 'Ajuste de inventário'],
      ], tipo === 'ajuste' ? 'ajuste' : 'entrada')}
      ${field('mv-qtd', 'Quantidade', '1', 'number', 'min="1"')}
      ${field('mv-motivo', 'Motivo', '')}
    `, () => {
      const prodId = document.getElementById('mv-prod').value;
      const tipo = document.getElementById('mv-tipo').value;
      const qtd = Number(document.getElementById('mv-qtd').value) || 0;
      const motivo = document.getElementById('mv-motivo').value;
      if (qtd <= 0) { toast('Quantidade inválida.', 'warn'); return; }
      const r = O.estoque.registrar({ produtoId: prodId, quantidade: qtd, tipo, motivo });
      if (r.ok) { toast('Movimentação registrada. Saldo: ' + r.saldo, 'success'); const modal = document.querySelector('.modal'); if (modal) modal.remove(); if (window.ECOMIM_APP) window.ECOMIM_APP.renderView('estoque'); }
      else toast(r.message || 'Erro ao registrar.', 'danger');
    });
  }

  /* ------------------------------------------------------------------ *
   * VIEW: ATENDIMENTO OPERACIONAL (lista + finalizar + serviços/produtos)
   * ------------------------------------------------------------------ */
  function renderAtendimentoOps(c) {
    const st = O.atendimentos.stats();
    const head = el('div', 'page-header', '<h1>Atendimento</h1><p>Execução de serviços, uso de produtos e registro financeiro automático.</p><div style="margin-top:8px"><button class="btn btn-primary btn-sm" id="btn-novo-atend">Novo atendimento</button></div>');
    c.appendChild(head);

    const kpis = [
      { label: 'Hoje', valor: st.hoje },
      { label: 'Concluídos (mês)', valor: st.concluidos },
      { label: 'Pendentes', valor: st.pendentes },
    ];
    const grid = el('div', 'kpi-grid', '');
    kpis.forEach((k) => grid.appendChild(el('div', 'card kpi-card kpi-red', `<div class="kpi-value">${k.valor}</div><div class="kpi-label">${esc(k.label)}</div>`)));
    c.appendChild(grid);

    const list = O.atendimentos.list().slice().sort((a, b) => new Date(b.inicio) - new Date(a.inicio));
    const box = el('div', 'card', '<h4>Atendimentos</h4>');
    if (!list.length) box.appendChild(el('div', 'empty', 'Nenhum atendimento registrado.'));
    else {
      const table = el('table', 'table', '<thead><tr><th>Cliente</th><th>Data</th><th>Serviço</th><th>Status</th><th>Receita</th><th></th></tr></thead><tbody></tbody>');
      const tb = table.querySelector('tbody');
      list.slice(0, 80).forEach((a) => {
        const receita = (a.servicoPreco || 0) + (a.itensProdutos || []).reduce((s, it) => s + (it.precoUnitario || 0) * (it.quantidade || 0), 0);
        const tr = el('tr', '', '');
        tr.innerHTML = `
          <td><b>${esc(a.cliente)}</b><div class="text-muted">${esc(a.responsavel || '')}</div></td>
          <td>${esc(fmtDate(a.inicio))} ${esc(fmtTime(a.inicio))}</td>
          <td>${esc(a.servicoNome || '—')}${a.itensProdutos && a.itensProdutos.length ? '<div class="text-muted">+' + a.itensProdutos.length + ' produto(s)</div>' : ''}</td>
          <td>${statusChip(a.status)}</td>
          <td>${receita ? fmtMoney(receita) : '—'}</td>
          <td style="text-align:right"><button class="btn btn-sm" data-open="${a.id}">Abrir</button> <button class="btn btn-sm btn-ghost" data-del-atend="${a.id}" title="Excluir atendimento">🗑</button></td>
        `;
        tr.querySelector('[data-open]').addEventListener('click', () => openAtendimentoDetail(a.id));
        tr.querySelector('[data-del-atend]').addEventListener('click', () => {
          const concluido = a.status === 'concluido';
          if (!confirm(`Excluir o atendimento de "${a.cliente}"?${concluido ? '\n\nAtenção: CONCLUÍDO — lançamentos financeiros NÃO são desfeitos.' : ''}`)) return;
          if (concluido && !confirm('Segunda confirmação: excluir atendimento concluído?')) return;
          const r = O.atendimentos.excluir(a.id, { forcar: true });
          if (r.ok) { toast('Atendimento excluído.', 'info'); renderViewAtual(); }
          else toast(r.message || 'Não foi possível excluir.', 'danger');
        });
        tb.appendChild(tr);
      });
      box.appendChild(table);
    }
    c.appendChild(box);
    const novo = c.querySelector('#btn-novo-atend');
    if (novo) novo.addEventListener('click', () => openAtendimentoModal());
  }

  /* ------------------------------------------------------------------ *
   * DETALHE DO ATENDIMENTO (painel lateral): itens, despesas, finalizar
   * ------------------------------------------------------------------ */
  function openAtendimentoDetail(id) {
    document.querySelectorAll('.lead-detail-panel').forEach((p) => p.remove());
    let a = O.atendimentos.list().find((x) => x.id === id);
    if (!a) return;
    const prods = O.produtos.ativos();
    const panel = el('div', 'lead-detail-panel open', '');
    const render = () => {
      a = O.atendimentos.list().find((x) => x.id === id) || a;
      const receita = (a.servicoPreco || 0) + (a.itensProdutos || []).reduce((s, it) => s + (it.precoUnitario || 0) * (it.quantidade || 0), 0);
      const custo = (a.servicoCusto || 0) + (a.itensProdutos || []).reduce((s, it) => s + (it.custoUnitario || 0) * (it.quantidade || 0), 0);
      const despesas = (a.despesas || []).reduce((s, d) => s + (d.valor || 0), 0);
      const lucro = receita - custo - despesas;
      const itemsHtml = (a.itensProdutos || []).map((it, i) => `
        <div class="ldp-field" style="justify-content:space-between">
          <span>${esc(it.produtoNome)} × ${it.quantidade}</span>
          <span>${fmtMoney((it.precoUnitario || 0) * (it.quantidade || 0))} <button class="btn btn-xs btn-ghost" data-delitem="${i}" ${a.status === 'concluido' ? 'disabled' : ''}>Remover</button></span>
        </div>`).join('') || '<div class="text-muted">Nenhum produto vinculado.</div>';
      const despHtml = (a.despesas || []).map((d, i) => `
        <div class="ldp-field" style="justify-content:space-between">
          <span>${esc(d.descricao || '')} <span class="text-muted">(${esc(d.categoria || '')})</span></span>
          <span>${fmtMoney(d.valor || 0)} <button class="btn btn-xs btn-ghost" data-deldesp="${i}" ${a.status === 'concluido' ? 'disabled' : ''}>Remover</button></span>
        </div>`).join('') || '<div class="text-muted">Nenhuma despesa vinculada.</div>';
      panel.innerHTML = `
        <div class="ldp-header">
          <div style="flex:1">
            <h3>${esc(a.cliente)}</h3>
            <div class="text-muted">${esc(fmtDate(a.inicio))} ${esc(fmtTime(a.inicio))} — ${esc(fmtTime(a.fim))} · ${esc(a.responsavel || '—')}</div>
          </div>
          ${statusChip(a.status)}
          <button class="btn btn-icon" data-close>✕</button>
        </div>
        <div class="ldp-body">
          <div class="ldp-section"><h4>Resumo financeiro</h4>
            <div class="atend-resumo">
              <div class="ar-item"><div class="ar-label">Receita</div><div class="ar-val ar-positivo">${fmtMoney(receita)}</div></div>
              <div class="ar-item"><div class="ar-label">Custo</div><div class="ar-val ar-negativo">${fmtMoney(custo)}</div></div>
              <div class="ar-item"><div class="ar-label">Despesas</div><div class="ar-val ar-negativo">${fmtMoney(despesas)}</div></div>
              <div class="ar-item"><div class="ar-label">Lucro líquido</div><div class="ar-val ${lucro >= 0 ? 'ar-positivo' : 'ar-negativo'}">${fmtMoney(lucro)}</div></div>
            </div>
          </div>
          <div class="ldp-section"><h4>Serviço</h4>
            <div class="ldp-field"><span class="k">Serviço:</span><span>${esc(a.servicoNome || '—')}</span></div>
            <div class="ldp-field"><span class="k">Valor:</span><span>${fmtMoney(a.servicoPreco || 0)}</span></div>
            ${a.status !== 'concluido' ? '<div class="btn-group" style="margin-top:6px"><button class="btn btn-sm" data-addprod>Adicionar produto</button></div>' : ''}
          </div>
          <div class="ldp-section"><h4>Produtos utilizados</h4>${itemsHtml}</div>
          <div class="ldp-section"><h4>Despesas do atendimento</h4>${despHtml}
            ${a.status !== 'concluido' ? '<div class="btn-group" style="margin-top:6px"><button class="btn btn-sm" data-adddesp>Registrar despesa</button></div>' : ''}
          </div>
          <div class="ldp-section"><h4>Ações</h4>
            <div class="btn-group">
              ${a.status === 'agendado' ? '<button class="btn btn-sm" data-status="confirmado">Confirmar</button>' : ''}
              ${a.status === 'confirmado' ? '<button class="btn btn-sm" data-status="agendado">Desconfirmar</button>' : ''}
              ${a.status !== 'concluido' ? `<button class="btn btn-sm btn-success" data-finalizar>Finalizar atendimento</button>` : ''}
              ${a.status === 'agendado' || a.status === 'confirmado' ? '<button class="btn btn-sm" data-status="em_andamento">Iniciar</button>' : ''}
              ${!['cancelado', 'concluido', 'nao_compareceu'].includes(a.status) ? '<button class="btn btn-sm btn-ghost" data-status="nao_compareceu">Não compareceu</button>' : ''}
              ${a.status !== 'cancelado' ? '<button class="btn btn-sm btn-ghost" data-status="cancelado">Cancelar</button>' : ''}
              ${['concluido', 'cancelado', 'nao_compareceu'].includes(a.status) ? '<button class="btn btn-sm btn-ghost" data-status="agendado">Reagendar</button>' : ''}
              <button class="btn btn-sm btn-ghost" data-editar>Editar</button>
              <button class="btn btn-sm btn-danger" data-excluir>Excluir</button>
            </div>
          </div>
        </div>
      `;
      // Bind
      panel.querySelector('[data-close]').addEventListener('click', () => panel.remove());
      const ed = panel.querySelector('[data-editar]');
      if (ed) ed.addEventListener('click', () => { panel.remove(); openAtendimentoModal(a); });
      const fin = panel.querySelector('[data-finalizar]');
      if (fin) fin.addEventListener('click', () => {
        if (!confirm('Finalizar este atendimento? O estoque será baixado e os valores virarão receitas e custos.')) return;
        const r = O.atendimentos.finalizar(id);
        if (r.ok) { toast('Atendimento finalizado. Receita de ' + fmtMoney(r.receita) + ' registrada.', 'success'); render(); }
        else toast(r.message || 'Não foi possível finalizar.', 'danger');
      });
      const ex = panel.querySelector('[data-excluir]');
      if (ex) ex.addEventListener('click', () => {
        const concluido = a.status === 'concluido';
        if (!confirm(`Excluir o atendimento de "${a.cliente}"?${concluido ? '\n\nAtenção: ele já está CONCLUÍDO — lançamentos financeiros feitos NÃO serão desfeitos.' : ''}`)) return;
        if (!confirm('Confirma pela segunda vez a exclusão deste atendimento?')) return;
        const r = O.atendimentos.excluir(id, { forcar: true });
        if (r.ok) { toast('Atendimento excluído.', 'info'); panel.remove(); renderViewAtual(); }
        else toast(r.message || 'Não foi possível excluir.', 'danger');
      });
      const ap = panel.querySelector('[data-addprod]');
      if (ap) ap.addEventListener('click', () => {
        document.querySelectorAll('.modal').forEach((m) => m.remove());
        const modal = el('div', 'modal', '');
        const box = el('div', 'modal-box', `
          <h3>Adicionar produto</h3>
          ${sel('ip-prod', 'Produto', prods.map((p) => [p.id, p.nome + ' (' + p.estoqueAtual + ' ' + p.unidade + ')']), prods[0] ? prods[0].id : '')}
          <div class="form-grid">
            ${field('ip-qtd', 'Quantidade', '1', 'number', 'min="1"')}
            ${field('ip-prec', 'Preço unitário (R$)', prods[0] ? (prods[0].preco / 100).toFixed(2) : '', 'text')}
            ${field('ip-cust', 'Custo unitário (R$)', prods[0] ? (prods[0].custo / 100).toFixed(2) : '', 'text')}
          </div>
          <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Adicionar</button></div>
        `);
        modal.appendChild(box);
        document.body.appendChild(modal);
        const prodSel = box.querySelector('#ip-prod');
        if (prodSel) prodSel.addEventListener('change', () => {
          const p = prods.find((x) => x.id === prodSel.value);
          if (p) { box.querySelector('#ip-prec').value = (p.preco / 100).toFixed(2); box.querySelector('#ip-cust').value = (p.custo / 100).toFixed(2); }
        });
        box.querySelector('[data-close]').addEventListener('click', () => modal.remove());
        box.querySelector('[data-ok]').addEventListener('click', () => {
          const p = prods.find((x) => x.id === (box.querySelector('#ip-prod') || {}).value);
          if (!p) { toast('Selecione um produto.', 'warn'); return; }
          const qtd = Number(box.querySelector('#ip-qtd').value) || 0;
          if (qtd <= 0) { toast('Quantidade inválida.', 'warn'); return; }
          const itens = (a.itensProdutos || []).concat([{ produtoId: p.id, produtoNome: p.nome, quantidade: qtd, precoUnitario: parseBRL(box.querySelector('#ip-prec').value), custoUnitario: parseBRL(box.querySelector('#ip-cust').value) }]);
          O.atendimentos.update(id, { itensProdutos: itens });
          modal.remove();
          toast('Produto adicionado.', 'success');
          render();
        });
      });
      const ad = panel.querySelector('[data-adddesp]');
      if (ad) ad.addEventListener('click', () => {
        document.querySelectorAll('.modal').forEach((m) => m.remove());
        const modal = el('div', 'modal', '');
        const box = el('div', 'modal-box', `
          <h3>Registrar despesa</h3>
          ${field('dp-desc', 'Descrição', '')}
          <div class="form-grid">
            ${field('dp-valor', 'Valor (R$)', '', 'text', 'placeholder="0,00"')}
            ${sel('dp-cat', 'Categoria', [['gasolina', 'Gasolina'], ['frete', 'Frete'], ['alimentacao', 'Alimentação'], ['materiais', 'Materiais'], ['ferramentas', 'Ferramentas'], ['funcionarios', 'Funcionários'], ['marketing', 'Marketing'], ['taxas', 'Taxas'], ['aluguel', 'Aluguel'], ['outros', 'Outros']], 'outros')}
          </div>
          <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Registrar</button></div>
        `);
        modal.appendChild(box);
        document.body.appendChild(modal);
        box.querySelector('[data-close]').addEventListener('click', () => modal.remove());
        box.querySelector('[data-ok]').addEventListener('click', () => {
          const desc = box.querySelector('#dp-desc').value.trim();
          const valor = parseBRL(box.querySelector('#dp-valor').value);
          if (!desc || valor <= 0) { toast('Informe descrição e valor.', 'warn'); return; }
          const desps = (a.despesas || []).concat([{ descricao: desc, valor, categoria: box.querySelector('#dp-cat').value }]);
          O.atendimentos.update(id, { despesas: desps });
          modal.remove();
          toast('Despesa registrada.', 'success');
          render();
        });
      });
      const stBtns = panel.querySelectorAll('[data-status]');
      stBtns.forEach((b) => b.addEventListener('click', () => {
        const st = b.dataset.status;
        if (st === 'cancelado' && !confirm('Cancelar este atendimento?')) return;
        if (st === 'nao_compareceu' && !confirm('Marcar como não compareceu?')) return;
        if (st === 'agendado' && ['concluido', 'cancelado', 'nao_compareceu'].includes(a.status) && !confirm('Reagendar este atendimento?')) return;
        O.atendimentos.update(id, { status: st });
        toast('Status atualizado.', 'success');
        render();
      }));
      const di = panel.querySelectorAll('[data-delitem]');
      di.forEach((b) => b.addEventListener('click', () => {
        const itens = (a.itensProdutos || []).filter((_, i) => i !== Number(b.dataset.delitem));
        O.atendimentos.update(id, { itensProdutos: itens });
        render();
      }));
      const dd = panel.querySelectorAll('[data-deldesp]');
      dd.forEach((b) => b.addEventListener('click', () => {
        const desps = (a.despesas || []).filter((_, i) => i !== Number(b.dataset.deldesp));
        O.atendimentos.update(id, { despesas: desps });
        render();
      }));
    };
    render();
    document.body.appendChild(panel);
  }

  const fmtDateTime = (iso) => `${fmtDate(iso)} ${fmtTime(iso)}`;

  return { renderPlanner, renderServicos, renderProdutos, renderEstoque, renderAtendimentoOps, openAtendimentoDetail, available: true };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { NEITZEL_OPS_UI };
if (typeof window !== 'undefined') window.NEITZEL_OPS_UI = NEITZEL_OPS_UI;