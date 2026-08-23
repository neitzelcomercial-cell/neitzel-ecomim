/* NEITZEL — API do Portal (rotas /api/*). Preço/duração SEMPRE do banco. */
'use strict';
const store = require('./store');
const T = require('./time');
const engine = require('./engine');

const json = (res, code, obj) => {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (CORS_ORIGIN) headers['Access-Control-Allow-Origin'] = CORS_ORIGIN;
  res.writeHead(code, headers);
  res.end(JSON.stringify(obj));
};
const errJson = (res, code, codeErr, msg) => json(res, code, { ok: false, code: codeErr, message: msg || codeErr });

let CORS_ORIGIN = '';
function setCorsOrigin(v) { CORS_ORIGIN = v || ''; }

const hits = new Map();
function rateLimit(ip, limite) {
  const agora = Date.now();
  let rec = hits.get(ip);
  if (!rec || agora - rec.t0 > 60000) { rec = { t0: agora, n: 0 }; hits.set(ip, rec); }
  rec.n++;
  if (hits.size > 5000) hits.clear();
  return rec.n <= limite;
}

const digits = (s) => String(s || '').replace(/\D/g, '');
const uid = (p) => (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* --------------------------- contexto de agora ---------------------------- */
function ctxAgora(db) {
  const n = T.nowInTZ(db.config.timezone);
  return { hojeYmd: n.ymd, agoraMin: n.minutes, agoraTs: Date.now() };
}

function servicoPublico(db, id) {
  const s = db.services.find((x) => x.id === id && x.status === 'ativo' && x.portalVisivel !== false);
  return s || null;
}

function linksPortal() {
  const os = require('os');
  const port = process.env.PORT || 8080;
  const rede = [];
  try {
    for (const lista of Object.values(os.networkInterfaces())) {
      for (const ni of lista || []) {
        if (ni.family === 'IPv4' && !ni.internal) rede.push('http://' + ni.address + ':' + port + '/agendamento');
      }
    }
  } catch (e) {}
  return { local: 'http://localhost:' + port + '/agendamento', rede };
}

function publicConfig(db) {
  const c = db.config;
  return {
    ok: true,
    ativo: !!c.portalAtivo,
    empresaNome: c.empresaNome, segmento: c.segmento, telefone: c.telefone, instagram: c.instagram,
    timezone: c.timezone, slotMin: c.slotMin, janelaDias: c.janelaDias,
    permitirCancelar: !!c.permitirCancelarCliente, cancelarAteHoras: c.cancelarAteHoras,
    permitirRemarcar: !!c.permitirRemarcarCliente,
    mensagemFechado: c.mensagemFechado,
    schedule: db.schedule,
    specialHours: db.specialHours.map((s) => ({ date: s.date, periodos: s.periodos })),
    blockedDates: db.blockedDates.map((b) => b.date),
    links: linksPortal(),
    services: db.services.filter((s) => s.status === 'ativo' && s.portalVisivel !== false)
      .map((s) => ({ id: s.id, nome: s.nome, descricao: s.descricao, categoria: s.categoria, precoCentavos: s.preco, duracaoMin: s.duracaoMin || null })),
    products: db.products.filter((p) => p.status === 'ativo')
      .map((p) => ({ id: p.id, nome: p.nome, precoCentavos: p.preco }))
  };
}

/* ------------------------------- HOLDS ------------------------------------ */
function criarHold(db, body) {
  const ctx = ctxAgora(db);
  if (!db.config.portalAtivo) return { code: 'PORTAL_INATIVO' };
  const s = servicoPublico(db, body.serviceId);
  if (!s) return { code: 'SERVICO_INVALIDO' };
  const ymd = String(body.date || '');
  if (!T.isValidYmd(ymd)) return { code: 'DATA_INVALIDA' };
  const start = Number(body.time);
  if (!Number.isInteger(start)) return { code: 'HORARIO_INVALIDO' };
  const slotMin = Math.max(5, Number(db.config.slotMin) || 15);
  const dur = Math.max(5, Number(s.duracaoMin) || slotMin);
  const intervalo = Math.max(0, Number(s.intervaloMin != null ? s.intervaloMin : db.config.intervaloPadraoMin) || 0);
  const fimOp = start + dur + intervalo;
  if (ymd < ctx.hojeYmd || engine.diaFechado(db, ymd)) return { code: 'INDISPONIVEL' };
  const { periodos } = engine.periodosDoDia(db, ymd);
  if (!periodos.some((p) => start >= p.start && fimOp <= p.end)) return { code: 'FORA_DO_HORARIO' };
  if (ymd === ctx.hojeYmd && start < ctx.agoraMin + (Number(db.config.antecedenciaMinMinutos) || 0)) return { code: 'ANTECEDENCIA' };
  if (engine.bloqueadoPorHorario(db, ymd, start, fimOp)) return { code: 'BLOQUEADO' };
  engine.purgeExpired(db, ctx.agoraTs);
  if (!engine.temVaga(db, ymd, start, fimOp, ctx.agoraTs, null)) return { code: 'OCUPADO' };
  const ttl = Math.min(30, Math.max(1, Number(body.ttlMinutos || db.config.holdTtlMinutos) || 5));
  const hold = {
    id: uid('h'), serviceId: s.id, professionalId: body.professionalId || null,
    date: ymd, startMin: start, endMin: fimOp,
    contato: digits(body.telefone).slice(-4) || '0000',
    status: 'active', criadoEm: new Date().toISOString(),
    expiresAt: Date.now() + ttl * 60000
  };
  db.holds.push(hold);
  store.audit('hold.criado', { holdId: hold.id, date: ymd, start });
  return { ok: true, hold };
}

/* ---------------------------- APPOINTMENTS -------------------------------- */
function validarCliente(db, c) {
  const nome = String(c && c.nome || '').trim().slice(0, 80);
  const tel = digits(c && c.telefone);
  if (nome.length < 2) return { code: 'NOME_INVALIDO' };
  if (tel.length < 10) return { code: 'TELEFONE_INVALIDO' };
  const email = String(c && c.email || '').trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { code: 'EMAIL_INVALIDO' };
  return { ok: true, nome, tel, email };
}

function acharOuCriarCliente(db, v) {
  let cli = db.customers.find((x) => x.telefone === v.tel);
  if (!cli) {
    cli = { id: uid('c'), nome: v.nome, telefone: v.tel, email: v.email || '', criadoEm: new Date().toISOString(), origem: 'PORTAL_CLIENTE' };
    db.customers.push(cli);
    store.audit('cliente.criado', { clienteId: cli.id, nome: v.nome });
  } else if (v.nome && v.nome !== cli.nome) {
    cli.nome = v.nome;
  }
  if (v.email) cli.email = v.email;
  return cli;
}

/** Transação de confirmação — roda DENTRO do mutex (api.handle faz transact). */
function confirmarTx(db, body) {
  const ctx = ctxAgora(db);
  engine.purgeExpired(db, ctx.agoraTs);
  const idemKey = String(body.idempotencyKey || '');
  if (!idemKey) return { code: 'IDEMPOTENCIA_AUSENTE' };
  if (db.idempotency[idemKey]) return { repetido: db.idempotency[idemKey] };

  const vc = validarCliente(db, body.customer);
  if (!vc.ok) return vc;
  const s = servicoPublico(db, body.serviceId);
  if (!s) return { code: 'SERVICO_INVALIDO' };
  const ymd = String(body.date || '');
  const start = Number(body.time);
  if (!T.isValidYmd(ymd) || !Number.isInteger(start)) return { code: 'DADOS_INVALIDOS' };
  if (!db.config.portalAtivo) return { code: 'PORTAL_INATIVO' };

  const slotMin = Math.max(5, Number(db.config.slotMin) || 15);
  const dur = Math.max(5, Number(s.duracaoMin) || slotMin);
  const intervalo = Math.max(0, Number(s.intervaloMin != null ? s.intervaloMin : db.config.intervaloPadraoMin) || 0);
  const fimOp = start + dur + intervalo;

  // Revalidação completa (mesmo com hold): nada vem do frontend.
  if (ymd < ctx.hojeYmd || engine.diaFechado(db, ymd)) return { code: 'INDISPONIVEL' };
  const { periodos } = engine.periodosDoDia(db, ymd);
  if (!periodos.some((p) => start >= p.start && fimOp <= p.end)) return { code: 'FORA_DO_HORARIO' };
  if (ymd === ctx.hojeYmd && start < ctx.agoraMin + (Number(db.config.antecedenciaMinMinutos) || 0)) return { code: 'ANTECEDENCIA' };
  if (engine.bloqueadoPorHorario(db, ymd, start, fimOp)) return { code: 'BLOQUEADO' };
  if (!engine.temVaga(db, ymd, start, fimOp, ctx.agoraTs, null, body.holdId || null)) return { code: 'HORARIO_INDISPONIVEL', message: 'Este horário pode ter acabado de ser reservado por outra pessoa.' };

  // Produtos: apenas ids reais do catálogo; preços vindos do banco.
  const itens = (Array.isArray(body.productIds) ? body.productIds : []).slice(0, 20)
    .map((pid) => db.products.find((p) => p.id === pid && p.status === 'ativo'))
    .filter(Boolean)
    .map((p) => ({ produtoId: p.id, produtoNome: p.nome, quantidade: 1, precoUnitario: Number(p.preco) || 0 }));

  const cli = acharOuCriarCliente(db, vc);
  const ap = {
    id: uid('a'), codigo: String(db.seq++).padStart(4, '0') + '-' + ymd.replace(/-/g, '').slice(4),
    date: ymd, startMin: start, endMin: start + dur,
    serviceId: s.id, servicoNome: s.nome, precoCentavos: Number(s.preco) || 0, duracaoMin: dur,
    professionalId: body.professionalId || null,
    clienteId: cli.id, clienteNome: cli.nome, clienteTelefone: cli.telefone, clienteEmail: cli.email || '',
    itensProdutos: itens,
    observacoes: String(body.notes || '').trim().slice(0, 500),
    status: 'confirmed', origem: 'PORTAL_CLIENTE',
    criadoEm: new Date().toISOString(),
    inicioISO: T.zonedToISO(ymd, start, db.config.timezone),
    fimISO: T.zonedToISO(ymd, start + dur, db.config.timezone),
    holdId: null
  };
  // Consome o hold se existir e pertence ao mesmo slot
  if (body.holdId) {
    const h = db.holds.find((x) => x.id === body.holdId);
    if (h && h.status === 'active') { h.status = 'converted'; ap.holdId = h.id; }
  }
  db.appointments.push(ap);
  store.audit('agendamento.criado', { id: ap.id, codigo: ap.codigo, date: ymd, start, cliente: cli.nome });
  const resposta = { ok: true, appointment: resumoPublico(ap) };
  db.idempotency[idemKey] = resposta;
  return resposta;
}

function resumoPublico(a) {
  return {
    id: a.id, codigo: a.codigo, date: a.date, startMin: a.startMin, endMin: a.endMin,
    servicoNome: a.servicoNome, precoCentavos: a.precoCentavos, duracaoMin: a.duracaoMin,
    clienteNome: a.clienteNome, observacoes: a.observacoes,
    itensProdutos: a.itensProdutos.map((i) => ({ nome: i.produtoNome, precoCentavos: i.precoUnitario })),
    status: a.status
  };
}

/** Cancelamento público: exige código + últimos 4 dígitos do telefone. */
function cancelarTx(db, id, ultimos4) {
  const a = db.appointments.find((x) => x.id === id);
  if (!a) return { code: 'NAO_ENCONTRADO' };
  if (!['confirmed', 'pending'].includes(a.status)) return { code: 'STATUS_INVALIDO' };
  if (!db.config.permitirCancelarCliente) return { code: 'CANCELAMENTO_DESATIVADO' };
  if (String(ultimos4 || '') !== String(a.clienteTelefone).slice(-4)) return { code: 'AUTENTICACAO_FALHOU' };
  const ctx = ctxAgora(db);
  if (a.date < ctx.hojeYmd || (a.date === ctx.hojeYmd && a.startMin < ctx.agoraMin + (Number(db.config.cancelarAteHoras) * 60 || 0))) {
    return { code: 'PRAZO_EXPIRADO', message: 'Prazo mínimo para cancelamento atingido. Fale conosco pelo WhatsApp.' };
  }
  a.status = 'cancelled'; a.canceladoEm = new Date().toISOString();
  store.audit('agendamento.cancelado_portal', { id: a.id, codigo: a.codigo });
  return { ok: true };
}

/* --------------------------------- ADMIN ---------------------------------- */
function isAdmin(req, db) {
  const esperado = process.env.NEITZEL_ADMIN_TOKEN || '';
  if (!esperado) return false;
  const h = req.headers['authorization'] || '';
  return h === 'Bearer ' + esperado;
}

const rotasAdmin = {
  'GET /api/admin/config': (db) => ({ ok: true, config: db.config, schedule: db.schedule, specialHours: db.specialHours, blockedDates: db.blockedDates, blockedTimes: db.blockedTimes, links: linksPortal() }),
  'GET /api/admin/appointments': (db, q) => {
    let lista = db.appointments;
    if (q.from) lista = lista.filter((a) => a.date >= q.from);
    if (q.to) lista = lista.filter((a) => a.date <= q.to);
    return { ok: true, appointments: lista.slice(-500).reverse() };
  },
  'GET /api/admin/audit': (db) => ({ ok: true, auditLog: db.auditLog.slice(-300).reverse() }),
};

/** Transações admin de mutação (rodam no mutex). */
function adminMutacao(db, acao, body) {
  switch (acao) {
    case 'put-config': {
      const c = db.config, b = body || {};
      const nums = ['slotMin', 'antecedenciaMinMinutos', 'janelaDias', 'holdTtlMinutos', 'capacidadePorSlot', 'cancelarAteHoras', 'intervaloPadraoMin'];
      const strs = ['empresaNome', 'segmento', 'telefone', 'instagram', 'timezone', 'mensagemFechado'];
      strs.forEach((k) => { if (typeof b[k] === 'string') c[k] = b[k].slice(0, 120); });
      nums.forEach((k) => { if (b[k] !== undefined && Number.isFinite(Number(b[k])) && Number(b[k]) >= 0) c[k] = Number(b[k]); });
      ['portalAtivo', 'permitirCancelarCliente', 'permitirRemarcarCliente'].forEach((k) => { if (typeof b[k] === 'boolean') c[k] = b[k]; });
      store.audit('admin.config_atualizada', c);
      return { ok: true };
    }
    case 'put-schedule': {
      const s = body && body.schedule;
      if (!s || typeof s !== 'object' || Array.isArray(s)) return { code: 'DADOS_INVALIDOS' };
      for (const k of Object.keys(s)) if (!/^[0-6]$/.test(k)) return { code: 'DADOS_INVALIDOS' };
      for (let d = 0; d < 7; d++) {
        const per = Array.isArray(s[d]) ? s[d] : [];
        db.schedule[d] = per
          .map((p) => ({ start: Number(p.start), end: Number(p.end) }))
          .filter((p) => Number.isInteger(p.start) && Number.isInteger(p.end) && p.end > p.start && p.start >= 0 && p.end <= 1440)
          .slice(0, 4);
      }
      store.audit('admin.agenda_semanal', db.schedule);
      return { ok: true };
    }
    default: return null;
  }
}

function adminListaAdd(db, colecao, body, campos) {
  const item = { id: uid('b') };
  for (const [k, fn] of campos) {
    const v = fn(body[k]);
    if (v === undefined || v === null || v === '') return { code: 'DADOS_INVALIDOS', campo: k };
    item[k] = v;
  }
  db[colecao].push(item);
  store.audit('admin.' + colecao + '_add', item);
  return { ok: true, item };
}

function adminRemove(db, colecao, id) {
  const i = db[colecao].findIndex((x) => x.id === id);
  if (i < 0) return { code: 'NAO_ENCONTRADO' };
  const [rem] = db[colecao].splice(i, 1);
  store.audit('admin.' + colecao + '_remove', rem);
  return { ok: true };
}

/** Sincroniza catálogo real do sistema (SPA → backend). */
function syncCatalogo(db, body) {
  const normS = (s) => ({
    id: String(s.id), nome: String(s.nome || '').slice(0, 80),
    descricao: String(s.descricao || '').slice(0, 300), categoria: String(s.categoria || ''),
    preco: Math.max(0, Math.round(Number(s.preco) || 0)),
    duracaoMin: Math.max(0, Number(s.duracaoMin) || 0),
    status: s.status === 'inativo' ? 'inativo' : 'ativo',
    portalVisivel: s.portalVisivel !== false
  });
  const normP = (p) => ({
    id: String(p.id), nome: String(p.nome || '').slice(0, 80),
    preco: Math.max(0, Math.round(Number(p.preco) || 0)),
    status: p.status === 'inativo' ? 'inativo' : 'ativo'
  });
  if (Array.isArray(body.servicos)) db.services = body.servicos.map(normS);
  if (Array.isArray(body.produtos)) db.products = body.produtos.map(normP);
  store.audit('admin.catalogo_sincronizado', { servicos: db.services.length, produtos: db.products.length });
  return { ok: true, servicos: db.services.length, produtos: db.products.length };
}

/** Muda status de agendamento (admin): cancelar/concluir/no_show/reabrir. */
function adminStatusTx(db, id, novo) {
  const a = db.appointments.find((x) => x.id === id);
  if (!a) return { code: 'NAO_ENCONTRADO' };
  const permitidos = { confirmed: ['cancelled', 'completed', 'no_show'], cancelled: ['confirmed'], completed: [], no_show: [] };
  if (!(novo === 'confirmed' && a.status === 'cancelled') && !['cancelled', 'completed', 'no_show'].includes(novo)) return { code: 'STATUS_INVALIDO' };
  if (!permitidos[a.status] || !permitidos[a.status].includes(novo)) return { code: 'TRANSICAO_INVALIDA', de: a.status };
  const antes = a.status;
  a.status = novo; a.atualizadoEm = new Date().toISOString();
  store.audit('admin.agendamento_status', { id: a.id, codigo: a.codigo, antes, novo });
  return { ok: true };
}

/** Pesquisa web para o agente: DuckDuckGo Instant Answers + Wikipédia PT (sem chaves). */
const cacheWeb = new Map();
async function buscarWeb(q) {
  q = String(q || '').slice(0, 200).trim();
  if (!q) return { ok: false };
  const hit = cacheWeb.get(q);
  if (hit && Date.now() - hit.ts < 600000) return hit.val;
  const fontes = [];
  let texto = '';
  const ddg = fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(q) + '&format=json&no_html=1&skip_disambig=1', { signal: AbortSignal.timeout(8000) }).then((r) => r.json()).catch(() => null);
  const wikiBusca = fetch('https://pt.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&origin=*&srsearch=' + encodeURIComponent(q), { signal: AbortSignal.timeout(8000) }).then((r) => r.json()).catch(() => null);
  const [d, w] = await Promise.all([ddg, wikiBusca]);
  if (d) {
    if (d.Answer) texto += '**' + String(d.Answer).slice(0, 200) + '**\n';
    if (d.AbstractText) texto += d.AbstractText + '\n';
    else if (d.Definition && !texto) texto += d.Definition + '\n';
    (d.RelatedTopics || []).slice(0, 2).forEach((tp) => { if (tp.Text) fontes.push({ titulo: tp.Text.slice(0, 90), url: tp.FirstURL }); });
  }
  const titulo = w && w.query && w.query.search && w.query.search[0] && w.query.search[0].title;
  if (titulo) {
    const s = await fetch('https://pt.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(titulo), { signal: AbortSignal.timeout(8000) }).then((r) => r.json()).catch(() => null);
    if (s && s.extract) texto += s.extract + '\n';
    if (s && s.content_urls) fontes.push({ titulo: (s.titles && s.titles.normalized) || titulo, url: s.content_urls.desktop.page });
  }
  texto = texto.trim();
  if (!texto && !fontes.length) return { ok: false };
  const val = { ok: true, texto: texto || 'Encontrei estas fontes sobre o assunto.', fontes };
  cacheWeb.set(q, { ts: Date.now(), val });
  return val;
}

module.exports = { json, errJson, rateLimit, ctxAgora, publicConfig, servicoPublico, criarHold, confirmarTx, cancelarTx, isAdmin, rotasAdmin, adminMutacao, adminListaAdd, adminRemove, syncCatalogo, adminStatusTx, resumoPublico, buscarWeb, setCorsOrigin };








