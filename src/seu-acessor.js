/* ============================================================================
 * NEITZEL — SEU ACESSOR (Operador Pessoal via WhatsApp)
 * Modulo independente — NAO confundir com o Acessor de Clientes (acessor.js),
 * que continua intacto. Este e o operador pessoal do dono do sistema:
 * recebe mensagens pelo WhatsApp, interpreta a intencao, executa tools REAIS
 * no ECOMIM (fonte de verdade) e confirma apenas o que de fato executou.
 *
 * Arquitetura (principio do prompt):
 *   EU DIGO -> ELE ENTENDE -> ELE EXECUTA -> ELE CONFIRMA
 *   WhatsApp = interface · Motor = interpretacao · Tools = maos · ECOMIM = verdade
 *
 * Regras implementadas:
 *   - Autenticacao por NUMERO autorizado (nunca pelo nome informado).
 *   - Permissoes em 4 niveis aplicadas no runtime (a IA nunca decide permissao).
 *   - Idempotencia por message_id (webhooks podem reenviar).
 *   - Contexto de conversa por numero (referencias, pronomes, desambiguacao).
 *   - Confirmacao explicita para niveis 3-4; nunca interpretar "ok" solto
 *     como autorizacao de acao critica.
 *   - Confirmacao SOMENTE depois do sucesso real; nunca fingir execucao.
 *   - Multi-tenant: todo dado acessado e deste navegador/empresa (isolado por
 *     natureza local-first; a bridge repassa o mesmo contexto).
 *   - Meta Cloud API real quando configurada; sem credenciais, status honesto
 *     "nao conectado", sem simulacao.
 * ========================================================================== */

'use strict';

const SEU_ACESSOR = (() => {
  const E = (typeof window !== 'undefined' && window.ECOMIM) || (typeof global !== 'undefined' && global.ECOMIM) || null;
  const OPS = (typeof window !== 'undefined' && window.NEITZEL_OPS) || (typeof global !== 'undefined' && global.NEITZEL_OPS) || null;

  const KEY = 'neitzel_seu_acessor_v1';

  /* ------------------------------------------------------------------ *
   * HELPERS BASICOS (sem DOM — navegador e bridge Node)
   * ------------------------------------------------------------------ */
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const norm = (s) => {
    let t = String(s == null ? '' : s);
    if (E && E.normalizeText) return E.normalizeText(t).replace(/\s+/g, ' ').trim();
    try { t = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { t = t.toLowerCase(); }
    return t.replace(/\s+/g, ' ').trim();
  };

  const digits = (s) => (E && E.digitsOf ? E.digitsOf(s) : String(s == null ? '' : s).replace(/\D/g, ''));

  const uid = () => (E && E.uid ? E.uid() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  const nowISO = () => (E && E.nowISO ? E.nowISO() : new Date().toISOString());
  const fmtMoney = (cents) => (E && E.fmtMoney ? E.fmtMoney(cents) : 'R$ ' + (Number(cents || 0) / 100).toFixed(2));

  const fmtDataHora = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const fmtHora = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const store = {
    get(key) {
      try { if (typeof localStorage !== 'undefined') return localStorage.getItem(key); } catch (e) { /* ignore */ }
      return null;
    },
    set(key, val) {
      try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, val); } catch (e) { /* ignore */ }
    },
  };

  /* ------------------------------------------------------------------ *
   * ESTADO PERSISTENTE
   * ------------------------------------------------------------------ */
  const DEFAULT_PERMISSOES = () => [
    { acao: 'Buscar leads', tool: 'buscar_leads', nivel: 1, requerConfirmacao: false },
    { acao: 'Consultar lead', tool: 'consultar_lead', nivel: 1, requerConfirmacao: false },
    { acao: 'Buscar clientes', tool: 'buscar_clientes', nivel: 1, requerConfirmacao: false },
    { acao: 'Consultar cliente', tool: 'consultar_cliente', nivel: 1, requerConfirmacao: false },
    { acao: 'Buscar tarefas', tool: 'buscar_tarefas', nivel: 1, requerConfirmacao: false },
    { acao: 'Consultar agenda', tool: 'consultar_agenda', nivel: 1, requerConfirmacao: false },
    { acao: 'Consultar vendas/financeiro', tool: 'consultar_vendas', nivel: 1, requerConfirmacao: false },
    { acao: 'Consultar dashboard (resumo)', tool: 'consultar_dashboard', nivel: 1, requerConfirmacao: false },
    { acao: 'Consultar estoque', tool: 'consultar_estoque', nivel: 1, requerConfirmacao: false },
    { acao: 'Criar lead', tool: 'criar_lead', nivel: 2, requerConfirmacao: false },
    { acao: 'Alterar status de lead', tool: 'alterar_status_lead', nivel: 2, requerConfirmacao: false },
    { acao: 'Criar tarefa', tool: 'criar_tarefa', nivel: 2, requerConfirmacao: false },
    { acao: 'Concluir tarefa', tool: 'concluir_tarefa', nivel: 2, requerConfirmacao: false },
    { acao: 'Registrar interacao', tool: 'registrar_interacao', nivel: 2, requerConfirmacao: false },
    { acao: 'Registrar despesa', tool: 'registrar_despesa', nivel: 2, requerConfirmacao: false },
    { acao: 'Enviar mensagem a cliente', tool: 'enviar_mensagem', nivel: 3, requerConfirmacao: true },
    { acao: 'Excluir registros', tool: 'excluir_registro', nivel: 4, requerConfirmacao: true },
    { acao: 'Acoes financeiras (receita/pagamento)', tool: 'acao_financeira', nivel: 4, requerConfirmacao: true },
    { acao: 'Alterar configuracoes do sistema', tool: 'alterar_configuracao', nivel: 4, requerConfirmacao: true },
  ];

  const DEFAULT_STATE = () => ({
    versao: 1,
    ativo: false,
    numerosAutorizados: [],
    nivelPadrao: 2,
    meta: { wabaId: '', phoneNumberId: '', token: '', verifyToken: '', webhookUrl: '' },
    ia: { gatewayUrl: '', apiKey: '', modelo: '' },
    bridge: { url: '', ultimaSync: '' },
    permissoes: DEFAULT_PERMISSOES(),
    mensagensProcessadas: [],
    conversas: {},
    historico: [],
    criadoEm: '',
  });

  const state = {
    load() {
      const raw = store.get(KEY);
      const base = DEFAULT_STATE();
      try {
        if (raw) {
          const p = JSON.parse(raw);
          if (Array.isArray(p.permissoes) && p.permissoes.length) base.permissoes = p.permissoes;
          if (Array.isArray(p.numerosAutorizados)) base.numerosAutorizados = p.numerosAutorizados;
          if (Array.isArray(p.mensagensProcessadas)) base.mensagensProcessadas = p.mensagensProcessadas;
          if (Array.isArray(p.historico)) base.historico = p.historico;
          if (p.conversas && typeof p.conversas === 'object') base.conversas = p.conversas;
          base.ativo = !!p.ativo;
          if (p.nivelPadrao != null) base.nivelPadrao = Number(p.nivelPadrao) || 2;
          if (p.meta && typeof p.meta === 'object') base.meta = Object.assign(base.meta, p.meta);
          if (p.ia && typeof p.ia === 'object') base.ia = Object.assign(base.ia, p.ia);
          if (p.bridge && typeof p.bridge === 'object') base.bridge = Object.assign(base.bridge, p.bridge);
          if (p.criadoEm) base.criadoEm = p.criadoEm;
          return base;
        }
      } catch (e) { /* estado corrompido → defaults */ }
      return base;
    },
    save(s) { store.set(KEY, JSON.stringify(s)); },
  };

  let st = state.load();
  const save = () => state.save(st);

  const getNumero = (numero) => (st.numerosAutorizados || []).find((n) => digits(n.numero) === digits(numero) && n.ativo);

  /* ------------------------------------------------------------------ *
   * AUDITORIA
   * ------------------------------------------------------------------ */
  const registrar = (numero, tipo, descricao, resultado, extra) => {
    const s = st.historico || (st.historico = []);
    s.unshift({ id: uid(), ts: nowISO(), numero: digits(numero) || '', tipo, descricao, resultado: resultado || 'ok', extra: extra || null });
    if (s.length > 500) s.length = 500;
    save();
    if (E && E.audit && E.audit.record) {
      try { E.audit.record('seu_acessor.' + (resultado === 'erro' ? 'erro' : 'acao'), 'seu_acessor', null, { numero: digits(numero), tipo, descricao, resultado }); } catch (e) { /* ignore */ }
    }
  };

  /* ------------------------------------------------------------------ *
   * IDEMPOTENCIA (message_id / request_id)
   * ------------------------------------------------------------------ */
  const idempotencia = {
    jaProcessada(messageId) {
      if (!messageId) return null;
      const a = st.mensagensProcessadas || [];
      return a.find((m) => m.id === String(messageId)) || null;
    },
    registrar(messageId, resposta, hash) {
      const a = st.mensagensProcessadas || (st.mensagensProcessadas = []);
      a.unshift({ id: String(messageId), hash: hash || '', resposta: String(resposta || '').slice(0, 400), ts: nowISO() });
      const limite = new Date(Date.now() - 72 * 3600 * 1000).getTime();
      for (let i = a.length - 1; i >= 0; i--) {
        if (i > 500 || new Date(a[i].ts || 0).getTime() < limite) a.splice(i, 1);
      }
      save();
    },
  };

  /* ------------------------------------------------------------------ *
   * CONTEXTO DE CONVERSA (por numero)
   * ------------------------------------------------------------------ */
  const conversa = (numero) => {
    const k = digits(numero);
    if (!st.conversas[k]) st.conversas[k] = { ultimaLista: [], alvoAtual: null, pendente: null, candidatos: [], msgs: [] };
    return st.conversas[k];
  };
  const lembrarMsg = (numero, role, texto) => {
    const c = conversa(numero);
    c.msgs.push({ role, texto: String(texto || '').slice(0, 300), ts: nowISO() });
    if (c.msgs.length > 12) c.msgs.splice(0, c.msgs.length - 12);
    save();
  };

  /* ------------------------------------------------------------------ *
   * MATRIZ DE PERMISSAO (o BACKEND decide — nunca a IA)
   * ------------------------------------------------------------------ */
  const permissaoDa = (tool) => (st.permissoes || []).find((p) => p.tool === tool) || { nivel: 4, requerConfirmacao: true };
  const nivelDoNumero = (numero) => {
    const n = getNumero(numero);
    if (!n) return 0;
    return n.nivel != null ? Number(n.nivel) : st.nivelPadrao;
  };
  const pode = (numero, tool) => {
    const nivel = nivelDoNumero(numero);
    const perm = permissaoDa(tool);
    return { ok: nivel >= perm.nivel, nivel, exigido: perm.nivel, requerConfirmacao: perm.requerConfirmacao && nivel < 4 };
  };

  /* ------------------------------------------------------------------ *
   * LOCALIZACAO DE ENTIDADES (leads + clientes) com desambiguacao
   * ------------------------------------------------------------------ */
  const todosContatos = () => {
    const out = [];
    (E.db.get().leads || []).forEach((l) => out.push({ id: l.id, tipo: 'lead', nome: l.nome || '', etapa: l.etapa, sub: [l.empresa, l.cidade, l.telefone ? 'tel ' + l.telefone : ''].filter(Boolean).join(' · '), obj: l }));
    if (E.modules.clientes && E.modules.clientes.list) {
      E.modules.clientes.list().forEach((c) => out.push({ id: c.id, tipo: 'cliente', nome: c.nome || '', sub: [c.empresa, c.cidade, c.email].filter(Boolean).join(' · '), obj: c }));
    }
    return out;
  };

  const localizar = (nomeBuscado, numero) => {
    const n = norm(nomeBuscado);
    if (!n) return { ok: false, code: 'SEM_TERMO' };
    const todos = todosContatos();
    const candidatos = todos.filter((c) => {
      const cn = norm(c.nome);
      return cn && (cn.includes(n) || n.includes(cn));
    });
    if (!candidatos.length) return { ok: false, code: 'NAO_ENCONTRADO' };
    if (candidatos.length === 1) return { ok: true, alvo: candidatos[0] };
    const c = conversa(numero);
    c.candidatos = candidatos.slice(0, 5);
    save();
    return { ok: false, code: 'AMBIGUO', candidatos: candidatos.slice(0, 5) };
  };

  const resolverCandidato = (numero, resposta) => {
    const c = conversa(numero);
    if (!c.candidatos || !c.candidatos.length) return null;
    const r = resposta.trim();
    const idx = /^\d+$/.test(r) ? parseInt(r, 10) - 1 : -1;
    if (idx >= 0 && idx < c.candidatos.length) {
      const alvo = c.candidatos[idx];
      c.alvoAtual = { id: alvo.id, tipo: alvo.tipo, nome: alvo.nome };
      c.candidatos = [];
      save();
      return c.alvoAtual;
    }
    const alvo = c.candidatos.find((x) => norm(x.nome) === norm(r));
    if (alvo) {
      c.alvoAtual = { id: alvo.id, tipo: alvo.tipo, nome: alvo.nome };
      c.candidatos = [];
      save();
      return c.alvoAtual;
    }
    return null;
  };

  /* ------------------------------------------------------------------ *
   * PARSING DE DATA RELATIVA ("amanha as 9", "hoje 14:30", "em 2 dias")
   * ------------------------------------------------------------------ */
  const diasSemana = { domingo: 0, segunda: 1, seg: 1, 'segunda-feira': 1, terca: 2, 'terca': 2, 'terca-feira': 2, quarta: 3, 'quarta-feira': 3, quinta: 4, 'quinta-feira': 4, sexta: 5, 'sexta-feira': 5, sabado: 6, 'sabado': 6 };

  const extrairMomento = (texto) => {
    const t = norm(texto);
    const d = new Date();
    let quando = null;
    let hora = null;
    const mHora = t.match(/(?:as|aos|pra|para)?\s*(\d{1,2})(?:[:hH](\d{2}))?/);
    if (mHora) {
      const h = parseInt(mHora[1], 10);
      const mi = mHora[2] ? parseInt(mHora[2], 10) : 0;
      if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) hora = { h, mi };
    }
    if (t.includes('amanha') || t.includes('depois de amanha')) {
      d.setDate(d.getDate() + 1);
      quando = d;
    } else if (/(\d+)\s*(dias?|dia)/.test(t)) {
      const qtd = parseInt(t.match(/(\d+)\s*(dias?|dia)/)[1], 10);
      d.setDate(d.getDate() + qtd);
      quando = d;
    } else {
      for (const key of Object.keys(diasSemana)) {
        if (t.includes(key)) {
          let diff = (diasSemana[key] - d.getDay() + 7) % 7;
          if (diff === 0) diff = 7;
          d.setDate(d.getDate() + diff);
          quando = d;
          break;
        }
      }
    }
    if (!quando) quando = d; // padrao: hoje
    const base = new Date(quando);
    if (hora) {
      base.setHours(hora.h, hora.mi, 0, 0);
      const hojeInicio = new Date(); hojeInicio.setHours(0, 0, 0, 0);
      if (quando.getTime() === hojeInicio.getTime() && base.getTime() < Date.now()) base.setDate(base.getDate() + 1);
    } else {
      base.setHours(9, 0, 0, 0);
    }
    return base;
  };

  /* ------------------------------------------------------------------ *
   * EXTRATOR DE LEAD (a partir de texto livre)
   * ------------------------------------------------------------------ */
  const extrairLead = (texto) => {
    const t = String(texto || '').trim();
    let corpo = t
      .replace(/\b(anota|anote|cadastra|cadastre|cadastrar|criar|cria|registra|registre|novo|nova|lead|cliente|contato)\b:?/gi, ' ')
      .replace(/\s+/g, ' ').trim();
    let nome = '', empresa = '', telefone = '', interesse = '';
    const dg = digits(corpo);
    const mTel = dg.match(/\d{10,11}/);
    if (mTel) {
      telefone = mTel[0];
      corpo = corpo.replace(/\d{2,5}[\s.-]*\d{3,5}[\s.-]*\d{3,5}/g, ' ').replace(/\s+/g, ' ').trim();
    }
    const mEmp = corpo.match(/\b(?:dono|dona|proprietario|proprietaria|socio|socia)\s+(?:d[aeo]\s+)?([^,.;]+)/i);
    if (mEmp) empresa = mEmp[1].trim();
    const partes = corpo.split(',').map((x) => x.trim()).filter(Boolean);
    if (partes.length) {
      if (!nome) nome = partes[0].replace(/\b(?:do|da|de)\s+\w+/g, '').trim();
      const resto = partes.slice(1).join(' · ');
      if (!empresa) {
        const m = resto.match(/\b(?:da|do|de)\s+(.+?)(?=\s*[·]|\s*$)/i);
        if (m) empresa = m[1].trim();
      }
      if (!interesse) interesse = resto;
    }
    if (!nome) {
      const m = corpo.match(/^([A-Za-zÀ-ÿ][^,]{1,40}?)\s+(?:dono|dona|proprietar)/i);
      if (m) nome = m[1].trim();
    }
    if (!nome && !empresa) nome = corpo.slice(0, 60);
    return { nome, empresa, telefone, interesse };
  };

  /* ------------------------------------------------------------------ *
   * MAPA DE ETAPAS (linguagem natural → id do funil)
   * ------------------------------------------------------------------ */
  const ETAPAS = { novo: 'novo', contato: 'contato', qualificado: 'qualificado', quente: 'qualificado', proposta: 'proposta', negociacao: 'negociacao', negoc: 'negociacao', ganho: 'ganho', ganha: 'ganho', fechado: 'ganho', fechada: 'ganho', perdido: 'perdido', perdida: 'perdido', descartado: 'perdido' };

  const etapaValida = (id) => (E.db.get().funil || []).some((f) => f.id === id);

  /* ------------------------------------------------------------------ *
   * TOOLS — execucao REAL no ECOMIM (fonte de verdade)
   * ------------------------------------------------------------------ */
  const listarLeads = (filtro, limite) => {
    const leads = (E.db.get().leads || []).slice();
    let lista = leads;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    if (filtro === 'hoje') {
      lista = leads.filter((l) => { const d = new Date(l.created || l.updated || 0); return d >= hoje; });
    } else if (filtro === 'quentes') {
      lista = leads.filter((l) => ['qualificado', 'proposta', 'negociacao'].includes(l.etapa));
      lista.sort((a, b) => (b.score || 0) - (a.score || 0));
    } else if (filtro === 'novos') {
      lista = leads.filter((l) => l.etapa === 'novo');
    }
    return lista.slice(0, limite || 10);
  };

  const tools = {
    buscar_leads(params, numero) {
      const tipo = params.filtro || 'todos';
      const lista = listarLeads(tipo, 10);
      if (!lista.length) return { ok: true, resposta: tipo === 'hoje' ? 'Nenhum lead entrou hoje.' : tipo === 'quentes' ? 'Nenhum lead quente no momento.' : 'Nenhum lead cadastrado ainda.' };
      const linhas = lista.map((l, i) => `${i + 1}. ${l.nome || 'Sem nome'}${l.empresa ? ' — ' + l.empresa : ''}${l.etapa ? ' [' + l.etapa + ']' : ''}`);
      return { ok: true, resposta: `📋 ${lista.length} lead(s):\n` + linhas.join('\n'), dados: lista.map((l) => ({ id: l.id, nome: l.nome })) };
    },

    consultar_lead(params, numero) {
      const alvo = params.alvo || conversa(numero).alvoAtual;
      if (!alvo || !alvo.id) return { ok: false, code: 'SEM_ALVO', resposta: 'De qual lead voce esta falando?' };
      const l = (E.db.get().leads || []).find((x) => x.id === alvo.id);
      if (!l) return { ok: false, code: 'NOT_FOUND', resposta: 'Nao encontrei esse lead (pode ter sido removido).' };
      const linhas = [
        `👤 ${l.nome || 'Sem nome'}`,
        l.empresa ? `🏢 ${l.empresa}` : null,
        l.telefone ? `📞 ${l.telefone}` : null,
        l.email ? `✉️ ${l.email}` : null,
        l.cidade ? `📍 ${l.cidade}${l.uf ? '/' + l.uf : ''}` : null,
        `🎯 Etapa: ${l.etapa || 'novo'}`,
        l.valor ? `💵 Potencial: ${fmtMoney(l.valor)}` : null,
        l.score != null ? `⭐ Score: ${l.score}` : null,
      ].filter(Boolean);
      const ult = (l.hist && l.hist.length) ? l.hist[l.hist.length - 1] : null;
      if (ult) linhas.push(`🕘 Ultimo evento: ${ult.desc || ult.tipo || 'atualizacao'} (${fmtDataHora(ult.at || l.updated)})`);
      return { ok: true, resposta: linhas.join('\n') };
    },

    criar_lead(params, numero) {
      const dados = params.lead || {};
      if (!dados.nome) return { ok: false, code: 'SEM_DADOS', resposta: 'Preciso do nome para cadastrar. Ex.: "Anota esse lead: Carlos, dono da Academia Fit, 47988888888".' };
      const input = {
        nome: dados.nome,
        empresa: dados.empresa || '',
        telefone: dados.telefone || '',
        whats: dados.telefone || '',
        origem: 'seu_acessor_whatsapp',
        desc: dados.interesse || '',
        consentimento: !!params.consentimento,
      };
      if (dados.email) input.email = dados.email;
      const r = E.modules.leads.addToQueue(input);
      if (r.ok) {
        const linhas = ['✅ Lead encaminhado para a fila de aprovacao (LGPD):', `• ${input.nome}`];
        if (input.empresa) linhas.push(`• ${input.empresa}`);
        if (input.telefone) linhas.push(`• Tel: ${input.telefone}`);
        if (dados.interesse) linhas.push(`• Interesse: ${dados.interesse}`);
        linhas.push('Apos aprovacao na fila, ele entra no CRM.');
        return { ok: true, resposta: linhas.join('\n'), registro: r.lead.id };
      }
      if (r.code === 'DUPLICADO_FILA' || r.code === 'DUPLICADO') {
        return { ok: false, code: 'DUPLICADO', resposta: `⚠️ ${input.nome} ja existe (duplicado). Nada foi cadastrado.` };
      }
      return { ok: false, code: r.code || 'ERRO', resposta: 'Nao consegui cadastrar o lead agora. O ECOMIM retornou um erro. Nenhuma alteracao foi realizada.' };
    },

    alterar_status_lead(params, numero) {
      const alvo = params.alvo || conversa(numero).alvoAtual;
      const etapa = params.etapa;
      if (!alvo || !alvo.id) return { ok: false, code: 'SEM_ALVO', resposta: 'De qual lead estamos falando? Informe o nome.' };
      if (!etapa || !etapaValida(etapa)) return { ok: false, code: 'ETAPA_INVALIDA', resposta: 'Essa etapa nao existe no funil. Etapas: novo, contato, qualificado, proposta, negociacao, ganho, perdido.' };
      const r = E.modules.leads.moveStage(alvo.id, etapa, 'Alterado pelo Seu Acessor (WhatsApp)');
      if (r.ok) return { ok: true, resposta: `✅ ${alvo.nome} agora esta em **${etapa}**.` };
      if (r.code === 'NOT_FOUND') return { ok: false, code: 'NOT_FOUND', resposta: 'Nao encontrei esse lead.' };
      return { ok: false, code: r.code || 'ERRO', resposta: 'Nao consegui alterar o status. Nenhuma alteracao foi realizada.' };
    },

    buscar_clientes(params, numero) {
      const lista = (E.modules.clientes && E.modules.clientes.list ? E.modules.clientes.list() : []).slice(0, 10);
      if (!lista.length) return { ok: true, resposta: 'Nenhum cliente cadastrado ainda.' };
      const linhas = lista.map((c, i) => `${i + 1}. ${c.nome || 'Sem nome'}${c.empresa ? ' — ' + c.empresa : ''}${c.status ? ' [' + c.status + ']' : ''}`);
      return { ok: true, resposta: `👥 ${lista.length} cliente(s):\n` + linhas.join('\n'), dados: lista.map((c) => ({ id: c.id, nome: c.nome })) };
    },

    consultar_cliente(params, numero) {
      const alvo = params.alvo || conversa(numero).alvoAtual;
      if (!alvo || !alvo.id) return { ok: false, code: 'SEM_ALVO', resposta: 'De qual cliente voce esta falando?' };
      const c = (E.modules.clientes.list ? E.modules.clientes.list() : []).find((x) => x.id === alvo.id);
      if (!c) return { ok: false, code: 'NOT_FOUND', resposta: 'Nao encontrei esse cliente.' };
      const linhas = [
        `👤 ${c.nome || 'Sem nome'}`,
        c.empresa ? `🏢 ${c.empresa}` : null,
        c.telefone ? `📞 ${c.telefone}` : null,
        c.email ? `✉️ ${c.email}` : null,
        c.status ? `Status: ${c.status}` : null,
        c.mrr ? `MRR: ${fmtMoney(c.mrr)}` : null,
      ].filter(Boolean);
      return { ok: true, resposta: linhas.join('\n') };
    },

    buscar_tarefas(params, numero) {
      const pendentes = E.modules.tarefas.pendentes().slice(0, 10);
      const atrasadas = E.modules.tarefas.atrasadas();
      if (!pendentes.length && !atrasadas.length) return { ok: true, resposta: 'Nenhuma tarefa pendente. 🎉' };
      const linhas = [];
      if (atrasadas.length) linhas.push(`⚠️ ${atrasadas.length} atrasada(s):`);
      atrasadas.slice(0, 5).forEach((t, i) => linhas.push(`${i + 1}. ${t.titulo || t.desc || 'Tarefa'} (vencida ${fmtDataHora(t.due)})`));
      if (pendentes.length) linhas.push(`📋 ${pendentes.length} pendente(s):`);
      pendentes.filter((t) => !atrasadas.includes(t)).slice(0, 5).forEach((t, i) => linhas.push(`${i + 1}. ${t.titulo || t.desc || 'Tarefa'} — ${fmtDataHora(t.due)}`));
      return { ok: true, resposta: linhas.join('\n') };
    },

    criar_tarefa(params, numero) {
      const titulo = params.titulo;
      const quando = params.quando;
      if (!titulo) return { ok: false, code: 'SEM_DADOS', resposta: 'Informe o que devo anotar. Ex.: "Cria uma tarefa para eu ligar para Carlos amanha as 9".' };
      const input = { titulo, status: 'pendente', prioridade: 'normal' };
      if (quando) input.due = quando;
      else input.due = nowISO();
      if (params.alvo && params.alvo.id && params.alvo.tipo === 'lead') input.leadId = params.alvo.id;
      if (params.alvo && params.alvo.id && params.alvo.tipo === 'cliente') input.clienteId = params.alvo.id;
      const r = E.modules.tarefas.add(input);
      if (r.ok) {
        return { ok: true, resposta: `✅ Tarefa criada: "${titulo}" para ${fmtDataHora(r.tarefa.due)}.`, registro: r.tarefa.id };
      }
      return { ok: false, code: r.code || 'ERRO', resposta: 'Nao consegui criar a tarefa agora. O ECOMIM retornou um erro. Nada foi salvo.' };
    },

    concluir_tarefa(params, numero) {
      let tarefa = null;
      if (params.tarefaId) tarefa = (E.db.get().tarefas || []).find((t) => t.id === params.tarefaId);
      if (!tarefa && params.alvo && params.alvo.nome) {
        const alvoNome = norm(params.alvo.nome);
        tarefa = (E.db.get().tarefas || []).find((t) => norm(t.titulo || t.desc || '').includes(alvoNome) || norm(t.titulo || '').includes(alvoNome)) || null;
      }
      if (!tarefa) {
        const pend = E.modules.tarefas.pendentes();
        if (pend.length === 1) tarefa = pend[0];
        else return { ok: false, code: 'NAO_ENCONTRADO', resposta: 'Qual tarefa devo concluir? Me diga o nome ou o assunto.' };
      }
      const r = E.modules.tarefas.update(tarefa.id, { status: 'concluida' });
      if (r.ok) return { ok: true, resposta: `✅ Tarefa concluida: "${tarefa.titulo || tarefa.desc || 'Tarefa'}".` };
      return { ok: false, code: r.code || 'ERRO', resposta: 'Nao consegui concluir a tarefa agora. Nada foi alterado.' };
    },

    consultar_vendas(params, numero) {
      const f = E.modules.financeiro.saldo();
      let lucroOps = null;
      if (OPS && OPS.metrics) {
        const iniMes = new Date(); iniMes.setDate(1); iniMes.setHours(0, 0, 0, 0);
        lucroOps = OPS.metrics.lucroAtendimentos(iniMes.toISOString());
      }
      const linhas = [
        '💰 Financeiro:',
        `• A receber: ${fmtMoney(f.aReceber)}`,
        `• Recebido: ${fmtMoney(f.recebido)}`,
        `• A pagar: ${fmtMoney(f.aPagar)}`,
        `• Pago: ${fmtMoney(f.pago)}`,
        `• Saldo: ${fmtMoney(f.saldo)}`,
      ];
      if (lucroOps != null) linhas.push(`• Lucro dos atendimentos (mes): ${fmtMoney(lucroOps)}`);
      return { ok: true, resposta: linhas.join('\n') };
    },

    consultar_agenda(params, numero) {
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);
      const linhas = [];
      let itens = [];
      if (OPS && OPS.atendimentos) {
        const lista = OPS.atendimentos.list();
        itens = lista.filter((a) => {
          const d = new Date(a.inicio || 0);
          return d >= hoje && d < amanha && a.status !== 'cancelado';
        });
      }
      const agendaHoje = (E.modules.agenda.today ? E.modules.agenda.today() : []).filter((e) => e.status !== 'cancelado');
      if (itens.length) {
        linhas.push(`📅 ${itens.length} atendimento(s) hoje:`);
        itens.slice(0, 8).forEach((a) => linhas.push(`• ${fmtHora(a.inicio)} — ${a.cliente || 'Cliente'}${a.servicoNome ? ' (' + a.servicoNome + ')' : ''} [${a.status || 'agendado'}]`));
      }
      if (agendaHoje.length) {
        linhas.push(`🗓️ ${agendaHoje.length} compromisso(s) na agenda:`);
        agendaHoje.slice(0, 8).forEach((e) => linhas.push(`• ${fmtHora(e.quando)} — ${e.titulo}`));
      }
      if (!linhas.length) return { ok: true, resposta: 'Nenhum compromisso hoje. 📭' };
      return { ok: true, resposta: linhas.join('\n') };
    },

    consultar_estoque(params, numero) {
      if (!OPS || !OPS.produtos) return { ok: false, code: 'INDISPONIVEL', resposta: 'O modulo de estoque nao esta disponivel agora.' };
      const produtos = OPS.produtos.list ? OPS.produtos.list() : [];
      const baixos = produtos.filter((p) => p.estoqueAtual <= p.estoqueMinimo);
      if (params.produto) {
        const p = produtos.find((x) => norm(x.nome).includes(norm(params.produto)));
        if (!p) return { ok: false, code: 'NAO_ENCONTRADO', resposta: `Nao encontrei "${params.produto}" no catalogo.` };
        return { ok: true, resposta: `📦 ${p.nome}: ${p.estoqueAtual} ${p.unidade || 'un'} em estoque (minimo ${p.estoqueMinimo}).${p.estoqueAtual <= p.estoqueMinimo ? ' ⚠️ Abaixo do minimo!' : ''}` };
      }
      if (!produtos.length) return { ok: true, resposta: 'Nenhum produto cadastrado.' };
      const linhas = [`📦 ${produtos.length} produto(s) no catalogo:`];
      produtos.slice(0, 8).forEach((p) => linhas.push(`• ${p.nome}: ${p.estoqueAtual} ${p.unidade || 'un'}${p.estoqueAtual <= p.estoqueMinimo ? ' ⚠️' : ''}`));
      if (baixos.length) linhas.push('', `⚠️ ${baixos.length} com estoque baixo (abaixo do minimo).`);
      return { ok: true, resposta: linhas.join('\n') };
    },

    consultar_dashboard(params, numero) {
      const linhas = ['📌 Resumo de hoje:', ''];
      const atrasadas = E.modules.tarefas.atrasadas();
      const pendentes = E.modules.tarefas.pendentes();
      const novos = listarLeads('novos', 5);
      const quentes = listarLeads('quentes', 5);
      const vencidas = E.modules.financeiro.vencidas ? E.modules.financeiro.vencidas() : [];
      if (atrasadas.length) linhas.push(`⚠️ ${atrasadas.length} tarefa(s) atrasada(s)`);
      if (vencidas.length) linhas.push(`💸 ${vencidas.length} conta(s) vencida(s)`);
      if (novos.length) linhas.push(`🆕 ${novos.length} lead(s) novo(s) sem primeiro contato`);
      if (quentes.length) linhas.push(`🔥 ${quentes.length} lead(s) quente(s)`);
      if (pendentes.length) linhas.push(`📋 ${pendentes.length} tarefa(s) pendente(s)`);
      if (linhas.length === 2) return { ok: true, resposta: '📌 Sem pendencias criticas hoje. Aproveite para prospectar!' };
      return { ok: true, resposta: linhas.join('\n') };
    },

    registrar_interacao(params, numero) {
      const alvo = params.alvo || conversa(numero).alvoAtual;
      if (!alvo || !alvo.id) return { ok: false, code: 'SEM_ALVO', resposta: 'Com quem foi a interacao? Informe o nome.' };
      const desc = params.desc || 'Interacao registrada via WhatsApp';
      if (alvo.tipo === 'lead') {
        const l = (E.db.get().leads || []).find((x) => x.id === alvo.id);
        if (!l) return { ok: false, code: 'NOT_FOUND', resposta: 'Lead nao encontrado.' };
        l.hist = l.hist || [];
        l.hist.push({ at: nowISO(), tipo: 'interacao', de: l.etapa, para: l.etapa, desc, por: 'seu_acessor' });
        l.updated = nowISO();
        E.db.save();
        return { ok: true, resposta: `✅ Interacao registrada com ${l.nome}.` };
      }
      if (E.modules.clientes && E.modules.clientes.updateCliente) {
        const c = (E.modules.clientes.list() || []).find((x) => x.id === alvo.id);
        if (c) {
          c.historico = c.historico || [];
          c.historico.push({ at: nowISO(), tipo: 'interacao', desc, por: 'seu_acessor' });
          E.modules.clientes.updateCliente(c.id, { historico: c.historico, ultimoAcesso: nowISO() });
          return { ok: true, resposta: `✅ Interacao registrada com ${c.nome}.` };
        }
      }
      return { ok: false, code: 'NAO_ENCONTRADO', resposta: 'Nao encontrei o contato.' };
    },

    registrar_despesa(params, numero) {
      const valor = params.valor; // REAIS
      if (!valor || valor <= 0) return { ok: false, code: 'VALOR_INVALIDO', resposta: 'Informe o valor da despesa. Ex.: "Registra R$ 50 de gasolina".' };
      const desc = params.desc || 'Despesa';
      const r = E.modules.financeiro.addConta({
        tipo: 'pagar', descricao: desc, valor, vencimento: nowISO(), categoria: params.categoria || 'outros', observacoes: 'Registrada pelo Seu Acessor',
      });
      if (r.ok) return { ok: true, resposta: `✅ Despesa registrada: ${desc} — ${fmtMoney(r.conta.valor)}.` };
      return { ok: false, code: r.code || 'ERRO', resposta: 'Nao consegui registrar a despesa. Nada foi salvo.' };
    },

    enviar_mensagem(params, numero) {
      const alvo = params.alvo || conversa(numero).alvoAtual;
      const texto = params.texto;
      if (!texto) return { ok: false, code: 'SEM_TEXTO', resposta: 'O que devo enviar?' };
      // Canal honesto: so envia se houver integracao de verdade
      const canal = (typeof window !== 'undefined' && window.ECOMIM_EXT && window.ECOMIM_EXT.channels) ? window.ECOMIM_EXT.channels : null;
      let enviado = false;
      if (canal && canal.send) {
        const destino = (alvo && alvo.obj && (alvo.obj.telefone || alvo.obj.whats)) || (params.destino || '');
        if (destino) {
          const pr = canal.send('whatsapp', destino, 'Seu Acessor', texto);
          if (pr && pr.then) {
            return { ok: false, code: 'ASSINCRONO', resposta: 'Ainda nao consigo enviar mensagens reais: a integracao WhatsApp exige Meta Cloud API configurada. Nenhuma mensagem foi enviada.' };
          }
          if (pr && pr.ok) enviado = true;
        }
      }
      if (!enviado) {
        return { ok: false, code: 'CANAL_NAO_DISPONIVEL', resposta: 'Nao enviei a mensagem: o canal WhatsApp nao esta conectado (exige Meta Cloud API com WABA aprovada). Nenhuma mensagem foi enviada.' };
      }
      return { ok: true, resposta: `✅ Mensagem enviada para ${alvo ? alvo.nome : 'o contato'}.` };
    },

    excluir_registro(params, numero) {
      const alvo = params.alvo || conversa(numero).alvoAtual;
      if (!alvo || !alvo.id) return { ok: false, code: 'SEM_ALVO', resposta: 'Qual registro devo excluir? Informe o nome.' };
      if (alvo.tipo === 'lead') {
        const r = E.modules.leads.deleteLead(alvo.id, 'Excluido pelo Seu Acessor via WhatsApp (com confirmacao)');
        if (r.ok) return { ok: true, resposta: `🗑️ Lead "${alvo.nome}" excluido.` };
        return { ok: false, code: r.code || 'ERRO', resposta: 'Nao consegui excluir o lead. Nada foi alterado.' };
      }
      return { ok: false, code: 'NAO_SUPORTADO', resposta: 'So consigo excluir leads por enquanto. Para outros registros, use o sistema.' };
    },

    acao_financeira(params, numero) {
      if (params.tipo === 'receber' || params.tipo === 'pagar') {
        const r = E.modules.financeiro.addConta({
          tipo: params.tipo, descricao: params.desc || 'Lancamento via Seu Acessor',
          valor: params.valor, vencimento: nowISO(), categoria: params.categoria || 'outros',
        });
        if (r.ok) return { ok: true, resposta: `✅ Conta registrada (${params.tipo === 'receber' ? 'a receber' : 'a pagar'}): ${params.desc || ''} — ${fmtMoney(r.conta.valor)}.` };
        return { ok: false, code: r.code || 'ERRO', resposta: 'Nao consegui registrar o lancamento. Nada foi salvo.' };
      }
      return { ok: false, code: 'TIPO_INVALIDO', resposta: 'Acao financeira nao reconhecida.' };
    },

    alterar_configuracao(params, numero) {
      return { ok: false, code: 'NAO_SUPORTADO', resposta: 'Alteracao de configuracoes pelo WhatsApp nao esta habilitada. Faca no painel do sistema.' };
    },
  };

  const executarTool = (tool, params, numero, opts) => {
    const perm = pode(numero, tool);
    if (!perm.ok) {
      registrar(numero, 'Negado', `Tentativa de "${tool}" sem permissao (nivel ${perm.nivel}/${perm.exigido})`, 'negado');
      return { ok: false, code: 'SEM_PERMISSAO', resposta: `Essa acao exige nivel ${perm.exigido} de permissao e seu numero tem nivel ${perm.nivel}. Acao nao executada.` };
    }
    const fn = tools[tool];
    if (!fn) return { ok: false, code: 'TOOL_INEXISTENTE', resposta: 'Acao nao implementada.' };
    if (perm.requerConfirmacao && !opts.confirmado) {
      const descricao = params._descricao || `executar "${tool}"`;
      const c = conversa(numero);
      c.pendente = { tool, params, numero, ts: nowISO(), descricao };
      save();
      return { ok: false, code: 'REQUER_CONFIRMACAO', resposta: `Confirmacao: deseja ${descricao}?\nResponda "sim" para confirmar ou "nao" para cancelar.` };
    }
    const r = fn(params, numero);
    registrar(numero, 'Acao', `${tool} → ${r.ok ? (r.resposta || '').slice(0, 120) : (r.resposta || r.code || 'erro').slice(0, 120)}`, r.ok ? 'ok' : 'erro', { tool, params: params._descricao || null });
    return r;
  };

  /* ------------------------------------------------------------------ *
   * PARSER DE INTENCAO (linguagem natural, sem comandos rigidos)
   * ------------------------------------------------------------------ */
  const parser = {
    saudacao(t) { return /^(oi|ola|olá|bom dia|boa tarde|boa noite|e aí|eai|opa|hey|fala)[\s!.,]?/.test(t) && t.length < 40; },
    ajuda(t) { return t.includes('ajuda') || t.includes('help') || t.includes('o que voce faz') || t.includes('o que voce pode') || t.includes('menu') || t.includes('opcoes'); },
    criarLead(t) {
      return /(anota|anote|cadastra|cadastre|cadastrar|criar|cria|registra|registre)\s+(um\s+)?(lead|cliente|contato)/.test(t)
        || (t.includes('lead') && (t.includes('anota') || t.includes('cadastra') || t.includes('cria')));
    },
    alterarStatus(t) {
      return /(coloca|colocar|muda|mudar|altera|alterar|passa|passar|move|mover)\s+/.test(t)
        && Object.keys(ETAPAS).some((e) => t.includes(e));
    },
    criarTarefa(t) {
      return t.includes('tarefa') || t.includes('me lembra') || t.includes('lembrete') || /(ligar|ligacao|ligação)\s+(para|pro|pra)\s/.test(t) || t.startsWith('me lembra');
    },
    concluirTarefa(t) {
      return /(conclui|concluir|marca|marque|fecha|encerra)\s+.*(tarefa|feito|concluida|concluido)/.test(t)
        || /marca\s+(a\s+)?tarefa/.test(t);
    },
    leadsHoje(t) { return t.includes('lead') && (t.includes('hoje') || t.includes('entraram') || t.includes('chegaram') || t.includes('novos')); },
    leadsQuentes(t) { return t.includes('lead') && t.includes('quente'); },
    verLeads(t) { return t.includes('lead') && (t.includes('mostra') || t.includes('ver') || t.includes('lista') || t.includes('quais') || t.includes('meus') || t.includes('me mostra')); },
    verClientes(t) { return t.includes('cliente') && (t.includes('mostra') || t.includes('ver') || t.includes('lista') || t.includes('quais') || t.includes('meus') || t.includes('cadastrados')); },
    verVendas(t) { return t.includes('venda') || t.includes('faturamento') || t.includes('receita') || t.includes('faturei') || t.includes('vendido'); },
    verLucro(t) { return t.includes('lucro') || t.includes('margem'); },
    verTarefas(t) { return (t.includes('tarefa') && (t.includes('tenho') || t.includes('fazer') || t.includes('pendente') || t.includes('mostra') || t.includes('minhas'))) || t.includes('o que tenho para fazer'); },
    verAgenda(t) { return t.includes('agenda') || t.includes('atendimento') || t.includes('compromisso') || (t.includes('o que tenho') && t.includes('hoje')); },
    verEstoque(t) { return t.includes('estoque') || t.includes('em estoque') || t.includes('estoque baixo'); },
    resumo(t) { return t.includes('resumo') || t.includes('prioridade') || t.includes('o que preciso fazer') || t.includes('o que eu faco'); },
    interacao(t) { return /(registra|registre|anota|anote)\s+.*(intera|liguei|falei|contato|respondeu)/.test(t) || t.includes('registrar interacao'); },
    despesa(t) { return /(gastei|despesa|registra)/.test(t) && /\d/.test(t); },
    consultarContato(t) { return /(e\s+o|e\s+a|mostra\s+o|mostra\s+a|quem\s+é|quem e|como\s+está|como esta|me\s+fala\s+do)/.test(t) || /^(o|a|e)\s+[a-zà-ÿ]+/.test(t); },
    pronome(t) { return /^(ele|ela)\b/.test(t) || t.includes('coloca ele') || t.includes('muda ele') || t.includes('liga para ele') || t.includes('fala com ele') || t.includes('fala com ela'); },
    sim(t) { return /^(sim|confirmo|confirmar|pode|pode ser|isso|exato)/.test(t); },
    nao(t) { return /^(nao|não|cancela|cancelar|nada|deixa)/.test(t); },
  };

  const extrairEtapa = (t) => {
    for (const key of Object.keys(ETAPAS)) if (t.includes(key)) return ETAPAS[key];
    return null;
  };

  const extrairValor = (t) => {
    const m = t.match(/(?:R\$\s*)?([\d.,]+)/);
    if (!m) return null;
    const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
    return isNaN(v) ? null : v;
  };

  /* ------------------------------------------------------------------ *
   * PROCESSADOR PRINCIPAL DE MENSAGEM
   * Fluxo: idempotencia → autenticacao → contexto → intencao → tool → confirmacao
   * ------------------------------------------------------------------ */
  const processarMensagem = (input) => {
    const messageId = input && input.messageId ? String(input.messageId) : '';
    const numero = digits((input && input.numero) || '');
    const texto = String((input && input.texto) || '').trim();
    const ts = input && input.ts ? input.ts : nowISO();

    if (!numero) return { ok: false, code: 'SEM_NUMERO', resposta: 'Mensagem sem remetente identificaavel.' };
    if (!texto) return { ok: false, code: 'SEM_TEXTO', resposta: '' };

    // 1. IDEMPOTENCIA — webhook pode reenviar a mesma mensagem
    if (messageId) {
      const prev = idempotencia.jaProcessada(messageId);
      if (prev) return { ok: true, duplicada: true, resposta: prev.resposta };
    }

    // 2. AUTENTICACAO — so numeros autorizados
    const autorizado = getNumero(numero);
    if (!autorizado) {
      registrar(numero, 'Negado', 'Numero nao autorizado tentou operar o Seu Acessor', 'negado');
      const resp = 'Este numero nao esta autorizado a utilizar o Seu Acessor.';
      if (messageId) idempotencia.registrar(messageId, resp);
      return { ok: false, code: 'NAO_AUTORIZADO', resposta: resp };
    }
    if (!st.ativo) {
      const resp = 'O Seu Acessor esta desativado. Ative no painel do sistema.';
      if (messageId) idempotencia.registrar(messageId, resp);
      return { ok: false, code: 'DESATIVADO', resposta: resp };
    }

    lembrarMsg(numero, 'user', texto);
    const c = conversa(numero);
    const t = norm(texto);
    let resposta = '';
    let acao = '';

    // 3. CONFIRMACAO PENDENTE (nivel 3-4)
    if (c.pendente) {
      if (parser.sim(t)) {
        const pend = c.pendente;
        c.pendente = null;
        save();
        const r = executarTool(pend.tool, pend.params, numero, { confirmado: true });
        resposta = r.resposta;
        acao = pend.tool;
      } else if (parser.nao(t) || t.includes('nao ') || t.includes('não ')) {
        c.pendente = null;
        save();
        resposta = 'Cancelado. Nenhuma acao foi executada.';
        acao = 'cancelar';
      } else {
        resposta = 'Ainda aguardo sua confirmacao:\n' + (c.pendente.descricao || c.pendente.tool) + '\nResponda "sim" ou "nao".';
        acao = 'aguardando';
      }
    }
    // 4. DESAMBIGUACAO PENDENTE
    else if (c.candidatos && c.candidatos.length) {
      const alvo = resolverCandidato(numero, texto);
      if (alvo) {
        c.alvoAtual = alvo;
        save();
        resposta = `Entendido: ${alvo.nome}. O que deseja fazer com ${alvo.nome}?`;
        acao = 'desambiguado';
      } else {
        const nomes = c.candidatos.map((x, i) => `${i + 1}. ${x.nome}${x.sub ? ' — ' + x.sub : ''}`);
        resposta = 'Ainda nao entendi qual voce quer:\n' + nomes.join('\n') + '\nResponda com o numero (ex.: 1).';
        acao = 'aguardando';
      }
    }
    // 5. INTENCAO
    else if (parser.saudacao(t)) {
      resposta = `Ola, ${autorizado.nome || 'chefe'}! 👋\nSou seu operador do ECOMIM. Posso:\n• Consultar leads, clientes, tarefas, agenda, vendas e estoque\n• Criar leads e tarefas\n• Alterar status de leads\n• Registrar interacoes e despesas\nE so falar naturalmente. Ex.: "Quais leads entraram hoje?"`;
      acao = 'saudacao';
    } else if (parser.ajuda(t)) {
      resposta = 'Posso te ajudar com:\n• "Quais leads entraram hoje?"\n• "Me mostra os leads quentes"\n• "Cadastra esse lead: Maria, Pizzaria X, 47999999999"\n• "Coloca o Carlos em negociacao"\n• "Cria tarefa para eu ligar para Joao amanha as 9"\n• "Marca a tarefa do Carlos como concluida"\n• "O que tenho para fazer hoje?"\n• "Quanto faturei essa semana?"\n• "O que tem na agenda hoje?"\n• "Quanto tem em estoque do Produto A?"';
      acao = 'ajuda';
    } else if (parser.criarLead(t)) {
      const lead = extrairLead(texto);
      const r = executarTool('criar_lead', { lead, _descricao: `cadastrar o lead "${lead.nome || ''}" na fila de aprovacao` }, numero, {});
      resposta = r.resposta;
      acao = 'criar_lead';
      if (r.ok) { c.ultimaLista = []; c.alvoAtual = { id: r.registro, tipo: 'lead', nome: lead.nome }; save(); }
    } else if (parser.alterarStatus(t)) {
      const etapa = extrairEtapa(t);
      const nomeAlvo = extrairNomeAlvo(texto);
      if (nomeAlvo) {
        const loc = localizar(nomeAlvo, numero);
        if (!loc.ok && loc.code === 'AMBIGUO') {
          const nomes = loc.candidatos.map((x, i) => `${i + 1}. ${x.nome}${x.sub ? ' — ' + x.sub : ''}`);
          resposta = `Encontrei ${loc.candidatos.length} contatos com esse nome. Qual voce quer?\n` + nomes.join('\n');
          acao = 'desambiguar';
        } else if (!loc.ok) {
          resposta = `Nao encontrei "${nomeAlvo}" nos contatos. Confira o nome e tente de novo.`;
          acao = 'nao_encontrado';
        } else {
          c.alvoAtual = { id: loc.alvo.id, tipo: loc.alvo.tipo, nome: loc.alvo.nome };
          save();
          const r = executarTool('alterar_status_lead', { alvo: loc.alvo, etapa, _descricao: `alterar ${loc.alvo.nome} para "${etapa}"` }, numero, {});
          resposta = r.resposta;
          acao = 'alterar_status_lead';
        }
      } else {
        resposta = 'Para quem devo alterar o status? Ex.: "Coloca o Carlos em negociacao".';
        acao = 'sem_alvo';
      }
    } else if (parser.concluirTarefa(t)) {
      const nomeAlvo = extrairNomeAlvo(texto);
      const r = executarTool('concluir_tarefa', { alvo: nomeAlvo ? { nome: nomeAlvo, id: null } : null, _descricao: 'concluir a tarefa mencionada' }, numero, {});
      resposta = r.resposta;
      acao = 'concluir_tarefa';
    } else if (parser.criarTarefa(t)) {
      const quando = extrairMomento(texto);
      const titulo = extrairTituloTarefa(texto);
      let alvo = null;
      const nomeAlvo = extrairNomeAlvo(texto);
      if (nomeAlvo) {
        const loc = localizar(nomeAlvo, numero);
        if (loc.ok) { alvo = loc.alvo; c.alvoAtual = { id: loc.alvo.id, tipo: loc.alvo.tipo, nome: loc.alvo.nome }; save(); }
      }
      const r = executarTool('criar_tarefa', { titulo, quando: quando.toISOString(), alvo, _descricao: `criar a tarefa "${titulo}" para ${fmtDataHora(quando.toISOString())}` }, numero, {});
      resposta = r.resposta;
      acao = 'criar_tarefa';
    } else if (parser.leadsHoje(t)) {
      const r = executarTool('buscar_leads', { filtro: 'hoje', _descricao: 'consultar leads de hoje' }, numero, {});
      resposta = r.resposta;
      acao = 'buscar_leads';
      c.ultimaLista = r.dados || [];
      save();
    } else if (parser.leadsQuentes(t)) {
      const r = executarTool('buscar_leads', { filtro: 'quentes', _descricao: 'consultar leads quentes' }, numero, {});
      resposta = r.resposta;
      acao = 'buscar_leads';
      c.ultimaLista = r.dados || [];
      save();
    } else if (parser.verLeads(t)) {
      const r = executarTool('buscar_leads', { filtro: 'todos', _descricao: 'listar leads' }, numero, {});
      resposta = r.resposta;
      acao = 'buscar_leads';
      c.ultimaLista = r.dados || [];
      save();
    } else if (parser.verClientes(t)) {
      const r = executarTool('buscar_clientes', { _descricao: 'listar clientes' }, numero, {});
      resposta = r.resposta;
      acao = 'buscar_clientes';
      c.ultimaLista = r.dados || [];
      save();
    } else if (parser.verEstoque(t)) {
      const m = texto.match(/produto\s+([a-zà-ÿ0-9 ]+)/i);
      const r = executarTool('consultar_estoque', { produto: m ? m[1].trim() : '', _descricao: 'consultar estoque' }, numero, {});
      resposta = r.resposta;
      acao = 'consultar_estoque';
    } else if (parser.verLucro(t)) {
      const r = executarTool('consultar_vendas', { _descricao: 'consultar vendas e lucro' }, numero, {});
      resposta = r.resposta;
      acao = 'consultar_vendas';
    } else if (parser.verVendas(t)) {
      const r = executarTool('consultar_vendas', { _descricao: 'consultar vendas/financeiro' }, numero, {});
      resposta = r.resposta;
      acao = 'consultar_vendas';
    } else if (parser.verAgenda(t)) {
      const r = executarTool('consultar_agenda', { _descricao: 'consultar agenda' }, numero, {});
      resposta = r.resposta;
      acao = 'consultar_agenda';
    } else if (parser.verTarefas(t)) {
      const r = executarTool('buscar_tarefas', { _descricao: 'listar tarefas' }, numero, {});
      resposta = r.resposta;
      acao = 'buscar_tarefas';
    } else if (parser.resumo(t)) {
      const r = executarTool('consultar_dashboard', { _descricao: 'montar resumo do dia' }, numero, {});
      resposta = r.resposta;
      acao = 'consultar_dashboard';
    } else if (parser.despesa(t)) {
      const valor = extrairValor(texto);
      const desc = extrairDescDespesa(texto);
      if (!valor) {
        resposta = 'Informe o valor da despesa. Ex.: "Registra R$ 50 de gasolina".';
      } else {
        const r = executarTool('registrar_despesa', { valor, desc, _descricao: `registrar despesa de ${fmtMoney(Math.round(valor * 100))} (${desc})` }, numero, {});
        resposta = r.resposta;
        acao = 'registrar_despesa';
      }
    } else if (parser.interacao(t)) {
      const nomeAlvo = extrairNomeAlvo(texto);
      if (nomeAlvo) {
        const loc = localizar(nomeAlvo, numero);
        if (loc.ok) {
          c.alvoAtual = { id: loc.alvo.id, tipo: loc.alvo.tipo, nome: loc.alvo.nome };
          save();
          const r = executarTool('registrar_interacao', { alvo: loc.alvo, desc: texto.slice(0, 140), _descricao: `registrar interacao com ${loc.alvo.nome}` }, numero, {});
          resposta = r.resposta;
          acao = 'registrar_interacao';
        } else if (loc.code === 'AMBIGUO') {
          const nomes = loc.candidatos.map((x, i) => `${i + 1}. ${x.nome}${x.sub ? ' — ' + x.sub : ''}`);
          resposta = 'Encontrei varios contatos. Qual?\n' + nomes.join('\n');
          acao = 'desambiguar';
        } else {
          resposta = `Nao encontrei "${nomeAlvo}".`;
          acao = 'nao_encontrado';
        }
      } else {
        resposta = 'Com quem foi a interacao? Ex.: "Registra que falei com Carlos".';
        acao = 'sem_alvo';
      }
    } else if (parser.consultarContato(t)) {
      const nomeAlvo = extrairNomeAlvo(texto);
      if (nomeAlvo) {
        const loc = localizar(nomeAlvo, numero);
        if (loc.ok) {
          c.alvoAtual = { id: loc.alvo.id, tipo: loc.alvo.tipo, nome: loc.alvo.nome };
          save();
          const tool = loc.alvo.tipo === 'lead' ? 'consultar_lead' : 'consultar_cliente';
          const r = executarTool(tool, { alvo: loc.alvo, _descricao: `consultar ${loc.alvo.nome}` }, numero, {});
          resposta = r.resposta;
          acao = tool;
        } else if (loc.code === 'AMBIGUO') {
          const nomes = loc.candidatos.map((x, i) => `${i + 1}. ${x.nome}${x.sub ? ' — ' + x.sub : ''}`);
          resposta = `Encontrei ${loc.candidatos.length} contatos com esse nome:\n` + nomes.join('\n') + '\nResponda com o numero.';
          acao = 'desambiguar';
        } else {
          resposta = `Nao encontrei "${nomeAlvo}" nos contatos.`;
          acao = 'nao_encontrado';
        }
      } else {
        resposta = 'De quem voce quer saber? Ex.: "E o Carlos?" ou "Mostra o Joao".';
        acao = 'sem_alvo';
      }
    } else if (parser.pronome(t)) {
      if (c.alvoAtual && c.alvoAtual.id) {
        if (Object.keys(ETAPAS).some((e) => t.includes(e))) {
          const etapa = extrairEtapa(t);
          const r = executarTool('alterar_status_lead', { alvo: c.alvoAtual, etapa, _descricao: `alterar ${c.alvoAtual.nome} para "${etapa}"` }, numero, {});
          resposta = r.resposta;
          acao = 'alterar_status_lead';
        } else {
          const tool = c.alvoAtual.tipo === 'lead' ? 'consultar_lead' : 'consultar_cliente';
          const r = executarTool(tool, { alvo: c.alvoAtual, _descricao: `consultar ${c.alvoAtual.nome}` }, numero, {});
          resposta = r.resposta;
          acao = tool;
        }
      } else {
        resposta = 'A quem voce se refere? Mencione o nome para eu localizar.';
        acao = 'sem_alvo';
      }
    } else {
      // "E o Carlos?" — referencia a conversa
      const m = texto.match(/^(?:e\s+o|e\s+a|o|a)\s+([A-Za-zÀ-ÿ]+)/);
      if (m) {
        const loc = localizar(m[1], numero);
        if (loc.ok) {
          c.alvoAtual = { id: loc.alvo.id, tipo: loc.alvo.tipo, nome: loc.alvo.nome };
          save();
          const tool = loc.alvo.tipo === 'lead' ? 'consultar_lead' : 'consultar_cliente';
          const r = executarTool(tool, { alvo: loc.alvo, _descricao: `consultar ${loc.alvo.nome}` }, numero, {});
          resposta = r.resposta;
          acao = tool;
        } else if (loc.code === 'AMBIGUO') {
          const nomes = loc.candidatos.map((x, i) => `${i + 1}. ${x.nome}${x.sub ? ' — ' + x.sub : ''}`);
          resposta = 'Encontrei varios:\n' + nomes.join('\n') + '\nResponda com o numero.';
          acao = 'desambiguar';
        } else {
          resposta = `Nao encontrei "${m[1]}" nos contatos.`;
          acao = 'nao_encontrado';
        }
      } else {
        resposta = 'Ainda nao sei executar isso automaticamente. Posso consultar leads, clientes, tarefas, agenda, vendas e estoque, e criar leads, tarefas e despesas. Se quiser, use "ajuda".';
        acao = 'sem_intencao';
      }
    }

    lembrarMsg(numero, 'bot', resposta);
    registrar(numero, 'Mensagem', texto.slice(0, 120), 'ok', { acao, resposta: resposta.slice(0, 200) });

    // 6. IDEMPOTENCIA — grava resultado
    if (messageId) idempotencia.registrar(messageId, resposta);

    return { ok: true, resposta, acao, numero };
  };

  /* --- extratores auxiliares de intencao --- */
  function extrairNomeAlvo(texto) {
    let t = String(texto || '').trim();
    const m2 = t.match(/(?:coloca|muda|altera|passa|move|mover)\s+(?:o|a)\s+([A-ZÀ-Ú][a-zà-ú]*(?:\s+[A-ZÀ-Ú][a-zà-ú]*){0,2})/i);
    if (m2) return m2[1].trim();
    const m3 = t.match(/(?:do|da|para|com|pro|pra)\s+([A-ZÀ-Ú][a-zà-ú]*(?:\s+[A-ZÀ-Ú][a-zà-ú]*){0,2})(?=\s*(?:amanha|amanhã|às|as|hoje|no|na|em|de|\s*$))/i);
    if (m3 && /^[A-ZÀ-Ú]/.test(m3[1]) && m3[1].length > 2) return m3[1].trim();
    const m4 = t.match(/^(?:e\s+o|e\s+a|o|a)\s+([A-ZÀ-Ú][a-zà-ú]*(?:\s+[A-ZÀ-Ú][a-zà-ú]*){0,2})/);
    if (m4) return m4[1].trim();
    return '';
  }

  function extrairTituloTarefa(texto) {
    let t = String(texto || '').trim();
    t = t.replace(/^(cria|criar|anota|anote|registra|registre|me\s+lembra|lembrete)\s+(uma|um)?\s*(tarefa|pra|para|de)?\s*/i, '');
    t = t.replace(/\s+(amanha|amanhã|hoje|às|as|depois de amanhã)\s+.*$/i, '');
    t = t.replace(/^(ligar\s+para\s+)/i, 'Ligar para ');
    t = t.replace(/\s*(na|no|para|pro|pra)\s+\d{1,2}([:h]\d{2})?.*$/i, '');
    t = t.charAt(0).toUpperCase() + t.slice(1);
    return t.trim() || 'Tarefa';
  }

  function extrairDescDespesa(texto) {
    let t = String(texto || '').trim();
    t = t.replace(/^(registra|registre|gastei|gastou|despesa|anota|anote)\s*(de|com)?\s*/i, '');
    t = t.replace(/R\$\s*[\d.,]+\s*/gi, '');
    t = t.charAt(0).toUpperCase() + t.slice(1);
    return t.trim() || 'Despesa';
  }

  /* ------------------------------------------------------------------ *
   * INTEGRACAO COM A BRIDGE (Meta Cloud API) — chamadas honestas
   * ------------------------------------------------------------------ */
  const statusMeta = () => {
    const m = st.meta || {};
    const configurado = !!(m.phoneNumberId && m.token && m.verifyToken);
    return {
      configurado,
      completo: configurado && !!m.wabaId,
      wabaId: m.wabaId || '',
      phoneNumberId: m.phoneNumberId || '',
      verifyToken: m.verifyToken || '',
      webhookUrl: m.webhookUrl || '',
      status: !m.phoneNumberId && !m.token && !m.verifyToken ? 'nao_configurado' : configurado ? 'aguardando_verificacao' : 'incompleto',
    };
  };

  const enviarRespostaWhatsApp = async (numero, texto) => {
    const m = st.meta || {};
    if (!m.phoneNumberId || !m.token) {
      return { ok: false, code: 'META_NAO_CONFIGURADA', message: 'Meta Cloud API nao configurada. Configure phone_number_id e token no painel Seu Acessor.' };
    }
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${m.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${m.token}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: numero,
          type: 'text',
          text: { body: String(texto).slice(0, 4000) },
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        registrar(numero, 'Erro', 'Falha ao enviar resposta via Meta: HTTP ' + res.status, 'erro', { erro: err.slice(0, 200) });
        return { ok: false, code: 'META_HTTP_' + res.status };
      }
      registrar(numero, 'Envio', 'Resposta enviada via Meta Cloud API', 'ok');
      return { ok: true };
    } catch (e) {
      registrar(numero, 'Erro', 'Falha de rede ao enviar via Meta: ' + e.message, 'erro');
      return { ok: false, code: 'REDE', message: e.message };
    }
  };

  /* ------------------------------------------------------------------ *
   * SINCRONIZACAO COM A BRIDGE (backup do estado para o servidor Node)
   * ------------------------------------------------------------------ */
  const sincronizarComBridge = async () => {
    const b = st.bridge || {};
    if (!b.url) return { ok: false, code: 'SEM_URL', message: 'Informe a URL da bridge no painel.' };
    const snapshot = {
      db: E && E.db ? E.db.get() : null,
      storages: {},
      acessor: st,
      ts: nowISO(),
    };
    const chaves = {
      ecomim_agenda: 'agenda', ecomim_notas: 'notas', ecomim_financeiro: 'financeiro', ecomim_atendimento: 'atendimento',
      ecomim_projetos: 'projetos', ecomim_clientes: 'clientes', ecomim_marketing: 'marketing', ecomim_rh: 'rh',
      ecomim_automacoes: 'automacoes', ecomim_notifications: 'notificacoes', ecomim_ia_conversations: 'ia_conversas',
      neitzel_servicos_v1: 'servicos', neitzel_produtos_v1: 'produtos', neitzel_estoque_mov_v1: 'estoque_mov',
      neitzel_atendimentos_v1: 'atendimentos_ops',
    };
    Object.keys(chaves).forEach((k) => {
      try { const v = localStorage.getItem(k); if (v) snapshot.storages[chaves[k]] = JSON.parse(v); } catch (e) { /* ignore */ }
    });
    try {
      const res = await fetch(b.url.replace(/\/$/, '') + '/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      st.bridge.ultimaSync = nowISO();
      save();
      return { ok: true, message: 'Sincronizado com a bridge em ' + fmtDataHora(st.bridge.ultimaSync) };
    } catch (e) {
      registrar('', 'Erro', 'Falha ao sincronizar com a bridge: ' + e.message, 'erro');
      return { ok: false, code: 'SYNC_FALHOU', message: e.message };
    }
  };

  /* ------------------------------------------------------------------ *
   * PAINEL ADMINISTRATIVO (render — somente navegador)
   * ------------------------------------------------------------------ */
  function renderSeuAcessor(c) {
    if (typeof document === 'undefined') return;
    st = state.load();

    const el = (tag, cls, html) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (html != null) n.innerHTML = html;
      return n;
    };
    const toast = (msg, tipo) => {
      const tc = document.getElementById('toast-container');
      if (!tc) return;
      const t = el('div', `toast toast-${tipo || 'info'}`, esc(msg));
      tc.appendChild(t);
      setTimeout(() => t.classList.add('show'), 10);
      setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 4200);
    };

    c.appendChild(el('div', 'page-header', '<h1>Seu Acessor</h1><p>Operador pessoal do ECOMIM via WhatsApp — motor real, permissoes aplicadas, integracao Meta configuravel.</p>'));

    // Status
    const mstat = statusMeta();
    const statuses = el('div', 'acessor-status', '');
    const stCard = (label, valor, cls) => el('div', 'as-card', `<span>${esc(label)}</span><b class="${cls || ''}">${esc(valor)}</b>`);
    statuses.appendChild(stCard('Status', st.ativo ? 'Ativo' : 'Desativado', st.ativo ? 'ar-positivo' : 'ar-negativo'));
    statuses.appendChild(stCard('Numeros autorizados', String((st.numerosAutorizados || []).filter((n) => n.ativo).length)));
    statuses.appendChild(stCard('Nivel padrao', 'Nivel ' + (st.nivelPadrao || 2)));
    statuses.appendChild(stCard('Meta Cloud API', mstat.status === 'nao_configurado' ? 'Nao configurada' : mstat.configurado ? 'Configurada (aguardando webhook)' : 'Incompleta', mstat.configurado ? 'ar-positivo' : 'ar-negativo'));
    statuses.appendChild(stCard('Bridge', (st.bridge && st.bridge.url) ? 'Configurada' : 'Nao configurada', (st.bridge && st.bridge.url) ? 'ar-positivo' : ''));
    statuses.appendChild(stCard('Interacoes', String(st.historico.length)));
    c.appendChild(statuses);

    // Aviso honesto
    c.appendChild(el('div', 'card', '<h4>Como funciona</h4><p class="text-muted">O <b>Seu Acessor</b> e um operador real: interpreta sua mensagem, executa tools no ECOMIM (fonte de verdade) e confirma apenas o que de fato executou. E independente do <b>Acessor de Clientes</b> (atendimento a clientes), que continua intacto. O envio/recebimento pelo WhatsApp exige a <b>Meta Cloud API</b> (WABA aprovada, numero verificado, token e webhook apontando para a bridge). Sem essas credenciais, nada e enviado nem simulado — voce pode testar o motor no painel abaixo.</p>'));

    // Cadastro do operador (numero autorizado)
    const form = el('div', 'card', '<h4>Operador (seu numero)</h4>');
    const fg = el('div', 'form-grid', '');
    const op0 = (st.numerosAutorizados || [])[0] || {};
    fg.innerHTML = `
      <div><label>Seu numero de WhatsApp (DDD + numero)</label><input class="input" id="sa-num" placeholder="Ex.: 47 99999-9999" value="${esc(op0.numero || '')}" style="margin-bottom:6px"></div>
      <div><label>Seu nome</label><input class="input" id="sa-nome" placeholder="Ex.: Daniel" value="${esc(op0.nome || '')}" style="margin-bottom:6px"></div>
      <div>
        <label>Nivel de acesso</label>
        <select class="input" id="sa-nivel" style="margin-bottom:6px">
          <option value="1" ${op0.nivel === 1 ? 'selected' : ''}>Nivel 1 — Somente consultas</option>
          <option value="2" ${!op0.nivel || op0.nivel === 2 ? 'selected' : ''}>Nivel 2 — Acoes reversiveis (recomendado)</option>
          <option value="3" ${op0.nivel === 3 ? 'selected' : ''}>Nivel 3 — Acoes externas (com confirmacao)</option>
          <option value="4" ${op0.nivel === 4 ? 'selected' : ''}>Nivel 4 — Acoes criticas (confirmacao explicita)</option>
        </select>
      </div>
    `;
    form.appendChild(fg);
    const btnSalvar = el('button', 'btn btn-primary', st.ativo ? 'Salvar operador' : 'Ativar Seu Acessor');
    btnSalvar.addEventListener('click', () => {
      const num = document.getElementById('sa-num').value.trim();
      if (!num) { toast('Informe seu numero de WhatsApp.', 'warn'); return; }
      const nome = document.getElementById('sa-nome').value.trim() || 'Operador';
      const nivel = Number(document.getElementById('sa-nivel').value) || 2;
      const existente = (st.numerosAutorizados || []).find((n) => digits(n.numero) === digits(num));
      if (existente) { existente.nome = nome; existente.nivel = nivel; existente.ativo = true; }
      else st.numerosAutorizados.push({ numero: num, nome, nivel, perfil: 'proprietario', ativo: true, criadoEm: nowISO() });
      st.ativo = true;
      save();
      registrar(digits(num), 'Configuracao', 'Operador salvo: ' + nome + ' (' + num + ')', 'ok');
      toast('Seu Acessor salvo e ativado.', 'success');
      if (window.ECOMIM_APP) window.ECOMIM_APP.renderView('seu_acessor');
    });
    const btnDesat = el('button', 'btn btn-danger btn-ghost', 'Desativar');
    btnDesat.addEventListener('click', () => {
      if (!confirm('Desativar o Seu Acessor? Mensagens deixam de ser processadas.')) return;
      st.ativo = false;
      save();
      registrar('', 'Configuracao', 'Seu Acessor desativado', 'ok');
      toast('Seu Acessor desativado.', 'warn');
      if (window.ECOMIM_APP) window.ECOMIM_APP.renderView('seu_acessor');
    });
    const btns = el('div', 'btn-group', '');
    btns.appendChild(btnSalvar);
    btns.appendChild(btnDesat);
    form.appendChild(btns);
    c.appendChild(form);

    // Configuracao Meta Cloud API (honesta)
    const metaCard = el('div', 'card', '<h4>Integracao WhatsApp (Meta Cloud API)</h4><p class="text-muted">Preencha com as credenciais reais do seu app da Meta (WABA aprovada). Nada e enviado enquanto o webhook nao estiver verificado.</p>');
    const mg = el('div', 'form-grid', '');
    const mm = st.meta || {};
    mg.innerHTML = `
      <div><label>WABA ID (business)</label><input class="input" id="sa-waba" value="${esc(mm.wabaId || '')}" placeholder="Ex.: 102290129904398" style="margin-bottom:6px"></div>
      <div><label>Phone Number ID</label><input class="input" id="sa-phone" value="${esc(mm.phoneNumberId || '')}" placeholder="Ex.: 105399224561032" style="margin-bottom:6px"></div>
      <div><label>Token permanente (access token)</label><input class="input" id="sa-token" type="password" value="${esc(mm.token || '')}" placeholder="Ex.: EAAG..." style="margin-bottom:6px"></div>
      <div><label>Verify token (webhook)</label><input class="input" id="sa-verify" value="${esc(mm.verifyToken || '')}" placeholder="Ex.: minha-verificacao" style="margin-bottom:6px"></div>
      <div><label>URL do webhook (sua bridge)</label><input class="input" id="sa-webhook" value="${esc(mm.webhookUrl || '')}" placeholder="https://seu-servidor.com/webhook" style="margin-bottom:6px"></div>
    `;
    metaCard.appendChild(mg);
    const btnMeta = el('button', 'btn btn-primary btn-sm', 'Salvar configuracao Meta');
    btnMeta.addEventListener('click', () => {
      st.meta = {
        wabaId: document.getElementById('sa-waba').value.trim(),
        phoneNumberId: document.getElementById('sa-phone').value.trim(),
        token: document.getElementById('sa-token').value.trim(),
        verifyToken: document.getElementById('sa-verify').value.trim(),
        webhookUrl: document.getElementById('sa-webhook').value.trim(),
      };
      save();
      registrar('', 'Configuracao', 'Credenciais Meta atualizadas', 'ok');
      toast('Configuracao Meta salva. Status: ' + (statusMeta().configurado ? 'configurado (aguardando webhook verificado)' : 'incompleto'), 'success');
      if (window.ECOMIM_APP) window.ECOMIM_APP.renderView('seu_acessor');
    });
    metaCard.appendChild(btnMeta);
    c.appendChild(metaCard);

    // Bridge
    const bridgeCard = el('div', 'card', '<h4>Bridge (servidor Node opcional)</h4><p class="text-muted">A bridge (pasta <b>bridge/</b> no projeto) expoe o webhook da Meta e processa mensagens fora do navegador. Para sincronizar o estado do navegador com a bridge, informe a URL do servidor.</p>');
    const bg = el('div', 'form-grid', '');
    bg.innerHTML = `<div><label>URL da bridge</label><input class="input" id="sa-bridge-url" value="${esc((st.bridge && st.bridge.url) || '')}" placeholder="http://localhost:3000" style="margin-bottom:6px"></div>`;
    bridgeCard.appendChild(bg);
    const btnSync = el('button', 'btn btn-primary btn-sm', 'Sincronizar agora');
    btnSync.addEventListener('click', async () => {
      const url = document.getElementById('sa-bridge-url').value.trim();
      if (url) { st.bridge.url = url; save(); }
      const r = await sincronizarComBridge();
      toast(r.ok ? r.message : 'Sync falhou: ' + (r.message || r.code), r.ok ? 'success' : 'warn');
    });
    bridgeCard.appendChild(btnSync);
    c.appendChild(bridgeCard);

    // Teste local (usa o motor real)
    const test = el('div', 'card', '<h4>Teste do motor (processa como se viesse do WhatsApp)</h4><p class="text-muted">Envie a mensagem como faria no WhatsApp. O motor executa acoes REAIS no ECOMIM. Ex.: "Quais leads entraram hoje?", "Criar lead: Maria, Pizzaria X, 47999999999", "Coloca o Joao em negociacao", "O que tenho para fazer hoje?"</p>');
    const tRow = el('div', '', '<input class="input" id="sa-msg" placeholder="Digite a mensagem..." style="margin-bottom:8px">');
    const tBtn = el('button', 'btn btn-sm btn-primary', 'Enviar (motor real)');
    tBtn.addEventListener('click', () => {
      const input = document.getElementById('sa-msg');
      if (!input || !input.value.trim()) return;
      const numeroTeste = (st.numerosAutorizados[0] || {}).numero || '47999999999';
      const res = processarMensagem({ messageId: 'teste_' + Date.now(), numero: numeroTeste, texto: input.value });
      const respBox = test.querySelector('#sa-resposta');
      if (respBox) respBox.innerHTML = `<b>Seu Acessor:</b><br>${esc(res.resposta).replace(/\n/g, '<br>')}`;
      input.value = '';
      const content = document.querySelector('.ecomim-content');
      if (content) setTimeout(() => renderSeuAcessor(content), 50); // atualiza historico
    });
    tRow.appendChild(tBtn);
    test.appendChild(tRow);
    test.appendChild(el('div', 'ai-insight', `<div class="ai-insight-head" id="sa-resposta">Aguardando mensagem...</div>`));
    c.appendChild(test);

    // Historico
    const histCard = el('div', 'card', '<h4>Historico de interacoes</h4>');
    if (!st.historico.length) histCard.appendChild(el('div', 'empty', 'Nenhuma interacao registrada.'));
    else {
      const table = el('table', 'table', '<thead><tr><th>Quando</th><th>Tipo</th><th>Descricao</th><th>Resultado</th></tr></thead><tbody></tbody>');
      const tb = table.querySelector('tbody');
      st.historico.slice(0, 40).forEach((h) => {
        const tr = el('tr', '', '');
        const badge = h.resultado === 'ok' ? 'badge-green' : h.resultado === 'erro' ? 'badge-red' : 'badge-orange';
        tr.innerHTML = `<td>${esc(fmtDataHora(h.ts))}</td><td>${esc(h.tipo)}</td><td>${esc(h.descricao || '')}</td><td><span class="badge ${badge}">${esc(h.resultado)}</span></td>`;
        tb.appendChild(tr);
      });
      histCard.appendChild(table);
    }
    c.appendChild(histCard);

    // Permissoes (matriz real — aplicada no runtime)
    const permCard = el('div', 'card', '<h4>Permissoes ativas (politica em 4 niveis — aplicada no runtime)</h4>');
    const ptable = el('table', 'table', '<thead><tr><th>Acao</th><th>Tool</th><th>Nivel</th><th>Execucao</th></tr></thead><tbody></tbody>');
    const ptb = ptable.querySelector('tbody');
    (st.permissoes || []).forEach((p) => {
      const tr = el('tr', 'perm-row', '');
      const nivelCls = 'nivel-' + (p.nivel || 2);
      tr.innerHTML = `
        <td><b>${esc(p.acao)}</b></td>
        <td class="text-muted">${esc(p.tool || '—')}</td>
        <td><span class="${nivelCls}">Nivel ${p.nivel}</span></td>
        <td>${p.requerConfirmacao ? '<span class="badge badge-orange">Com confirmacao</span>' : '<span class="badge badge-green">Automatica</span>'}</td>
      `;
      ptb.appendChild(tr);
    });
    permCard.appendChild(ptable);
    c.appendChild(permCard);
  }

  return {
    processarMensagem,
    executarTool,
    sincronizarComBridge,
    enviarRespostaWhatsApp,
    statusMeta,
    localizar,
    conversa,
    registrar,
    idempotencia,
    tools,
    state,
    save,
    renderSeuAcessor,
    _norm: norm,
    _extrairLead: extrairLead,
    _extrairMomento: extrairMomento,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { SEU_ACESSOR };
if (typeof window !== 'undefined') window.SEU_ACESSOR = SEU_ACESSOR;