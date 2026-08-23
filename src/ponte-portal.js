/* ============================================================================
 * NEITZEL — PONTE PORTAL ⇄ SISTEMA (fonte única de verdade = backend)
 * - Puxa agendamentos confirmados do backend para o Planner (localStorage)
 * - Replica clientes novos do portal para o CRM (ecomim_clientes)
 * - Escuta /api/events (SSE) e reage em tempo real
 * ========================================================================== */
'use strict';

(function () {
  const API = window.NEITZEL_API_BASE || ''; // mesmo origin
  const LS_ATD = 'neitzel_atendimentos_v1';
  const LS_CLI = 'ecomim_clientes';
  const LS_MARCA = 'neitzel_ponte_marcador_v1';

  const lsGet = (k, f) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : f; } catch (e) { return f; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  let tokenAdmin = '';
  function adminHeaders() {
    tokenAdmin = tokenAdmin || localStorage.getItem('neitzel_admin_token') || '';
    return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokenAdmin };
  }

  /* ---------------- agendamentos backend → Planner ---------------- */
  async function sincronizarAgendamentos() {
    try {
      const r = await fetch(API + '/api/admin/appointments?from=2000-01-01', { headers: adminHeaders() });
      if (!r.ok) return;
      const data = await r.json();
      if (!data.ok) return;
      const portal = data.appointments.filter((a) => a.origem === 'PORTAL_CLIENTE');
      const atd = lsGet(LS_ATD, []);
      let mudou = false;
      const idsBackend = new Set(portal.map((a) => a.id));

      // remove/atualiza os que vieram do portal
      for (let i = atd.length - 1; i >= 0; i--) {
        if (!atd[i].portalId) continue;
        const novo = portal.find((p) => p.id === atd[i].portalId);
        if (!novo) continue;
        const statusMap = { confirmed: 'confirmado', cancelled: 'cancelado', completed: 'concluido', no_show: 'nao_compareceu' };
        const alvo = statusMap[novo.status] || 'agendado';
        if (atd[i].status !== alvo) { atd[i].status = alvo; mudou = true; }
      }
      // adiciona os que faltam
      const existentes = new Set(atd.map((a) => a.portalId).filter(Boolean));
      for (const a of portal) {
        if (existentes.has(a.id)) continue;
        atd.push({
          id: 'pt-' + a.id, portalId: a.id,
          cliente: a.clienteNome, clienteId: a.clienteIdLocal || null,
          telefone: String(a.clienteTelefone || ''),
          inicio: a.inicioISO, fim: a.fimISO,
          servicoNome: a.servicoNome, servicoId: a.serviceId,
          servicoPreco: (a.precoCentavos || 0) / 100,
          servicoCusto: 0,
          responsavel: '', endereco: '',
          observacoes: (a.observacoes || '') + (a.codigo ? ' [Portal #' + a.codigo + ']' : ''),
          status: a.status === 'confirmed' ? 'confirmado' : 'agendado',
          itensProdutos: (a.itensProdutos || []).map((it) => ({
            produtoId: it.produtoId, produtoNome: it.produtoNome,
            quantidade: it.quantidade || 1,
            precoUnitario: (it.precoUnitario || 0) / 100, custoUnitario: 0
          })),
          despesas: [], pagamentos: [],
          criadoEm: a.criadoEm, origem: 'PORTAL_CLIENTE'
        });
        mudou = true;
      }
      if (mudou) {
        lsSet(LS_ATD, atd);
        window.dispatchEvent(new CustomEvent('ecomim:db-changed', { detail: { at: Date.now(), fonte: 'ponte-portal' } }));
      }
      lsSet(LS_MARCA, Date.now());
    } catch (e) { /* servidor offline — sistema continua local */ }
  }

  /* ---------------- clientes do portal → CRM ---------------- */
  async function sincronizarClientes() {
    try {
      const r = await fetch(API + '/api/admin/appointments?from=2000-01-01', { headers: adminHeaders() });
      if (!r.ok) return;
      const data = await r.json();
      if (!data.ok) return;
      const clientes = lsGet(LS_CLI, []);
      const porTelefone = new Set(clientes.map((c) => String(c.telefone || '')));
      let mudou = false;
      for (const a of data.appointments) {
        const tel = String(a.clienteTelefone || '');
        if (!tel || porTelefone.has(tel)) continue;
        clientes.unshift({
          id: 'ptc-' + a.clienteId, nome: a.clienteNome, empresa: '', cnpj: '',
          email: a.clienteEmail || '', telefone: tel, whats: tel,
          segmento: '', porte: '', status: 'ativo',
          responsavelComercial: '', csResponsavel: '', implantador: '', plano: '',
          mrr: 0, contratoInicio: null, contratoFim: null, ultimoAcesso: null,
          nps: null, notas: 'Cliente via Portal de Agendamento',
          created: new Date().toISOString(),
          historico: [{ at: new Date().toISOString(), tipo: 'criacao', desc: 'Criado a partir do Portal do Cliente' }]
        });
        porTelefone.add(tel); mudou = true;
      }
      if (mudou) {
        lsSet(LS_CLI, clientes);
        window.dispatchEvent(new CustomEvent('ecomim:db-changed', { detail: { at: Date.now(), fonte: 'ponte-portal' } }));
      }
    } catch (e) { /* offline */ }
  }

  /* ---------------- catálogo sistema → backend ---------------- */
  async function publicarCatalogo() {
    const E = window.ECOMIM;
    const servicos = (window.NEITZEL_OPS && window.NEITZEL_OPS.servicos.list()) || [];
    const produtos = (window.NEITZEL_OPS && window.NEITZEL_OPS.produtos.list()) || [];
    // marca visibilidade escolhida no painel
    const pref = lsGet('neitzel_portal_servicos_pref_v1', {});
    const body = {
      servicos: servicos.map((s) => Object.assign({}, s, { portalVisivel: pref[s.id] !== false })),
      produtos
    };
    const r = await fetch(API + '/api/admin/sync-catalog', { method: 'POST', headers: adminHeaders(), body: JSON.stringify(body) });
    return r.ok;
  }

  /* ---------------- SSE tempo real ---------------- */
  let es = null;
  function conectarEventos() {
    try { if (es) es.close(); } catch (e) {}
    try {
      es = new EventSource(API + '/api/events');
      es.addEventListener('changed', (ev) => {
        let p = {}; try { p = JSON.parse(ev.data); } catch (e) {}
        if (['appointment', 'appointment_status', 'cancel'].includes(p.tipo)) { sincronizarAgendamentos(); sincronizarClientes(); }
        if (p.tipo === 'catalogo') sincronizarAgendamentos();
      });
      es.onerror = () => { /* reconexão automática do EventSource */ };
    } catch (e) { /* SSE indisponível */ }
  }

  function iniciar() {
    sincronizarAgendamentos().then(sincronizarClientes);
    conectarEventos();
    // Publica o catálogo real no backend em segundo plano (portal sempre atualizado)
    setTimeout(() => { try { publicarCatalogo(); } catch (e) {} }, 1500);
    setInterval(() => { sincronizarAgendamentos(); }, 60000);
  }

  window.NEITZEL_PONTE = { iniciar, sincronizarAgendamentos, sincronizarClientes, publicarCatalogo };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
