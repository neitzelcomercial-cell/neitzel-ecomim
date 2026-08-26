/* ============================================================================
 * NEITZEL — CAMADA DE BUSCA EXTERNA (SearchProvider abstrato)
 * Requisito da especificação do módulo de cenário:
 *  - Chaves de API NUNCA no frontend (só variáveis de ambiente no servidor).
 *  - Provedor configurável/trocável SEM refatorar o módulo de análise.
 *  - Nada inventado: só entra resultado que o provedor realmente devolveu.
 *
 * Provedores suportados (defina NEITZEL_SEARCH_PROVIDER ou deixe 'auto'):
 *   tavily  — TAVILY_API_KEY      (API de busca com conteúdo limpo)
 *   serpapi — SERPAPI_KEY         (Google SerpAPI)
 *   bing    — BING_API_KEY        (Azure Bing Web Search v7)
 *   livre   — padrão sem chave: Chrome headless (Google/DDG/Bing/Mojeek)
 *             com fallback para APIs abertas (DuckDuckGo IA + Wikipédia PT).
 * ========================================================================== */
'use strict';

const chromeMod = (() => { try { return require('./chrome'); } catch (e) { return null; } })();

const TIMEOUT_MS = Number(process.env.NEITZEL_SEARCH_TIMEOUT_MS) || 25000;

function provedorConfigurado() {
  const explicito = String(process.env.NEITZEL_SEARCH_PROVIDER || '').toLowerCase().trim();
  if (explicito && explicito !== 'auto') return explicito;
  if (process.env.TAVILY_API_KEY) return 'tavily';
  if (process.env.SERPAPI_KEY) return 'serpapi';
  if (process.env.BING_API_KEY) return 'bing';
  return 'livre';
}

function nomeProvedor() {
  return provedorConfigurado();
}

/** Normaliza o resultado ao formato canônico do módulo de cenário. */
function padronizar(url, titulo, trecho) {
  return {
    url: String(url || ''),
    titulo: String(titulo || '').replace(/<[^>]*>/g, '').trim().slice(0, 160),
    trecho: String(trecho || '').replace(/<[^>]*>/g, '').trim().slice(0, 400),
  };
}

/* ----------------------------- Tavily ----------------------------------- */
async function viaTavily(consulta, qtd) {
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query: consulta,
      search_depth: 'basic',
      max_results: Math.min(qtd || 8, 20),
      include_answer: false,
    }),
  });
  if (!r.ok) throw new Error('tavily_http_' + r.status);
  const data = await r.json();
  const resultados = (data.results || []).map((x) => padronizar(x.url, x.title, x.content));
  if (!resultados.length) throw new Error('tavily_vazio');
  return resultados;
}

/* ----------------------------- SerpAPI ---------------------------------- */
async function viaSerpApi(consulta, qtd) {
  const u = 'https://serpapi.com/search.json?engine=google&hl=pt-BR&gl=br&num=' +
    Math.min(qtd || 10, 20) + '&q=' + encodeURIComponent(consulta) +
    '&api_key=' + encodeURIComponent(process.env.SERPAPI_KEY);
  const r = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error('serpapi_http_' + r.status);
  const data = await r.json();
  const resultados = (data.organic_results || [])
    .map((x) => padronizar(x.link, x.title, (x.snippet || '') + ''))
    .filter((x) => x.url);
  if (!resultados.length) throw new Error('serpapi_vazio');
  return resultados;
}

/* ------------------------- Bing Web Search v7 ---------------------------- */
async function viaBing(consulta, qtd) {
  const r = await fetch('https://api.bing.microsoft.com/v7.0/search?count=' +
    Math.min(qtd || 10, 20) + '&responseFilter=WebPages&q=' + encodeURIComponent(consulta), {
    headers: { 'Ocp-Apim-Subscription-Key': process.env.BING_API_KEY },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error('bing_http_' + r.status);
  const data = await r.json();
  const resultados = ((data.webPages || {}).value || [])
    .map((x) => padronizar(x.url, x.name, x.snippet));
  if (!resultados.length) throw new Error('bing_vazio');
  return resultados;
}

/* -------------------- Provedor "livre" (sem chave) ----------------------- */
/** Busca por API aberta (sem navegador): DDG Instant Answers + Wikipédia PT.
 *  É o MESMO serviço usado pelo botão de IA (/api/ia/search) — reutilizado
 *  aqui como rede de segurança quando não há Chrome nem chaves. */
async function buscarWebAberta(q) {
  const fontes = [];
  let texto = '';
  const ddg = fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(q) + '&format=json&no_html=1&skip_disambig=1', { signal: AbortSignal.timeout(9000) }).then((r) => r.json()).catch(() => null);
  const wikiBusca = fetch('https://pt.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&origin=*&srsearch=' + encodeURIComponent(q), { signal: AbortSignal.timeout(9000) }).then((r) => r.json()).catch(() => null);
  const [d, w] = await Promise.all([ddg, wikiBusca]);
  if (d) {
    if (d.AbstractText) texto += d.AbstractText + '\n';
    (d.RelatedTopics || []).slice(0, 3).forEach((tp) => { if (tp.Text && tp.FirstURL) fontes.push(padronizar(tp.FirstURL, tp.Text.slice(0, 90), tp.Text)); });
  }
  const titulo = w && w.query && w.query.search && w.query.search[0] && w.query.search[0].title;
  if (titulo) {
    const s = await fetch('https://pt.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(titulo), { signal: AbortSignal.timeout(9000) }).then((r) => r.json()).catch(() => null);
    if (s && s.extract) texto += s.extract + '\n';
    if (s && s.content_urls) fontes.push(padronizar(s.content_urls.desktop.page, s.titles ? (s.titles.normalized || titulo) : titulo, (s.extract || '').slice(0, 300)));
  }
  return { ok: !!(texto.trim() || fontes.length), texto: texto.trim(), resultados: fontes };
}

async function viaLivre(consulta, qtd) {
  // 1º: Chrome headless com corrente de motores reais (o mais completo)
  if (chromeMod && chromeMod.disponivel()) {
    try {
      const resp = await chromeMod.comAbasIndependentes(
        [{ consulta }],
        (aba) => chromeMod.buscarResultadosNaAba(aba, consulta, Math.min(Math.max(qtd || 8, 5), 12)),
        1
      );
      const r = resp && resp[0];
      if (r && r.ok && Array.isArray(r.valor) && r.valor.length) {
        return r.valor.map((x) => padronizar(x.url, x.titulo, x.trecho));
      }
    } catch (e) { /* cai para APIs abertas */ }
  }
  // 2º: APIs abertas
  const aberta = await buscarWebAberta(consulta);
  if (aberta.ok && aberta.resultados.length) return aberta.resultados.slice(0, qtd || 8);
  if (aberta.ok && aberta.texto) {
    // Wikipedia às vezes só traz texto: entra como referência textual citável
    return [padronizar('', 'Resumo enciclopédico — ' + consulta.slice(0, 80), aberta.texto)];
  }
  throw new Error('livre_sem_resultados');
}

/**
 * Interface única do SearchProvider.
 * @returns {Promise<{ok:boolean, provedor:string, resultados:Array, erro?:string}>}
 */
async function pesquisar(consulta, qtd) {
  const provedor = provedorConfigurado();
  try {
    let resultados;
    if (provedor === 'tavily') resultados = await viaTavily(consulta, qtd);
    else if (provedor === 'serpapi') resultados = await viaSerpApi(consulta, qtd);
    else if (provedor === 'bing') resultados = await viaBing(consulta, qtd);
    else resultados = await viaLivre(consulta, qtd);
    return { ok: true, provedor, resultados };
  } catch (e) {
    return { ok: false, provedor, resultados: [], erro: String((e && e.message) || e) };
  }
}

module.exports = { pesquisar, nomeProvedor, buscarWebAberta };
