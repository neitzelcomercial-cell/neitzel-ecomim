/* NEITZEL — Leitor Chrome real.
 * Controla o Chrome/Edge instalado na máquina (headless) para:
 *  - buscar estabelecimentos NO GOOGLE MAPS de verdade e extrair
 *    nome, telefone, site, endereço e nota do cartão renderizado;
 *  - ler qualquer página com renderização completa (JS incluído),
 *    muito mais fiel que um simples download de HTML.
 * Nada é inventado: só entra o que o Chrome realmente mostrou.
 */
'use strict';

let navegador = null;
let iniciando = null;

const CANDIDATOS = [
  process.env.NEITZEL_CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env['ProgramFiles(x86)'] ? process.env['ProgramFiles(x86)'] + '\\Google\\Chrome\\Application\\chrome.exe' : null,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function acharExecutavel() {
  const fs = require('fs');
  for (const c of CANDIDATOS) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  return null;
}

async function obterNavegador() {
  if (navegador && navegador.connected) return navegador;
  if (iniciando) return iniciando;
  iniciando = (async () => {
    const exe = acharExecutavel();
    if (!exe) throw new Error('CHROME_NAO_ENCONTRADO');
    const puppeteer = require('puppeteer-core');
    navegador = await puppeteer.launch({
      executablePath: exe,
      headless: 'new',
      args: [
        '--no-first-run', '--no-default-browser-check', '--disable-crash-reporter',
        '--disable-features=Translate,InfinitePrefetch', '--lang=pt-BR',
        '--window-size=1366,900', '--hide-scrollbars', '--mute-audio',
      ],
    });
    navegador.on('disconnected', () => { navegador = null; });
    return navegador;
  })();
  try { return await iniciando; } finally { iniciando = null; }
}

/** Fecha após 3 min sem uso (chamado por cada operação). */
function agendarDescanso() {
  if (agendarDescanso._t) clearTimeout(agendarDescanso._t);
  const t = setTimeout(() => {
    try { if (navegador) { navegador.close().catch(() => {}); navegador = null; } } catch (e) {}
  }, 180000);
  try { if (typeof t.unref === 'function') t.unref(); } catch (e) {}
  agendarDescanso._t = t;
}

/* ------------------------------------------------------------------ *
 * GOOGLE MAPS REAL
 * ------------------------------------------------------------------ */

/**
 * Busca estabelecimentos no Google Maps renderizado pelo Chrome.
 * Retorna leads com nome, telefone, site, endereço e nota — quando o
 * cartão do Maps mostra esses dados (é exatamente o que aparece na tela).
 */
async function buscarNoMaps(termo, cidade, uf, limite) {
  limite = Math.min(Math.max(Number(limite) || 20, 5), 40);
  const browser = await obterNavegador();
  const pagina = await browser.newPage();
  try {
    await pagina.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36');
    await pagina.setViewport({ width: 1366, height: 900 });
    const consulta = [termo, cidade, uf].filter(Boolean).join(' ');
    await pagina.goto('https://www.google.com/maps/search/' + encodeURIComponent(consulta) + '?hl=pt-BR', {
      waitUntil: 'domcontentloaded', timeout: 45000,
    });
    // consentimento eventual
    try {
      await pagina.waitForSelector('button[aria-label*="Aceitar"], button[aria-label*="aceitar"], form[action*="consent"] button', { timeout: 3500 });
      const botoes = await pagina.$$('button');
      for (const b of botoes) {
        const t = (await b.evaluate((el) => el.getAttribute('aria-label') || el.textContent || '')).toLowerCase();
        if (t.includes('aceitar') || t.includes('accept all')) { await b.click(); break; }
      }
      await pausa(1200);
    } catch (e) {}

    // espera o feed de resultados
    try { await pagina.waitForSelector('div[role="feed"]', { timeout: 15000 }); } catch (e) {}
    // rola o feed para carregar mais cartões
    for (let i = 0; i < 5; i++) {
      const mais = await pagina.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]');
        if (!feed) return false;
        feed.scrollBy(0, 2200);
        return !feed.querySelector('.pFontB'); // sentinel some quando acaba
      });
      await pausa(1100);
      if (!mais) break;
    }

    const leads = await pagina.evaluate((lim) => {
      const esc2 = (s) => String(s == null ? '' : s);
      const limparTel = (v) => {
        // aria-label vem como "Telefone: (47) 3032-8888"
        const m = esc2(v).match(/([\d()\-\s+]{8,})$/);
        return m ? m[1].trim() : '';
      };
      const cartoes = Array.from(document.querySelectorAll('div[role="feed"] a.hfpxzc'));
      const fora = [];
      cartoes.slice(0, lim).forEach((a) => {
        const nome = a.getAttribute('aria-label') || '';
        const link = a.href || '';
        const card = a.closest('div[jsaction]') || a.parentElement;
        let fone = '', site = '', endereco = '', nota = '';
        if (card) {
          const telBtn = card.querySelector('button[data-item-id^="phone"]');
          if (telBtn) fone = limparTel(telBtn.getAttribute('aria-label'));
          const siteA = card.querySelector('a[data-item-id="authority"]');
          if (siteA) site = siteA.href;
          const addrBtn = card.querySelector('button[data-item-id^="address"]');
          if (addrBtn) endereco = esc2(addrBtn.getAttribute('aria-label')).replace(/^Endereço:\s*/i, '');
          const estrelas = card.querySelector('span[role="img"]');
          if (estrelas) nota = esc2(estrelas.getAttribute('aria-label')).slice(0, 30);
        }
        fora.push({ nome: esc2(nome), link, fone, site, endereco, nota });
      });
      return fora;
    }, limite);

    return leads.map((l) => ({
      sintetico: false,
      lead_type: 'company',
      name: l.nome || null,
      company: l.nome || null,
      profession: termo || null,
      segment: termo || null,
      city: cidade || null,
      state: (uf || '').toUpperCase() || null,
      street: l.endereco || null,
      phone: l.fone || null,
      whats: l.fone || null,
      email: null,
      website: l.site || null,
      instagram: null,
      facebook: null,
      linkedin: null,
      rating: l.nota || null,
      maps_url: l.link || null,
      description: 'Google Maps (lido pelo Chrome)' + (l.nota ? ' · ' + l.nota : '') + (l.endereco ? ' · ' + l.endereco : ''),
      source: { type: 'maps_chrome', url: l.link, found_at: new Date().toISOString(), data: {} },
    })).filter((l) => l.name);
  } finally {
    try { await pagina.close(); } catch (e) {}
    agendarDescanso();
  }
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ *
 * ABAS INDEPENDENTES EM PARALELO
 * ------------------------------------------------------------------ */

/**
 * Roda `fn(pagina, item, indice)` para cada item — cada um numa ABA
 * independente do mesmo Chrome, até `max` abas simultâneas.
 * Retorna resultados na ordem dos itens ({ ok, valor } ou { ok:false, erro }).
 */
async function comAbasIndependentes(itens, fn, max) {
  const lista = Array.isArray(itens) ? itens : [];
  if (!lista.length) return [];
  const browser = await obterNavegador();
  const simultaneas = Math.min(Math.max(Number(max) || 4, 1), 6, lista.length);
  const resultados = new Array(lista.length);
  let proximo = 0;

  async function novaAbaConfigurada() {
    const p = await browser.newPage();
    try {
      await p.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36');
      await p.setViewport({ width: 1366, height: 900 });
      // bloqueia recursos pesados que não ajudam na leitura de contatos
      await p.setRequestInterception(true);
      p.on('request', (req) => {
        const t = req.resourceType();
        if (t === 'image' || t === 'media' || t === 'font') req.abort().catch(() => {});
        else req.continue().catch(() => {});
      });
    } catch (e) { /* segue sem interceptação */ }
    return p;
  }

  async function trabalhador() {
    let pagina = await novaAbaConfigurada();
    while (true) {
      const meu = proximo++;
      if (meu >= lista.length) break;
      try {
        const valor = await fn(pagina, lista[meu], meu);
        resultados[meu] = { ok: true, valor };
      } catch (e) {
        resultados[meu] = { ok: false, erro: String((e && e.message) || e) };
        // aba pode ter ficado em estado ruim: troca por uma nova
        try { await pagina.close(); } catch (e2) {}
        pagina = await novaAbaConfigurada();
      }
    }
    try { await pagina.close(); } catch (e) {}
  }

  await Promise.all(Array.from({ length: simultaneas }, () => trabalhador()));
  agendarDescanso();
  return resultados;
}

/**
 * Busca resultados REAIS numa aba: tenta o Google; se aparecer consentimento/
 * captcha, cai automaticamente para o DuckDuckGo HTML na mesma aba.
 * Retorna [{ url, titulo, trecho }].
 */
async function buscarResultadosNaAba(pagina, consulta, qtd) {
  const alvo = Math.min(Math.max(Number(qtd) || 12, 5), 25);

  async function extrairLista() {
    return pagina.evaluate((lim) => {
      const dec = (s) => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
      // Decodifica wrappers de buscadores para a URL REAL de destino
      function alvoReal(href) {
        try {
          const u = new URL(href, location.origin);
          const host = u.hostname.replace(/^www\./, '');
          // DuckDuckGo: /l/?uddg=<codificado>
          if (/duckduckgo\./i.test(host)) {
            const m = (u.search || '').match(/[?&]uddg=([^&]+)/);
            if (m) return decodeURIComponent(m[1]);
            return null;
          }
          // Bing: /ck/a?...&u=a1<base64url>
          if (/bing\.com$/i.test(host) && /^\/ck\/a/i.test(u.pathname)) {
            const m = (u.search || '').match(/[?&]u=a1([^&]+)/);
            if (m) {
              let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
              while (b64.length % 4) b64 += '=';
              const dec2 = atob(b64);
              return /^[a-z]+:\/\//i.test(dec2) ? dec2 : null;
            }
            return null;
          }
          return href;
        } catch (e) { return null; }
      }
      const achados = [];
      const vistos = new Set();
      document.querySelectorAll('a').forEach((a) => {
        const bruto = a.href || '';
        if (!/^https?:\/\//i.test(bruto)) return;
        const destino = alvoReal(bruto);
        if (!destino) return;
        try {
          const host = new URL(destino).hostname.replace(/^www\./, '');
          if (/^(google|gstatic|duckduckgo|bing|yahoo|microsoft|mojeek|startpage)\./i.test(host)) return;
        } catch (e) { return; }
        let titulo = dec(a.textContent).slice(0, 120);
        // títulos sujos: domínio + url grudados ("petmaxi.com.brhttps://...")
        titulo = titulo.replace(/https?:\/\/\S+/gi, ' ').replace(/\b(?:www\.)?[a-z0-9-]{2,}\.(?:com|net|org|br|io)(?:\.br)?\b(?=[\s|·\-–]*$)/gi, ' ').replace(/\s{2,}/g, ' ').trim();
        if (!titulo || titulo.length < 3) return;
        const chave = destino.split('#')[0];
        if (vistos.has(chave)) return;
        vistos.add(chave);
        const container = a.closest('div');
        const trechoEl = container && (container.querySelector('.VwiC3b, .result__snippet, [data-sncf], span.st, .s, .b_caption p') || container.parentElement?.querySelector('.VwiC3b, .result__snippet, .b_caption p'));
        achados.push({ url: chave, titulo, trecho: trechoEl ? dec(trechoEl.textContent).slice(0, 260) : '' });
      });
      return achados.slice(0, lim);
    }, alvo);
  }

  async function tentar(url, esperaMs) {
    try {
      await pagina.goto(url, { waitUntil: 'domcontentloaded', timeout: 22000 });
      await pausa(esperaMs || 800);
      const lista = await extrairLista();
      if (lista.length >= 3) return lista.filter((r) => !/duckduckgo\.com\/l\b|bing\.com\/ck\b/i.test(r.url));
    } catch (e) {}
    return null;
  }

  // Corrente de motores REAIS na mesma aba (o que funcionar primeiro):
  // Google → DDG HTML → DDG Lite → Mojeek → Bing
  let r = await tentar('https://www.google.com/search?q=' + encodeURIComponent(consulta) + '&num=20&hl=pt-BR');
  if (r) return r;
  r = await tentar('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(consulta), 900);
  if (r) return r;
  r = await tentar('https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(consulta), 900);
  if (r) return r;
  r = await tentar('https://www.mojeek.com/search?q=' + encodeURIComponent(consulta), 700);
  if (r) return r;
  r = await tentar('https://www.bing.com/search?q=' + encodeURIComponent(consulta) + '&setlang=pt-BR', 800);
  if (r) return r;
  return [];
}

/* ------------------------------------------------------------------ *
 * LEITURA COMPLETA DE PÁGINA (com JavaScript renderizado)
 * ------------------------------------------------------------------ */

/** Abre a URL no Chrome e devolve o HTML final renderizado (ou null). */
async function lerRenderizado(url, msAte) {
  const browser = await obterNavegador();
  const pagina = await browser.newPage();
  try {
    await pagina.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36');
    await pagina.goto(url, { waitUntil: 'domcontentloaded', timeout: msAte || 20000 });
    await pausa(900); // deixa scripts assíncronos básicos rodarem
    return await pagina.content();
  } catch (e) {
    return null;
  } finally {
    try { await pagina.close(); } catch (e) {}
    agregarDescanso();
  }
}
function agregarDescanso() { try { agendarDescanso(); } catch (e) {} }

/** Indica se o Chrome está disponível nesta máquina (para fallback honesto). */
function disponivel() { return !!acharExecutavel(); }

async function fechar() {
  try { if (navegador) { await navegador.close(); navegador = null; } } catch (e) {}
}

process.on('exit', () => { try { if (navegador) navegador.close(); } catch (e) {} });

module.exports = { buscarNoMaps, buscarResultadosNaAba, comAbasIndependentes, lerRenderizado, disponivel, fechar };
