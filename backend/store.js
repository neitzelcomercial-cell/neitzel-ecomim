/* ============================================================================
 * NEITZEL — STORE (persistência transacional do Portal de Agendamento)
 * Banco: data/neitzel-db.json (arquivo único, escrita atômica tmp+rename).
 * Toda mutação passa por transação serializada (mutex async) — REGRA CRÍTICA
 * contra dupla reserva. Sem dependências externas.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'neitzel-db.json');

function defaultDB() {
  return {
    version: 1,
    criadoEm: new Date().toISOString(),
    config: {
      empresaNome: 'Neitzel',
      segmento: '',
      telefone: '',
      instagram: '',
      timezone: 'America/Sao_Paulo',
      slotMin: 15,
      antecedenciaMinMinutos: 60,
      janelaDias: 60,
      holdTtlMinutos: 5,
      capacidadePorSlot: 1,
      permitirCancelarCliente: true,
      cancelarAteHoras: 4,
      permitirRemarcarCliente: true,
      portalAtivo: true,
      mensagemFechado: 'Agendamentos indisponíveis no momento.',
      intervaloPadraoMin: 0
    },
    schedule: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
    specialHours: [],
    blockedDates: [],
    blockedTimes: [],
    services: [],
    products: [],
    customers: [],
    professionals: [],
    appointments: [],
    holds: [],
    idempotency: {},
    auditLog: [],
    seq: 1
  };
}

let DB = null;

function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const disco = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      const padrao = defaultDB();
      // Merge PROFUNDO do config: antes um Object.assign raso fazia um banco
      // antigo (sem chaves novas) SUBSTITUIR o config padrão inteiro, e a API
      // quebrava por chaves indefinidas (ex.: timezone).
      const configMesclado = Object.assign({}, padrao.config, disco.config || {});
      DB = Object.assign(padrao, disco);
      DB.config = configMesclado;
      for (const k of ['schedule', 'specialHours', 'blockedDates', 'blockedTimes', 'services', 'products', 'customers', 'professionals', 'appointments', 'holds', 'auditLog']) {
        if (!Array.isArray(DB[k]) && typeof DB[k] !== 'object') DB[k] = padrao[k];
      }
      if (!DB.idempotency || typeof DB.idempotency !== 'object') DB.idempotency = {};
      if (!Number.isFinite(DB.seq)) DB.seq = 1;
    }
  } catch (e) {
    console.error('[store] Falha ao ler banco, iniciando novo:', e.message);
  }
  if (!DB) DB = defaultDB();
  return DB;
}

function save() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(DB), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

let chain = Promise.resolve();

/** Executa fn(db) na única fila de escrita; erro => nada é salvo. */
function transact(fn) {
  const run = chain.then(() => {
    const out = fn(DB);
    save();
    return out;
  });
  chain = run.then(() => undefined, () => undefined);
  return run;
}

function audit(action, detalhe) {
  DB.auditLog.push({ ts: new Date().toISOString(), action, detalhe });
  if (DB.auditLog.length > 4000) DB.auditLog.splice(0, DB.auditLog.length - 4000);
}

module.exports = { load, save, transact, audit, get db() { return DB; }, DB_FILE };
