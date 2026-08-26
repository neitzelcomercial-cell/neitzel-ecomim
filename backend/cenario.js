/* ============================================================================
 * NEITZEL — MÓDULO DE ANÁLISE DE CENÁRIO, MERCADO E PREVISÃO (backend)
 * Reestruturado conforme especificação (especificacao_modulo_analise_opencode):
 *   §2  Consultas geradas DINAMICAMENTE por país/estado/cidade/segmento/período
 *   §3  Fontes com metadados completos + prioridade (P1 oficial > P2 imprensa)
 *   §4  Mapeamento ativo de eventos locais com estrutura própria
 *   §5  SEPARAÇÃO RÍGIDA evento ≠ impacto (nunca presumir causalidade simples)
 *   §6  Clima real (Open-Meteo, sem chave), sazonalidade de pagamento
 *   §11 Fallback honesto: sem dados externos => aviso explícito, nada inventado
 *   §12 Provedor de busca abstrato (backend/busca.js) + cache por parâmetros
 * NADA é simulado: todo campo que não vier de fonte real fica null/'INDETERMINADO'.
 * ========================================================================== */
'use strict';

const busca = require('./busca');

/* ============================ CONSULTAS (§2) ============================== */
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Gera as consultas dinamicamente — muda quando país/estado/cidade/segmento/período mudam. */
function gerarConsultas({ pais, estado, cidade, segmento, periodoSemanas }) {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mesAtual = MESES[agora.getMonth()];
  const proximoMes = MESES[(agora.getMonth() + 1) % 12];
  const onde = [cidade, estado].filter(Boolean).join(' ');
  const regiao = onde || pais || 'Brasil';
  const seg = String(segmento || '').trim();
  const horizonte = Math.min(Math.max(Number(periodoSemanas) || 8, 1), 8);
  const c = [];
  const add = (consulta, categoria, peso) => c.push({ consulta, categoria, peso });

  // Eventos próximos (janela da análise) — padrões exigidos pela especificação
  add(`eventos ${regiao} próximos dias`, 'eventos', 'alta');
  add(`eventos ${regiao} próxima semana`, 'eventos', 'alta');
  add(`shows ${regiao}`, 'eventos', 'media');
  add(`feiras ${regiao}`, 'eventos', 'media');
  add(`eventos esportivos ${regiao}`, 'eventos', 'media');
  add(`${seg ? seg + ' ' : ''}${regiao} ${mesAtual} ${proximoMes} programação`, 'eventos', 'media');

  // Feriados e datas especiais no horizonte
  add(`feriados ${regiao} próximos 2 meses`, 'feriados', 'alta');
  add(`feriados ${pais || 'Brasil'} ${ano}`, 'feriados', 'media');
  add(`pontos facultativos ${pais || 'Brasil'} ${ano}`, 'feriados', 'baixa');
  add(`férias escolares ${estado || pais || 'Brasil'} ${ano}`, 'feriados', 'baixa');

  // Economia local / consumo / comércio
  add(`economia ${regiao}`, 'economia', 'alta');
  add(`comércio ${regiao} movimento`, 'economia', 'alta');
  add(`${pais || 'Brasil'} índice confiança do consumidor atual`, 'economia', 'media');

  // Específicas do segmento (ex.: barbearia — cortes pré-evento/formaturas)
  if (seg) {
    add(`${seg} ${regiao} mercado demanda`, 'segmento', 'alta');
    add(`movimento comércio ${regiao} ${seg}`, 'segmento', 'media');
    if (/barbear|sal[aã]o|est[eé]tica/i.test(seg)) {
      add(`formaturas casamentos ${regiao} ${ano} datas`, 'segmento', 'baixa');
      add(`${seg} movimento volta às aulas véspera de feriado`, 'segmento', 'baixa');
    }
  }
  return { consultas: c.slice(0, 18), horizonteSemanas: horizonte };
}

/* ====================== PRIORIDADE E NOME DE FONTE (§3) =================== */
const DOMINIOS_P1 = [
  /\.gov\.br$/i, /\.gov$/i, /\.leg\.br$/i, /\.edu\.br$/i,
  /ibge\.gov\.br$/i, /planalto\.gov\.br$/i, /inmet\.gov\.br$/i,
];
const PALAVRAS_IMPRENSA = /(jornal|notic|news|gazeta|tribuna|diario|diário|g1|globo|uol|terra|r7|record|nsctotal|bocainafolha|folha|estadao|estadão|bbc|cnn|sbt|band)/i;

function classificarFonte(url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return { nomeFonte: 'Fonte não informada', prioridade: 3, dominio: '' }; }
  const prioridade = DOMINIOS_P1.some((re) => re.test(host)) ? 1 : (PALAVRAS_IMPRESSA(host) ? 2 : 3);
  return { nomeFonte: host, prioridade, dominio: host };
}
function PALAVRAS_IMPRESSA(host) { return PALAVRAS_IMPRENSA.test(host); }

/* ===================== EXTRAÇÃO DE DATAS/EVENTOS (§4) ==================== */
function extrairDataEvento(texto, agora) {
  const t = String(texto || '').toLowerCase();
  const anoCorrente = agora.getFullYear();
  // "12 de agosto", "12 e 13 de setembro"
  let m = t.match(new RegExp('(\\d{1,2})\\s*(?:e\\s*\\d{1,2}\\s*)?de\\s*(' + MESES.join('|') + ')(?:\\s*(?:de\\s*)?(\\d{4}))?'));
  if (m) {
    const dia = Number(m[1]);
    const mes = MESES.indexOf(m[2]);
    let ano = m[3] ? Number(m[3]) : anoCorrente;
    if (!m[3] && mes < agora.getMonth() - 1) ano += 1; // mês já passou => próximo ano
    if (dia >= 1 && dia <= 31 && mes >= 0) {
      const d = new Date(Date.UTC(ano, mes, dia, 12));
      return isNaN(d) ? null : d.toISOString();
    }
  }
  // "15/08" ou "15/08/2026"
  m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (m) {
    const dia = Number(m[1]), mes = Number(m[2]) - 1;
    let ano = m[3] ? Number(m[3]) : anoCorrente;
    if (!m[3] && mes < agora.getMonth() - 1) ano += 1;
    if (mes >= 0 && mes <= 11 && dia >= 1 && dia <= 31) {
      const d = new Date(Date.UTC(ano, mes, dia, 12));
      return isNaN(d) ? null : d.toISOString();
    }
  }
  // Só o mês ("agosto") => primeiro dia do mês como referência aproximada
  m = t.match(new RegExp('(' + MESES.join('|') + ')'));
  if (m) {
    const mes = MESES.indexOf(m[1]);
    let ano = anoCorrente;
    if (mes < agora.getMonth() - 1) ano += 1;
    const d = new Date(Date.UTC(ano, mes, 1, 12));
    return isNaN(d) ? null : d.toISOString();
  }
  return null;
}

const TIPOS_EVENTO = [
  { tipo: 'show', re: /\b(show|shows|concert|espetáculo|espetaculo|festival)\b/i },
  { tipo: 'feira', re: /\b(feira|feiras|expofeira|expo)\b/i },
  { tipo: 'congresso', re: /\b(congresso|convenção|convencao|seminário|seminario|workshop)\b/i },
  { tipo: 'esportivo', re: /\b(jogo|campeonato|corrida|maratona|copa|torneio|evento esportivo)\b/i },
  { tipo: 'feriado', re: /\b(feriado|ponto facultativo|feriadão|feriadao)\b/i },
  { tipo: 'cultural', re: /\b(festa|celebração|celebracao|aniversário (?:da )?cidade|evento cultural|caravana|parada)\b/i },
  { tipo: 'ferias_escolares', re: /\bf[eé]rias escolares\b/i },
  { tipo: 'obra', re: /\b(obras?|intervenção|intervencao|interdição|interdicão|interdicao|fechamento de via|bloqueio)\b/i },
];
const ALTA_CIRCULACAO = /\b(grande porte|milhares de pessoas|público esperado|publico esperado|multidão|multidao|nacional|internacional|mega)\b/i;
const TIPO_CIRCULACAO_ALTA = new Set(['show', 'feira', 'congresso', 'esportivo']);

/** Extrai eventos estruturados das fontes — nunca inventa campos. */
function extrairEventos(fontes, contexto, horizonteDias, agoraTs) {
  const agora = new Date(agoraTs || Date.now());
  const eventos = [];
  const vistos = new Set();
  for (const f of fontes || []) {
    const texto = `${f.titulo || ''} ${f.resumo || ''}`;
    const t = texto.toLowerCase();
    const ehEvento = TIPOS_EVENTO.some((tp) => tp.re.test(t));
    if (!ehEvento) continue;
    const dataISO = extrairDataEvento(texto, agora);
    const tituloLimpo = String(f.titulo || '').slice(0, 90);
    const chave = (tituloLimpo.toLowerCase().slice(0, 50)) + '|' + (dataISO || '');
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    const tipoHit = TIPOS_EVENTO.find((tp) => tp.re.test(t));
    let diasAte = null;
    if (dataISO) {
      diasAte = Math.round((new Date(dataISO).getTime() - agora.getTime()) / 86400000);
      if (diasAte < -2 || diasAte > horizonteDias) continue; // fora da janela da análise
    }

    /* -------- §5 SEPARAÇÃO RÍGIDA: EVENTO ≠ IMPACTO --------
       Classificação conservadora: só atribui direção positiva/negativa
       quando há evidência textual explícita; caso contrário INDETERMINADO. */
    let impacto = 'INDETERMINADO';
    let direcao = 'indeterminado';
    let justificativa = 'Existe um evento próximo ao estabelecimento, com potencial de alterar a circulação de pessoas. Entretanto, não existem dados suficientes para afirmar que isso aumentará ou diminuirá diretamente os atendimentos.';
    const forte = ALTA_CIRCULACAO.test(texto);
    const circAlta = TIPO_CIRCULACAO_ALTA.has(tipoHit.tipo);
    const perto = diasAte != null && diasAte >= 0 && diasAte <= 14;
    if ((tipoHit.tipo === 'obra')) {
      impacto = 'NEGATIVO'; direcao = 'negativo';
      justificativa = 'Há registro de obra/intervenção urbana na região, o que pode reduzir o tráfego de passagem. Sem histórico local parecido registrado neste sistema, o tamanho real do efeito é incerto.';
    } else if (circAlta && perto && forte) {
      impacto = 'POSITIVO'; direcao = 'positivo';
      justificativa = `Evento de grande circulação (${tipoHit.tipo}) a ${diasAte} dia(s), descrito em fonte pública como de grande porte. Pode aumentar o fluxo de pessoas na região — mas não há dado suficiente para afirmar aumento direto de atendimentos.`;
    } else if (tipoHit.tipo === 'feriado' && perto) {
      impacto = 'INDETERMINADO';
      justificativa = 'Feriado próximo: em alguns negócios aumenta o movimento, em outros zera (clientes viajam). O sistema ainda não tem histórico suficiente de feriados anteriores para decidir a direção.';
    }
    // Público esperado/duração: SÓ quando explicitamente citados no texto
    const pubMatch = texto.match(/(?:público esperado|publico esperado|expectativa de)\s*:?\s*([\w .,]*?\d[\d.,]*\s*(?:mil|pessoas|públicos|publicos)?)/i);
    const duracaoMatch = texto.match(/(?:até|até dia|duração|duracao|segue|ocorre)\s+(?:\w+\s+){0,3}?(\d{1,2}\s*(?:de\s+\w+|\d{1,2}\/\d{1,2}))\b/i);

    eventos.push({
      nome: tituloLimpo,
      dataISO: dataISO,
      dataBruta: dataISO ? new Date(dataISO).toLocaleDateString('pt-BR') : null,
      diasAte: diasAte,
      local: null, // só preenchido se endereço explícito aparecer no resumo
      cidade: (contexto.cidade && t.includes(String(contexto.cidade).toLowerCase())) ? contexto.cidade : (contexto.cidade || null),
      publicoEsperado: pubMatch ? pubMatch[1].trim().slice(0, 40) : null,
      duracao: duracaoMatch ? duracaoMatch[1].slice(0, 40) : null,
      tipo: tipoHit.tipo,
      url: f.url || '',
      fonteNome: f.nomeFonte || null,
      impacto, direcao, justificativa,
      confianca: f.prioridade === 1 ? 'alta' : f.prioridade === 2 ? 'média' : 'baixa',
    });
    if (eventos.length >= 12) break;
  }
  eventos.sort((a, b) => (a.diasAte == null ? 9999 : a.diasAte) - (b.diasAte == null ? 9999 : b.diasAte));
  return eventos;
}

/* ======================= ESTRUTURAÇÃO DE FONTES (§3) ===================== */
function estruturarFontes(resultadosPorConsulta, agoraTs) {
  const agoraISO = new Date(agoraTs || Date.now()).toISOString();
  const saida = [];
  const vistos = new Set();
  for (const grupo of resultadosPorConsulta || []) {
    for (const r of grupo.resultados || []) {
      if (!r.url && !r.titulo) continue;
      const chave = (r.url || r.titulo).split('#')[0];
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const cf = classificarFonte(r.url);
      // Data de publicação: apenas quando EXPLICITAMENTE extraível
      let publicadoEm = null;
      const txt = `${r.titulo || ''} ${r.trecho || ''}`;
      const ha = txt.match(/h[aá]\s+(\d+)\s+(hora|dia|semana|m[eé]s)/i);
      if (ha) {
        const mult = { hora: 3600000, dia: 86400000, semana: 604800000, mes: 2592000000 }[ha[2].toLowerCase()] || 0;
        publicadoEm = new Date((agoraTs || Date.now()) - Number(ha[1]) * mult).toISOString();
      } else {
        const dm = txt.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
        if (dm) publicadoEm = new Date(Date.UTC(+dm[3], +dm[2] - 1, +dm[1], 12)).toISOString();
      }
      saida.push({
        consultaCategoria: grupo.categoria || null,
        titulo: String(r.titulo || '').slice(0, 160),
        url: r.url || '',
        nomeFonte: cf.nomeFonte,
        prioridade: cf.prioridade,
        publicadoEm,
        dataConsulta: agoraISO,
        resumo: String(r.trecho || '').slice(0, 400),
        relevancia: grupo.peso === 'alta' ? 'alta' : grupo.peso === 'media' ? 'média' : 'baixa',
        nivelConfianca: cf.prioridade === 1 ? 'alta' : cf.prioridade === 2 ? 'média' : 'baixa',
        impactoEstimado: 'INDETERMINADO', // impacto é julgado por-evento, não por-fonte
      });
    }
  }
  // Prioridade 1 primeiro, depois relevância da consulta
  saida.sort((a, b) => a.prioridade - b.prioridade || (a.relevancia === 'alta' ? -1 : 1));
  return saida.slice(0, 60);
}

/* ========================== CLIMA REAL (§6) =============================== */
/** Open-Meteo (gratuito, sem chave): geocodificação + previsão 7 dias.
 *  Retorna null se indisponível — nada é inventado. */
async function climaLocal(cidade, estado) {
  if (!cidade) return null;
  try {
    const gurl = 'https://geocoding-api.open-meteo.com/v1/search?count=1&language=pt&format=json' +
      '&name=' + encodeURIComponent(cidade) +
      (estado ? '&countryCode=BR' : '');
    const gr = await fetch(gurl, { signal: AbortSignal.timeout(9000) }).then((r) => r.json());
    const g = gr && gr.results && gr.results[0];
    if (!g) return null;
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + g.latitude + '&longitude=' + g.longitude +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=7&timezone=auto';
    const fr = await fetch(url, { signal: AbortSignal.timeout(9000) }).then((r) => r.json());
    if (!fr || !fr.daily) return null;
    const dias = fr.daily.time.map((d, i) => ({
      data: d,
      tMax: fr.daily.temperature_2m_max[i],
      tMin: fr.daily.temperature_2m_min[i],
      chuvaMm: fr.daily.precipitation_sum[i],
    }));
    const chuvaTotal = dias.reduce((a, d) => a + (Number(d.chuvaMm) || 0), 0);
    return {
      ok: true,
      cidadeEncontrada: g.name,
      fonte: 'open-meteo.com',
      dias,
      leitura: chuvaTotal >= 40 ? 'semana de muita chuva prevista'
        : chuvaTotal >= 20 ? 'chuva moderada prevista'
        : 'semana de tempo estável previsto',
      chuvaTotalMm: Math.round(chuvaTotal * 10) / 10,
    };
  } catch (e) { return null; }
}

/* ==================== SAZONALIDADE DE PAGAMENTO (§6) ====================== */
/** Inferência declarada: início do mês (salário recém-caído) tende levemente
 *  acima; véspera do pagamento tende levemente abaixo. É um ajuste pequeno e
 *  explicado — nunca disfarçado de dado medido. */
function sazonalidadePagamento(dataRef) {
  const d = dataRef instanceof Date ? dataRef : new Date(dataRef);
  const dia = d.getDate();
  if (dia <= 10) return { fator: 1.03, rotulo: 'início do mês — salários recentes (inferência)' };
  if (dia >= 25) return { fator: 0.97, rotulo: 'fim do mês — aguardando pagamento (inferência)' };
  return { fator: 1.0, rotulo: 'meio do mês — neutro (inferência)' };
}

/* ============================== ORQUESTRAÇÃO ============================== */
const CACHE_TTL_MS = Number(process.env.NEITZEL_CENARIO_CACHE_MS) || 30 * 60 * 1000;
const cache = new Map(); // chave -> { ts, val }

function chaveCache(p) {
  return JSON.stringify([p.pais, p.estado, p.cidade, p.segmento, p.periodoSemanas]);
}

/** Executa TODAS as consultas num ÚNICO lote de abas independentes (rápido):
 *  - provedores com chave: concorrência 4 direto na API;
 *  - modo livre: um único comAbasIndependentes(max=6) no Chrome;
 *  - ONDAS COM SAÍDA ANTECIPADA: consultas ordenadas por peso; após cada
 *    onda, se as categorias essenciais (eventos/feriados/economia) já têm
 *    cobertura e há fontes suficientes, o restante (peso baixa) é PULADO. */
const FONTES_SUFICIENTES = 40;
async function executarLote(consultas) {
  const resultadosPorConsulta = [];
  let falhas = 0;
  let puladas = 0;
  const essenciais = ['eventos', 'feriados', 'economia'];
  const catOk = new Set();
  const contaFontes = () => resultadosPorConsulta.reduce((s, g) => s + g.resultados.length, 0);

  const provedor = busca.nomeProvedor();
  const usaChrome = provedor === 'livre';
  const chromeMod = usaChrome ? (() => { try { return require('./chrome'); } catch (e) { return null; } })() : null;

  // Peso alta primeiro: a 1ª onda já costuma cobrir tudo que importa
  const ordem = { alta: 0, media: 1, baixa: 2 };
  const pendentes = consultas.slice().sort((a, b) => (ordem[a.peso] ?? 3) - (ordem[b.peso] ?? 3));

  async function rodarOnda(lote) {
    if (!lote.length) return;
    if (usaChrome && chromeMod && chromeMod.disponivel()) {
      const resp = await chromeMod.comAbasIndependentes(
        lote,
        (aba, item) => chromeMod.buscarResultadosNaAba(aba, item.consulta, 8),
        6 // 6 abas simultâneas
      );
      for (let i = 0; i < lote.length; i++) {
        const r = resp[i];
        if (r && r.ok && Array.isArray(r.valor) && r.valor.length) {
          resultadosPorConsulta.push({ categoria: lote[i].categoria, peso: lote[i].peso, consulta: lote[i].consulta, resultados: r.valor.map((x) => ({ url: x.url, titulo: x.titulo, trecho: x.trecho })) });
          catOk.add(lote[i].categoria);
        } else falhas++;
      }
    } else {
      const fila = lote.slice();
      await Promise.all(Array.from({ length: Math.min(4, fila.length) }, async () => {
        while (fila.length) {
          const item = fila.shift();
          const r = await busca.pesquisar(item.consulta, 8);
          if (r.ok && r.resultados.length) {
            resultadosPorConsulta.push({ categoria: item.categoria, peso: item.peso, consulta: item.consulta, resultados: r.resultados });
            catOk.add(item.categoria);
          } else falhas++;
        }
      }));
    }
  }

  while (pendentes.length) {
    const lote = pendentes.splice(0, 6);
    await rodarOnda(lote);
    const coberturaEssencial = essenciais.every((c) => catOk.has(c));
    if (coberturaEssencial && contaFontes() >= FONTES_SUFICIENTES && pendentes.length) {
      puladas = pendentes.length;
      break; // já temos material suficiente — não gastamos tempo com peso baixa
    }
  }
  void essenciais;
  return { resultadosPorConsulta, falhas, puladas };
}

/** Coleta TUDO que é externo. Nunca lança para cima: devolve avisos. */
async function coletarExterno(params, opts) {
  const force = !!(opts && opts.force);
  const p = {
    pais: String(params.pais || 'Brasil').slice(0, 40),
    estado: String(params.estado || '').slice(0, 2).toUpperCase(),
    cidade: String(params.cidade || '').slice(0, 60),
    segmento: String(params.segmento || '').slice(0, 40),
    periodoSemanas: Math.min(Math.max(Number(params.periodoSemanas) || 8, 1), 8),
  };
  const chave = chaveCache(p);
  if (!force) {
    const hit = cache.get(chave);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return Object.assign({ doCache: true, cacheTs: hit.ts }, hit.val);
  }

  const { consultas, horizonteSemanas } = gerarConsultas(p);
  const avisos = [];

  const t0 = Date.now();
  const { resultadosPorConsulta, falhas, puladas } = await executarLote(consultas);
  const duracaoMs = Date.now() - t0;
  const provedorUsado = busca.nomeProvedor();

  const fontes = estruturarFontes(resultadosPorConsulta, Date.now());
  const eventos = fontes.length ? extrairEventos(fontes, p, horizonteSemanas * 7, Date.now()) : [];

  if (!fontes.length) avisos.push('Nenhuma fonte externa respondeu às consultas.');
  if (falhas > 0 && fontes.length) avisos.push(`${falhas} de ${consultas.length} consultas não retornaram resultado (falha ou resposta vazia do motor de busca).`);
  if (puladas > 0) avisos.push(`${puladas} consulta(s) complementar(es) dispensada(s): a coleta já tinha cobertura suficiente.`);

  const val = {
    ok: fontes.length > 0,
    code: fontes.length ? undefined : 'SEM_FONTES',
    provedor: provedorUsado,
    coletadoEm: new Date().toISOString(),
    parametros: p,
    horizonteSemanas,
    consultasExecutadas: consultas.length - puladas,
    consultasPuladas: puladas,
    consultasBemSucedidas: consultas.length - puladas - falhas,
    duracaoMs,
    fontes, eventos, avisos,
  };
  cache.set(chave, { ts: Date.now(), val });
  return val;
}

module.exports = {
  gerarConsultas, classificarFonte, extrairDataEvento, extrairEventos,
  estruturarFontes, climaLocal, sazonalidadePagamento, coletarExterno,
};
