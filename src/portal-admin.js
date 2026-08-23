/* ============================================================================
 * NEITZEL — PAINEL DO PORTAL DO CLIENTE (view 'portal')
 * Configuração real da agenda: horários, bloqueios, exceções, regras,
 * catálogo visível e agendamentos recebidos. Tudo persistido no BACKEND.
 * ========================================================================== */
'use strict';

(function () {
  const API = window.NEITZEL_API_BASE || '';
  const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const mm = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
  const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  function headers() {
    const t = localStorage.getItem('neitzel_admin_token') || '';
    return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t };
  }
  async function get(rota) {
    try {
      const ctrl = new AbortController();
      const tmo = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(API + rota, { headers: headers(), signal: ctrl.signal });
      clearTimeout(tmo);
      return await r.json();
    } catch (e) { return null; }
  }
  async function send(metodo, rota, body) {
    try {
      const r = await fetch(API + rota, { method: metodo, headers: headers(), body: body ? JSON.stringify(body) : undefined });
      let j = null; try { j = await r.json(); } catch (e) {}
      return { status: r.status, json: j || {} };
    } catch (e) { return { status: 0, json: {} }; }
  }

  /** Card de conexão: mensagens distintas para desenvolvimento e produção. */
  function cardServidor(c) {
    const producao = !!window.NEITZEL_EM_PRODUCAO; // API remota configurada
    const viaArquivo = location.protocol === 'file:';
    c.innerHTML = '';
    if (producao) {
      c.appendChild(el('div', 'card', `
        <h3>Não foi possível conectar ao servidor</h3>
        <p class="text-muted" style="font-size:13px">Verifique sua conexão e tente novamente em instantes.</p>
        <div class="btn-group" style="margin-top:12px"><button class="btn btn-sm btn-primary" id="pt-retry">Tentar novamente</button></div>`));
    } else {
      c.appendChild(el('div', 'card', `
        <h3>${viaArquivo ? 'Você abriu o sistema como arquivo' : 'Servidor local não iniciado'}</h3>
        <p class="text-muted" style="font-size:13px">O Portal do Cliente funciona com o <b>servidor local</b> (fonte única de verdade da agenda).${viaArquivo ? ' Abrir pelo endereço do servidor — nunca pelo arquivo HTML.' : ''}</p>
        <ol style="font-size:13px;line-height:1.9;margin:10px 0 4px 18px">
          <li>Inicie o servidor: <code>node server.js</code></li>
          <li>Abra o sistema em <b>http://localhost:8080/</b></li>
          <li>Voltando aqui, o painel conecta sozinho (token em <code>data/admin-token.txt</code>)</li>
        </ol>
        <div class="btn-group" style="margin-top:12px">
          <button class="btn btn-sm btn-primary" id="pt-cmd">Copiar comando</button>
          <button class="btn btn-sm" id="pt-retry">Tentar conectar novamente</button>
          <button class="btn btn-sm btn-success" id="pt-abrir-direto">Abrir portal mesmo assim</button>
        </div>`));
      const cmd = c.querySelector('#pt-cmd');
      if (cmd) cmd.addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText('node server.js'); toastMsg('Comando copiado.', 'success'); });
      const direto = c.querySelector('#pt-abrir-direto');
      if (direto) direto.addEventListener('click', () => {
        const janela = window.open('http://localhost:8080/agendamento', '_blank');
        if (!janela) location.href = 'http://localhost:8080/agendamento';
      });
    }
    const retry = c.querySelector('#pt-retry');
    if (retry) retry.addEventListener('click', () => render(c));
  }

  function toastMsg(msg, tipo) { if (window.toast) window.toast(msg, tipo || 'info'); }

  /* ------------------------------ render ------------------------------ */
  async function render(c) {
    try {
      await renderInterno(c);
    } catch (e) {
      c.innerHTML = '';
      c.appendChild(el('div', 'card', `
        <h3>Não foi possível abrir o painel do Portal</h3>
        <p class="text-muted" style="font-size:12.5px;font-family:monospace">${esc((e && e.message) || String(e))}</p>
        <button class="btn btn-sm btn-primary" onclick="location.reload()">Recarregar página</button>`));
    }
  }

  async function renderInterno(c) {
    c.innerHTML = '<div class="empty">Carregando portal…</div>';
    const st = await get('/api/admin/config');
    if (!st) { cardServidor(c); return; }
    if (!st.ok) {
      c.innerHTML = '';
      c.appendChild(el('div', 'card', `
        <h3>Token do administrador necessário</h3>
        <p class="text-muted" style="font-size:13px">O painel do Portal fala direto com o backend (fonte única de verdade). Informe o token admin — ele fica em <code>data/admin-token.txt</code> na pasta do sistema.</p>
        <input class="input" id="pt-token" placeholder="Cole aqui o token…" style="max-width:420px">
        <div class="btn-group" style="margin-top:10px"><button class="btn btn-primary btn-sm" id="pt-salvar-token">Conectar</button></div>`));
      c.querySelector('#pt-salvar-token').addEventListener('click', () => {
        localStorage.setItem('neitzel_admin_token', c.querySelector('#pt-token').value.trim());
        render(c);
      });
      return;
    }
    c.innerHTML = '';

    /* ---- cartão status + link ---- */
    const cfg = st.config;
    const viaArquivo = location.protocol === 'file:';
    const link = viaArquivo ? 'http://localhost:8080/agendamento' : (location.origin + '/agendamento');
    const cardTop = el('div', 'card', `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div><h3 style="margin:0">Portal do Cliente</h3>
          <span class="badge ${cfg.portalAtivo ? 'badge-green' : 'badge-red'}">${cfg.portalAtivo ? 'ATIVO' : 'DESATIVADO'}</span></div>
        <button class="btn btn-sm ${cfg.portalAtivo ? 'btn-danger' : 'btn-success'}" id="pt-toggle">${cfg.portalAtivo ? 'Desativar portal' : 'Ativar portal'}</button>
      </div>
      <p class="text-muted" style="font-size:12px;margin-top:10px">Link público para enviar aos clientes (Instagram, WhatsApp, QR Code):</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <code style="background:var(--bg-soft,#f4f4f5);padding:6px 10px;border-radius:8px">${esc(link)}</code>
        <button class="btn btn-sm" id="pt-copiar">Copiar link</button>
        <button class="btn btn-sm btn-success" id="pt-abrir">Abrir portal no navegador</button>
      </div>
      ${(st.links && st.links.rede && st.links.rede.length) ? `
      <p class="text-muted" style="font-size:12px;margin-top:10px">Compartilhar com clientes <b>na mesma rede</b> (Wi-Fi da empresa — celular acessa direto):</p>
      ${st.links.rede.map((l) => '<div style="margin-top:6px"><code style="background:var(--bg-soft,#f4f4f5);padding:5px 9px;border-radius:8px">' + esc(l) + '</code> <button class="btn btn-sm btn-ghost" data-rede="' + esc(l) + '">Copiar</button></div>').join('')}` : ''}`);
    c.appendChild(cardTop);
    cardTop.querySelector('#pt-toggle').addEventListener('click', async () => {
      const r = await send('PUT', '/api/admin/config', { portalAtivo: !cfg.portalAtivo });
      toastMsg(r.json.ok ? 'Portal ' + (!cfg.portalAtivo ? 'ativado' : 'desativado') + '.' : 'Falha', r.json.ok ? 'success' : 'danger');
      render(c);
    });
    cardTop.querySelector('#pt-copiar').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(link); toastMsg('Link copiado.', 'success'); });
    cardTop.querySelector('#pt-abrir').addEventListener('click', () => {
      const janela = window.open(link, '_blank');
      if (!janela) location.href = link; // bloqueador de pop-up: navega na própria aba
    });
    cardTop.querySelectorAll('[data-rede]').forEach((b) => b.addEventListener('click', () => {
      navigator.clipboard && navigator.clipboard.writeText(b.dataset.rede);
      toastMsg('Link de rede copiado.', 'success');
    }));

    c.appendChild(cardGithub());

    /* ---- PRÉVIA AO VIVO: o portal novo, como o cliente vê ---- */
    const previa = el('div', 'card', `
      <h4>Seu portal — ao vivo</h4>
      <p class="text-muted" style="font-size:12px">É exatamente assim que o cliente vê. Tudo que você editar aqui reflete nesta prévia na hora.</p>
      <div class="btn-group" style="margin:10px 0 12px">
        <button class="btn btn-sm btn-success" id="pv-abrir">Abrir portal em nova aba</button>
        <button class="btn btn-sm btn-ghost" id="pv-refresh">Atualizar prévia</button>
      </div>
      <div style="border:1px solid rgba(128,128,128,.3);border-radius:20px;overflow:hidden;height:min(680px,78vh);background:#0e0f13;box-shadow:0 10px 30px rgba(0,0,0,.25)">
        <iframe id="pv-frame" title="Prévia do Portal do Cliente" src="/agendamento?vivo=1" style="width:100%;height:100%;border:none;display:block"></iframe>
      </div>`);
    c.appendChild(previa);
    previa.querySelector('#pv-abrir').addEventListener('click', () => {
      const j = window.open('/agendamento', '_blank'); if (!j) location.href = '/agendamento';
    });
    previa.querySelector('#pv-refresh').addEventListener('click', () => {
      const f = previa.querySelector('#pv-frame');
      f.src = '/agendamento?vivo=' + Date.now();
    });

    /* ---- Gestão avançada (recolhida) ---- */
    function detalhes(titulo, node, aberto) {
      const d = document.createElement('details');
      d.className = 'card';
      d.style.padding = '14px 18px';
      if (aberto) d.open = true;
      const s = document.createElement('summary');
      s.textContent = titulo;
      s.style.cssText = 'cursor:pointer;font-weight:700;font-size:14.5px';
      d.appendChild(s);
      const wrap = document.createElement('div');
      wrap.style.marginTop = '10px';
      wrap.appendChild(node);
      d.appendChild(wrap);
      return d;
    }
    c.appendChild(detalhes('⚙️ Horários de funcionamento', await cardAgenda(st.schedule)));
    c.appendChild(detalhes('🚫 Bloqueios, feriados e horários especiais', cardBloqueios(st)));
    c.appendChild(detalhes('🎚️ Regras de agendamento', await cardConfig(cfg)));
    c.appendChild(detalhes('📦 Catálogo publicado no portal', await cardCatalogo()));
    c.appendChild(detalhes('📋 Agendamentos recebidos', cardAgendamentos()));
  }

  /* ---- Link do GitHub (compartilhável) + publicação ---- */
  function cardGithub() {
    const salvo = (() => { try { return JSON.parse(localStorage.getItem('nz_pub') || '{}'); } catch (e) { return {}; } })();
    const owner = salvo.owner || 'neitzelcomercial-cell';
    const repo = salvo.repo || 'neitzel-ecomim';
    const pasta = salvo.path || 'portal';
    const branch = salvo.branch || 'master';
    const urlGit = `https://${owner}.github.io/${repo}/${pasta}/index.html`;

    const card = el('div', 'card', `
      <h4>Link do GitHub para compartilhar</h4>
      <p class="text-muted" style="font-size:12px">Este é o link que vai para os clientes (Instagram, WhatsApp, QR Code). Ele mostra exatamente o que foi publicado — edite no Portal e clique em <b>Publicar agora</b>.</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <code id="gh-url" style="background:var(--bg-soft,#f4f4f5);padding:6px 10px;border-radius:8px;word-break:break-all">${esc(urlGit)}</code>
        <button class="btn btn-sm" id="gh-copiar">Copiar link</button>
        <button class="btn btn-sm btn-ghost" id="gh-abrir">Abrir</button>
      </div>
      <div class="btn-group" style="margin-top:12px;flex-wrap:wrap">
        <input class="input" id="gh-token" type="password" placeholder="${salvo.temToken ? '✔ token salvo neste dispositivo — pode publicar direto' : 'GitHub token (ghp_…), só na primeira vez'}" style="max-width:340px">
        <button class="btn btn-sm btn-primary" id="gh-publicar">Publicar agora no GitHub</button>
      </div>
      <span class="text-muted" id="gh-status" style="font-size:12px;display:block;margin-top:8px;min-height:16px"></span>`);
    card.querySelector('#gh-copiar').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(urlGit); toastMsg('Link copiado.', 'success'); });
    card.querySelector('#gh-abrir').addEventListener('click', () => {
      const j = window.open(urlGit, '_blank'); if (!j) location.href = urlGit;
    });
    card.querySelector('#gh-publicar').addEventListener('click', async () => {
      const stSpan = card.querySelector('#gh-status');
      const tokenInput = card.querySelector('#gh-token');
      stSpan.textContent = 'Publicando…'; stSpan.style.color = '';
      const r = await send('POST', '/api/admin/publicar-portal', {
        github_token: tokenInput.value.trim() || undefined,
        owner, repo, path: pasta, branch,
        apiUrl: location.origin
      });
      if (r.json.ok) {
        if (tokenInput.value.trim()) localStorage.setItem('nz_pub', JSON.stringify({ owner, repo, path: pasta, branch, temToken: true }));
        else localStorage.setItem('nz_pub', JSON.stringify({ owner, repo, path: pasta, branch, temToken: true }));
        stSpan.style.color = '#22c55e';
        stSpan.innerHTML = `Publicado ✔ — ${esc(r.json.url)}`;
        toastMsg('Portal publicado no GitHub!', 'success');
      } else {
        stSpan.style.color = '#f87171';
        stSpan.textContent = { SEM_TOKEN_GITHUB: 'Cole o GitHub token acima (uma vez) e publique de novo.' }[r.json.code] || ('Falha: ' + (r.json.message || r.json.code));
      }
    });
    return card;
  }

  /* ---- agenda semanal (múltiplos períodos por dia) ---- */
  async function cardAgenda(schedule) {
    const card = el('div', 'card', '<h4>Horários de funcionamento</h4>');
    const linhas = {};
    for (let d = 0; d < 7; d++) {
      linhas[d] = (schedule[d] || []).map((p) => ({ start: p.start, end: p.end }));
    }
    const tabela = document.createElement('div');
    for (let d = 0; d < 7; d++) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid rgba(128,128,128,.15);flex-wrap:wrap';
      row.innerHTML = `<b style="width:90px;font-size:13px">${DIAS[d]}</b><span data-per></span>
        <button class="btn btn-sm btn-ghost" data-add>＋ Período</button>`;
      const perSpan = row.querySelector('[data-per]');
      const pintar = () => {
        perSpan.innerHTML = linhas[d].length
          ? linhas[d].map((p, i) => `<span style="white-space:nowrap;margin-right:8px">
              <input type="time" value="${hhmm(p.start)}" data-i="${i}" data-c="start" step="3600"> –
              <input type="time" value="${hhmm(p.end)}" data-i="${i}" data-c="end" step="3600">
              <button class="btn btn-sm btn-ghost" data-del="${i}">✕</button></span>`).join('')
          : '<span class="text-muted" style="font-size:12px">Fechado</span>';
        perSpan.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', () => {
          linhas[d][Number(inp.dataset.i)][inp.dataset.c] = mm(inp.value);
        }));
        perSpan.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { linhas[d].splice(Number(b.dataset.del), 1); pintar(); }));
      };
      row.querySelector('[data-add]').addEventListener('click', () => {
        if (linhas[d].length >= 4) return toastMsg('Máximo de 4 períodos por dia.', 'warn');
        linhas[d].push({ start: 9 * 60, end: 18 * 60 }); pintar();
      });
      pintar();
      tabela.appendChild(row);
    }
    card.appendChild(tabela);
    const salvar = el('button', 'btn btn-sm btn-primary', 'Salvar horários');
    salvar.style.marginTop = '10px';
    salvar.addEventListener('click', async () => {
      const payload = {};
      for (let d = 0; d < 7; d++) payload[d] = linhas[d].filter((p) => p.end > p.start);
      const r = await send('PUT', '/api/admin/schedule', { schedule: payload });
      toastMsg(r.json.ok ? 'Horários salvos no backend.' : 'Falha ao salvar: ' + (r.json.code || ''), r.json.ok ? 'success' : 'danger');
    });
    card.appendChild(salvar);
    return card;
  }

  /* ---- bloqueios (datas inteiras + horários) e exceções ---- */
  function cardBloqueios(st) {
    const card = el('div', 'card', '<h4>Bloqueios, feriados e horários especiais</h4>');
    const lista = () => `
      <b style="font-size:13px">Datas fechadas</b>
      <div data-lista-datas>${st.blockedDates.map((b) => `<span style="display:inline-flex;gap:6px;align-items:center;margin:4px 8px 4px 0"><code>${b.date}</code> ${esc(b.motivo || '')}<button class="btn btn-sm btn-ghost" data-del-date="${b.id}">✕</button></span>`).join('') || '<span class="text-muted" style="font-size:12px">nenhuma</span>'}</div>
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
        <input class="input" type="date" data-nova-data style="max-width:160px">
        <input class="input" data-motivo-data placeholder="Motivo (feriado, férias…)" style="max-width:200px">
        <button class="btn btn-sm" data-add-data>Bloquear dia</button>
      </div>
      <b style="font-size:13px;display:block;margin-top:14px">Horários bloqueados</b>
      <div data-lista-horas>${st.blockedTimes.map((b) => `<span style="display:inline-flex;gap:6px;align-items:center;margin:4px 8px 4px 0"><code>${b.date} ${hhmm(b.start)}–${hhmm(b.end)}</code> ${esc(b.motivo || '')}<button class="btn btn-sm btn-ghost" data-del-hora="${b.id}">✕</button></span>`).join('') || '<span class="text-muted" style="font-size:12px">nenhum</span>'}</div>
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
        <input class="input" type="date" data-nova-hora-dia style="max-width:160px">
        <input class="input" type="time" data-nova-inicio style="max-width:120px">
        <input class="input" type="time" data-nova-fim style="max-width:120px">
        <input class="input" data-motivo-hora placeholder="Motivo" style="max-width:180px">
        <button class="btn btn-sm" data-add-hora>Bloquear horário</button>
      </div>`;
    const conteudo = document.createElement('div');
    conteudo.innerHTML = lista();
    card.appendChild(conteudo);

    const redesenhar = (novos) => { st.blockedDates = novos.blockedDates || st.blockedDates; st.blockedTimes = novos.blockedTimes || st.blockedTimes; conteudo.innerHTML = lista(); ligar(); };
    function ligar() {
      conteudo.querySelectorAll('[data-del-date]').forEach((b) => b.addEventListener('click', async () => { const r = await send('DELETE', '/api/admin/blockedDates/' + b.dataset.delDate); if (r.json.ok) toastMsg('Dia liberado.', 'success'); recarregar(); }));
      conteudo.querySelectorAll('[data-del-hora]').forEach((b) => b.addEventListener('click', async () => { await send('DELETE', '/api/admin/blockedTimes/' + b.dataset.delHora); toastMsg('Horário liberado.', 'success'); recarregar(); }));
      const addData = conteudo.querySelector('[data-add-data]');
      addData.addEventListener('click', async () => {
        const date = conteudo.querySelector('[data-nova-data]').value;
        if (!date) return toastMsg('Escolha a data.', 'warn');
        const r = await send('POST', '/api/admin/blockedDates', { date, motivo: conteudo.querySelector('[data-motivo-data]').value });
        toastMsg(r.json.ok ? 'Dia bloqueado — portal já reflete.' : 'Falha', r.json.ok ? 'success' : 'danger'); recarregar();
      });
      const addHora = conteudo.querySelector('[data-add-hora]');
      addHora.addEventListener('click', async () => {
        const q = (s) => conteudo.querySelector(s).value;
        if (!q('[data-nova-hora-dia]') || !q('[data-nova-inicio]') || !q('[data-nova-fim]')) return toastMsg('Preencha dia, início e fim.', 'warn');
        const r = await send('POST', '/api/admin/blockedTimes', { date: q('[data-nova-hora-dia]'), start: mm(q('[data-nova-inicio]')), end: mm(q('[data-nova-fim]')), motivo: q('[data-motivo-hora]') });
        toastMsg(r.json.ok ? 'Horário bloqueado.' : 'Falha', r.json.ok ? 'success' : 'danger'); recarregar();
      });
    }
    async function recarregar() { const novo = await get('/api/admin/config'); if (novo.ok) redesenhar(novo); }
    ligar();
    return card;
  }

  /* ---- configurações gerais e regras ---- */
  async function cardConfig(cfg) {
    const card = el('div', 'card', '<h4>Regras de agendamento</h4>');
    const campos = [
      ['empresaNome', 'Nome da empresa'], ['telefone', 'WhatsApp exibido'], ['instagram', 'Instagram'],
      ['slotMin', 'Grade mínima (min)', 'number'], ['antecedenciaMinMinutos', 'Antecedência mínima (min)', 'number'],
      ['janelaDias', 'Janela de agenda (dias)', 'number'], ['holdTtlMinutos', 'Reserva temporária (min)', 'number'],
      ['capacidadePorSlot', 'Capacidade por horário', 'number'], ['cancelarAteHoras', 'Cancelar até (h antes)', 'number'],
    ];
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px';
    campos.forEach(([k, rotulo, tipo]) => {
      const w = document.createElement('div');
      w.innerHTML = `<label style="font-size:12px" class="text-muted">${rotulo}</label><input class="input" type="${tipo || 'text'}" data-k="${k}" value="${esc(cfg[k])}">`;
      grid.appendChild(w);
    });
    card.appendChild(grid);
    const linha2 = document.createElement('div');
    linha2.style.cssText = 'margin-top:10px;display:flex;gap:16px;flex-wrap:wrap';
    linha2.innerHTML = `
      <label style="font-size:13px"><input type="checkbox" data-k="permitirCancelarCliente" ${cfg.permitirCancelarCliente ? 'checked' : ''}> Cliente pode cancelar</label>
      <label style="font-size:13px"><input type="checkbox" data-k="permitirRemarcarCliente" ${cfg.permitirRemarcarCliente ? 'checked' : ''}> Cliente pode remarcar</label>`;
    card.appendChild(linha2);
    const btn = el('button', 'btn btn-sm btn-primary', 'Salvar regras');
    btn.style.marginTop = '10px';
    btn.addEventListener('click', async () => {
      const body = {};
      card.querySelectorAll('[data-k]').forEach((inp) => {
        body[inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : (inp.type === 'number' ? Number(inp.value) : inp.value);
      });
      const r = await send('PUT', '/api/admin/config', body);
      toastMsg(r.json.ok ? 'Regras salvas no backend.' : 'Falha ao salvar.', r.json.ok ? 'success' : 'danger');
    });
    card.appendChild(btn);
    return card;
  }

  /* ---- catálogo: o que o cliente vê no portal ---- */
  async function cardCatalogo() {
    const card = el('div', 'card', '<h4>Serviços e produtos exibidos no portal</h4>');
    const pref = JSON.parse(localStorage.getItem('neitzel_portal_servicos_pref_v1') || '{}');
    const ops = window.NEITZEL_OPS;
    if (!ops) { card.appendChild(el('div', 'empty', 'Catálogo local indisponível.')); return card; }
    const lista = document.createElement('div');
    ops.servicos.list().forEach((s) => {
      const w = document.createElement('label');
      w.style.cssText = 'display:block;font-size:13px;padding:2px 0';
      const vis = pref[s.id] !== false;
      w.innerHTML = `<input type="checkbox" data-sv="${s.id}" ${vis ? 'checked' : ''} ${s.status !== 'ativo' ? 'disabled' : ''}> ${esc(s.nome)} — ${(s.preco / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · ${s.duracaoMin || '?'} min${s.status !== 'ativo' ? ' (inativo)' : ''}`;
      lista.appendChild(w);
    });
    card.appendChild(lista);
    const btn = el('button', 'btn btn-sm btn-primary', 'Publicar catálogo no portal');
    btn.style.marginTop = '10px';
    btn.addEventListener('click', async () => {
      lista.querySelectorAll('[data-sv]').forEach((i) => { pref[i.dataset.sv] = i.checked; });
      localStorage.setItem('neitzel_portal_servicos_pref_v1', JSON.stringify(pref));
      const okPub = await window.NEITZEL_PONTE.publicarCatalogo();
      toastMsg(okPub ? 'Catálogo publicado — portal atualizado na hora.' : 'Falha ao publicar.', okPub ? 'success' : 'danger');
    });
    card.appendChild(btn);
    return card;
  }

  /* ---- agendamentos recebidos do portal ---- */
  function cardAgendamentos() {
    const card = el('div', 'card', '<h4>Agendamentos do portal</h4><p class="text-muted" style="font-size:12px">Fonte: backend (tempo real). Eles entram automaticamente no Planner e no CRM.</p>');
    const box = document.createElement('div');
    card.appendChild(box);
    const STATUS = { confirmed: ['badge-green', 'confirmado'], cancelled: ['badge-red', 'cancelado'], completed: ['badge-gray', 'concluído'], no_show: ['badge-orange', 'não compareceu'] };
    async function carregar() {
      const data = await get('/api/admin/appointments?from=2000-01-01');
      if (!data.ok) { box.innerHTML = '<div class="empty">Sem acesso ao backend.</div>'; return; }
      const lista = data.appointments.slice(0, 30);
      if (!lista.length) { box.innerHTML = '<div class="empty">Nenhum agendamento ainda.</div>'; return; }
      box.innerHTML = '';
      lista.forEach((a) => {
        const [classe, rotulo] = STATUS[a.status] || ['badge-gray', a.status];
        const row = document.createElement('div');
        row.className = 'mm-file';
        row.innerHTML = `<div class="mm-info">
          <span class="badge ${classe}">${rotulo}</span>
          <b style="margin-left:8px">${esc(a.clienteNome)}</b>
          <span class="text-muted" style="font-size:12px"> ${a.date.split('-').reverse().join('/')} · ${hhmm(a.startMin)}–${hhmm(a.endMin)} · ${esc(a.servicoNome)}${a.codigo ? ' · #' + a.codigo : ''}</span>
          ${a.observacoes ? `<div class="text-muted" style="font-size:12px">“${esc(a.observacoes)}”</div>` : ''}
          <div class="btn-group" style="margin-top:6px"></div></div>`;
        const bts = row.querySelector('.btn-group');
        [['cancelled', 'Cancelar'], ['completed', 'Concluir'], ['no_show', 'Faltou'], ['confirmed', 'Reabrir']].forEach(([st, rot]) => {
          if (a.status === st) return;
          const b = el('button', 'btn btn-sm btn-ghost', rot);
          b.addEventListener('click', async () => {
            const r = await send('PATCH', `/api/admin/appointments/${a.id}/status`, { status: st });
            toastMsg(r.json.ok ? 'Atualizado — portal e Planner sincronizam sozinhos.' : 'Transição inválida.', r.json.ok ? 'success' : 'danger');
            carregar();
          });
          bts.appendChild(b);
        });
        box.appendChild(row);
      });
    }
    carregar();
    return card;
  }

  window.NEITZEL_PORTAL_ADMIN = { render };
})();
