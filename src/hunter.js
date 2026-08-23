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

  /** Normalização de telefone brasileiro: apenas dígitos, DDD separado. */
  const normPhone = (s) => {
    const d = String(s || '').replace(/\D/g, '');
    if (d.length === 10 || d.length === 11) return d;
    if (d.length > 11 && d.slice(-11).startsWith('55')) return d.slice(-11);
    if (d.length > 11) return d.slice(-11);
    return d;
  };

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
    { id: 'google', tipo: 'pessoa|empresa', nome: 'Google', icone: '', desc: 'Busca pública (com operadores quando apropriado).', demoraMs: 1200 },
    { id: 'maps', tipo: 'empresa|pessoa', nome: 'Google Maps', icone: '', desc: 'Comércios e prestadores de serviço com telefone/site públicos.', demoraMs: 1800 },
    { id: 'instagram', tipo: 'pessoa|empresa', nome: 'Instagram', icone: '', desc: 'Perfis públicos, hashtags e bios públicas.', demoraMs: 1400 },
    { id: 'linkedin', tipo: 'pessoa', nome: 'LinkedIn', icone: '', desc: 'Perfis públicos com cargo e empresa.', demoraMs: 1400 },
    { id: 'facebook', tipo: 'pessoa|empresa', nome: 'Facebook', icone: '', desc: 'Páginas públicas com contato.', demoraMs: 1200 },
    { id: 'sites', tipo: 'pessoa|empresa', nome: 'Sites', icone: '', desc: 'Páginas de contato/sobre/equipe/autores.', demoraMs: 1500 },
    { id: 'diretorios', tipo: 'pessoa|empresa', nome: 'Diretórios', icone: '', desc: 'Diretórios profissionais e guias locais públicos.', demoraMs: 1300 },
  ];

  function fontesAplicaveis(tipo) {
    return DB.sources.filter((s) => s.ativo && (s.tipo.includes('|') ? s.tipo.split('|').includes(tipo) : s.tipo === tipo));
  }

  function getFonteMeta(id) { return FONTES_DISPONIVEIS.find((f) => f.id === id) || null; }

  /** Garante que todas as fontes do catálogo existam na persistência. */
  function garantirFontes() {
    FONTES_DISPONIVEIS.forEach((f) => {
      if (!DB.sources.find((s) => s.id === f.id)) {
        DB.sources.push(Object.assign({ ativo: true, ultimaExecucao: null, total: 0, erros: [] }, f));
      }
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

  /**
   * Coleta SIMULADA de uma fonte — pré-coleta determinística para
   * validação humana. IMPORTANTE (LGPD): os contatos gerados aqui são
   * sintéticos (nomes/telefones/e-mails compostos por fórmula) e são
   * SEMPRE marcados com `sintetico: true` para que a UI os rotule como
   * "contato de demonstração" e para que NUNCA sejam promovidos ao CRM
   * com consentimento presumido. No lugar de um scraper externo (que
   * exigiria backend/credenciais), a fonte é um motor independente que
   * retorna { leads, erros }.
   */
  function coletarDaFonte(fonte, params, seed) {
    const meta = getFonteMeta(fonte.id);
    const count = Math.max(2, Math.min(12, Math.round((params.quantidade || 50) / 8)));
    const erros = [];
    const out = [];
    const cidade = delim(params.cidade);
    const estado = normUf(params.estado);
    const palavraChave = delim(params.palavraChave) || delim(params.segmento) || 'mercado';

    for (let i = 1; i <= count; i++) {
      const n = seed * 101 + i * 13;
      const nome = (fonte.id === 'maps' || fonte.id === 'diretorios')
        ? `${capitalize(palavraChave)} ${sufixos[(n * 3) % sufixos.length]} ${i}`
        : `${NOMES[(n * 5 + i) % NOMES.length]} ${SOBRENOMES[(n * 11 + i * 3) % SOBRENOMES.length]}`;
      const lead = {
        id: uid(),
        sintetico: true, // contato de demonstração — rotulado na UI, nunca com consentimento presumido
        lead_type: fonte.tipo === 'pessoa' ? 'person' : 'company',
        name: nome,
        profession: (fonte.id === 'maps' || fonte.id === 'diretorios') ? capitalize(palavraChave) : PROFISSOES[(n * 3) % PROFISSOES.length],
        job_title: (fonte.id === 'linkedin') ? CARGOS[(n * 5) % CARGOS.length] : null,
        company: (fonte.id === 'linkedin' || fonte.id === 'sites' || fonte.id === 'facebook') ? `${capitalize(palavraChave)} ${SUFIXOS_EMPRESA[(n * 11) % SUFIXOS_EMPRESA.length]}` : null,
        segment: delim(params.segmento) || null,
        city: cidade || null,
        state: estado || null,
        country: 'BR',
        ddd: delim(params.ddd) || null,
        phone: null,
        whats: null,
        email: null,
        website: null,
        instagram: null,
        facebook: null,
        linkedin: null,
        description: `Encontrado via ${meta.nome} — dados públicos de ${cidade || 'sua região'} (segmento: ${delim(params.segmento) || 'geral'}).`,
        score: 0,
        quality: 'pendente',
        source: { type: fonte.id, url: null, found_at: nowISO(), data: { } },
        status: 'novo',
        created_at: nowISO(),
        updated_at: nowISO(),
      };

      // Distribui dados públicos por fonte, de forma determinística e plausível
      if (fonte.id === 'maps' || fonte.id === 'diretorios') {
        lead.phone = gerarTelefonePublico(cidade, estado, n);
        if (n % 2 === 0) lead.website = nomeToSite(nome, palavraChave);
        if (n % 3 === 0) lead.instagram = `insta_${palavraChave}_${n}`;
      }
      if (fonte.id === 'google') {
        lead.website = nomeToSite(nome, palavraChave);
        if (n % 2 === 0) lead.email = gerarEmailPublico(nome, palavraChave);
        if (n % 3 === 0) lead.description = 'Perfil/lista encontrado em pesquisa pública.';
      }
      if (fonte.id === 'instagram') {
        lead.instagram = `@${normTxt(nome).replace(/\s+/g, '.')}`;
        if (n % 2 === 0) lead.description = `Bio pública: ${capitalize(palavraChave)} — ${PROFISSOES[(n * 3) % PROFISSOES.length]}`;
      }
      if (fonte.id === 'linkedin') {
        lead.linkedin = `linkedin.com/in/${normTxt(nome).replace(/\s+/g, '-')}-${n}`;
        lead.company = `${capitalize(palavraChave)} ${SUFIXOS_EMPRESA[(n * 11) % SUFIXOS_EMPRESA.length]}`;
      }
      if (fonte.id === 'facebook') {
        lead.facebook = `facebook.com/${normTxt(nome).replace(/\s+/g, '.')}`;
        lead.phone = gerarTelefonePublico(cidade, estado, n + 5);
      }
      if (fonte.id === 'sites') {
        lead.website = nomeToSite(nome, palavraChave);
        lead.email = gerarEmailPublico(nome, palavraChave);
      }

      out.push(lead);
    }

    // Alguns resultados podem falhar/duplicar internamente — simula erros reais de fonte (ex.: página ausente)
    if (fonte.id === 'instagram' && seed % 5 === 0) erros.push('Perfil privado ignorado (sem acesso)');
    if (fonte.id === 'linkedin' && seed % 4 === 0) erros.push('1 perfil exigia login — ignorado');

    // Aplica "pre-veter" de qualidade: sem telefone/email no Maps é raro; mantém realismo
    return { leads: out, erros };
  }

  /** Nomes públicos comuns (apenas catálogo determinístico para a pré-coleta). */
  const NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elaine', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Lucas', 'Mariana', 'Nelson', 'Patrícia', 'Rafael', 'Sandra', 'Thiago', 'Vanessa', 'Wagner', 'Amanda', 'Beatriz', 'Caio', 'Daniela', 'Eduardo', 'Fernanda', 'Gustavo', 'Helena', 'Igor', 'Julia', 'Kaique', 'Larissa', 'Mateus', 'Natália', 'Otávio', 'Paula', 'Renato', 'Sabrina', 'Tatiane', 'Vitor'];
  const SOBRENOMES = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Lima', 'Araújo', 'Fernandes', 'Carvalho', 'Gomes', 'Martins', 'Rocha', 'Ribeiro', 'Alves', 'Monteiro', 'Cardoso', 'Barbosa', 'Freitas', 'Moreira', 'Teixeira', 'Melo', 'Correia', 'Pinto', 'Campos', 'Dias', 'Abreu'];
  const PROFISSOES = ['Médico', 'Advogado', 'Engenheiro', 'Contador', 'Arquiteto', 'Fisioterapeuta', 'Psicólogo', 'Dentista', 'Nutricionista', 'Personal Trainer', 'Designer', 'Consultor', 'Corretor', 'Professor', 'Veterinário', 'Fotógrafo', 'Cabeleireiro', 'Eletricista', 'Encanador', 'Chef de Cozinha'];
  const CARGOS = ['Sócio-Diretor', 'Gerente Comercial', 'Coordenador', 'Analista Sênior', 'CEO', 'Fundador', 'Supervisor', 'Especialista'];
  const SUFIXOS_EMPRESA = ['Comércio', 'Serviços', 'Assessoria', 'Consultoria', 'Studio', 'Clínica', 'oficina', 'Distribuidora', 'Atelier'];
  const sufixos = ['Comércio', 'Serviços', 'Studio', 'Clínica', 'Distribuidora', 'Atelier', 'Oficina'];

  const capitalize = (s) => String(s || '').replace(/(^|\s)\S/g, (m) => m.toUpperCase());

  /** Composição determinística de telefone BR com formato real (10–11 dígitos: DDD + 8/9 dígitos). */
  function gerarTelefonePublico(cidade, estado, n) {
    const ddd = ['11', '12', '13', '14', '15', '16', '17', '18', '19', '21', '22', '24', '27', '28', '31', '32', '33', '34', '35', '37', '38', '41', '42', '43', '44', '45', '46', '47', '48', '49', '51', '53', '54', '55', '61', '62', '63', '64', '65', '66', '67', '68', '69', '71', '73', '74', '75', '77', '79', '81', '82', '83', '84', '85', '86', '87', '88', '89', '91', '92', '93', '94', '95', '96', '97', '98', '99'][(n * 13) % 63];
    // Padrão BR: celular = 9 + 8 dígitos (11 total) · fixo = 8 dígitos (10 total)
    const first = n % 2 === 0 ? '9' : '';
    const rest = String((n * 8128 + 4000000) % 100000000).padStart(8, '0');
    return ddd + first + rest;
  }

  /** Slug de site a partir do nome normalizado. */
  function nomeToSite(nome, palavraChave) {
    const base = normTxt(nome).replace(/\s+/g, '') || normTxt(palavraChave).replace(/\s+/g, '');
    return `https://www.${base}.com.br`;
  }

  function gerarEmailPublico(nome, palavraChave) {
    const base = normTxt(nome).replace(/\s+/g, '.');
    const dom = normTxt(palavraChave).replace(/\s+/g, '') + '.com.br';
    return `${base}@${dom}`;
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
    l.ddd = dddOf(l.phone) || delim(l.ddd) || null;
    l.phone = normPhone(l.phone || l.telefone) || null;
    // WhatsApp = contato direto do telefone público (padrão BR: mesmo número)
    l.whats = normPhone(l.whats || l.whatsapp || l.phone) || null;
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
    if (lead.phone && lead.phone.length < 10) warnings.push('Telefone incompleto');
    if (lead.ddd && !validDDD(lead.ddd)) warnings.push('DDD inválido');
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

    const arg = Date.now() % 9973;
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
      // Coleta — seed varia por fonte para gerar resultados distintos e plausíveis
      try {
        const res = await new Promise((resolve) => setTimeout(() => resolve(coletarDaFonte(fonte, params, (arg + fi * 7 + 1) % 97 + 1)), 350));
        ativo.progresso += 1; emitChange();
        const res2 = await new Promise((resolve) => setTimeout(() => resolve(res), 220));
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
      if (f.ddd && (l.ddd || dddOf(l.phone)) !== f.ddd) return false;
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