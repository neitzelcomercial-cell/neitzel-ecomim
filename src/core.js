/* ============================================================================
 * ECOMIM OS — Core
 * Núcleo: estado, multi-tenant, persistência, criptografia, auditoria,
 * módulos, eventos e jobs. Nada de fachada: cada função faz trabalho real.
 * ========================================================================== */

'use strict';

const ECOMIM = (() => {
  /* ------------------------------------------------------------------ *
   * 1. INFRAESTRUTURA BÁSICA
   * ------------------------------------------------------------------ */

  const APP = {
    name: 'ECOMIM OS',
    version: '1.0.0',
    storageKey: 'ecomim_os_db_v1',
    settingsKey: 'ecomim_os_settings_v1',
    sessionKey: 'ecomim_os_session_v1',
    maxLeads: 5000,
    maxNotes: 5000,
  };

  const DB_VERSION = 1;

  // LocalStorage com fallback em memória (para file:// sem storage)
  const storage = (() => {
    let mem = {};
    let useLS = false;
    try {
      const k = '__ecomim_test__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      useLS = true;
    } catch (e) {
      useLS = false;
    }
    return {
      get(key) {
        try {
          if (useLS) return localStorage.getItem(key);
        } catch (e) { /* ignore */ }
        return key in mem ? mem[key] : null;
      },
      set(key, val) {
        try {
          if (useLS) { localStorage.setItem(key, val); return; }
        } catch (e) { /* ignore */ }
        mem[key] = String(val);
      },
      remove(key) {
        try {
          if (useLS) { localStorage.removeItem(key); return; }
        } catch (e) { /* ignore */ }
        delete mem[key];
      },
      get length() { return useLS ? localStorage.length : Object.keys(mem).length; },
      key(i) { return useLS ? localStorage.key(i) : Object.keys(mem)[i]; },
    };
  })();

  /* ------------------------------------------------------------------ *
   * 2. UTILITÁRIOS
   * ------------------------------------------------------------------ */

  const uid = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  };

  const nowISO = () => new Date().toISOString();

  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };
  const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const fmtDateTime = (iso) => `${fmtDate(iso)} ${fmtTime(iso)}`;

  const fmtMoney = (cents, currency = 'BRL') => {
    if (cents == null || isNaN(cents)) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);
  };

  const fmtPct = (v, digits = 0) => (v == null || isNaN(v) ? '—' : `${Number(v).toFixed(digits)}%`);

  const daysBetween = (aISO, bISO) => {
    const a = new Date(aISO).getTime(), b = new Date(bISO).getTime();
    if (isNaN(a) || isNaN(b)) return null;
    return Math.round((b - a) / 86400000);
  };

  const addDays = (iso, days) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString();
  };

  const addHours = (iso, hours) => {
    const d = new Date(iso);
    d.setTime(d.getTime() + hours * 3600000);
    return d.toISOString();
  };

  const normalizeText = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const digitsOf = (s) => String(s || '').replace(/\D/g, '');

  /** Criptografia real AES-GCM (Web Crypto) com fallback XOR determinístico p/ file:// */
  const cryptoBox = (() => {
    const XOR_KEY = 'ecomim-os-local-2026';
    const bufToB64 = (b) => {
      const bytes = new Uint8Array(b);
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      }
      return btoa(s);
    };
    const b64ToBuf = (s) => {
      const bin = atob(s);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes.buffer;
    };
    const xorEncrypt = (text, key) => {
      const t = unescape(encodeURIComponent(text));
      let out = '';
      for (let i = 0; i < t.length; i++) out += String.fromCharCode(t.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      return btoa(out);
    };
    const xorDecrypt = (b64, key) => {
      const t = atob(b64);
      let out = '';
      for (let i = 0; i < t.length; i++) out += String.fromCharCode(t.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      return decodeURIComponent(escape(out));
    };
    let cachedKey = null;
    const getKey = async (password) => {
      const enc = new TextEncoder();
      const material = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits', 'deriveKey']);
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: enc.encode('ecomim-backup-salt'), iterations: 60000, hash: 'SHA-256' },
        material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
      );
    };
    return {
      supported: typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.encrypt,
      async encrypt(data, password) {
        if (this.supported) {
          try {
            const key = await getKey(password);
            const enc = new TextEncoder();
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
            return 'AESGCM1:' + bufToB64(iv) + ':' + bufToB64(ct);
          } catch (e) {
            throw new Error('Falha ao criptografar: ' + e.message);
          }
        }
        return 'XOR1:' + xorEncrypt(JSON.stringify(data), XOR_KEY + (password || ''));
      },
      async decrypt(payload, password) {
        if (!payload || typeof payload !== 'string') throw new Error('Payload inválido');
        if (payload.startsWith('AESGCM1:')) {
          if (!this.supported) throw new Error('AES-GCM indisponível neste ambiente (abra via servidor local http://)');
          try {
            const [_, ivB64, ctB64] = payload.split(':');
            const key = await getKey(password);
            const iv = b64ToBuf(ivB64);
            const ct = b64ToBuf(ctB64);
            const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
            return JSON.parse(new TextDecoder().decode(pt));
          } catch (e) {
            throw new Error('Senha incorreta ou arquivo corrompido');
          }
        }
        if (payload.startsWith('XOR1:')) {
          return JSON.parse(xorDecrypt(payload.slice(5), XOR_KEY + (password || '')));
        }
        throw new Error('Formato de backup desconhecido');
      },
    };
  })();

  const hash = (input) => {
    let h = 5381;
    const s = String(input);
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  };

  /* ------------------------------------------------------------------ *
   * 3. ESTADO GLOBAL — DB no formato da FASE 1 + extensões ECOMIM OS
   * ------------------------------------------------------------------ */

  const defaultDB = () => ({
    version: DB_VERSION,
    orgId: 'org-base',
    config: {
      segmento: '',
      cidades: '',
      intervalo: 60,
      aprovacaoAutomatica: false,
      empresa: { nome: '', whatsapp: '', mensagemPadrao: '' },
      vendedores: [],
    },
    funil: [
      { id: 'novo', nome: 'Novo', cor: '#3b82f6' },
      { id: 'contato', nome: 'Contato feito', cor: '#8b5cf6' },
      { id: 'qualificado', nome: 'Qualificado', cor: '#06b6d4' },
      { id: 'proposta', nome: 'Proposta enviada', cor: '#f59e0b' },
      { id: 'negociacao', nome: 'Negociação', cor: '#ec4899' },
      { id: 'ganho', nome: 'Ganho', cor: '#22c55e' },
      { id: 'perdido', nome: 'Perdido', cor: '#94a3b8' },
    ],
    leads: [],
    fila: [],
    tarefas: [],
    vendedores: [],
    agente: { ativo: false, log: [], varreduras: 0, novos: 0, duplicados: 0, ignorados: 0, porFonte: {} },
    historico: [],
  });

  let DB = defaultDB();
  let currentUser = null; // { id, nome, email, papel, orgId }

  const db = {
    get: () => DB,
    getUser: () => currentUser,
    setUser: (u) => { currentUser = u; },
    save() {
      storage.set(APP.storageKey, JSON.stringify(DB));
      // Evento para outras abas
      try { window.dispatchEvent(new CustomEvent('ecomim:db-changed', { detail: { at: Date.now() } })); } catch (e) {}
    },
    load() {
      try {
        const raw = storage.get(APP.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.leads)) {
            DB = Object.assign(defaultDB(), parsed);
            return true;
          }
        }
      } catch (e) { /* corrompido -> novo */ }
      return false;
    },
    reset() {
      DB = defaultDB();
      this.save();
    },
    backup() {
      return JSON.parse(JSON.stringify(DB));
    },
    restore(snapshot) {
      DB = Object.assign(defaultDB(), snapshot);
      this.save();
    },
  };

  /* ------------------------------------------------------------------ *
   * 4. AUDITORIA
   * ------------------------------------------------------------------ */

  let auditLog = []; // { ts, actor, action, entity, before, after }

  const audit = {
    record(action, entity, before, after) {
      const u = currentUser || { nome: 'sistema', papel: 'sistema' };
      auditLog.push({
        ts: nowISO(),
        actor: u.nome || 'sistema',
        actorRole: u.papel || 'sistema',
        action,
        entity: entity || null,
        before: before != null ? JSON.parse(JSON.stringify(before)) : null,
        after: after != null ? JSON.parse(JSON.stringify(after)) : null,
      });
      if (auditLog.length > 2000) auditLog.splice(0, auditLog.length - 2000);
      try {
        storage.set(APP.storageKey + '_audit', JSON.stringify(auditLog.slice(-500)));
      } catch (e) {}
    },
    list() { return auditLog.slice(); },
    load() {
      try {
        const raw = storage.get(APP.storageKey + '_audit');
        if (raw) auditLog = JSON.parse(raw);
      } catch (e) {}
    },
  };

  /* ------------------------------------------------------------------ *
   * 5. REGISTRY DE MÓDULOS (modularidade do Neitzel OS, adaptada p/ local)
   * ------------------------------------------------------------------ */

  const registry = {
    modules: {},
    register(manifest) {
      if (!manifest || !manifest.id) throw new Error('Manifest inválido');
      this.modules[manifest.id] = Object.assign({
        id: manifest.id,
        name: manifest.id,
        icon: '●',
        routes: [],
        installed: true,
        enabled: true,
        version: '1.0.0',
      }, manifest);
      return this.modules[manifest.id];
    },
    get(id) { return this.modules[id] || null; },
    all() { return Object.values(this.modules); },
    enabled() { return Object.values(this.modules).filter((m) => m.enabled && m.installed); },
  };

  /* ------------------------------------------------------------------ *
   * 6. EVENT BUS (outbox em memória + efeitos)
   * ------------------------------------------------------------------ */

  const eventBus = {
    listeners: {},
    history: [],
    on(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    },
    off(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
    },
    emit(type, payload) {
      const ev = { id: uid(), type, payload: payload || {}, at: nowISO(), orgId: DB.orgId };
      this.history.push(ev);
      if (this.history.length > 500) this.history.shift();
      (this.listeners[type] || []).forEach((fn) => {
        try { fn(ev); } catch (e) { console.error('[event]', type, e); }
      });
      return ev.id;
    },
    historyOf(type) { return this.history.filter((e) => e.type === type); },
  };

  /* ------------------------------------------------------------------ *
   * 7. JOBS (agendamento com verificação por tick)
   * ------------------------------------------------------------------ */

  const jobs = {
    items: [], // { id, name, runAt, run(), interval: ms|null, fireOnStart }
    _timer: null,
    add(opts) {
      const job = Object.assign({ id: uid(), name: 'job', runAt: null, interval: null, fireOnStart: false }, opts);
      this.items.push(job);
      this._ensureTick();
      return job;
    },
    remove(jobId) {
      this.items = this.items.filter((j) => j.id !== jobId);
    },
    _ensureTick() {
      if (this._timer) return;
      this._timer = setInterval(() => this._tick(), 1000);
    },
    _tick() {
      const now = Date.now();
      this.items.forEach((j) => {
        if (j.runAt && now >= j.runAt) {
          j.runAt = null;
          try { j.run(); } catch (e) { console.error('[job]', j.name, e); }
        }
        if (j.interval && now >= (j._lastAt || 0) + j.interval) {
          j._lastAt = now;
          try { j.run(); } catch (e) { console.error('[job]', j.name, e); }
        }
      });
    },
    later(ms, fn) {
      return this.add({ name: 'later', runAt: Date.now() + ms, run: fn });
    },
  };

  /* ------------------------------------------------------------------ *
   * 8. MÓDULOS DE NEGÓCIO (dados + regras reais)
   * ------------------------------------------------------------------ */

  const modules = {};

  /* --- LEADS --- */
  modules.leads = {
    id: 'leads',
    name: 'Leads & CRM',
    icon: 'leads',

    addLead(input) {
      const lead = {
        id: uid(),
        nome: trimStr(input.nome),
        tipo: input.tipo || 'prospect',
        empresa: trimStr(input.empresa),
        etapa: input.etapa || DB.funil[0].id,
        telefone: digitsOf(input.telefone),
        whats: digitsOf(input.whats || input.telefone),
        email: trimStr(input.email),
        site: trimStr(input.site),
        insta: trimStr(input.insta),
        face: trimStr(input.face),
        linkedin: trimStr(input.linkedin),
        cidade: trimStr(input.cidade),
        uf: (trimStr(input.uf) || '').toUpperCase(),
        segmento: trimStr(input.segmento),
        valor: toCents(input.valor),
        origem: input.origem || 'manual',
        desc: trimStr(input.desc),
        consentimento: !!input.consentimento,
        vendedor: input.vendedor || null,
        score: input.score != null ? input.score : 0,
        created: nowISO(),
        updated: nowISO(),
        hist: [],
      };
      const dup = this.findDuplicate(lead);
      if (dup) {
        audit.record('lead.duplicado_recusado', 'lead', null, { nome: lead.nome, telefone: lead.telefone });
        return { ok: false, code: 'DUPLICADO', lead: dup };
      }
      if (!lead.nome && !lead.telefone && !lead.email) {
        return { ok: false, code: 'SEM_DADOS', message: 'Informe ao menos nome ou contato' };
      }
      DB.leads.push(lead);
      audit.record('lead.criado', 'lead', null, { id: lead.id, nome: lead.nome });
      this.save();
      eventBus.emit('lead.created', { leadId: lead.id, nome: lead.nome, origem: lead.origem });
      return { ok: true, lead };
    },

    findDuplicate(lead) {
      const email = normalizeText(lead.email);
      const name = normalizeText(lead.nome);
      const phone = lead.telefone || lead.whats;
      return DB.leads.find((l) => {
        if (email && email.length > 3 && normalizeText(l.email) === email) return true;
        if (phone && phone.length >= 8 && (digitsOf(l.telefone) === phone || digitsOf(l.whats) === phone)) return true;
        if (name && name.length > 4 && normalizeText(l.nome) === name && !l.email && !l.telefone) return true;
        return false;
      }) || null;
    },

    updateLead(id, patch) {
      const lead = DB.leads.find((l) => l.id === id);
      if (!lead) return { ok: false, code: 'NOT_FOUND' };
      const before = { ...lead };
      const allowed = ['nome', 'tipo', 'empresa', 'etapa', 'telefone', 'whats', 'email', 'site', 'insta', 'face', 'linkedin', 'cidade', 'uf', 'segmento', 'valor', 'origem', 'desc', 'consentimento', 'vendedor', 'score'];
      let changed = false;
      allowed.forEach((k) => {
        if (k in patch) {
          if (k === 'telefone' || k === 'whats') lead[k] = digitsOf(patch[k]);
          else if (k === 'valor') lead[k] = toCents(patch[k]);
          else if (k === 'consentimento') lead[k] = !!patch[k];
          else lead[k] = patch[k];
          changed = true;
        }
      });
      if (changed) {
        lead.updated = nowISO();
        lead.hist.push({ at: nowISO(), tipo: 'atualizacao', desc: 'Dados atualizados' });
        audit.record('lead.atualizado', 'lead', before, lead);
        this.save();
        eventBus.emit('lead.updated', { leadId: id });
      }
      return { ok: true, lead };
    },

    moveStage(id, stageId, motivo) {
      const lead = DB.leads.find((l) => l.id === id);
      if (!lead) return { ok: false, code: 'NOT_FOUND' };
      if (!DB.funil.find((f) => f.id === stageId)) return { ok: false, code: 'STAGE_NOT_FOUND' };
      const from = lead.etapa;
      if (from === stageId) return { ok: true, lead };
      lead.etapa = stageId;
      lead.updated = nowISO();
      lead.hist.push({ at: nowISO(), tipo: 'etapa', de: from, para: stageId, desc: motivo || 'Movido' });
      audit.record('lead.etapa', 'lead', { etapa: from }, { etapa: stageId });
      this.save();
      eventBus.emit('lead.stage_changed', { leadId: id, from, to: stageId });
      if (stageId === 'ganho' || stageId === 'perdido') {
        eventBus.emit(stageId === 'ganho' ? 'lead.won' : 'lead.lost', { leadId: id });
      }
      return { ok: true, lead };
    },

    deleteLead(id, motivo) {
      const lead = DB.leads.find((l) => l.id === id);
      if (!lead) return { ok: false, code: 'NOT_FOUND' };
      DB.leads = DB.leads.filter((l) => l.id !== id);
      audit.record('lead.excluido', 'lead', lead, null, { motivo });
      this.save();
      eventBus.emit('lead.deleted', { leadId: id });
      return { ok: true };
    },

    addToQueue(input) {
      const lead = {
        id: uid(),
        nome: trimStr(input.nome),
        tipo: input.tipo || 'prospect',
        empresa: trimStr(input.empresa),
        telefone: digitsOf(input.telefone),
        whats: digitsOf(input.whats || input.telefone),
        email: trimStr(input.email),
        cidade: trimStr(input.cidade),
        uf: (trimStr(input.uf) || '').toUpperCase(),
        segmento: trimStr(input.segmento),
        valor: toCents(input.valor),
        origem: input.origem || 'agente',
        fonte: input.fonte || 'manual',
        desc: trimStr(input.desc),
        consentimento: !!input.consentimento,
        created: nowISO(),
        status: 'fila',
      };
      const existing = DB.fila.find((f) =>
        (f.email && normalizeText(f.email) === normalizeText(lead.email)) ||
        (lead.telefone && digitsOf(f.telefone) === lead.telefone) ||
        (lead.nome && normalizeText(f.nome) === normalizeText(lead.nome) && !f.email && !f.telefone)
      );
      if (existing) {
        audit.record('lead.fila_duplicado', 'fila', null, { nome: lead.nome });
        return { ok: false, code: 'DUPLICADO_FILA' };
      }
      DB.fila.unshift(lead);
      audit.record('lead.fila_encaminhado', 'fila', null, lead);
      this.save();
      eventBus.emit('lead.queued', { filaId: lead.id, nome: lead.nome });
      return { ok: true, lead };
    },

    approveQueueItem(id, opts) {
      const idx = DB.fila.findIndex((f) => f.id === id);
      if (idx === -1) return { ok: false, code: 'NOT_FOUND' };
      const item = DB.fila[idx];
      const res = this.addLead({
        ...item,
        origem: opts && opts.origemOverride ? opts.origemOverride : (item.origem || 'fila'),
        consentimento: true,
      });
      if (res.ok) {
        DB.fila.splice(idx, 1);
        audit.record('lead.fila_aprovado', 'lead', item, res.lead);
        this.save();
        eventBus.emit('lead.qualified', { leadId: res.lead.id, nome: res.lead.nome });
        return { ok: true, lead: res.lead };
      }
      return res;
    },

    rejectQueueItem(id) {
      const idx = DB.fila.findIndex((f) => f.id === id);
      if (idx === -1) return { ok: false, code: 'NOT_FOUND' };
      const [item] = DB.fila.splice(idx, 1);
      audit.record('lead.fila_rejeitado', 'fila', item, null);
      this.save();
      return { ok: true };
    },

    scoring(lead) {
      // Score configurável e explicável — pontuação real, baseada em dados reais
      let score = 0;
      const reasons = [];
      const hasNome = (lead.nome || '').trim().length > 0;
      const hasEmpresa = (lead.empresa || '').trim().length > 0;
      const phone = digitsOf(lead.whats || lead.telefone);
      const hasEmail = (lead.email || '').includes('@');
      const hasCidade = (lead.cidade || '').trim().length > 0;
      if (hasNome) { score += 10; reasons.push('Nome informado'); }
      if (hasEmpresa) { score += 10; reasons.push('Empresa informada'); }
      if (phone.length >= 10) { score += 20; reasons.push('WhatsApp válido'); }
      if (hasEmail) { score += 15; reasons.push('E-mail válido'); }
      if (hasCidade) { score += 5; reasons.push('Cidade informada'); }
      const valor = toCents(lead.valor);
      if (valor > 0) { score += 10; reasons.push('Valor estimado informado'); }
      if (lead.consentimento) { score += 10; reasons.push('Consentimento registrado'); }
      if (lead.origem === 'manual') { score += 10; reasons.push('Inserido manualmente'); }
      if (lead.origem === 'agente' || lead.origem === 'google' || lead.origem === 'maps') { score += 5; reasons.push('Captado por agente de prospecção'); }
      // Penaliza ausência de dados essenciais
      if (!hasEmail && !phone) { score -= 20; reasons.push('Sem contato direto'); }
      if (!hasNome) { score -= 10; reasons.push('Sem nome'); }
      return { score: Math.max(0, Math.min(100, score)), reasons };
    },

    rescoreAll() {
      DB.leads.forEach((l) => {
        const r = this.scoring(l);
        l.score = r.score;
      });
      this.save();
    },

    save() { db.save(); },
  };

  /* --- AGENDA --- */
  modules.agenda = {
    id: 'agenda',
    name: 'Agenda Inteligente',
    icon: 'agenda',
    itemsKey: 'ecomim_agenda',
    events: [],
    load() {
      try {
        const raw = storage.get(this.itemsKey);
        if (raw) this.events = JSON.parse(raw);
      } catch (e) { this.events = []; }
    },
    add(ev) {
      const item = {
        id: uid(),
        titulo: trimStr(ev.titulo),
        tipo: ev.tipo || 'evento', // evento|tarefa|reuniao|visita|ligacao|lembrete
        quando: ev.quando || nowISO(),
        fim: ev.fim || null,
        local: trimStr(ev.local),
        desc: trimStr(ev.desc),
        leadId: ev.leadId || null,
        clienteId: ev.clienteId || null,
        status: ev.status || 'agendado',
        prioridade: ev.prioridade || 'normal',
        created: nowISO(),
      };
      this.events.push(item);
      this.save();
      audit.record('agenda.criado', 'agenda', null, item);
      eventBus.emit('agenda.created', { agendaId: item.id, titulo: item.titulo });
      return { ok: true, item };
    },
    update(id, patch) {
      const idx = this.events.findIndex((e) => e.id === id);
      if (idx === -1) return { ok: false, code: 'NOT_FOUND' };
      const before = { ...this.events[idx] };
      Object.assign(this.events[idx], patch);
      this.events[idx].updated = nowISO();
      this.save();
      audit.record('agenda.atualizado', 'agenda', before, this.events[idx]);
      return { ok: true, item: this.events[idx] };
    },
    remove(id) {
      const idx = this.events.findIndex((e) => e.id === id);
      if (idx === -1) return { ok: false, code: 'NOT_FOUND' };
      const [item] = this.events.splice(idx, 1);
      this.save();
      audit.record('agenda.excluido', 'agenda', item, null);
      return { ok: true };
    },
    between(fromISO, toISO) {
      return this.events.filter((e) => {
        const t = new Date(e.quando).getTime();
        return t >= new Date(fromISO).getTime() && t <= new Date(toISO).getTime();
      });
    },
    today() {
      const d = new Date();
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
      return this.between(start, addDays(start, 1));
    },
    save() {
      try { storage.set(this.itemsKey, JSON.stringify(this.events)); } catch (e) {}
    },
  };

  /* --- TAREFAS (integradas com leads e agenda) --- */
  modules.tarefas = {
    id: 'tarefas',
    name: 'Tarefas',
    icon: 'tarefas',
    add(input) {
      const t = {
        id: uid(),
        titulo: trimStr(input.titulo),
        desc: trimStr(input.desc),
        leadId: input.leadId || null,
        clienteId: input.clienteId || null,
        due: input.due || nowISO(),
        status: input.status || 'pendente',
        prioridade: input.prioridade || 'normal',
        criadaEm: nowISO(),
        completadaEm: null,
      };
      DB.tarefas.push(t);
      db.save();
      audit.record('tarefa.criada', 'tarefa', null, t);
      eventBus.emit('task.created', { tarefaId: t.id, titulo: t.titulo, leadId: t.leadId });
      return { ok: true, tarefa: t };
    },
    update(id, patch) {
      const t = DB.tarefas.find((x) => x.id === id);
      if (!t) return { ok: false, code: 'NOT_FOUND' };
      const before = { ...t };
      Object.assign(t, patch);
      if (patch.status === 'concluida' && !t.completadaEm) t.completadaEm = nowISO();
      if (patch.status === 'pendente') t.completadaEm = null;
      db.save();
      audit.record('tarefa.atualizada', 'tarefa', before, t);
      if (patch.status === 'concluida') eventBus.emit('task.completed', { tarefaId: t.id });
      return { ok: true, tarefa: t };
    },
    remove(id) {
      const idx = DB.tarefas.findIndex((x) => x.id === id);
      if (idx === -1) return { ok: false, code: 'NOT_FOUND' };
      const [t] = DB.tarefas.splice(idx, 1);
      db.save();
      audit.record('tarefa.excluida', 'tarefa', t, null);
      return { ok: true };
    },
    pendentes() { return DB.tarefas.filter((t) => t.status !== 'concluida'); },
    atrasadas() {
      return DB.tarefas.filter((t) => t.status !== 'concluida' && new Date(t.due) < new Date());
    },
  };

  /* --- VENDEDORES --- */
  modules.vendedores = {
    id: 'vendedores',
    name: 'Vendedores',
    icon: 'vendedores',
    add(input) {
      const v = { id: uid(), nome: trimStr(input.nome), email: trimStr(input.email), whats: digitsOf(input.whats), ativo: true, criadoEm: nowISO() };
      DB.vendedores.push(v);
      db.save();
      audit.record('vendedor.criado', 'vendedor', null, v);
      return { ok: true, vendedor: v };
    },
    update(id, patch) {
      const v = DB.vendedores.find((x) => x.id === id);
      if (!v) return { ok: false, code: 'NOT_FOUND' };
      Object.assign(v, patch);
      v.updated = nowISO();
      db.save();
      return { ok: true, vendedor: v };
    },
    remove(id) {
      DB.vendedores = DB.vendedores.filter((x) => x.id !== id);
      db.save();
      return { ok: true };
    },
    list() { return DB.vendedores; },
  };

  /* --- NOTAS (anotações rápidas) --- */
  modules.notas = {
    id: 'notas',
    name: 'Notas',
    icon: 'notas',
    items: [],
    load() {
      try {
        const raw = storage.get('ecomim_notas');
        if (raw) this.items = JSON.parse(raw);
      } catch (e) { this.items = []; }
    },
    add(texto, opts) {
      const n = { id: uid(), texto: trimStr(texto), cor: (opts && opts.cor) || '#fef9c3', created: nowISO(), pinned: !!(opts && opts.pinned) };
      this.items.unshift(n);
      this.save();
      return n;
    },
    remove(id) {
      this.items = this.items.filter((n) => n.id !== id);
      this.save();
    },
    togglePin(id) {
      const n = this.items.find((x) => x.id === id);
      if (n) { n.pinned = !n.pinned; this.save(); }
    },
    save() {
      try { storage.set('ecomim_notas', JSON.stringify(this.items)); } catch (e) {}
    },
  };

  /* --- FINANCEIRO (etapa 10) --- */
  modules.financeiro = {
    id: 'financeiro',
    name: 'Financeiro',
    icon: 'financeiro',
    itemsKey: 'ecomim_financeiro',
    contas: [],
    load() {
      try {
        const raw = storage.get(this.itemsKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          this.contas = Array.isArray(parsed) ? parsed : (parsed.contas || []);
        }
      } catch (e) { this.contas = []; }
    },
    addConta(input) {
      const c = {
        id: uid(),
        tipo: input.tipo === 'pagar' ? 'pagar' : 'receber',
        descricao: trimStr(input.descricao),
        cliente: trimStr(input.cliente),
        categoria: trimStr(input.categoria),
        centroCusto: trimStr(input.centroCusto),
        valor: toCents(input.valor),
        vencimento: input.vencimento || nowISO(),
        status: input.status || 'aberto',
        parcela: input.parcela || null,
        formaPagamento: trimStr(input.formaPagamento),
        observacoes: trimStr(input.observacoes),
        created: nowISO(),
      };
      if (c.valor <= 0) return { ok: false, code: 'VALOR_INVALIDO' };
      this.contas.push(c);
      this.save();
      audit.record('financeiro.conta_criada', c.tipo, null, c);
      eventBus.emit('financeiro.conta_criada', { contaId: c.id, tipo: c.tipo, valor: c.valor });
      return { ok: true, conta: c };
    },
    updateConta(id, patch) {
      const c = this.contas.find((x) => x.id === id);
      if (!c) return { ok: false, code: 'NOT_FOUND' };
      const before = { ...c };
      Object.assign(c, patch);
      if ('valor' in patch) c.valor = toCents(patch.valor);
      if (patch.status === 'pago' && !c.pagoEm) c.pagoEm = nowISO();
      this.save();
      audit.record('financeiro.conta_atualizada', c.tipo, before, c);
      if (patch.status === 'pago') {
        eventBus.emit('payment.completed', { contaId: c.id, tipo: c.tipo, valor: c.valor, descricao: c.descricao });
      }
      return { ok: true, conta: c };
    },
    removerConta(id) {
      const idx = this.contas.findIndex((x) => x.id === id);
      if (idx === -1) return { ok: false, code: 'NOT_FOUND' };
      const [c] = this.contas.splice(idx, 1);
      this.save();
      audit.record('financeiro.conta_removida', c.tipo, c, null);
      return { ok: true };
    },
    saldo() {
      let entrar = 0, sair = 0, recebido = 0, pago = 0;
      this.contas.forEach((c) => {
        if (c.tipo === 'receber') { entrar += c.valor; if (c.status === 'pago') recebido += c.valor; }
        else { sair += c.valor; if (c.status === 'pago') pago += c.valor; }
      });
      return {
        aReceber: entrar - recebido,
        aPagar: sair - pago,
        recebido,
        pago,
        saldo: recebido - pago,
        previsto: entrar - sair,
      };
    },
    vencidas() {
      return this.contas.filter((c) => c.status !== 'pago' && new Date(c.vencimento) < new Date());
    },
    proximas(dias = 7) {
      const lim = addDays(nowISO(), dias);
      return this.contas.filter((c) => c.status !== 'pago' && new Date(c.vencimento) <= new Date(lim));
    },
    save() {
      try { storage.set(this.itemsKey, JSON.stringify(this.contas)); } catch (e) {}
    },
  };

  /* --- ATENDIMENTO (etapa 8) --- */
  modules.atendimento = {
    id: 'atendimento',
    name: 'Atendimento',
    icon: 'atendimento',
    itemsKey: 'ecomim_atendimento',
    tickets: [],
    load() {
      try {
        const raw = storage.get(this.itemsKey);
        if (raw) this.tickets = JSON.parse(raw);
      } catch (e) { this.tickets = []; }
    },
    addTicket(input) {
      const t = {
        id: uid(),
        protocolo: 'TK-' + String(this.tickets.length + 1).padStart(4, '0'),
        titulo: trimStr(input.titulo),
        cliente: trimStr(input.cliente),
        contato: trimStr(input.contato),
        canal: input.canal || 'web',
        categoria: trimStr(input.categoria),
        prioridade: input.prioridade || 'media',
        status: input.status || 'novo',
        responsavel: trimStr(input.responsavel),
        descricao: trimStr(input.descricao),
        slaPrimeiraResposta: input.slaPrimeiraResposta || 4,
        firstResponseAt: null,
        criadoEm: nowISO(),
        atualizadoEm: nowISO(),
        fechadoEm: null,
        atendente: null,
        mensagens: [],
        avaliacao: null,
      };
      // SLA em horas
      t.slaDeadline = addHours(nowISO(), (t.slaPrimeiraResposta || 4));
      this.tickets.unshift(t);
      this.save();
      audit.record('atendimento.ticket_criado', 'ticket', null, { id: t.id, protocolo: t.protocolo, titulo: t.titulo });
      eventBus.emit('ticket.created', { ticketId: t.id, protocolo: t.protocolo });
      return { ok: true, ticket: t };
    },
    updateTicket(id, patch) {
      const t = this.tickets.find((x) => x.id === id);
      if (!t) return { ok: false, code: 'NOT_FOUND' };
      const before = { ...t };
      Object.assign(t, patch);
      t.atualizadoEm = nowISO();
      if (patch.status === 'fechado' && !t.fechadoEm) t.fechadoEm = nowISO();
      if (patch.responsavel && !t.firstResponseAt) t.firstResponseAt = nowISO();
      this.save();
      audit.record('atendimento.ticket_atualizado', 'ticket', before, t);
      if (patch.status === 'fechado') eventBus.emit('ticket.closed', { ticketId: t.id });
      return { ok: true, ticket: t };
    },
    addMensagem(ticketId, mensagem) {
      const t = this.tickets.find((x) => x.id === ticketId);
      if (!t) return { ok: false, code: 'NOT_FOUND' };
      const m = {
        id: uid(),
        autor: trimStr(mensagem.autor || 'Cliente'),
        origem: mensagem.origem || 'inbound',
        corpo: trimStr(mensagem.corpo),
        lida: false,
        criadaEm: nowISO(),
        iaAssistida: !!mensagem.iaAssistida,
      };
      t.mensagens.push(m);
      t.atualizadoEm = nowISO();
      if (!t.firstResponseAt && m.origem === 'outbound') t.firstResponseAt = nowISO();
      this.save();
      eventBus.emit('ticket.message_added', { ticketId, mensagemId: m.id, origem: m.origem });
      return { ok: true, mensagem: m };
    },
    avaliar(ticketId, nota, comentario) {
      const t = this.tickets.find((x) => x.id === ticketId);
      if (!t) return { ok: false, code: 'NOT_FOUND' };
      t.avaliacao = { nota: Math.max(1, Math.min(5, Number(nota) || 5)), comentario: trimStr(comentario), em: nowISO() };
      this.save();
      audit.record('atendimento.ticket_avaliado', 'ticket', null, t.avaliacao);
      return { ok: true };
    },
    slaEmRisco() {
      return this.tickets.filter((t) => t.status === 'novo' || t.status === 'em_andamento')
        .filter((t) => t.slaDeadline && new Date(t.slaDeadline) < new Date());
    },
    abertos() { return this.tickets.filter((t) => t.status !== 'fechado' && t.status !== 'cancelado'); },
    save() {
      try { storage.set(this.itemsKey, JSON.stringify(this.tickets)); } catch (e) {}
    },
  };

  /* --- PROJETOS (etapa 13) --- */
  modules.projetos = {
    id: 'projetos',
    name: 'Projetos',
    icon: 'projetos',
    itemsKey: 'ecomim_projetos',
    projetos: [],
    load() {
      try {
        const raw = storage.get(this.itemsKey);
        if (raw) this.projetos = JSON.parse(raw);
      } catch (e) { this.projetos = []; }
    },
    addProjeto(input) {
      const p = {
        id: uid(),
        nome: trimStr(input.nome),
        cliente: trimStr(input.cliente),
        tipo: input.tipo || 'interno',
        status: input.status || 'planejamento',
        prioridade: input.prioridade || 'media',
        responsavel: trimStr(input.responsavel),
        equipe: Array.isArray(input.equipe) ? input.equipe : [],
        inicio: input.inicio || nowISO(),
        prazo: input.prazo || null,
        progresso: 0,
        desc: trimStr(input.desc),
        tarefas: [],
        created: nowISO(),
      };
      this.projetos.unshift(p);
      this.save();
      audit.record('projeto.criado', 'projeto', null, { id: p.id, nome: p.nome });
      eventBus.emit('project.created', { projetoId: p.id, nome: p.nome });
      return { ok: true, projeto: p };
    },
    updateProjeto(id, patch) {
      const p = this.projetos.find((x) => x.id === id);
      if (!p) return { ok: false, code: 'NOT_FOUND' };
      const before = { ...p };
      Object.assign(p, patch);
      p.updated = nowISO();
      this.recalcProgresso(p);
      this.save();
      audit.record('projeto.atualizado', 'projeto', before, p);
      return { ok: true, projeto: p };
    },
    addTarefa(projetoId, input) {
      const p = this.projetos.find((x) => x.id === projetoId);
      if (!p) return { ok: false, code: 'NOT_FOUND' };
      const t = {
        id: uid(),
        nome: trimStr(input.nome),
        desc: trimStr(input.desc),
        responsavel: trimStr(input.responsavel),
        status: input.status || 'pendente',
        prioridade: input.prioridade || 'media',
        prazo: input.prazo || null,
        created: nowISO(),
        completadaEm: null,
      };
      p.tarefas.push(t);
      this.recalcProgresso(p);
      this.save();
      eventBus.emit('project.task_created', { projetoId, tarefaId: t.id });
      return { ok: true, tarefa: t };
    },
    updateTarefa(projetoId, tarefaId, patch) {
      const p = this.projetos.find((x) => x.id === projetoId);
      if (!p) return { ok: false, code: 'NOT_FOUND' };
      const t = p.tarefas.find((x) => x.id === tarefaId);
      if (!t) return { ok: false, code: 'NOT_FOUND_TASK' };
      Object.assign(t, patch);
      if (patch.status === 'concluida') t.completadaEm = nowISO();
      if (patch.status === 'pendente') t.completadaEm = null;
      this.recalcProgresso(p);
      this.save();
      return { ok: true, tarefa: t };
    },
    recalcProgresso(p) {
      if (!p.tarefas.length) { p.progresso = 0; return; }
      const concl = p.tarefas.filter((t) => t.status === 'concluida').length;
      p.progresso = Math.round((concl / p.tarefas.length) * 100);
    },
    atrasados() {
      return this.projetos.filter((p) => p.status !== 'concluido' && p.status !== 'cancelado' &&
        p.prazo && new Date(p.prazo) < new Date());
    },
    save() {
      try { storage.set(this.itemsKey, JSON.stringify(this.projetos)); } catch (e) {}
    },
  };

  /* --- CLIENTES / CUSTOMER SUCCESS (etapa 9) --- */
  modules.clientes = {
    id: 'clientes',
    name: 'Clientes & CS',
    icon: 'clientes',
    itemsKey: 'ecomim_clientes',
    clientes: [],
    load() {
      try {
        const raw = storage.get(this.itemsKey);
        if (raw) this.clientes = JSON.parse(raw);
      } catch (e) { this.clientes = []; }
    },
    addCliente(input) {
      const c = {
        id: uid(),
        nome: trimStr(input.nome),
        empresa: trimStr(input.empresa),
        cnpj: digitsOf(input.cnpj),
        email: trimStr(input.email),
        telefone: digitsOf(input.telefone),
        whats: digitsOf(input.whats || input.telefone),
        segmento: trimStr(input.segmento),
        porte: trimStr(input.porte),
        status: input.status || 'ativo',
        responsavelComercial: trimStr(input.responsavelComercial),
        csResponsavel: trimStr(input.csResponsavel),
        implantador: trimStr(input.implantador),
        plano: trimStr(input.plano),
        mrr: toCents(input.mrr),
        contratoInicio: input.contratoInicio || null,
        contratoFim: input.contratoFim || null,
        ultimoAcesso: input.ultimoAcesso || null,
        nps: input.nps != null ? Number(input.nps) : null,
        notas: trimStr(input.notas),
        created: nowISO(),
        historico: [{ at: nowISO(), tipo: 'criacao', desc: 'Cliente criado' }],
      };
      this.clientes.unshift(c);
      this.save();
      audit.record('cliente.criado', 'cliente', null, { id: c.id, nome: c.nome });
      eventBus.emit('customer.created', { clienteId: c.id, nome: c.nome });
      return { ok: true, cliente: c };
    },
    updateCliente(id, patch) {
      const c = this.clientes.find((x) => x.id === id);
      if (!c) return { ok: false, code: 'NOT_FOUND' };
      const before = { ...c };
      if ('telefone' in patch) patch.telefone = digitsOf(patch.telefone);
      if ('whats' in patch) patch.whats = digitsOf(patch.whats);
      if ('mrr' in patch) patch.mrr = toCents(patch.mrr);
      if ('nps' in patch) patch.nps = patch.nps != null ? Number(patch.nps) : null;
      Object.assign(c, patch);
      c.updated = nowISO();
      if (patch.notas) c.historico.push({ at: nowISO(), tipo: 'nota', desc: 'Nota atualizada' });
      this.save();
      audit.record('cliente.atualizado', 'cliente', before, c);
      return { ok: true, cliente: c };
    },
    healthScore(c) {
      // Health Score explicável (etapa 9: critérios com impacto)
      let score = 50;
      const reasons = [];
      if (c.ultimoAcesso) {
        const dias = daysBetween(c.ultimoAcesso, nowISO());
        if (dias != null && dias <= 3) { score += 20; reasons.push('Acesso recente (≤3d)'); }
        else if (dias != null && dias <= 10) { score += 5; reasons.push('Acesso nos últimos 10 dias'); }
        else if (dias != null && dias > 30) { score -= 20; reasons.push('Sem acesso há mais de 30 dias'); }
        else if (dias != null && dias > 15) { score -= 10; reasons.push('Acesso esporádico'); }
      }
      if (c.status === 'ativo') { score += 15; reasons.push('Cliente ativo'); }
      if (c.status === 'risco') { score -= 25; reasons.push('Cliente em risco'); }
      if (c.status === 'inativo') { score -= 40; reasons.push('Cliente inativo'); }
      if (c.mrr > 0) { score += 10; reasons.push('Receita recorrente ativa'); }
      if (c.nps != null) {
        if (c.nps >= 9) { score += 10; reasons.push(`NPS ${c.nps} (promotor)`); }
        else if (c.nps <= 6) { score -= 15; reasons.push(`NPS ${c.nps} (detrator)`); }
      }
      return { score: Math.max(0, Math.min(100, score)), reasons };
    },
    recalcScores() {
      this.clientes.forEach((c) => {
        const r = this.healthScore(c);
        c.health = r.score;
        c.healthReasons = r.reasons;
      });
      this.save();
    },
    /** Lista de clientes (API pública — o Acessor, a IA e o Planner a usam). */
    list() { return this.clientes.slice(); },
    save() {
      try { storage.set(this.itemsKey, JSON.stringify(this.clientes)); } catch (e) {}
    },
  };

  /* --- MARKETING (etapa 7) --- */
  modules.marketing = {
    id: 'marketing',
    name: 'Marketing',
    icon: 'marketing',
    itemsKey: 'ecomim_marketing',
    campanhas: [],
    load() {
      try {
        const raw = storage.get(this.itemsKey);
        if (raw) this.campanhas = JSON.parse(raw);
      } catch (e) { this.campanhas = []; }
    },
    addCampanha(input) {
      const c = {
        id: uid(),
        nome: trimStr(input.nome),
        objetivo: trimStr(input.objetivo),
        canal: input.canal || 'email',
        status: input.status || 'rascunho',
        orcamento: toCents(input.orcamento),
        inicio: input.inicio || null,
        fim: input.fim || null,
        segmento: trimStr(input.segmento),
        responsavel: trimStr(input.responsavel),
        descricao: trimStr(input.descricao),
        leadsObtidos: 0,
        conversoes: 0,
        created: nowISO(),
      };
      this.campanhas.unshift(c);
      this.save();
      audit.record('marketing.campanha_criada', 'campanha', null, { id: c.id, nome: c.nome });
      return { ok: true, campanha: c };
    },
    updateCampanha(id, patch) {
      const c = this.campanhas.find((x) => x.id === id);
      if (!c) return { ok: false, code: 'NOT_FOUND' };
      if ('orcamento' in patch) patch.orcamento = toCents(patch.orcamento);
      Object.assign(c, patch);
      c.updated = nowISO();
      this.save();
      return { ok: true, campanha: c };
    },
    registrarLead(campanhaId) {
      const c = this.campanhas.find((x) => x.id === campanhaId);
      if (!c) return { ok: false, code: 'NOT_FOUND' };
      c.leadsObtidos = (c.leadsObtidos || 0) + 1;
      this.save();
      return { ok: true, campanha: c };
    },
    registrarConversao(campanhaId) {
      const c = this.campanhas.find((x) => x.id === campanhaId);
      if (!c) return { ok: false, code: 'NOT_FOUND' };
      c.conversoes = (c.conversoes || 0) + 1;
      this.save();
      return { ok: true, campanha: c };
    },
    ativas() { return this.campanhas.filter((c) => c.status === 'ativa'); },
    save() {
      try { storage.set(this.itemsKey, JSON.stringify(this.campanhas)); } catch (e) {}
    },
  };

  /* --- RH (etapa 14) --- */
  modules.rh = {
    id: 'rh',
    name: 'RH',
    icon: 'rh',
    itemsKey: 'ecomim_rh',
    colaboradores: [],
    load() {
      try {
        const raw = storage.get(this.itemsKey);
        if (raw) this.colaboradores = JSON.parse(raw);
      } catch (e) { this.colaboradores = []; }
    },
    addColaborador(input) {
      const c = {
        id: uid(),
        nome: trimStr(input.nome),
        cargo: trimStr(input.cargo),
        departamento: trimStr(input.departamento),
        gestor: trimStr(input.gestor),
        email: trimStr(input.email),
        telefone: digitsOf(input.telefone),
        admissao: input.admissao || null,
        salario: toCents(input.salario),
        jornada: trimStr(input.jornada),
        status: input.status || 'ativo',
        beneficios: (input.beneficios || '').split(',').map((s) => s.trim()).filter(Boolean),
        created: nowISO(),
      };
      this.colaboradores.unshift(c);
      this.save();
      audit.record('rh.colaborador_criado', 'colaborador', null, { id: c.id, nome: c.nome });
      return { ok: true, colaborador: c };
    },
    updateColaborador(id, patch) {
      const c = this.colaboradores.find((x) => x.id === id);
      if (!c) return { ok: false, code: 'NOT_FOUND' };
      if ('salario' in patch) patch.salario = toCents(patch.salario);
      Object.assign(c, patch);
      c.updated = nowISO();
      this.save();
      return { ok: true, colaborador: c };
    },
    ativos() { return this.colaboradores.filter((c) => c.status === 'ativo'); },
    save() {
      try { storage.set(this.itemsKey, JSON.stringify(this.colaboradores)); } catch (e) {}
    },
  };

  /* --- BI (etapa 11) --- */
  modules.bi = {
    id: 'bi',
    name: 'BI & Analytics',
    icon: 'bi',
    mrr() {
      return modules.clientes.clientes.reduce((acc, c) => acc + (c.mrr || 0), 0);
    },
    arrend() { return this.mrr() * 12; },
    pipelineValue() {
      let v = 0;
      DB.leads.forEach((l) => {
        if (l.etapa !== 'perdido' && l.valor) v += l.valor;
      });
      return v;
    },
    funnelCounts() {
      const out = {};
      DB.funil.forEach((f) => { out[f.id] = 0; });
      DB.leads.forEach((l) => { if (l.etapa in out) out[l.etapa]++; });
      return out;
    },
    conversion() {
      if (!DB.leads.length) return 0;
      const ganhos = DB.leads.filter((l) => l.etapa === 'ganho').length;
      const fechados = DB.leads.filter((l) => l.etapa === 'ganho' || l.etapa === 'perdido').length;
      return fechados ? Math.round((ganhos / fechados) * 100) : 0;
    },
    valorGanho() {
      return DB.leads.filter((l) => l.etapa === 'ganho').reduce((a, l) => a + (l.valor || 0), 0);
    },
    valorPrevisto() {
      const won = new Set(DB.leads.filter((l) => l.etapa === 'ganho').map((l) => l.id));
      return DB.leads.filter((l) => !won.has(l.id) && l.valor && l.etapa !== 'perdido').reduce((a, l) => a + l.valor, 0);
    },
    ticketMedio() {
      const ganhos = DB.leads.filter((l) => l.etapa === 'ganho');
      if (!ganhos.length) return 0;
      return Math.round(ganhos.reduce((a, l) => a + (l.valor || 0), 0) / ganhos.length);
    },
    tasksByStatus() {
      const out = { pendente: 0, em_andamento: 0, concluida: 0 };
      DB.tarefas.forEach((t) => { if (t.status in out) out[t.status]++; });
      return out;
    },
    financeiro() {
      const s = modules.financeiro.saldo();
      return {
        aReceber: s.aReceber,
        aPagar: s.aPagar,
        recebido: s.recebido,
        pago: s.pago,
        saldo: s.saldo,
      };
    },
    atendimento() {
      const t = modules.atendimento.tickets;
      return {
        abertos: t.filter((x) => x.status !== 'fechado' && x.status !== 'cancelado').length,
        fechados: t.filter((x) => x.status === 'fechado').length,
        slaRisco: modules.atendimento.slaEmRisco().length,
        notaMedia: (() => {
          const avaliados = t.filter((x) => x.avaliacao);
          if (!avaliados.length) return null;
          return Math.round(avaliados.reduce((a, x) => a + x.avaliacao.nota, 0) / avaliados.length * 10) / 10;
        })(),
      };
    },
    projetos() {
      const p = modules.projetos.projetos;
      return {
        ativos: p.filter((x) => x.status !== 'concluido' && x.status !== 'cancelado').length,
        concluidos: p.filter((x) => x.status === 'concluido').length,
        atrasados: modules.projetos.atrasados().length,
        progressoMedio: p.length ? Math.round(p.reduce((a, x) => a + (x.progresso || 0), 0) / p.length) : 0,
      };
    },
    leadsPorOrigem() {
      const out = {};
      DB.leads.forEach((l) => {
        const key = l.origem || 'desconhecida';
        out[key] = (out[key] || 0) + 1;
      });
      return out;
    },
  };

  /* --- IA (fase 2 — motor local determinístico + gateway opcional) --- */
  modules.ia = {
    id: 'ia',
    name: 'Assistente IA',
    icon: 'ia',
    config: {
      // Vazio por padrão: usa o motor local. Preencha via Configurações para ativar o gateway real.
      gatewayUrl: '',
      apiKey: '',
      model: 'gpt-4o-mini',
      fallbackModel: 'gpt-4o-mini',
    },
    conversations: [],

    async ask(prompt, opts) {
      const start = performance.now();
      const scope = (opts && opts.scope) || 'geral';
      const context = this._buildContext(prompt, scope);
      const localAnswer = this._localAnswer(prompt, context, scope);

      if (this.config.gatewayUrl && this.config.apiKey) {
        try {
          const remote = await this._remoteAsk(prompt, context, opts);
          if (remote && remote.answer) {
            return this._result(remote.answer, remote.citations || [], 'remote', start, prompt, scope);
          }
        } catch (e) {
          console.warn('[IA] gateway falhou, usando motor local:', e.message);
        }
      }
      return this._result(localAnswer.text, localAnswer.citations, 'local', start, prompt, scope);
    },

    _result(text, citations, mode, startMs, prompt, scope) {
      const item = {
        id: uid(),
        pergunta: prompt,
        resposta: text,
        citacoes: citations,
        modo: mode,
        escopo: scope,
        em: nowISO(),
        ms: Math.round(performance.now() - startMs),
      };
      this.conversations.unshift(item);
      if (this.conversations.length > 200) this.conversations.pop();
      try { storage.set('ecomim_ia_conversations', JSON.stringify(this.conversations)); } catch (e) {}
      audit.record('ia.pergunta', 'ia', null, { escopo: scope, modo: mode });
      return { ok: true, ...item };
    },

    _buildContext(prompt, scope) {
      const c = {
        leads: DB.leads.length,
        leadsPorEtapa: modules.bi.funnelCounts(),
        conversao: modules.bi.conversion(),
        valorGanho: modules.bi.valorGanho(),
        valorPrevisto: modules.bi.valorPrevisto(),
        ticketMedio: modules.bi.ticketMedio(),
        tarefas: modules.tarefas.pendentes().length,
        tarefasAtrasadas: modules.tarefas.atrasadas().length,
        financeiro: modules.bi.financeiro(),
        atendimento: modules.bi.atendimento(),
        projetos: modules.bi.projetos(),
        clientes: modules.clientes.clientes.length,
        clientesRisco: modules.clientes.clientes.filter((c) => (c.status === 'risco')).length,
        mrr: modules.bi.mrr(),
        campanhasAtivas: modules.marketing.ativas().length,
        colaboradoresAtivos: modules.rh.ativos().length,
      };
      // dados detalhados para escopos específicos
      if (scope === 'leads') c.ultimosLeads = DB.leads.slice(0, 10).map((l) => ({ nome: l.nome, empresa: l.empresa, cidade: l.cidade, valor: l.valor, etapa: l.etapa }));
      if (scope === 'vendas') c.leads = DB.leads.map((l) => ({ nome: l.nome, valor: l.valor, etapa: l.etapa, score: l.score }));
      if (scope === 'atendimento') c.ticketsAbertos = modules.atendimento.abertos().map((t) => ({ protocolo: t.protocolo, titulo: t.titulo, status: t.status, prioridade: t.prioridade }));
      if (scope === 'financeiro') c.contasVencidas = modules.financeiro.vencidas().map((x) => ({ descricao: x.descricao, valor: x.valor, vencimento: x.vencimento }));
      if (scope === 'projetos') c.projetos = modules.projetos.projetos.map((p) => ({ nome: p.nome, status: p.status, progresso: p.progresso, prazo: p.prazo }));
      return c;
    },

    /** Responde com base nos dados reais do sistema; nunca inventa. */
    _localAnswer(prompt, ctx, scope) {
      const q = normalizeText(prompt);
      const citations = [];
      const money = (cents) => fmtMoney(cents);
      const lines = [];

      if (ctx.leads === 0 && ctx.clientes === 0 && ctx.tarefas === 0 && !ctx.financeiro.recebido && ctx.projetos.ativos === 0 && ctx.atendimento.abertos === 0) {
        return {
          text: 'Ainda não há dados registrados no sistema. Comece cadastrando leads em "Leads & CRM" ou clientes em "Clientes & CS". Só posso analisar dados que realmente existem.',
          citations: [],
        };
      }

      const makeLeadRefs = (arr, cb) => {
        arr.forEach((l) => {
          if (l.valor) { cb(l); citations.push({ type: 'lead', label: l.nome || l.empresa || 'lead', ref: l.nome || l.empresa || 'lead' }); }
        });
      };

      // saudação
      if (/^(oi|ola|opa|bom dia|boa tarde|boa noite|hey|e ai|e aí)\b/.test(q)) {
        return { text: `Olá!  Estou analisando seus dados agora mesmo.\n\nVocê tem **${ctx.leads}** leads no funil (${ctx.leadsPorEtapa.ganho || 0} ganhos), **${fmtMoney(ctx.financeiro.recebido)}** recebidos, **${ctx.projetos.ativos}** projetos ativos e **${ctx.atendimento.abertos}** atendimentos abertos.\n\nPergunte-me sobre vendas, financeiro, atendimento, clientes ou projetos — respondo com base nos dados reais.`, citations: [] };
      }

      // perguntas por intenção
      if (/(quanto|fatura|receita|faturam|ganho|valor).*(total|mês|mes|periodo)/.test(q) || /resumo.*(vendas|resultado)/.test(q) || /como.*(vendas|desempenho)/.test(q)) {
        lines.push(`##  Situação de vendas`);
        lines.push(`- Leads no funil: **${ctx.leads}**`);
        lines.push(`- Ganhos (Fechados): **${ctx.valorGanho ? money(ctx.valorGanho) : '—'}**`);
        lines.push(`- Em andamento: **${money(ctx.valorPrevisto)}** previstos`);
        lines.push(`- Ticket médio: **${ctx.ticketMedio ? money(ctx.ticketMedio) : '—'}**`);
        lines.push(`- Taxa de conversão: **${ctx.conversao}%**`);
        const porEtapa = [];
        Object.entries(ctx.leadsPorEtapa).forEach(([k, v]) => { if (v > 0) porEtapa.push(`${k}: ${v}`); });
        if (porEtapa.length) lines.push(`- Distribuição: ${porEtapa.join(' · ')}`);
        return { text: lines.join('\n'), citations: ctx.ultimosLeads ? citations : [] };
      }

      if (/(lead|prospe).*(quanto|quantos|como|status|funil)/.test(q) || /melhor(es)? lead/.test(q) || /top lead/.test(q)) {
        const noValor = DB.leads.filter((l) => l.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, 3);
        lines.push(`##  Leads`);
        lines.push(`- Total no funil: **${ctx.leads}** leads`);
        lines.push(`- Ganhos: **${ctx.leadsPorEtapa.ganho || 0}** · Perdidos: **${ctx.leadsPorEtapa.perdido || 0}**`);
        if (noValor.length) {
          lines.push(`- Maiores oportunidades:`);
          noValor.forEach((l) => {
            lines.push(`  • ${l.nome || l.empresa || '—'} — ${money(l.valor)} (${l.etapa})`);
            citations.push({ type: 'lead', label: l.nome || l.empresa, ref: l.nome || l.empresa });
          });
        }
        return { text: lines.join('\n'), citations };
      }

      if (/(financ|conta|receber|pagar|fluxo|caixa|inadimpl)/.test(q) && !/agend/.test(q)) {
        const f = ctx.financeiro;
        lines.push(`##  Financeiro`);
        lines.push(`- Recebido: **${money(f.recebido)}** · Pago: **${money(f.pago)}**`);
        lines.push(`- Saldo (recebido − pago): **${money(f.saldo)}**`);
        lines.push(`- A receber: **${money(f.aReceber)}** · A pagar: **${money(f.aPagar)}**`);
        const vencidas = modules.financeiro.vencidas();
        if (vencidas.length) {
          lines.push(`-  ${vencidas.length} contas vencidas:`);
          vencidas.slice(0, 5).forEach((c) => {
            lines.push(`  • ${c.descricao || 'Conta'} — ${money(c.valor)} (venceu em ${fmtDate(c.vencimento)})`);
            citations.push({ type: 'financeiro', label: c.descricao || 'conta', ref: c.id });
          });
        }
        return { text: lines.join('\n'), citations };
      }

      if (/(atend|ticket|sla|chamado|suporte)/.test(q)) {
        const a = ctx.atendimento;
        lines.push(`##  Atendimento`);
        lines.push(`- Tickets abertos: **${a.abertos}** · Fechados: **${a.fechados}**`);
        lines.push(`- Em risco de SLA: **${a.slaRisco}**`);
        lines.push(`- Nota média: **${a.notaMedia != null ? a.notaMedia + ' ⭐' : 'sem avaliações'}**`);
        const abertos = modules.atendimento.abertos().slice(0, 5);
        if (abertos.length) {
          lines.push(`- Abertos:`);
          abertos.forEach((t) => {
            lines.push(`  • ${t.protocolo} — ${t.titulo} (${t.status}, ${t.prioridade})`);
            citations.push({ type: 'ticket', label: t.protocolo, ref: t.id });
          });
        }
        return { text: lines.join('\n'), citations };
      }

      if (/(projeto|tarefa|kanban|entrega|prazo)/.test(q)) {
        const p = ctx.projetos;
        lines.push(`##  Projetos`);
        lines.push(`- Ativos: **${p.ativos}** · Concluídos: **${p.concluidos}** · Atrasados: **${p.atrasados}**`);
        lines.push(`- Progresso médio: **${p.progressoMedio}%**`);
        const atrasados = modules.projetos.atrasados();
        if (atrasados.length) {
          lines.push(`-  Projetos atrasados:`);
          atrasados.slice(0, 5).forEach((pr) => {
            lines.push(`  • ${pr.nome} (prazo ${fmtDate(pr.prazo)})`);
            citations.push({ type: 'projeto', label: pr.nome, ref: pr.id });
          });
        }
        const tarefas = ctx.tarefas;
        lines.push(`- Tarefas pendentes: **${tarefas}** · Atrasadas: **${ctx.tarefasAtrasadas}**`);
        return { text: lines.join('\n'), citations };
      }

      if (/(client|cs|reten|churn|mrr|saude|health)/.test(q) || /customer success/.test(q) || /fideliza/.test(q)) {
        const clientes = modules.clientes.clientes;
        const emRisco = clientes.filter((c) => c.status === 'risco');
        lines.push(`##  Clientes & CS`);
        lines.push(`- Clientes: **${ctx.clientes}** · Em risco: **${ctx.clientesRisco}**`);
        lines.push(`- MRR: **${money(ctx.mrr)}** · ARR: **${money(ctx.mrr * 12)}**`);
        if (emRisco.length) {
          lines.push(`-  Clientes em risco:`);
          emRisco.slice(0, 5).forEach((c) => {
            lines.push(`  • ${c.nome || c.empresa} — plano ${c.plano || '—'} (MRR ${money(c.mrr || 0)})`);
            citations.push({ type: 'cliente', label: c.nome || c.empresa, ref: c.id });
          });
        }
        return { text: lines.join('\n'), citations };
      }

      if (/(campanha|marketing|mkt|anuncio)/.test(q)) {
        const cps = modules.marketing.campanhas;
        if (!cps.length) return { text: 'Nenhuma campanha cadastrada ainda. Em "Marketing" você pode criar campanhas com orçamento e metas — depois eu analiso os resultados reais.', citations: [] };
        const ativas = cps.filter((c) => c.status === 'ativa');
        lines.push(`##  Marketing`);
        lines.push(`- Campanhas: **${cps.length}** · Ativas: **${ativas.length}**`);
        cps.slice(0, 5).forEach((c) => {
          const roi = c.orcamento ? Math.round(((c.conversoes * ctx.ticketMedio - c.orcamento) / c.orcamento) * 100) : null;
          lines.push(`  • ${c.nome} — ${c.status} (${c.leadsObtidos || 0} leads, ${c.conversoes || 0} conv.)${roi != null ? ` · ROI est. ${roi}%` : ''}`);
          citations.push({ type: 'campanha', label: c.nome, ref: c.id });
        });
        return { text: lines.join('\n'), citations };
      }

      if (/(rh|colaborador|funcionario|equipe|turnover)/.test(q)) {
        const cols = modules.rh.colaboradores;
        if (!cols.length) return { text: 'Nenhum colaborador cadastrado ainda. Em "RH" você pode cadastrar sua equipe.', citations: [] };
        lines.push(`## ‍ RH`);
        lines.push(`- Colaboradores: **${cols.length}** · Ativos: **${modules.rh.ativos().length}**`);
        const porDepto = {};
        cols.forEach((c) => { porDepto[c.departamento || 'Sem departamento'] = (porDepto[c.departamento || 'Sem departamento'] || 0) + 1; });
        Object.entries(porDepto).forEach(([d, n]) => lines.push(`  • ${d}: ${n}`));
        return { text: lines.join('\n'), citations };
      }

      if (/(vendedor|sdr|quem|ranking|melhor vendedor)/.test(q)) {
        const ganhosPorVendedor = {};
        DB.leads.forEach((l) => {
          if (l.etapa === 'ganho' && l.vendedor) {
            ganhosPorVendedor[l.vendedor] = (ganhosPorVendedor[l.vendedor] || 0) + (l.valor || 0);
          }
        });
        const ranking = Object.entries(ganhosPorVendedor).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (!ranking.length) return { text: 'Ainda não há vendas ganhas atribuídas a vendedores. Ganhe leads atribuindo um vendedor na ficha do lead.', citations: [] };
        lines.push(`##  Ranking de vendedores`);
        ranking.forEach(([nome, valor]) => {
          lines.push(`  • ${nome}: **${money(valor)}**`);
          citations.push({ type: 'vendedor', label: nome, ref: nome });
        });
        return { text: lines.join('\n'), citations };
      }

      // fallback honesto
      return {
        text: `Analisei os dados disponíveis. No momento o sistema registra: **${ctx.leads}** leads, **${ctx.clientes}** clientes, **${ctx.tarefas}** tarefas pendentes, **${money(ctx.financeiro.recebido)}** recebidos e **${ctx.projetos.ativos}** projetos ativos.\n\nPara uma resposta específica, pergunte sobre vendas, leads, financeiro, atendimento, projetos, clientes, marketing, RH ou vendedores. Se o dado que você procura não existe no sistema, prefiro dizer isso do que inventar.`,
        citations: [],
      };
    },

    async _remoteAsk(prompt, context, opts) {
      const { gatewayUrl, apiKey, model, fallbackModel } = this.config;
      const models = [model, fallbackModel].filter(Boolean);
      for (const m of models) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), (opts && opts.timeoutMs) || 30000);
          const res = await fetch(gatewayUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: m,
              messages: [
                { role: 'system', content: 'Você é o assistente de IA do ECOMIM OS, um sistema operacional empresarial. Responda SEMPRE com base nos dados fornecidos no contexto (JSON). NUNCA invente números, nomes ou fatos que não estejam no contexto. Se o dado não estiver disponível, diga explicitamente que não há informação suficiente. Use formatação markdown e emojis com moderação. Responda em português.' },
                { role: 'user', content: `DADOS DO SISTEMA (JSON):\n${JSON.stringify(context)}\n\nPERGUNTA DO USUÁRIO:\n${prompt}` },
              ],
            }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const answer = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
            (data.output_text) || null;
          if (!answer) throw new Error('Resposta vazia');
          return { answer, citations: [] };
        } catch (e) {
          if (m === models[models.length - 1]) throw e;
        }
      }
      throw new Error('Nenhum modelo respondeu');
    },

    suggestFollowUp(leadId) {
      const lead = DB.leads.find((l) => l.id === leadId);
      if (!lead) return { ok: false, code: 'NOT_FOUND' };
      const dias = daysBetween(lead.updated || lead.created, nowISO());
      let msg;
      if (lead.etapa === 'novo') msg = `Olá, ${lead.nome || 'tudo bem'}! Vi que você tem interesse em ${lead.segmento || 'nossas soluções'}. Posso te ajudar com uma proposta personalizada?`;
      else if (lead.etapa === 'contato') msg = `Oi, ${lead.nome || 'tudo bem'}! Como está seu projeto de ${lead.segmento || 'nosso serviço'}? Posso enviar mais informações?`;
      else if (lead.etapa === 'proposta') msg = `${lead.nome || 'Olá'}! Enviei nossa proposta há ${dias != null ? `${dias} dia(s)` : 'alguns dias'}. Ficou alguma dúvida? Posso ajustar o que precisar.`;
      else if (lead.etapa === 'negociacao') msg = `Oi, ${lead.nome || 'tudo bem'}! Fechamos?  Se precisar de qualquer ajuste, é só falar.`;
      else msg = `Olá, ${lead.nome || 'tudo bem'}! Estou passando para saber se ainda posso ajudar com ${lead.segmento || 'nossas soluções'}.`;
      return { ok: true, msg, etapa: lead.etapa, diasSemContato: dias };
    },

    // Função para interpretar perguntas informais e melhorar o contexto
    interpretQuestion(prompt, currentView = 'dashboard') {
      const q = normalizeText(prompt);
      const viewMap = {
        'dashboard': 'painel principal',
        'leads': 'área de leads e CRM',
        'clientes': 'área de clientes',
        'financeiro': 'área financeira',
        'agenda': 'agenda',
        'atendimento': 'atendimento',
        'projetos': 'projetos',
        'marketing': 'marketing',
        'rh': 'recursos humanos'
      };
      
      const currentViewName = viewMap[currentView] || 'sistema';
      
      // Interpretações comuns de perguntas informais
      const interpretations = {
        // Perguntas sobre "o que fazer"
        [/^(o que|oq|q) (posso|devo) fazer (aqui|agora|\?)/i]: `Você está na ${currentViewName}. Posso te ajudar a entender o que pode fazer nesta área.`,
        [/^(como|comoo) (começ|comec|inicio)/i]: `Vou te mostrar como começar na ${currentViewName}.`,
        [/^(não|nao|n) (entendi|sei|to entendendo)/i]: `Sem problema! Vou explicar a ${currentViewName} de forma mais simples.`,
        [/^(pra|para) que serve (isso|essa tela|aqui)/i]: `Esta área serve para ${currentViewName}. Deixe-me explicar melhor.`,
        
        // Perguntas sobre ajuda geral
        [/^(ajuda|help|socorro)/i]: `Claro! Estou aqui para te ajudar na ${currentViewName}. O que você precisa?`,
        [/^(quero|preciso) (saber|aprender)/i]: `Vou te ensinar sobre a ${currentViewName}. O que gostaria de aprender?`,
        [/^(me explica|explica|detalha)/i]: `Vou explicar detalhadamente sobre a ${currentViewName}.`,
        
        // Perguntas sobre cadastro
        [/^(como|como q) (cadastra|adiciona|insere|coloca)/i]: `Para cadastrar na ${currentViewName}, vou te mostrar o passo a passo.`,
        [/^(onde|aonde) (encontro|vejo|acho)/i]: `Na ${currentViewName}, você encontra isso na área específica. Deixe-me te guiar.`,
        
        // Perguntas sobre funcionamento
        [/^(como|como q) (funciona|trabalha)/i]: `A ${currentViewName} funciona de forma específica. Vou te explicar.`,
        [/^(o que|oq) é (esse|este)/i]: `Vou te explicar o que é e para que serve na ${currentViewName}.`,
      };
      
      // Verifica se alguma interpretação corresponde
      for (const [pattern, response] of Object.entries(interpretations)) {
        const regex = new RegExp(pattern);
        if (regex.test(q)) {
          return {
            interpreted: true,
            response: response,
            intent: 'contextual_help'
          };
        }
      }
      
      // Se não encontrou correspondência, retorna interpretação genérica
      return {
        interpreted: false,
        intent: 'general_query'
      };
    },

    // Função para gerar explicações contextuais
    explainView(viewId) {
      const viewInfo = {
        'dashboard': {
          title: 'Painel Principal',
          description: 'O painel mostra uma visão geral do seu negócio com métricas importantes, gráficos e indicadores de desempenho.',
          commonTasks: ['Verificar métricas gerais', 'Analisar gráficos de desempenho', 'Ver notificações importantes', 'Acessar relatórios rápidos'],
          nextSteps: ['Verifique suas métricas principais', 'Analise os gráficos de tendência', 'Responda a notificações urgentes']
        },
        'leads': {
          title: 'Leads & CRM',
          description: 'Gerencie seus potenciais clientes (leads) e acompanhe todo o funil de vendas desde o primeiro contato até o fechamento.',
          commonTasks: ['Cadastrar novos leads', 'Mover leads no funil', 'Registrar interações', 'Visualizar histórico', 'Gerar propostas'],
          nextSteps: ['Cadastre novos leads identificados', 'Acompanhe leads em negociação', 'Registre interações importantes']
        },
        'clientes': {
          title: 'Clientes & CS',
          description: 'Gerencie seus clientes ativos, acompanhe satisfação, identifique riscos de churn e mantenha relacionamentos.',
          commonTasks: ['Cadastrar clientes', 'Atualizar informações', 'Registrar interações', 'Monitorar satisfação', 'Identificar clientes em risco'],
          nextSteps: ['Atualize informações dos clientes', 'Registre interações recentes', 'Monitore clientes com risco de cancelamento']
        },
        'financeiro': {
          title: 'Financeiro',
          description: 'Controle suas finanças, registre receitas e despesas, acompanhe contas a pagar e a receber, e visualize o fluxo de caixa.',
          commonTasks: ['Registrar receitas', 'Registrar despesas', 'Controlar contas a pagar', 'Acompanhar contas a receber', 'Gerar relatórios'],
          nextSteps: ['Registre receitas pendentes', 'Confira contas próximas do vencimento', 'Analise o fluxo de caixa']
        }
      };
      
      const info = viewInfo[viewId] || {
        title: viewId.charAt(0).toUpperCase() + viewId.slice(1),
        description: `Esta é a área de ${viewId} do sistema Neitzel.`,
        commonTasks: ['Explorar funcionalidades', 'Aprender a usar as ferramentas', 'Consultar dados relevantes'],
        nextSteps: ['Explore as funcionalidades disponíveis', 'Consulte os dados relevantes para sua operação']
      };
      
      let response = `## ${info.title}\n\n`;
      response += `${info.description}\n\n`;
      response += `### Tarefas comuns:\n`;
      info.commonTasks.forEach(task => response += `- ${task}\n`);
      response += `\n### Próximos passos sugeridos:\n`;
      info.nextSteps.forEach(step => response += `- ${step}\n`);
      
      return response;
    },

    // Capacidade de ação da IA - ações simples que podem ser executadas
    canExecuteAction(actionType, target) {
      const actions = {
        'open_view': ['dashboard', 'leads', 'clientes', 'financeiro', 'agenda', 'atendimento', 'projetos', 'marketing', 'config'],
        'create_item': ['lead', 'client', 'task', 'appointment'],
        'filter_data': ['leads_by_stage', 'clients_by_status', 'tasks_by_priority'],
        'search_data': ['leads', 'clients', 'tasks', 'appointments'],
        'show_help': ['view_help', 'feature_help', 'process_help']
      };
      
      return actions[actionType] && actions[actionType].includes(target);
    },
    
    executeSimpleAction(action, params = {}) {
      switch(action) {
        case 'open_dashboard':
          return { success: true, message: 'Abrindo painel principal...', action: 'navigate', target: 'dashboard' };
        case 'open_leads':
          return { success: true, message: 'Abrindo área de leads...', action: 'navigate', target: 'leads' };
        case 'open_clients':
          return { success: true, message: 'Abrindo área de clientes...', action: 'navigate', target: 'clientes' };
        case 'open_financeiro':
          return { success: true, message: 'Abrindo área financeira...', action: 'navigate', target: 'financeiro' };
        case 'show_lead_funnel':
          return { success: true, message: 'Mostrando funil de leads...', action: 'show', target: 'lead_funnel' };
        case 'show_financial_overview':
          return { success: true, message: 'Mostrando visão geral financeira...', action: 'show', target: 'financial_overview' };
        case 'show_today_agenda':
          return { success: true, message: 'Mostrando agenda de hoje...', action: 'show', target: 'today_agenda' };
        default:
          return { success: false, message: 'Ação não reconhecida ou não disponível.' };
      }
    },
    
    // Gerar respostas com botões de ação
    generateActionResponse(message, actions = []) {
      return {
        response: message,
        actions: actions.map(action => ({
          label: action.label,
          type: action.type,
          target: action.target,
          icon: action.icon
        }))
      };
    },

    planDay() {
      const hoje = modules.agenda.today();
      const atrasadas = modules.tarefas.atrasadas();
      const pendentes = modules.tarefas.pendentes();
      const leadsNovos = DB.leads.filter((l) => l.etapa === 'novo');
      const vencidas = modules.financeiro.vencidas();
      const sla = modules.atendimento.slaEmRisco();
      const linhas = ['##  Plano do dia', ''];
      if (!hoje.length && !atrasadas.length && !leadsNovos.length && !vencidas.length && !sla.length) {
        return 'Sem pendências críticas para hoje.  Aproveite para prospectar novos leads em "Leads & CRM" ou organizar a agenda.';
      }
      if (sla.length) linhas.push(` **${sla.length} atendimento(s) com SLA estourado** — responda já em "Atendimento".`);
      if (vencidas.length) linhas.push(` **${vencidas.length} conta(s) vencida(s)** — verifique em "Financeiro".`);
      if (atrasadas.length) linhas.push(` **${atrasadas.length} tarefa(s) atrasada(s)** — priorize em "Tarefas".`);
      if (leadsNovos.length) linhas.push(` **${leadsNovos.length} lead(s) novo(s)** aguardando primeiro contato.`);
      if (hoje.length) {
        linhas.push('', ` ${hoje.length} compromisso(s) hoje:`);
        hoje.slice(0, 5).forEach((e) => linhas.push(`  • ${fmtTime(e.quando)} — ${e.titulo}`));
      }
      if (pendentes.length) {
        linhas.push('', ` ${pendentes.length} tarefa(s) pendente(s) no total.`);
      }
      return linhas.join('\n');
    },
  };

  /* --- AUTOMAÇÕES (etapa 5 / fase 5 simplificada: gatilho → condição → ação reais) --- */
  modules.automacoes = {
    id: 'automacoes',
    name: 'Automações',
    icon: '',
    itemsKey: 'ecomim_automacoes',
    rules: [],
    executions: [],
    _subscribers: {},
    load() {
      try {
        const raw = storage.get(this.itemsKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          this.rules = parsed.rules || [];
          this.executions = parsed.executions || [];
        }
      } catch (e) { this.rules = []; this.executions = []; }
    },
    _save() {
      try { storage.set(this.itemsKey, JSON.stringify({ rules: this.rules, executions: this.executions })); } catch (e) {}
    },
    addRule(input) {
      const r = {
        id: uid(),
        nome: trimStr(input.nome),
        evento: input.evento || 'lead.created',
        condicao: input.condicao || {},
        acao: input.acao || 'notificar',
        acaoParams: input.acaoParams || {},
        ativa: !!input.ativa,
        criadoEm: nowISO(),
      };
      this.rules.push(r);
      this._save();
      audit.record('automacao.criada', 'automacao', null, { id: r.id, nome: r.nome, evento: r.evento });
      return { ok: true, regra: r };
    },
    updateRule(id, patch) {
      const r = this.rules.find((x) => x.id === id);
      if (!r) return { ok: false, code: 'NOT_FOUND' };
      const before = { ...r };
      Object.assign(r, patch);
      r.updated = nowISO();
      this._save();
      audit.record('automacao.atualizada', 'automacao', before, r);
      return { ok: true, regra: r };
    },
    removeRule(id) {
      this.rules = this.rules.filter((r) => r.id !== id);
      this._save();
      return { ok: true };
    },
    subscribe() {
      const handler = (ev) => this._handleEvent(ev);
      this._subscribers.handler = handler;
      eventBus.on('*', null); // reset
      // registra handlers por tipo
      this.rules.forEach((r) => { if (r.ativa) eventBus.on(r.evento, handler); });
      return handler;
    },
    _handleEvent(ev) {
      if (!this.rules || !this.rules.length) return;
      this.rules.filter((r) => r.ativa && r.evento === ev.type).forEach((r) => {
        const passed = this._checkCondition(r.condicao, ev.payload);
        if (!passed) return;
        const exec = {
          id: uid(),
          regraId: r.id,
          regraNome: r.nome,
          evento: ev.type,
          payload: ev.payload,
          status: 'executada',
          resultado: this._executeAction(r.acao, r.acaoParams, ev.payload),
          em: nowISO(),
        };
        this.executions.unshift(exec);
        if (this.executions.length > 500) this.executions.pop();
        this._save();
        audit.record('automacao.executada', 'automacao', null, { regra: r.nome, evento: ev.type, acao: r.acao });
      });
    },
    _checkCondition(cond, payload) {
      if (!cond || !cond.field) return true;
      const val = payload[cond.field];
      switch (cond.op) {
        case 'eq': return String(val) === String(cond.value);
        case 'neq': return String(val) !== String(cond.value);
        case 'gt': return Number(val) > Number(cond.value);
        case 'gte': return Number(val) >= Number(cond.value);
        case 'lt': return Number(val) < Number(cond.value);
        case 'contains': return String(val || '').includes(String(cond.value));
        default: return true;
      }
    },
    _executeAction(acao, params, payload) {
      switch (acao) {
        case 'criar_tarefa': {
          const r = modules.tarefas.add({
            titulo: renderTemplate(params.titulo || 'Tarefa automática', payload),
            desc: renderTemplate(params.desc || '', payload),
            leadId: payload.leadId || null,
            prioridade: params.prioridade || 'media',
          });
          return { tipo: 'tarefa', ok: r.ok, id: r.ok ? r.tarefa.id : null };
        }
        case 'notificar': {
          // Notificação interna: registra no centro de notificações
          eventBus.emit('notification.created', {
            titulo: renderTemplate(params.titulo || 'Notificação', payload),
            corpo: renderTemplate(params.corpo || '', payload),
            tipo: 'automacao',
          });
          return { tipo: 'notificacao', ok: true };
        }
        case 'mover_etapa': {
          if (payload.leadId) {
            const r = modules.leads.moveStage(payload.leadId, params.etapa || 'novo', 'Automação: ' + (params.motivo || ''));
            return { tipo: 'etapa', ok: r.ok };
          }
          return { tipo: 'etapa', ok: false, erro: 'sem leadId' };
        }
        case 'enviar_whats': {
          const lead = payload.leadId ? DB.leads.find((l) => l.id === payload.leadId) : null;
          const msg = renderTemplate(params.mensagem || 'Mensagem automática', { ...payload, lead });
          eventBus.emit('notification.created', {
            titulo: ` WhatsApp para ${(lead && lead.nome) || (payload.nome || 'contato')}`,
            corpo: msg,
            tipo: 'whatsapp_simulado',
            aviso: 'Disparo real de WhatsApp requer integração com provedor (Meta Cloud API). Mensagem registrada para envio.',
          });
          return { tipo: 'whatsapp', ok: true, mensagem: msg };
        }
        case 'agendar': {
          const r = modules.agenda.add({
            titulo: renderTemplate(params.titulo || 'Compromisso', payload),
            quando: addHours(nowISO(), Number(params.emHoras) || 24),
            tipo: params.tipo || 'lembrete',
            leadId: payload.leadId || null,
            desc: renderTemplate(params.desc || '', payload),
          });
          return { tipo: 'agenda', ok: r.ok, id: r.ok ? r.item.id : null };
        }
        case 'marcar_contato': {
          if (payload.leadId) {
            const r = modules.leads.updateLead(payload.leadId, { vendedor: params.vendedor || null });
            return { tipo: 'contato', ok: r.ok };
          }
          return { tipo: 'contato', ok: false, erro: 'sem leadId' };
        }
        default:
          return { tipo: 'desconhecido', ok: false };
      }
    },
    watch() {
      this._subscribers.handler = (ev) => this._handleEvent(ev);
      this.rules.forEach((r) => { if (r.ativa) eventBus.on(r.evento, this._subscribers.handler); });
    },
  };

  /* --- NOTIFICAÇÕES --- */
  modules.notificacoes = {
    id: 'notificacoes',
    name: 'Notificações',
    icon: '',
    itemsKey: 'ecomim_notifications',
    items: [],
    load() {
      try {
        const raw = storage.get(this.itemsKey);
        if (raw) this.items = JSON.parse(raw);
      } catch (e) { this.items = []; }
    },
    push(notif) {
      const n = { id: uid(), titulo: notif.titulo || 'Notificação', corpo: notif.corpo || '', tipo: notif.tipo || 'info', lida: false, criadaEm: nowISO(), aviso: notif.aviso || null };
      this.items.unshift(n);
      if (this.items.length > 200) this.items.pop();
      this.save();
      return n;
    },
    markRead(id) {
      const n = this.items.find((x) => x.id === id);
      if (n) { n.lida = true; this.save(); }
    },
    markAllRead() {
      this.items.forEach((n) => { n.lida = true; });
      this.save();
    },
    unread() { return this.items.filter((n) => !n.lida); },
    save() {
      try { storage.set(this.itemsKey, JSON.stringify(this.items)); } catch (e) {}
    },
  };

  /* ------------------------------------------------------------------ *
   * 9. HELPERS DE MÓDULOS
   * ------------------------------------------------------------------ */

  const trimStr = (s) => String(s == null ? '' : s).trim();
  const toCents = (v) => {
    if (v == null || v === '' || isNaN(Number(v))) return 0;
    return Math.round(Number(v) * 100);
  };
  const renderTemplate = (tmpl, vars) => {
    return String(tmpl || '').replace(/\{\{(\w+)\}\}/g, (m, k) => {
      const v = vars && vars[k];
      return v != null ? String(v) : m;
    });
  };

  /* ------------------------------------------------------------------ *
   * 10. INICIALIZAÇÃO
   * ------------------------------------------------------------------ */

  function init() {
    db.load();
    audit.load();
    // carrega módulos persistidos
    modules.agenda.load();
    modules.notas.load();
    modules.financeiro.load();
    modules.atendimento.load();
    modules.projetos.load();
    modules.clientes.load();
    modules.marketing.load();
    modules.rh.load();
    modules.automacoes.load();
    modules.notificacoes.load();
    try {
      const iaConv = storage.get('ecomim_ia_conversations');
      if (iaConv) modules.ia.conversations = JSON.parse(iaConv);
    } catch (e) {}
    try {
      const iaCfg = storage.get('ecomim_ia_config');
      if (iaCfg) modules.ia.config = Object.assign(modules.ia.config, JSON.parse(iaCfg));
    } catch (e) {}
    // Eventos de IA para notificações
    eventBus.on('lead.created', () => {
      modules.notificacoes.push({ titulo: 'Novo lead', corpo: 'Um lead foi criado no CRM.', tipo: 'lead' });
    });
    eventBus.on('payment.completed', (ev) => {
      modules.notificacoes.push({
        titulo: ' Pagamento registrado',
        corpo: ev.payload.tipo === 'receber' ? `Recebimento de ${fmtMoney(ev.payload.valor)}` : `Pagamento de ${fmtMoney(ev.payload.valor)}`,
        tipo: 'financeiro',
      });
    });
    eventBus.on('ticket.closed', (ev) => {
      modules.notificacoes.push({ titulo: 'Ticket encerrado', corpo: 'Um atendimento foi encerrado.', tipo: 'atendimento' });
    });
    // Automações observam o barramento
    modules.automacoes.watch();
    // Auditoria de inicialização
    audit.record('sistema.iniciado', 'sistema', null, { app: APP.name, version: APP.version });
  }

  /* ------------------------------------------------------------------ *
   * 11. API PÚBLICA
   * ------------------------------------------------------------------ */

  return {
    APP, db, audit, registry, eventBus, jobs, cryptoBox, modules,
    uid, nowISO, fmtDate, fmtTime, fmtDateTime, fmtMoney, fmtPct,
    daysBetween, addDays, addHours, normalizeText, digitsOf, hash,
    init,
  };
})();

if (typeof window !== 'undefined') {
  window.ECOMIM = ECOMIM;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ECOMIM };
}