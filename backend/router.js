/* NEITZEL — Router /api/* : liga HTTP às operações transacionais + SSE. */
'use strict';
const store = require('./store');
const T = require('./time');
const api = require('./api');
const engine = require('./engine');

const sseClients = new Set();

function broadcast(tipo, payload) {
  const msg = 'event: changed\ndata: ' + JSON.stringify({ tipo, payload, t: Date.now() }) + '\n\n';
  for (const res of sseClients) { try { res.write(msg); } catch (e) { /* ignora */ } }
}

function handleSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store',
    'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*'
  });
  res.write('retry: 3000\n\n');
  sseClients.add(res);
  res.on('close', () => sseClients.delete(res));
}

/** Ponto de entrada. `body` já é objeto (ou null). Retorna true se tratou. */
function handle(req, res, url, body, ip) {
  const db = store.db;
  const rota = req.method + ' ' + url.pathname;

  /* ---------- SSE ---------- */
  if (url.pathname === '/api/events') { handleSSE(res); return true; }

  /* ---------- HEALTH (deploy/monitoramento) ---------- */
  if (url.pathname === '/api/health') {
    return api.json(res, 200, { ok: true, servico: 'neitzel-backend', uptime: process.uptime() }), true;
  }


  /* ---------- PÚBLICO: leitura ---------- */
  if (rota === 'GET /api/public/config') {
    return api.json(res, 200, api.publicConfig(db)), true;
  }

  if (url.pathname === '/api/public/availability') {
    const sid = url.searchParams.get('serviceId');
    const ymd = String(url.searchParams.get('date') || '');
    const s = api.servicoPublico(db, sid);
    if (!s) return api.errJson(res, 404, 'SERVICO_INVALIDO'), true;
    if (!T.isValidYmd(ymd)) return api.errJson(res, 400, 'DATA_INVALIDA'), true;
    engine.purgeExpired(db, Date.now());
    const ctx = api.ctxAgora(db);
    return api.json(res, 200, engine.disponibilidade(db, s, ymd, ctx)), true;
  }

  /* ---------- PÚBLICO: escrita (rate-limited) ---------- */
  const escrita = url.pathname.startsWith('/api/public/hold') || url.pathname === '/api/public/appointments';
  if (!api.rateLimit(ip, escrita ? 40 : 240)) return api.errJson(res, 429, 'MUITAS_REQUISICOES'), true;

  if (rota === 'POST /api/public/holds') {
    store.transact((d) => api.criarHold(d, body || {})).then((r) => {
      if (!r.ok) { api.json(res, r.code === 'OCUPADO' ? 409 : 400, { ok: false, code: r.code }); return; }
      broadcast('hold', { date: r.hold.date });
      api.json(res, 201, { ok: true, hold: { id: r.hold.id, expiresAt: r.hold.expiresAt, date: r.hold.date, startMin: r.hold.startMin } });
    }).catch((e) => api.errJson(res, 500, 'ERRO_INTERNO', e.message));
    return true;
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/public/holds/')) {
    const id = url.pathname.split('/').pop();
    store.transact((d) => {
      const h = d.holds.find((x) => x.id === id && x.status === 'active');
      if (!h) return { code: 'NAO_ENCONTRADO' };
      h.status = 'released';
      store.audit('hold.liberado', { holdId: id });
      return { ok: true };
    }).then((r) => { if (r.ok) broadcast('release', {}); api.json(res, r.ok ? 200 : 404, r); }).catch(() => {});
    return true;
  }

  if (rota === 'POST /api/public/appointments') {
    store.transact((d) => api.confirmarTx(d, body || {})).then((r) => {
      if (r.repetido) return api.json(res, 200, r.repetido);
      if (!r.ok) return api.json(res, r.code === 'HORARIO_INDISPONIVEL' ? 409 : 400, { ok: false, code: r.code, message: r.message });
      broadcast('appointment', { date: r.appointment.date, codigo: r.appointment.codigo });
      api.json(res, 201, r);
    }).catch((e) => api.errJson(res, 500, 'ERRO_INTERNO', e.message));
    return true;
  }

  if (req.method === 'POST' && /^\/api\/public\/appointments\/[^/]+\/cancel$/.test(url.pathname)) {
    const id = url.pathname.split('/')[4];
    store.transact((d) => api.cancelarTx(d, id, body && body.ultimos4)).then((r) => {
      if (r.ok) broadcast('cancel', { id });
      api.json(res, r.ok ? 200 : r.code === 'NAO_ENCONTRADO' ? 404 : 403, r);
    }).catch((e) => api.errJson(res, 500, 'ERRO_INTERNO', e.message));
    return true;
  }

  /* ---------- AGENTE IA: pesquisa web ---------- */
  if (url.pathname === '/api/ia/search') {
    if (!api.rateLimit(ip, 20)) return api.errJson(res, 429, 'MUITAS_REQUISICOES'), true;
    api.buscarWeb(url.searchParams.get('q'))
      .then((v) => api.json(res, v.ok ? 200 : 404, v))
      .catch(() => api.errJson(res, 502, 'FALHA_PESQUISA'));
    return true;
  }

  /* ---------- ADMIN ---------- */
  if (url.pathname.startsWith('/api/admin')) {
    if (!api.isAdmin(req, db)) return api.errJson(res, 401, 'NAO_AUTORIZADO'), true;

    if (rota === 'GET /api/admin/config') return api.json(res, 200, api.rotasAdmin[rota](db)), true;
    if (rota === 'GET /api/admin/appointments') return api.json(res, 200, api.rotasAdmin[rota](db, url.searchParams)), true;
    if (rota === 'GET /api/admin/audit') return api.json(res, 200, api.rotasAdmin[rota](db)), true;

    const mut = api.adminMutacao;
    if (rota === 'PUT /api/admin/config') {
      store.transact((d) => mut(d, 'put-config', body)).then((r) => { broadcast('config', {}); api.json(res, r.ok ? 200 : 400, r); }).catch((e) => api.errJson(res, 500, 'ERRO_INTERNO', e.message));
      return true;
    }
    if (rota === 'PUT /api/admin/schedule') {
      store.transact((d) => mut(d, 'put-schedule', body)).then((r) => { broadcast('schedule', {}); api.json(res, r.ok ? 200 : 400, r); }).catch((e) => api.errJson(res, 500, 'ERRO_INTERNO', e.message));
      return true;
    }
    if (req.method === 'POST' && /^\/api\/admin\/(blockedDates|blockedTimes|specialHours)$/.test(url.pathname)) {
      const colecao = url.pathname.split('/').pop();
      const campos = colecao === 'blockedDates'
        ? [['date', (v) => T.isValidYmd(v) ? v : null], ['motivo', (v) => String(v || '').slice(0, 80)]]
        : colecao === 'blockedTimes'
          ? [['date', (v) => T.isValidYmd(v) ? v : null], ['start', (v) => T.isMin(Number(v)) ? Number(v) : null], ['end', (v) => T.isMin(Number(v)) ? Number(v) : null], ['motivo', (v) => String(v || '').slice(0, 80)]]
          : [['date', (v) => T.isValidYmd(v) ? v : null], ['periodos', (v) => Array.isArray(v) && v.length && v.every((p) => Number.isInteger(Number(p.start)) && Number.isInteger(Number(p.end)) && p.end > p.start) ? v.map((p) => ({ start: Number(p.start), end: Number(p.end) })) : null], ['motivo', (v) => String(v || '').slice(0, 80)]];
      store.transact((d) => api.adminListaAdd(d, colecao, body || {}, campos)).then((r) => { broadcast('admin', { colecao }); api.json(res, r.ok ? 201 : 400, r); }).catch((e) => api.errJson(res, 500, 'ERRO_INTERNO', e.message));
      return true;
    }
    if (req.method === 'DELETE' && /^\/api\/admin\/(blockedDates|blockedTimes|specialHours)\//.test(url.pathname)) {
      const parts = url.pathname.split('/');
      store.transact((d) => api.adminRemove(d, parts[3], parts.pop())).then((r) => { broadcast('admin', { colecao: parts[3] }); api.json(res, r.ok ? 200 : 404, r); }).catch((e) => api.errJson(res, 500, 'ERRO_INTERNO', e.message));
      return true;
    }
    if (rota === 'POST /api/admin/sync-catalog') {
      store.transact((d) => api.syncCatalogo(d, body || {})).then((r) => { broadcast('catalogo', {}); api.json(res, 200, r); }).catch((e) => api.errJson(res, 500, 'ERRO_INTERNO', e.message));
      return true;
    }
    if (rota === 'POST /api/admin/publicar-portal') {
      api.publicarPortal(db, body || {}).then((r) => {
        if (r.ok) broadcast('publicacao', { url: r.url });
        api.json(res, r.ok ? 200 : 400, r);
      });
      return true;
    }
    if (req.method === 'PATCH' && /^\/api\/admin\/appointments\/[^/]+\/status$/.test(url.pathname)) {
      const id = url.pathname.split('/')[4];
      store.transact((d) => api.adminStatusTx(d, id, body && body.status)).then((r) => { if (r.ok) broadcast('appointment_status', { id }); api.json(res, r.ok ? 200 : 400, r); }).catch((e) => api.errJson(res, 500, 'ERRO_INTERNO', e.message));
      return true;
    }
    return api.errJson(res, 404, 'ROTA_INEXISTENTE'), true;
  }

  return false;
}

module.exports = { handle, broadcast };

