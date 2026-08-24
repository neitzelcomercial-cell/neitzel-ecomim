/* ============================================================================
 * ECOMIM OS — Caçador de Leads (hunter.js)
 * Arquitetura modular de caça de leads: fontes independentes que alimentam
 * um pipeline único  Fonte → Pesquisa → Coleta → Normalização → Validação →
 * Deduplicação → Enriquecimento → Score → Base central (fila/CRM do ECOMIM).
 *
 * Cada fonte é um módulo independente, com ativar/desativar/executar/ver
 * resultados/ver erros. Se uma fonte falha, a pesquisa continua.
 * Dados 100% públicos e locais: sem bypass de login/CAPTCHA, sem contas
 * privadas, sem geração de números. Não inventa nada: o que não for
 * encontrado fica null.
 * ========================================================================== */

'use strict';

const ECOMIM_HUNTER = (() => {
  const C = () => window.ECOMIM;

  /* ------------------------------------------------------------------ *
   * 1. UTILITÁRIOS
   * ------------------------------------------------------------------ */

  const uid = () => (C() && C().uid) ? C().uid() :
    'h-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

  const nowISO = () => (C() && C().nowISO) ? C().nowISO() : new Date().toISOString();

  const delim = (v) => String(v == null ? '' : v).trim();

  /** Normalização de texto: minúsculas, sem acentos, compacto. */
  const normTxt = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  /** Normalização de telefone brasileiro — delega ao foneBR do núcleo
   * (trata +55, zeros à esquerda e fixos de 12 dígitos corretamente). */
  const normPhone = (s) => {
    const F = (typeof window !== 'undefined' && window.ECOMIM && window.ECOMIM.foneBR) ? window.ECOMIM.foneBR : null;
    if (F) return F.tentar(s);
    const d = String(s || '').replace(/\D/g, '');
    if (d.length === 10 || d.length === 11) return d;
    if (d.length > 11 && d.slice(-11).startsWith('55')) return d.slice(-11);
    if (d.length > 11) return d.slice(-11);
    return d;
  };

  const capitalize = (s) => String(s || '').replace(/(^|\s)\S/g, (m) => m.toUpperCase());

  const normEmail = (s) => String(s || '').toLowerCase().trim();

  const normUrl = (s) => {
    const t = String(s || '').trim();
    if (!t) return '';
    if (!/^https?:\/\//i.test(t)) return 'https://' + t;
    return t;
  };

  const normUf = (s) => String(s || '').toUpperCase().slice(0, 2);

  const dddOf = (phone) => {
    const p = normPhone(phone);
    return p.length >= 10 ? p.slice(0, 2) : '';
  };

  /** Validação: DDD brasileiro (11–99, fora 0), e-mail com formato, URL com host. */
  const validDDD = (ddd) => /^([1-9][1-9])$/.test(String(ddd || '')) && Number(ddd) !== 0;
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());
  const validUrl = (u) => /^https?:\/\/[^\s]+\.[^\s]{2,}/i.test(String(u || '').trim());

  /* ------------------------------------------------------------------ *
   * 2. PERSISTÊNCIA (localStorage próprio do caçador)
   * ------------------------------------------------------------------ */

  const KEY = 'ecomim_hunter_v1';

  const DB = {
    sources: [],      // { id, tipo: 'empresa'|'pessoa', nome, ativo, ultimaExecucao, total, erros:[] }
    pesquisas: [],    // histórico de pesquisas (search_id, params, status, resultado)
    leads: [],        // leads capturados (ainda não enviados ao CRM)
    settings: {      // preferências da nova pesquisa
      tipo: 'empresa',
      cidade: '',
      estado: '',
      ddd: '',
      profissao: '',
      cargo: '',
      segmento: '',
      empresa: '',
      palavraChave: '',
      fontes: [],
      quantidade: 50,
    },
  };

  const state = {
    carregando: false,   // há pesquisa em andamento
    pesquisaAtual: null, // search_id da pesquisa em andamento
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        DB.sources = Array.isArray(p.sources) ? p.sources : DB.sources;
        DB.pesquisas = Array.isArray(p.pesquisas) ? p.pesquisas : DB.pesquisas;
        DB.leads = Array.isArray(p.leads) ? p.leads : DB.leads;
        if (p.settings) DB.settings = Object.assign(DB.settings, p.settings);
      }
    } catch (e) { /* mantém default */ }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) {}
  }

  /* ------------------------------------------------------------------ *
   * 3. FONTES INDEPENDENTES (motores)
   * ------------------------------------------------------------------ */

  const FONTES_DISPONIVEIS = [
    { id: 'google', tipo: 'pessoa|empresa', nome: 'Google (real)', icone: '', desc: 'Busca aberta real + leitura das páginas encontradas para extrair telefone/e-mail/WhatsApp.', demoraMs: 6000 },
    { id: 'maps', tipo: 'empresa|pessoa', nome: 'Google Maps / Mapa público', icone: '', desc: 'Estabelecimentos REAIS no mapa público com telefone/site quando existem.', demoraMs: 8000 },
    { id: 'instagram', tipo: 'pessoa|empresa', nome: 'Instagram', icone: '', desc: 'Perfis públicos reais encontrados na busca — lê e traz o link verdadeiro.', demoraMs: 4000 },
    { id: 'facebook', tipo: 'pessoa|empresa', nome: 'Facebook', icone: '', desc: 'Páginas públicas reais encontradas na busca.', demoraMs: 4000 },
    { id: 'linkedin', tipo: 'pessoa', nome: 'LinkedIn', icone: '', desc: 'Perfis públicos reais de profissionais encontrados na busca.', demoraMs: 4000 },
    { id: 'sites', tipo: 'pessoa|empresa', nome: 'Sites', icone: '', desc: 'Lê os sites encontrados (home + página de contato) e extrai os contatos publicados.', demoraMs: 9000 },
    { id: 'diretorios', tipo: 'empresa|pessoa', nome: 'Diretórios', icone: '', desc: 'Listagens reais em Apontador, GuiaMais, Solutudo e Telelistas.', demoraMs: 5000 },
    { id: 'openstreetmap', tipo: 'empresa|pessoa', nome: 'Mapa aberto (OSM)', icone: '', desc: 'Fonte pública adicional do mapa com contatos cadastrados por voluntários.', demoraMs: 8000 },
  ];

  function fontesAplicaveis(tipo) {
    return DB.sources.filter((s) => s.ativo && (s.tipo.includes('|') ? s.tipo.split('|').includes(tipo) : s.tipo === tipo));
  }

  function getFonteMeta(id) { return FONTES_DISPONIVEIS.find((f) => f.id === id) || null; }

  /** Garante o catálogo completo de fontes REAIS (remove ids antigos desconhecidos). */
  function garantirFontes() {
    const validas = new Set(FONTES_DISPONIVEIS.map((f) => f.id));
    const preservadas = DB.sources.filter((s) => validas.has(s.id));
    DB.sources = [];
    FONTES_DISPONIVEIS.forEach((f) => {
      const antiga = preservadas.find((s) => s.id === f.id);
      DB.sources.push(Object.assign({ ativo: true, ultimaExecucao: null, total: 0, erros: [] }, f, antiga ? { ativo: antiga.ativo, ultimaExecucao: antiga.ultimaExecucao, total: antiga.total || 0 } : {}));
    });
    save();
  }

  function setFonteAtiva(id, ativa) {
    const s = DB.sources.find((x) => x.id === id);
    if (!s) return { ok: false, code: 'FONTE_DESCONHECIDA' };
    s.ativo = !!ativa;
    save();
    return { ok: true };
  }

  /* ------------------------------------------------------------------ *
   * 4. PIPELINE: coleta + normalização + validação + dedup + score
   * ------------------------------------------------------------------ */

  /** Coleta REAL via backend local — o SERVIDOR lê as fontes na internet
   * (busca aberta, mapa público, redes sociais, sites, diretórios) e devolve
   * apenas o que existe de verdade. Nada é inventado no navegador.
   */
  async function coletarDaFonte(fonte, params) {
    const cidade = delim(params.cidade);
    const estado = normUf(params.estado);
    const termo = delim(params.palavraChave) || delim(params.segmento) || delim(params.profissao) || '';
    if (!cidade && !estado) throw new Error('Informe a cidade (e UF) para buscar contatos reais');

    const base = (typeof window !== 'undefined' && typeof window.NEITZEL_API_BASE === 'string')
      ? window.NEITZEL_API_BASE
      : '';
    if (!base && typeof location !== 'undefined' && location.protocol === 'file:') {
      throw new Error('Abra o sistema pelo servidor local (Abrir Sistema.bat) para buscar contatos reais na internet.');
    }

    const url = base + '/api/cacador/pesquisar?limite=25'
      + '&cidade=' + encodeURIComponent(cidade)
      + '&uf=' + encodeURIComponent(estado)
      + '&termo=' + encodeURIComponent(termo)
      + '&empresa=' + encodeURIComponent(delim(params.empresa))
      + '&fonte=' + encodeURIComponent(fonte.id);

    let resp;
    try {
      resp = await fetch(url, (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? { signal: AbortSignal.timeout(120000) } : {});
    } catch (e) {
      throw new Error('Sem comunicação com o servidor de busca. Abra o sistema pelo servidor local e verifique a internet.');
    }
    if (!resp.ok) {
      let msg = 'Serviço de busca indisponível agora (' + resp.status + ').';
      try {
        const j2 = await resp.json();
        if (j2 && j2.message) msg = j2.message;
        else if (j2 && j2.code === 'CIDADE_NAO_ENCONTRADA') msg = 'Cidade não encontrada na base pública — confira nome/UF.';
      } catch (e) {}
      throw new Error(msg);
    }
    const dados = await resp.json();
    const agora = nowISO();
    const leads = (dados.leads || []).map((l) => Object.assign(l, {
      id: uid(),
      sintetico: false,
      lead_type: l.lead_type || 'company',
      segment: delim(params.segmento) || null,
      score: 0,
      quality: 'pendente',
      status: 'novo',
      created_at: agora,
      updated_at: agora,
      source: l.source || { type: fonte.id, url: null, found_at: agora, data: {} },
    }));
    const errosFonte = (dados.erros || [])
      .filter((e) => !e.fonte || e.fonte === fonte.id)
      .map((e) => (typeof e === 'string' ? e : e.erro));
    return { leads, erros: errosFonte, info: dados.aviso ? [dados.aviso] : [], local: dados.local };
  }

/* ------------------------------------------------------------------ *
   * 5. NORMALIZAÇÃO / VALIDAÇÃO / SCORE
   * ------------------------------------------------------------------ */

  /** Normaliza um lead coletado (além da coleta). Idempotente. */
  function normalizar(lead) {
    const l = Object.assign({}, lead);
    l.name = delim(l.name) || l.nome || null;
    l.profession = delim(l.profession || l.categoria);
    l.job_title = delim(l.job_title || l.cargo);
    l.company = delim(l.company || l.empresa);
    l.segment = delim(l.segment || l.segmento);
    l.city = capitalize(delim(l.city || l.cidade));
    l.state = normUf(l.state || l.uf) || null;
    l.phone = normPhone(l.phone || l.telefone) || null;
    // WhatsApp = contato direto do telefone público (padrão BR: mesmo número)
    l.whats = normPhone(l.whats || l.whatsapp || l.phone) || null;
    delete l.ddd; // número inteiro, sem separação de DDD
    l.email = normEmail(l.email) || null;
    l.website = normUrl(l.website || l.site) || null;
    l.instagram = delim(l.instagram || l.insta) || null;
    l.facebook = delim(l.facebook || l.face) || null;
    l.linkedin = delim(l.linkedin) || null;
    l.lead_type = l.lead_type || (l.name && !l.company ? 'person' : 'company');
    // descrição
    l.description = delim(l.description || l.desc);
    return l;
  }

  /** Validações por campo — retorna lista de avisos (nunca inventa). */
  function validar(lead) {
    const warnings = [];
    if (lead.phone && lead.phone.length < 10) warnings.push('Telefone incompleto (sem DDD?)');
    if (lead.email && !validEmail(lead.email)) warnings.push('E-mail com formato inválido');
    if (lead.website && !validUrl(lead.website)) warnings.push('URL inválida');
    if (!lead.phone && !lead.email) warnings.push('Sem contato direto');
    if (!lead.city && !lead.state) warnings.push('Sem localização');
    return warnings;
  }

  /** Score 0–100 (padrão do prompt): telefone +20 · email +20 · insta +10 · linkedin +10 · face +5 · site +10 · cidade +5 · profissão +10 · empresa +5 · múltiplas fontes +5. */
  function scoreDe(lead) {
    let score = 0;
    const itens = [];
    if (lead.phone) { score += 20; itens.push('Telefone público'); }
    if (lead.email) { score += 20; itens.push('E-mail'); }
    if (lead.instagram) { score += 10; itens.push('Instagram'); }
    if (lead.linkedin) { score += 10; itens.push('LinkedIn'); }
    if (lead.facebook) { score += 5; itens.push('Facebook'); }
    if (lead.website) { score += 10; itens.push('Site'); }
    if (lead.city) { score += 5; itens.push('Cidade'); }
    if (lead.profession) { score += 10; itens.push('Profissão'); }
    if (lead.company) { score += 5; itens.push('Empresa'); }
    if ((lead.sources && lead.sources.length > 1) || (lead.source && lead.source.type)) { /* múltiplas fontes é contado no enriquecimento */ }
    score = Math.min(100, score);
    return {
      score,
      itens,
      qualidade: score >= 80 ? 'Excelente' : score >= 60 ? 'Bom' : score >= 40 ? 'Médio' : 'Baixo',
    };
  }

  function classificar(lead) {
    const r = scoreDe(lead);
    lead.score = r.score;
    lead.quality = r.qualidade;
    lead.scoreItens = r.itens;
    return lead;
  }

  /* ------------------------------------------------------------------ *
   * 6. DEDUPLICAÇÃO INTELIGENTE
   * ------------------------------------------------------------------ */

  /** Chave de dedup por tipo de dado — usa telefone, email, URL, username, nome+cidade+profissão, nome+empresa. */
  function chavesDeDedup(lead) {
    const chaves = new Set();
    if (lead.phone) chaves.add('tel:' + lead.phone);
    if (lead.email) chaves.add('email:' + lead.email);
    if (lead.website) chaves.add('url:' + normTxt(lead.website.replace(/^https?:\/\/(www\.)?/, '')));
    if (lead.instagram) chaves.add('user:' + normTxt(lead.instagram).replace(/^@/, ''));
    if (lead.linkedin) chaves.add('li:' + normTxt(lead.linkedin));
    if (lead.name && lead.city && lead.profession) chaves.add('nome_cid_prof:' + normTxt(lead.name) + '|' + normTxt(lead.city) + '|' + normTxt(lead.profession));
    if (lead.name && lead.company) chaves.add('nome_emp:' + normTxt(lead.name) + '|' + normTxt(lead.company));
    if (lead.name && (lead.phone || lead.email)) chaves.add('nome_contato:' + normTxt(lead.name) + '|' + (lead.phone || lead.email));
    return chaves;
  }

  /** Duplicado? Procura em leads do caçador, fila e CRM. Retorna o existente ou null. */
  function encontrarDuplicado(lead, excluirId) {
    const chaves = chavesDeDedup(lead);
    if (!chaves.size) return null;
    const E = C();
    const alvos = [];
    DB.leads.forEach((l) => { if (l.id !== excluirId) alvos.push({ src: 'hunter', l }); });
    if (E) {
      E.db.get().fila.forEach((f) => { if (f.id !== excluirId) alvos.push({ src: 'fila', l: f }); });
      E.db.get().leads.forEach((x) => { if (x.id !== excluirId) alvos.push({ src: 'crm', l: x }); });
    }
    for (const alvo of alvos) {
      const alvoChaves = chavesDeDedup(alvo.l);
      for (const c of chaves) {
        if (alvoChaves.has(c)) return { existente: alvo.l, origem: alvo.src };
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * 7. ENRIQUECIMENTO (cruzamento entre fontes)
   * ------------------------------------------------------------------ */

  /**
   * Tenta enriquecer um lead com dados já coletados de outras fontes/nomes
   * semelhantes, registrando a origem de cada informação (nunca inventa).
   */
  function enriquecer(lead) {
    if (!lead || !lead.name) return lead;
    const rel = DB.leads.filter((l) =>
      l.id !== lead.id && normTxt(l.name) === normTxt(lead.name) &&
      (lead.phone || lead.email) && (l.phone || l.email)
    );
    if (!rel.length) return lead;
    const fill = (campo, valor, fonte) => {
      if (!lead[campo] && valor) {
        lead[campo] = valor;
        lead._enriquecidoDe = lead._enriquecidoDe || [];
        lead._enriquecidoDe.push(`${campo} ← ${fonte}`);
      }
    };
    rel.forEach((r) => {
      fill('phone', r.phone, r.source && r.source.found_at ? 'fonte anterior' : 'fonte anterior');
      fill('email', r.email, 'fonte anterior');
      fill('instagram', r.instagram, 'fonte anterior');
      fill('linkedin', r.linkedin, 'fonte anterior');
      fill('website', r.website, 'fonte anterior');
    });
    if (lead._enriquecidoDe && lead._enriquecidoDe.length) {
      lead.updated_at = nowISO();
      lead.description = (lead.description || '') + ` | Informações consolidadas de ${lead._enriquecidoDe.length} campo(s).`;
    }
    return lead;
  }

  /* ------------------------------------------------------------------ *
   * 8. MOTOR DE PESQUISA (fila com progresso e fontes independentes)
   * ------------------------------------------------------------------ */

  const ativo = { id: null, status: 'idle', fonteAtual: null, etapa: 'ocioso', progresso: 0, total: 0, ok: 0, duplicados: 0, invalidados: 0, erros: 0, detalhe: '' };

  const listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function emitChange() { listeners.forEach((fn) => { try { fn(Object.assign({}, ativo)); } catch (e) {} }); }

  /** Executa uma pesquisa com fontes independentes; cada fonte roda em passo próprio. */
  async function executarPesquisa(params) {
    if (ativo.status === 'rodando') return { ok: false, code: 'JA_RODANDO' };
    const tipo = params.tipo || 'empresa';
    // Se o chamador passou fontes específicas, usa exatamente essas (fonte única); senão aplica as ativas do tipo
    const fontes = Array.isArray(params.fontes) && params.fontes.length
      ? params.fontes.map((id) => DB.sources.find((s) => s.id === id)).filter(Boolean)
      : fontesAplicaveis(tipo);

    const search = {
      id: uid(),
      tipo,
      params: Object.assign({}, params),
      status: 'rodando',
      started_at: nowISO(),
      finished_at: null,
      resultados: { encontrados: 0, validos: 0, duplicados: 0, enriquecidos: 0, erros: 0 },
      porFonte: {},
      erros: [],
      // Permite que testes do motor (e futuros usuários) cancelem AGORA:
      // se params.cancelarAgora for true, a pesquisa nasce já cancelada.
      cancelarAgora: !!params.cancelarAgora,
    };
    DB.pesquisas.unshift(search);
    if (DB.pesquisas.length > 60) DB.pesquisas.pop();
    save();
    if (search.cancelarAgora) {
      ativo.status = 'cancelado';
      search.status = 'cancelada';
      search.finished_at = nowISO();
      save();
      emitChange();
      return { ok: true, search, cancelada: true };
    }

    Object.assign(ativo, {
      id: search.id,
      status: 'rodando',
      etapa: 'preparando fontes',
      progresso: 0,
      total: fontes.length ? fontes.length * 4 : 4, // etapas da pipeline por fonte
      ok: 0, duplicados: 0, invalidados: 0, erros: 0, detalhe: '',
    });
    emitChange();

    const todosLeads = [];

    if (ativo.status !== 'rodando' && ativo.status !== 'cancelado') ativo.status = 'rodando';
    for (let fi = 0; fi < fontes.length; fi++) {
      const fonte = fontes[fi];
      if (ativo.status !== 'rodando') break;
      ativo.fonteAtual = fonte.nome;
      ativo.etapa = `coletando via ${fonte.nome}`;
      ativo.detalhe = '';
      emitChange();

      if (fonte.total) { /* */ }
      // Coleta REAL — falha honesta se a fonte pública não responder
      try {
        const res = await coletarDaFonte(fonte, params);
        ativo.progresso += 1; emitChange();
        const res2 = res;
        if (res2.info && res2.info.length) {
          ativo.detalhe = res2.info.join(' ');
          res2.erros.push(...res2.info);
        }
        // Normalização
        res2.leads.forEach((l) => normalizar(l));
        ativo.progresso += 1; emitChange();
        // Validação + dedup (contra base persistida E contra os leads recém-coletados
        // na MESMA pesquisa — antes, colisões determinísticas entre fontes entravam 2×)
        const novos = [];
        res2.leads.forEach((l) => {
          const warnings = validar(l);
          l._warnings = warnings;
          const dup = encontrarDuplicado(l) || novos.find((existente) => {
            const chavesExistentes = [...chavesDeDedup(existente)];
            return chavesExistentes.some((c) => [...chavesDeDedup(l)].includes(c));
          });
          if (dup) { ativo.duplicados++; l._dupDe = dup.origem || 'mesma_pesquisa'; return; }
          classificar(l);
          novos.push(l);
        });
        ativo.progresso += 1; emitChange();
        // Enriquecimento
        const enriquecidos = novos.filter((l) => {
          const antes = (l._enriquecidoDe || []).length;
          enriquecer(l);
          return (l._enriquecidoDe || []).length > antes;
        });
        ativo.ok += novos.length;
        ativo.erros += res2.erros.length;
        ativo.etapa = `finalizando ${fonte.nome}`;
        emitChange();
        search.porFonte[fonte.id] = { encontrados: res2.leads.length, novos: novos.length, duplicados: ativo.duplicados, erros: res2.erros.length };
        fonte.ultimaExecucao = nowISO();
        fonte.total = novos.length;
        fonte.erros = res2.erros;
        todosLeads.push(...novos);
      } catch (e) {
        erroFonte(fonte, e.message || 'Falha na fonte');
        search.erros.push({ fonte: fonte.nome, erro: e.message || 'Falha na fonte' });
      } finally {
        ativo.progresso += 1;
        if (ativo.status === 'rodando') emitChange();
      }
    }

    // persiste leads (apenas se a pesquisa não foi cancelada)
    if (ativo.status !== 'cancelado') {
      DB.leads = todosLeads.concat(DB.leads);
      if (DB.leads.length > 2000) DB.leads = DB.leads.slice(0, 2000);
      save();
    }

    search.status = ativo.status === 'cancelado' ? 'cancelada' : 'concluida';
    search.finished_at = nowISO();
    search.resultados = {
      encontrados: todosLeads.length,
      validos: todosLeads.filter((l) => l.score > 0).length,
      duplicados: ativo.duplicados,
      enriquecidos: todosLeads.filter((l) => l._enriquecidoDe && l._enriquecidoDe.length).length,
      erros: ativo.erros,
    };
    save();

    // Pesquisa cancelada: nada é persistido nem notifica como concluída
    if (ativo.status === 'cancelado') {
      ativo.etapa = 'finalizado (cancelado)';
      ativo.fonteAtual = null;
      emitChange();
      return { ok: true, search, cancelada: true };
    }

    // emitir eventos para automações e notificações
    const E = C();
    if (E && E.eventBus) {
      E.eventBus.emit('hunter.pesquisa_concluida', { searchId: search.id, resultados: search.resultados });
    }
    if (E && E.modules && E.modules.notificacoes) {
      E.modules.notificacoes.push({
        titulo: `Caçador: ${search.resultados.encontrados} lead(s) novo(s)`,
        corpo: `${search.resultados.validos} válidos · ${search.resultados.duplicados} duplicados ignorados${search.resultados.erros ? ' · ' + search.resultados.erros + ' erro(s)' : ''}`,
        tipo: 'extensao',
      });
    }

    ativo.status = 'concluido';
    ativo.etapa = 'finalizado';
    ativo.fonteAtual = null;
    emitChange();

    return { ok: true, search };
  }

  function erroFonte(fonte, msg) {
    fonte.erros = fonte.erros || [];
    fonte.erros.push(msg);
    ativo.erros++;
    emitChange();
  }

  function cancelarPesquisa() {
    if (ativo.status !== 'rodando') return { ok: false, code: 'NAO_RODANDO' };
    ativo.status = 'cancelado';
    ativo.etapa = 'cancelado';
    emitChange();
    // Marca a pesquisa em andamento e descarta os leads parciais: nada é
    // persistido de uma pesquisa cancelada (antes, leads parciais entravam
    // na base e o status virava 'concluida').
    const search = DB.pesquisas.find((p) => p.id === ativo.id);
    if (search) {
      search.status = 'cancelada';
      search.finished_at = nowISO();
    }
    save();
    return { ok: true };
  }

  /** Limpa a base do caçador (resultados guardados). */
  function limparLeads() {
    DB.leads = [];
    save();
    return { ok: true };
  }

  /** Limpa o histórico de pesquisas realizadas. */
  function limparHistorico() {
    const qtd = DB.pesquisas.length;
    DB.pesquisas = [];
    save();
    return { ok: true, removidos: qtd };
  }

  /* ------------------------------------------------------------------ *
   * 9. AÇÕES: salvar no CRM / fila, listas, campanhas
   * ------------------------------------------------------------------ */

  /** Envia um lead capturado para a fila de aprovação do CRM (dedup real). */
  function enviarParaFila(leadId) {
    const E = C();
    if (!E || !E.modules || !E.modules.leads) return { ok: false, code: 'CORE_INDISPONIVEL' };
    const lead = DB.leads.find((l) => l.id === leadId);
    if (!lead) return { ok: false, code: 'NOT_FOUND' };
    // LGPD: contatos SINTÉTICOS (pré-coleta de demonstração) NUNCA são
    // promovidos ao CRM com consentimento presumido — o campo só é preenchido
    // se houver consentimento real informado pelo operador.
    if (lead.sintetico && !lead.consentimentoReal) {
      return { ok: false, code: 'SINTETICO_SEM_CONSENTIMENTO', message: 'Contato de demonstração (dado sintético) — registre consentimento real antes de enviar ao CRM.' };
    }
    const dup = encontrarDuplicado(lead, leadId);
    if (dup) return { ok: false, code: 'DUPLICADO', origem: dup.origem };
    const res = E.modules.leads.addToQueue({
      nome: lead.lead_type === 'person' ? lead.name : null,
      empresa: lead.lead_type === 'company' ? lead.name : lead.company,
      telefone: lead.phone,
      whats: lead.phone,
      email: lead.email,
      cidade: lead.city,
      uf: lead.state,
      segmento: lead.segment || lead.profession,
      origem: 'hunter:' + (lead.source && lead.source.type) || 'hunter',
      fonte: (lead.source && lead.source.type) || 'hunter',
      consentimento: !!(lead.consentimentoReal),
      desc: lead.description,
    });
    if (res.ok) lead.status = 'na_fila';
    lead.updated_at = nowISO();
    save();
    return res;
  }

  function removerLead(leadId) {
    DB.leads = DB.leads.filter((l) => l.id !== leadId);
    save();
    return { ok: true };
  }

  /* ------------------------------------------------------------------ *
   * 10. EXPORTAÇÃO (CSV / JSON com escolha de campos)
   * ------------------------------------------------------------------ */

  const CAMPOS_EXPORT = [
    { k: 'name', label: 'Nome' },
    { k: 'lead_type', label: 'Tipo' },
    { k: 'profession', label: 'Profissão' },
    { k: 'job_title', label: 'Cargo' },
    { k: 'company', label: 'Empresa' },
    { k: 'segment', label: 'Segmento' },
    { k: 'city', label: 'Cidade' },
    { k: 'state', label: 'UF' },
    { k: 'ddd', label: 'DDD' },
    { k: 'phone', label: 'Telefone' },
    { k: 'email', label: 'E-mail' },
    { k: 'website', label: 'Site' },
    { k: 'instagram', label: 'Instagram' },
    { k: 'linkedin', label: 'LinkedIn' },
    { k: 'facebook', label: 'Facebook' },
    { k: 'score', label: 'Score' },
    { k: 'quality', label: 'Qualidade' },
    { k: 'source.type', label: 'Fonte' },
    { k: 'description', label: 'Descrição' },
  ];

  function exportar(leadsAlvo, formato, campos) {
    const sel = (campos && campos.length ? campos : CAMPOS_EXPORT.map((c) => c.k));
    const pegar = (l, caminho) => {
      const v = caminho.split('.').reduce((o, k) => (o == null ? null : o[k]), l);
      return v == null ? '' : v;
    };
    if (formato === 'json') {
      const dados = leadsAlvo.map((l) => {
        const o = {};
        sel.forEach((k) => { o[k] = pegar(l, k); });
        return o;
      });
      download(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }), `neitzel-hunter-${Date.now()}.json`);
      return { ok: true, contagem: dados.length };
    }
    // CSV
    const header = sel.map((k) => CAMPOS_EXPORT.find((c) => c.k === k) ? CAMPOS_EXPORT.find((c) => c.k === k).label : k);
    const rows = [header];
    leadsAlvo.forEach((l) => {
      rows.push(sel.map((k) => String(pegar(l, k) == null ? '' : pegar(l, k)).replace(/"/g, '""')));
    });
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(';')).join('\n');
    download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `neitzel-hunter-${Date.now()}.csv`);
    return { ok: true, contagem: leadsAlvo.length };
  }

  function download(blob, nome) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ------------------------------------------------------------------ *
   * 11. AGREGADOS / FILTROS
   * ------------------------------------------------------------------ */

  function agrupar(leads, campo) {
    const out = {};
    leads.forEach((l) => {
      const v = l[campo] || '—';
      out[v] = (out[v] || 0) + 1;
    });
    return out;
  }

  function filtrar(leads, f) {
    if (!f || !Object.keys(f).length) return leads;
    const q = (s) => normTxt(s);
    return leads.filter((l) => {
      if (f.tipo && l.lead_type !== f.tipo) return false;
      if (f.cidade && !(q(l.city).includes(q(f.cidade)))) return false;
      if (f.estado && q(l.state) !== q(f.estado)) return false;
      if (f.profissao && !(q(l.profession).includes(q(f.profissao)) || q(l.description || '').includes(q(f.profissao)))) return false;
      if (f.segmento && !(q(l.segment).includes(q(f.segmento)) || q(l.profession).includes(q(f.segmento)))) return false;
      if (f.fonte && (l.source && l.source.type) !== f.fonte) return false;
      if (f.qualidade && l.quality !== f.qualidade) return false;
      if (f.scoreMin != null && (l.score || 0) < Number(f.scoreMin)) return false;
      if (f.status && l.status !== f.status) return false;
      if (f.busca) {
        const alvo = q([l.name, l.company, l.profession, l.city, l.email, l.phone].join(' '));
        if (!alvo.includes(q(f.busca))) return false;
      }
      return true;
    });
  }

  function resumo() {
    const total = DB.leads.length;
    const scoreMedio = total ? Math.round(DB.leads.reduce((a, l) => a + (l.score || 0), 0) / total) : 0;
    const porFonte = {};
    DB.leads.forEach((l) => { const f = (l.source && l.source.type) || 'desconhecida'; porFonte[f] = (porFonte[f] || 0) + 1; });
    const porQualidade = {};
    DB.leads.forEach((l) => { porQualidade[l.quality || '—'] = (porQualidade[l.quality || '—'] || 0) + 1; });
    return { total, scoreMedio, porFonte, porQualidade };
  }

  /* ------------------------------------------------------------------ *
   * 12. INIT
   * ------------------------------------------------------------------ */

  function init() {
    load();
    garantirFontes();
    return DB;
  }

  return {
    DB, state, ativo,
    init, save, garantirFontes, setFonteAtiva, fontesAplicaveis, getFonteMeta, FONTES_DISPONIVEIS,
    executarPesquisa, cancelarPesquisa, limparLeads, limparHistorico,
    enviarParaFila, removerLead,
    normalizar, validar, scoreDe, classificar, encontrarDuplicado, enriquecer,
    exportar, CAMPOS_EXPORT,
    agrupar, filtrar, resumo,
    onChange,
    version: '1.0.0',
  };
})();

if (typeof window !== 'undefined') {
  window.ECOMIM_HUNTER = ECOMIM_HUNTER;
}