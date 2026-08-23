/* ============================================================================
 * NEITZEL — Acessor ECOMIM via WhatsApp
 * Configuração e cadastro do Acessor: status da conexão, usuário vinculado,
 * permissões (níveis 1–4), histórico de interações, ações executadas,
 * simulação local honesta (sem fachada: a integração real exige Meta Cloud API).
 * ========================================================================== */

'use strict';

const NEITZEL_ACESSOR = (() => {
  const E = window.ECOMIM;
  const KEY = 'neitzel_acessor_v1';

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
    if (!c) return;
    const t = el('div', `toast toast-${tipo}`, esc(msg));
    c.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 4200);
  };
  const fmtDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  /* ------------------------------------------------------------------ *
   * ESTADO (persistente)
   * ------------------------------------------------------------------ */
  const DEFAULT_STATE = () => ({ ativo: false, numero: '', nome: '', perfil: 'proprietario', nivelPadrao: 2, historico: [], permissoes: DEFAULT_PERMISSOES(), consentimentoAcessor: false });

  const state = {
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const p = JSON.parse(raw);
          // Merge defensivo com os defaults: estado antigo (sem `permissoes`/`nivelPadrao`)
          // não pode crashar o render (antes, `st.permissoes.forEach` lançava TypeError).
          const base = DEFAULT_STATE();
          if (Array.isArray(p.permissoes)) base.permissoes = p.permissoes;
          if (Array.isArray(p.historico)) base.historico = p.historico;
          base.ativo = p.ativo;
          base.numero = p.numero || '';
          base.nome = p.nome || '';
          base.perfil = p.perfil || 'proprietario';
          if (p.nivelPadrao != null) base.nivelPadrao = Number(p.nivelPadrao) || 2;
          base.consentimentoAcessor = !!p.consentimentoAcessor;
          return base;
        }
      } catch (e) { /* ignore */ }
      return DEFAULT_STATE();
    },
    save(s) {
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
    },
  };

  function DEFAULT_PERMISSOES() {
    return [
      { acao: 'Consultar leads', tool: 'buscar_leads', nivel: 1, automatico: true },
      { acao: 'Consultar clientes', tool: 'buscar_clientes', nivel: 1, automatico: true },
      { acao: 'Consultar financeiro', tool: 'consultar_vendas', nivel: 1, automatico: true },
      { acao: 'Consultar agenda', tool: 'consultar_dashboard', nivel: 1, automatico: true },
      { acao: 'Criar lead', tool: 'criar_lead', nivel: 2, automatico: true },
      { acao: 'Criar tarefa', tool: 'criar_tarefa', nivel: 2, automatico: true },
      { acao: 'Alterar status de lead', tool: 'alterar_status_lead', nivel: 2, automatico: true },
      { acao: 'Registrar interação', tool: 'registrar_interacao', nivel: 2, automatico: true },
      { acao: 'Enviar mensagem a cliente', tool: 'enviar_mensagem', nivel: 3, automatico: false, requerConfirmacao: true },
      { acao: 'Excluir registros', tool: 'excluir_registro', nivel: 4, automatico: false, requerConfirmacao: true },
      { acao: 'Alterar configurações', tool: 'alterar_configuracao', nivel: 4, automatico: false, requerConfirmacao: true },
      { acao: 'Ações financeiras', tool: 'acao_financeira', nivel: 4, automatico: false, requerConfirmacao: true },
    ];
  }

  let st = state.load();

  const save = () => state.save(st);

  /* ------------------------------------------------------------------ *
   * REGISTRO DE INTERAÇÃO (auditoria do Acessor)
   * ------------------------------------------------------------------ */
  const registrarInteracao = (tipo, descricao, resultado, extra) => {
    st.historico.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: new Date().toISOString(),
      tipo, descricao, resultado: resultado || 'ok', extra: extra || null,
    });
    if (st.historico.length > 300) st.historico.length = 300;
    save();
    if (E && E.audit && E.audit.record) {
      try { E.audit.record('acessor.' + (resultado === 'erro' ? 'erro' : 'acao'), 'acessor', null, { tipo, descricao, resultado }); } catch (e) { /* ignore */ }
    }
  };

  /* ------------------------------------------------------------------ *
   * SIMULAÇÃO HONESTA — testes locais sem Meta Cloud API
   * ------------------------------------------------------------------ */
  const simularMensagem = (texto) => {
    const t = String(texto || '').trim();
    if (!t) return;
    const lower = t.toLowerCase();
    let resposta = '';
    let acao = 'consulta';

    if (lower.includes('lead')) {
      const n = (E.db.get() && E.db.get().leads) ? E.db.get().leads.length : 0;
      resposta = `Você possui ${n} lead(s) no funil. Posso listar ou criar um novo.`;
      if (lower.includes('criar') || lower.includes('cadastr')) {
        if (st.nivelPadrao >= 2) {
          // Remove comandos (criar/cadastre/cadastrar) e o rótulo "lead:"/"lead "
          const corpo = t
            .replace(/\blead\b:?/gi, '')
            .replace(/\b(criar|cadastr[aeis]{0,3})\b/gi, '')
            .replace(/\s+/g, ' ').trim();
          const partes = corpo.split(',').map((x) => x.trim());
          const nome = partes[0] || '';
          const empresa = partes[1] || '';
          if (nome) {
            const r = E.modules.leads.addToQueue({ nome, empresa, origem: 'acessor_whatsapp', consentimento: !!st.consentimentoAcessor });
            if (r.ok) { resposta = `Lead encaminhado para a fila de aprovação: ${nome}${empresa ? ' (' + empresa + ')' : ''}.`; acao = 'criar_lead'; registrarInteracao('Ação', `Criar lead: ${nome}${empresa ? ', ' + empresa : ''}`, 'ok'); }
            else if (r.code === 'DUPLICADO_FILA' || r.code === 'DUPLICADO') { resposta = `Lead duplicado: já existe um registro com esses dados.`; acao = 'duplicado'; registrarInteracao('Ação', `Criar lead: ${nome}`, 'duplicado'); }
            else resposta = 'Não foi possível criar o lead. Verifique os dados e tente novamente.';
          } else resposta = 'Informe o nome do lead. Ex.: "Criar lead: Maria Silva, Pizzaria X".';
        } else resposta = 'Seu perfil não tem permissão para criar leads (nível 2 necessário).';
      }
    } else if (lower.includes('cliente')) {
      const n = (E.modules.clientes && E.modules.clientes.list ? E.modules.clientes.list().length : 0);
      resposta = `Você possui ${n} cliente(s) cadastrados.`;
    } else if (lower.includes('venda') || lower.includes('faturamento') || lower.includes('receita')) {
      const s = E.modules.financeiro.saldo();
      resposta = `Contas a receber: ${E.fmtMoney(s.aReceber)} · Recebido: ${E.fmtMoney(s.recebido)} · Saldo previsto: ${E.fmtMoney(s.saldo)}.`;
    } else if (lower.includes('tarefa')) {
      const p = E.modules.tarefas.pendentes();
      resposta = `Você tem ${p.length} tarefa(s) pendente(s).`;
    } else if (lower.includes('hoje') || lower.includes('dia')) {
      const a = (window.NEITZEL_OPS && window.NEITZEL_OPS.atendimentos ? window.NEITZEL_OPS.atendimentos.hoje() : []);
      resposta = `Você tem ${a.length} atendimento(s) hoje. Priorize a agenda do dia.`;
    } else if (lower.includes('lucro')) {
      const f = E.modules.financeiro.saldo();
      resposta = `Recebido: ${E.fmtMoney(f.recebido)} · Pago: ${E.fmtMoney(f.pago)} · Diferença: ${E.fmtMoney(f.recebido - f.pago)}. O lucro com custos/despesas é calculado no módulo Financeiro.`;
    } else if (lower.includes('oi') || lower.includes('olá') || lower.includes('ola') || lower.includes('bom dia') || lower.includes('boa tarde') || lower.includes('boa noite')) {
      resposta = `Olá, ${st.nome || 'Daniel'}! O Acessor está ouvindo. Posso consultar leads, clientes, vendas, tarefas e agenda — ou executar ações autorizadas.`;
    } else if (lower.includes('ajuda') || lower.includes('help') || lower.includes('o que')) {
      resposta = 'Posso: consultar leads, clientes, tarefas, vendas e agenda; criar leads e tarefas; alterar status. Para ações externas (enviar mensagens) ou críticas (excluir, financeiro), sempre peço confirmação.';
    } else {
      resposta = 'Entendi sua mensagem, mas ainda não tenho uma resposta automática para isso. Na integração real (Meta Cloud API), o assistente de IA interpretaria e responderia com precisão.';
    }

    registrarInteracao('Mensagem', t.slice(0, 120), 'ok', { acao, resposta: resposta.slice(0, 200) });
    return resposta;
  };

  /* ------------------------------------------------------------------ *
   * VIEW: ACESSOR (interface de administração)
   * ------------------------------------------------------------------ */
  function renderAcessor(c) {
    st = state.load();
    c.appendChild(el('div', 'page-header', '<h1>Acessor ECOMIM</h1><p>Operador inteligente via WhatsApp — configuração, permissões e monitoramento.</p>'));

    // Status
    const statuses = el('div', 'acessor-status', '');
    const stCard = (label, valor, cls) => el('div', 'as-card', `<span>${esc(label)}</span><b class="${cls || ''}">${esc(valor)}</b>`);
    statuses.appendChild(stCard('Status da conexão', st.ativo ? 'Ativo' : 'Desativado', st.ativo ? 'ar-positivo' : 'ar-negativo'));
    statuses.appendChild(stCard('WhatsApp vinculado', st.numero || 'Não configurado'));
    statuses.appendChild(stCard('Usuário', st.nome || '—'));
    statuses.appendChild(stCard('Perfil', st.perfil || 'proprietario'));
    statuses.appendChild(stCard('Nível padrão', 'Nível ' + (st.nivelPadrao || 2)));
    statuses.appendChild(stCard('Interações', String(st.historico.length)));
    c.appendChild(statuses);

    // Aviso honesto de integração
    const aviso = el('div', 'card', `<h4>Integração com WhatsApp</h4><p class="text-muted">A conexão real com o WhatsApp exige a <b>Meta Cloud API</b> (WABA aprovada, número verificado, token e webhook). Até que essas credenciais existam, o Acessor opera em <b>modo de teste local</b>: as mensagens são interpretadas pelo motor local e o histórico fica registrado — nada é enviado de verdade.</p>`);
    c.appendChild(aviso);

    // Formulário de cadastro
    const form = el('div', 'card', '<h4>Cadastro do Acessor</h4>');
    const fg = el('div', 'form-grid', '');
    const mk = (id, label, value, ph = '') => `<label for="${id}">${esc(label)}</label><input class="input" id="${id}" value="${esc(value || '')}" placeholder="${esc(ph)}" style="margin-bottom:6px">`;
    fg.innerHTML = `
      <div>${mk('ac-num', 'Número de WhatsApp (DDD + número)', st.numero, 'Ex.: 47 99999-9999')}<div class="text-muted" style="font-size:11px">Este número será o único autorizado a operar o Acessor.</div></div>
      <div>${mk('ac-nome', 'Nome de exibição', st.nome, 'Ex.: Daniel')}</div>
      <div>
        <label>Perfil de acesso</label>
        <select class="input" id="ac-perfil" style="margin-bottom:6px">
          <option value="proprietario" ${st.perfil === 'proprietario' ? 'selected' : ''}>Proprietário</option>
          <option value="gerente" ${st.perfil === 'gerente' ? 'selected' : ''}>Gerente</option>
          <option value="vendedor" ${st.perfil === 'vendedor' ? 'selected' : ''}>Vendedor</option>
        </select>
      </div>
      <div>
        <label>Nível padrão de permissão</label>
        <select class="input" id="ac-nivel" style="margin-bottom:6px">
          <option value="1" ${st.nivelPadrao === 1 ? 'selected' : ''}>Nível 1 — Somente consultas</option>
          <option value="2" ${st.nivelPadrao === 2 ? 'selected' : ''}>Nível 2 — Ações reversíveis</option>
          <option value="3" ${st.nivelPadrao === 3 ? 'selected' : ''}>Nível 3 — Ações externas (com confirmação)</option>
          <option value="4" ${st.nivelPadrao === 4 ? 'selected' : ''}>Nível 4 — Ações críticas (confirmação explícita)</option>
        </select>
      </div>
    `;
    form.appendChild(fg);
    const btnAtivar = el('button', 'btn btn-primary', st.ativo ? 'Salvar alterações' : 'Ativar Acessor');
    btnAtivar.addEventListener('click', () => {
      const num = document.getElementById('ac-num').value.trim();
      if (!num) { toast('Informe o número de WhatsApp.', 'warn'); return; }
      st.numero = num;
      st.nome = document.getElementById('ac-nome').value.trim() || 'Operador';
      st.perfil = document.getElementById('ac-perfil').value;
      st.nivelPadrao = Number(document.getElementById('ac-nivel').value) || 2;
      st.ativo = true;
      save();
      registrarInteracao('Configuração', 'Acessor atualizado: ' + st.nome + ' (' + st.numero + ')', 'ok');
      toast('Acessor salvo e ativado.', 'success');
      if (window.ECOMIM_APP) window.ECOMIM_APP.renderView('acessor');
    });
    const btnDesat = el('button', 'btn btn-danger btn-ghost', 'Desativar');
    btnDesat.addEventListener('click', () => {
      if (!confirm('Desativar o Acessor? As interações param de ser registradas.')) return;
      st.ativo = false;
      save();
      registrarInteracao('Configuração', 'Acessor desativado', 'ok');
      toast('Acessor desativado.', 'warn');
      if (window.ECOMIM_APP) window.ECOMIM_APP.renderView('acessor');
    });
    const btns = el('div', 'btn-group', '');
    btns.appendChild(btnAtivar);
    btns.appendChild(btnDesat);
    form.appendChild(el('div', '', '').appendChild(btns));
    c.appendChild(form);

    // Teste local (simulação honesta)
    const test = el('div', 'card', '<h4>Teste local do Acessor</h4><p class="text-muted" style="margin-bottom:10px">Simule uma conversa para validar a interpretação. Ex.: "Quais leads entraram hoje?", "Criar lead: Maria, Pizzaria X", "Quantas tarefas pendentes?"</p>');
    const tRow = el('div', '', '<input class="input" id="ac-msg" placeholder="Digite a mensagem simulada..." style="margin-bottom:8px">');
    const tBtn = el('button', 'btn btn-sm btn-primary', 'Enviar (simulação)');
    tBtn.addEventListener('click', () => {
      const input = document.getElementById('ac-msg');
      if (!input || !input.value.trim()) return;
      const resp = simularMensagem(input.value);
      const respBox = test.querySelector('#ac-resposta');
      if (respBox) respBox.innerHTML = `<b>Acessor:</b> ${esc(resp)}`;
      input.value = '';
      // re-render histórico
      const content = document.querySelector('.ecomim-content');
      if (content) renderAcessor(content);
    });
    tRow.appendChild(tBtn);
    test.appendChild(tRow);
    test.appendChild(el('div', 'ai-insight', `<div class="ai-insight-head" id="ac-resposta">Aguardando mensagem...</div>`));
    c.appendChild(test);

    // Histórico
    const histCard = el('div', 'card', '<h4>Histórico de interações</h4>');
    if (!st.historico.length) { histCard.appendChild(el('div', 'empty', 'Nenhuma interação registrada.')); }
    else {
      const table = el('table', 'table', '<thead><tr><th>Quando</th><th>Tipo</th><th>Descrição</th><th>Resultado</th></tr></thead><tbody></tbody>');
      const tb = table.querySelector('tbody');
      st.historico.slice(0, 60).forEach((h) => {
        const tr = el('tr', '', '');
        const badge = h.resultado === 'ok' ? 'badge-green' : h.resultado === 'erro' ? 'badge-red' : 'badge-orange';
        tr.innerHTML = `<td>${fmtDateTime(h.ts)}</td><td>${esc(h.tipo)}</td><td>${esc(h.descricao)}</td><td><span class="badge ${badge}">${esc(h.resultado)}</span></td>`;
        tb.appendChild(tr);
      });
      histCard.appendChild(table);
    }
    c.appendChild(histCard);

    // Permissões (matriz)
    const permCard = el('div', 'card', '<h4>Permissões ativas (política em 4 níveis)</h4>');
    const table = el('table', 'table', '<thead><tr><th>Ação</th><th>Tool</th><th>Nível</th><th>Execução</th></tr></thead><tbody></tbody>');
    const tb2 = table.querySelector('tbody');
    st.permissoes.forEach((p) => {
      const tr = el('tr', 'perm-row', '');
      const nivelCls = 'nivel-' + (p.nivel || 2);
      tr.innerHTML = `
        <td><b>${esc(p.acao)}</b></td>
        <td class="text-muted">${esc(p.tool || '—')}</td>
        <td><span class="${nivelCls}">Nível ${p.nivel}</span></td>
        <td>${p.requerConfirmacao ? '<span class="badge badge-orange">Com confirmação</span>' : '<span class="badge badge-green">Automática</span>'}</td>
      `;
      tb2.appendChild(tr);
    });
    permCard.appendChild(table);
    c.appendChild(permCard);
  }

  return { renderAcessor, simularMensagem, registrarInteracao, state, save };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { NEITZEL_ACESSOR };
if (typeof window !== 'undefined') window.NEITZEL_ACESSOR = NEITZEL_ACESSOR;