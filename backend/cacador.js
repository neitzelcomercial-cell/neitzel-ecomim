/* NEITZEL — Caçador de contatos REAIS (multi-fonte).
 *
 * O SERVIDOR faz a leitura real da web e devolve só o que existe:
 *  - google      → busca aberta (DuckDuckGo HTML, sem chave) + leitura das páginas achadas
 *  - maps        → mapa público OpenStreetMap (Nominatim + Overpass)
 *  - instagram   → perfis públicos reais encontrados na busca (site:instagram.com)
 *  - facebook    → páginas públicas reais (site:facebook.com)
 *  - linkedin    → perfis públicos reais (site:linkedin.com)
 *  - sites       → lê os sites encontrados e extrai telefone/e-mail/WhatsApp do conteúdo
 *  - diretorios  → listagens reais em diretórios públicos (Apontador, GuiaMais, Solutudo…)
 *  - openstreetmap → alias extra do mapa público
 *
 * NADA é inventado: campo indisponível volta null e a interface mostra o relatório.
 */
'use strict';

const chrome = require('./chrome');

const cache = new Map(); // chave -> { ts, val } (15 min)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
// Serviços públicos OSM exigem User-Agent identificável (navegador genérico recebe 406)
const UA_OSM = 'NEITZEL-SistemaLocal/1.0 (sistema pessoal de gestao; busca de dados abertos)';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ *
 * Utilidades de HTML / texto
 * ------------------------------------------------------------------ */

function decHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&#x0?27;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ccedil;/g, 'ç')
    .replace(/\s+/g, ' ')
    .trim();
}

async function baixar(url, ms) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9', 'Accept': 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(ms || 9000),
      redirect: 'follow',
    });
    if (!r.ok) return null;
    const tipo = r.headers.get('content-type') || '';
    if (tipo && !/text\/html|text\/plain|application\/(xhtml|json)/i.test(tipo)) return null;
    const txt = await r.text();
    return txt.slice(0, 900000); // teto de ~0,9 MB por página
  } catch (e) { return null; }
}

/** Telefones BR legíveis dentro de um texto (página ou resumo de busca). */
function extrairFones(texto) {
  const out = [];
  const re = /(\+?\s?55\s?)?\(?\d{2}\)?\s?-?\s?(9\s?\d{4}|\d{4})\s?-?\s?\d{4}/g;
  let m;
  while ((m = re.exec(texto)) !== null) {
    const d = m[0].replace(/\D/g, '');
    if (d.length < 10 || d.length > 13) continue;
    const so55 = d.replace(/^55/, '');
    if (so55.length < 10 || so55.length > 11) continue;
    out.push(m[0].replace(/\s+/g, ' ').trim());
    if (out.length >= 3) break;
  }
  return [...new Set(out)];
}

function extrairEmails(texto) {
  const raw = String(texto || '').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
  return [...new Set(raw.map((e) => e.toLowerCase()))]
    .filter((e) => !/\.(png|jpe?g|gif|webp|css|js)$/i.test(e))
    .slice(0, 2);
}

/** Números de WhatsApp REAIS (links wa.me / api.whatsapp.com). */
function extrairWhats(texto) {
  const out = [];
  const re = /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\d{10,13})/gi;
  let m;
  while ((m = re.exec(texto)) !== null && out.length < 2) out.push(m[1]);
  return [...new Set(out)];
}

const REDE = {
  instagram: /instagram\.com\/([A-Za-z0-9_.]{2,40})/,
  facebook: /facebook\.com\/([A-Za-z0-9.\-_/]{2,60})/,
  linkedin: /linkedin\.com\/in\/([A-Za-z0-9_-]{2,60})/,
};

function primeiraRede(texto, rede) {
  const m = String(texto || '').match(REDE[rede]);
  if (!m) return null;
  return 'https://' + (rede === 'linkedin' ? 'linkedin.com/in/' : rede + '.com/') + m[1];
}

function dominarioDe(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return null; }
}

/* ------------------------------------------------------------------ *
 * Busca aberta (DuckDuckGo HTML — sem chave, resultados reais)
 * ------------------------------------------------------------------ */

/** Resultados de busca via download direto: DDG HTML → Mojeek (reserva). */
async function buscarWebDireto(query, qtd) {
  const parseAnchors = (html) => {
    const out = [];
    const re = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]{3,120}?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null && out.length < (qtd || 12)) {
      const url = m[1];
      try { if (/^(google|gstatic|duckduckgo|bing|yahoo|microsoft|mojeek)\./i.test(new URL(url).hostname)) continue; } catch (e) { continue; }
      const titulo = decHtml(m[2]);
      if (!titulo) continue;
      out.push({ url, titulo, trecho: '' });
    }
    return out;
  };
  let html = await baixar('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), 11000);
  if (html && html.includes('result__a')) {
    // usa o parser dedicado do DDG (com trechos)
    return parsearDdg(html, qtd);
  }
  await pausa(1200);
  html = await baixar('https://www.mojeek.com/search?q=' + encodeURIComponent(query), 11000);
  if (html) return parseAnchors(html);
  return [];
}

function parsearDdg(html, qtd) {
  const resultados = [];
  const reA = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = reA.exec(html)) !== null) {
    let href = m[1];
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) { try { href = decodeURIComponent(uddg[1]); } catch (e) {} }
    if (href.startsWith('//')) href = 'https:' + href;
    resultados.push({ url: href, titulo: decHtml(m[2]), trecho: '' });
    if (resultados.length >= (qtd || 12)) break;
  }
  const reS = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let i = 0;
  while ((m = reS.exec(html)) !== null) {
    if (resultados[i]) resultados[i].trecho = decHtml(m[1]);
    i++;
  }
  return resultados;
}

async function buscarWeb(query, qtd) {
  const direto = await buscarWebDireto(query, qtd);
  if (direto.length) return direto;
  return [];
}

const nomeDeTitulo = (t) => String(t || '').split(/\s+[-–|]\s+/)[0].slice(0, 70) || null;

/** Lê uma página (home ou /contato) e junta os contatos que existem nela.
 * Tenta download direto; se o site bloquear, abre NO CHROME renderizado. */
async function lerContatosDeSite(urlBase) {
  const alvos = [urlBase];
  const u = urlBase.replace(/\/+$/, '');
  alvos.push(u + '/contato', u + '/fale-conosco');
  const textoTotal = [];
  let whats = null;
  for (const alvo of alvos.slice(0, 3)) {
    let html = await baixar(alvo, 8500);
    if (!html && chrome.disponivel()) html = await chrome.lerRenderizado(alvo, 18000);
    if (!html) continue;
    textoTotal.push(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' '));
    const w = extrairWhats(html);
    if (!whats && w.length) whats = w[0];
    await pausa(250);
  }
  const texto = textoTotal.join(' ');
  const fones = extrairFones(texto);
  const emails = extrairEmails(texto);
  return {
    fones,
    emails,
    whats,
    instagram: primeiraRede(texto, 'instagram'),
    facebook: primeiraRede(texto, 'facebook'),
    linkedin: primeiraRede(texto, 'linkedin'),
  };
}


/* ------------------------------------------------------------------ *
 * Mapa público (OpenStreetMap) — igual à versão anterior
 * ------------------------------------------------------------------ */

async function geocodificar(cidade, uf) {
  const q = [cidade, uf, 'Brasil'].filter(Boolean).join(', ');
  const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=' + encodeURIComponent(q), {
    headers: { 'User-Agent': UA_OSM, 'Accept-Language': 'pt-BR' },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error('GEO_FALHOU');
  const j = await r.json();
  if (!Array.isArray(j) || !j.length) return null;
  const bb = j[0].boundingbox;
  return { sul: Number(bb[0]), norte: Number(bb[1]), oeste: Number(bb[2]), leste: Number(bb[3]), local: j[0].display_name };
}

async function buscarOverpass(bbox, termo) {
  const t = String(termo || '').replace(/["\\]/g, '').trim();
  const b = `${bbox.sul},${bbox.oeste},${bbox.norte},${bbox.leste}`;
  const filtroNome = t ? `["name"~"${t}",i]` : '';
  const filtroTag = t ? `~"^(craft|shop|amenity|healthcare|office|leisure)$"~"${t}",i` : null;
  const partes = [];
  ['phone', 'contact:phone', 'website', 'contact:website', 'email'].forEach((k) => partes.push(`nwr${filtroNome}["${k}"](${b});`));
  if (filtroTag) partes.push(`nwr[${filtroTag}](${b});`);
  const cq = `[out:json][timeout:40];(\n${partes.join('\n')}\n);out center 90;`;
  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA_OSM },
    body: 'data=' + encodeURIComponent(cq),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error('OVERPASS_FALHOU_' + r.status);
  return r.json();
}

const limpaUrl = (u) => {
  const s = String(u || '').trim();
  return s ? (/^https?:\/\//i.test(s) ? s : 'https://' + s) : null;
};

/* ------------------------------------------------------------------ *
 * Fontes
 * ------------------------------------------------------------------ */

/** Monta o lead-base comum. */
function leadBase(ctx) {
  return {
    sintetico: false,
    lead_type: ctx.tipoPerfil ? 'person' : 'company',
    profession: ctx.termo || null,
    segment: ctx.termo || null,
    city: ctx.cidade || null,
    state: (ctx.uf || '').toUpperCase() || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function fonteFonte(fonteId) { return fonteId; }

/** Mapa: primeiro o GOOGLE MAPS REAL lido pelo Chrome; se indisponível, mapa aberto OSM. */
async function fonteMaps(ctx) {
  if (chrome.disponivel()) {
    try {
      const viaChrome = await chrome.buscarNoMaps(ctx.termo, ctx.cidade, ctx.uf, ctx.limite);
      if (viaChrome && viaChrome.length) return viaChrome;
    } catch (e) { /* cai para a fonte pública abaixo */ }
  }
  return fonteGoogleMapsOSM(ctx);
}

async function fonteGoogleMapsOSM(ctx) {
  const bbox = await geocodificar(ctx.cidade, ctx.uf);
  if (!bbox) throw new Error('CIDADE_NAO_ENCONTRADA');
  const j = await buscarOverpass(bbox, ctx.termo);
  const vistos = new Set();
  const leads = [];
  (j.elements || []).forEach((el) => {
    const t = el.tags || {};
    if (!t.name) return;
    const k = (t.name + '|' + (t['addr:city'] || '')).toLowerCase();
    if (vistos.has(k)) return;
    vistos.add(k);
    const foneRaw = t.phone || t['contact:phone'] || t['contact:mobile'] || '';
    const primeiroFone = String(foneRaw).split(/[;,/]+/)[0].trim() || null;
    const site = limpaUrl(t.website || t['contact:website']);
    const rua = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ') || null;
    const mapsUrl = el.lat != null ? `https://www.google.com/maps?q=${el.lat},${el.lon}` : (el.center ? `https://www.google.com/maps?q=${el.center.lat},${el.center.lon}` : null);
    if (!primeiroFone && !site && !rua && !mapsUrl) return;
    leads.push(Object.assign(leadBase(ctx), {
      name: t.name,
      company: t.name,
      phone: primeiroFone,
      whats: primeiroFone,
      email: t.email || t['contact:email'] || null,
      website: site,
      instagram: t['contact:instagram'] ? ('https://instagram.com/' + String(t['contact:instagram']).replace(/^@/, '').split(/[ ;/]/)[0]) : null,
      facebook: null,
      linkedin: null,
      street: rua,
      maps_url: mapsUrl,
      description: 'Estabelecimento real no mapa público' + (rua ? ' — ' + rua : ''),
      source: { type: 'maps', url: mapsUrl, found_at: new Date().toISOString(), data: {} },
    }));
  });
  return leads;
}

/** Busca aberta genérica em ABAS INDEPENDENTES:
 * várias consultas em paralelo + leitura das páginas em abas paralelas.
 * Sem Chrome disponível, usa o caminho simples de download direto. */
async function fonteBuscaGeral(ctx, opts) {
  const { operadores, lerPaginas } = opts;
  const onde = [ctx.cidade, ctx.uf].filter(Boolean).join(', ');
  const sujeito = [ctx.termo, ctx.empresa].filter(Boolean).join(' ');
  const consultas = [
    [sujeito, onde, '(telefone OR contato OR whatsapp)'].filter(Boolean).join(' '),
    [sujeito, onde].filter(Boolean).join(' '),
    [sujeito, onde, operadores].filter(Boolean).join(' '),
  ];

  let itens = [];
  const porUrl = new Map();
  const somar = (lista) => lista.forEach((r) => {
    if (!porUrl.has(r.url)) porUrl.set(r.url, r);
  });

  if (chrome.disponivel()) {
    // ABAS INDEPENDENTES: uma consulta por aba, ao mesmo tempo
    const respostas = await chrome.comAbasIndependentes(consultas, (aba, consulta) => chrome.buscarResultadosNaAba(aba, consulta, 12), 3);
    respostas.forEach((r) => { if (r.ok && Array.isArray(r.valor)) somar(r.valor); });
  }
  if (!porUrl.size) {
    for (const q of consultas.slice(0, 2)) {
      somar(await buscarWeb(q, 12));
      await pausa(300);
    }
  }
  itens = [...porUrl.values()];
  if (!itens.length) return [];

  // filtra redes sociais (têm fontes próprias) e buscadores
  itens = itens.filter((it) => {
    if (/instagram\.com\/|facebook\.com\/|linkedin\.com\//i.test(it.url)) return false;
    const dom = dominarioDe(it.url);
    return dom && !/duckduckgo|google\.|bing\.|youtube\.|wikipedia/i.test(dom);
  }).slice(0, Math.max(ctx.limite, lerPaginas * 3));

  // LEITURA DAS PÁGINAS EM ABAS PARALELAS (até 4)
  async function contatosDeTexto(textoHtml, it) {
    const texto = String(textoHtml || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ');
    const fones = extrairFones(texto);
    const emails = extrairEmails(texto);
    const whats = extrairWhats(String(textoHtml || ''))[0] || null;
    return {
      fones,
      emails,
      whats,
      instagram: primeiraRede(textoHtml || '', 'instagram'),
      facebook: primeiraRede(textoHtml || '', 'facebook'),
      linkedin: primeiraRede(textoHtml || '', 'linkedin'),
      trecho: decHtml(it.trecho),
    };
  }

  const alvos = itens.slice(0, Math.max(ctx.limite, lerPaginas));
  let contatosPorItem = new Array(alvos.length).fill(null);

  if (chrome.disponivel()) {
    const lidas = await chrome.comAbasIndependentes(alvos, async (aba, it) => {
      const base = it.url.split('/').slice(0, 3).join('/');
      const html = await aba.goto(base, { waitUntil: 'domcontentloaded', timeout: 18000 }).then(() => aba.content());
      await pausa(600);
      return html;
    }, 4);
    for (let i = 0; i < lidas.length; i++) {
      const html = lidas[i].ok ? lidas[i].valor : null;
      if (!html) continue;
      try { contatosPorItem[i] = await contatosDeTexto(html, alvos[i]); } catch (e) {}
    }
  }
  // completa os que faltaram com download direto
  for (let i = 0; i < alvos.length; i++) {
    if (contatosPorItem[i]) continue;
    const extra = await lerContatosDeSite(alvos[i].url.split('/').slice(0, 3).join('/'));
    contatosPorItem[i] = { ...extra, trecho: decHtml(alvos[i].trecho) };
  }

  const leads = [];
  for (let i = 0; i < alvos.length; i++) {
    const it = alvos[i];
    const c = contatosPorItem[i] || {};
    const doTrecho = { fones: extrairFones([it.titulo, it.trecho].join(' ')), emails: extrairEmails(it.trecho), whats: extrairWhats(it.trecho)[0] || null };
    const fones = (c.fones && c.fones.length ? c.fones : doTrecho.fones);
    const emails = (c.emails && c.emails.length ? c.emails : doTrecho.emails);
    const temAlgo = fones.length || emails.length || c.whats || doTrecho.whats || c.instagram || c.facebook || c.linkedin || it.trecho;
    if (!temAlgo) continue;
    const dom = dominarioDe(it.url);
    leads.push(Object.assign(leadBase(ctx), {
      name: nomeDeTitulo(it.titulo) || dom,
      company: nomeDeTitulo(it.titulo) || dom,
      phone: fones[0] || null,
      whats: c.whats || doTrecho.whats || fones[0] || null,
      email: emails[0] || null,
      website: it.url,
      instagram: c.instagram,
      facebook: c.facebook,
      linkedin: c.linkedin,
      description: c.trecho || 'Encontrado na busca pública',
      source: { type: ctx.fonte, url: it.url, found_at: new Date().toISOString(), data: {} },
    }));
    if (leads.length >= ctx.limite) break;
  }
  return leads;
}

/** Perfis públicos reais de uma rede social (busca em aba independente;
 * se a corrente de motores ignorar o operador site:, tenta o caminho direto). */
async function fonteRedeSocial(ctx, rede) {
  const onde = [ctx.cidade, ctx.uf].filter(Boolean).join(', ');
  const sujeito = [ctx.termo, ctx.empresa].filter(Boolean).join(' ');
  const query = [`site:${rede}.com`, sujeito, onde].filter(Boolean).join(' ');

  let itens = [];
  if (chrome.disponivel()) {
    const r = await chrome.comAbasIndependentes([query], (aba, q) => chrome.buscarResultadosNaAba(aba, q, 14), 1);
    if (r[0] && r[0].ok) itens = r[0].valor;
    // motores alternativos podem ignorar site: — refina mantendo só a rede pedida
    itens = itens.filter((it) => REDE[rede].test(it.url));
  }
  if (!itens.length) itens = await buscarWeb(query, 14);
  itens = itens.filter((it) => REDE[rede].test(it.url));

  const leads = [];
  const vistos = new Set();
  for (const it of itens) {
    const alvoUrl = it.url;
    if (!REDE[rede].test(alvoUrl)) continue;
    const link = primeiraRede(alvoUrl, rede) || alvoUrl;
    if (vistos.has(link)) continue;
    vistos.add(link);
    const usuario = (alvoUrl.match(REDE[rede]) || [])[1] || '';
    const nome = nomeDeTitulo(it.titulo) || (usuario ? usuario.replace(/[._-]+/g, ' ') : rede);
    leads.push(Object.assign(leadBase(ctx), {
      name: nome,
      company: rede === 'linkedin' ? (nomeDeTitulo(it.titulo) || null) : nome,
      phone: null,
      whats: null,
      email: null,
      website: link,
      instagram: rede === 'instagram' ? link : primeiraRede(it.trecho, 'instagram'),
      facebook: rede === 'facebook' ? link : null,
      linkedin: rede === 'linkedin' ? link : null,
      description: `Perfil público real encontrado na busca (${rede}). Abra para ver os contatos publicados lá.`,
      source: { type: ctx.fonte, url: link, found_at: new Date().toISOString(), data: {} },
    }));
    if (leads.length >= ctx.limite) break;
  }
  return leads;
}

/** Diretórios públicos conhecidos (consulta composta; se falhar, uma por vez). */
async function fonteDiretorios(ctx) {
  const onde = [ctx.cidade, ctx.uf].filter(Boolean).join(', ');
  const sujeito = [ctx.termo, ctx.empresa].filter(Boolean).join(' ');
  const nomes = ['apontador', 'guiamais', 'solutudo', 'telelistas'];
  let itens = await buscarWeb(`(site:apontador.com.br OR site:guiamais.com.br OR site:solutudo.com.br OR site:telelistas.net) ${sujeito} ${onde}`.trim(), 12);
  if (!itens.length) {
    // motores alternativos ignoram OR — consulta simples por diretório
    for (const d of nomes.slice(0, 2)) {
      const parte = await buscarWeb(`${d} ${sujeito} ${onde}`.trim(), 8);
      itens.push(...parte.filter((it) => it.url.toLowerCase().includes(d)));
      if (itens.length >= 8) break;
      await pausa(400);
    }
  }
  const leads = [];
  for (const it of itens) {
    if (!/apontador|guiamais|solutudo|telelistas/i.test(it.url)) continue;
    const textoLivre = [it.titulo, it.trecho].join(' ');
    const fones = extrairFones(textoLivre);
    const nome = nomeDeTitulo(it.titulo);
    if (!nome) continue;
    leads.push(Object.assign(leadBase(ctx), {
      name: nome,
      company: nome,
      phone: fones[0] || null,
      whats: fones[0] || null,
      email: extrairEmails(it.trecho)[0] || null,
      website: it.url,
      description: 'Listagem real em diretório público.' + (fones.length ? '' : ' Abra a listagem para conferir o telefone.'),
      source: { type: 'diretorios', url: it.url, found_at: new Date().toISOString(), data: {} },
    }));
    if (leads.length >= ctx.limite) break;
  }
  return leads;
}

/* ------------------------------------------------------------------ *
 * Orquestração
 * ------------------------------------------------------------------ */

const FONTES_VALIDAS = ['google', 'maps', 'instagram', 'facebook', 'linkedin', 'sites', 'diretorios', 'openstreetmap'];

async function rodarFonte(fonte, ctx) {
  switch (fonte) {
    case 'google':
      return fonteBuscaGeral(ctx, { operadores: '(telefone OR contato OR whatsapp)', lerPaginas: 3 });
    case 'sites':
      return fonteBuscaGeral(ctx, { operadores: 'site oficial', lerPaginas: 4 });
    case 'diretorios':
      return fonteDiretorios(ctx);
    case 'instagram':
      return fonteRedeSocial(ctx, 'instagram');
    case 'facebook':
      return fonteRedeSocial(ctx, 'facebook');
    case 'linkedin':
      return fonteRedeSocial(ctx, 'linkedin');
    case 'maps':
      return fonteMaps(ctx);
    case 'openstreetmap':
      return fonteGoogleMapsOSM(ctx);
    default:
      throw new Error('FONTE_DESCONHECIDA');
  }
}

/**
 * Pesquisa real. `fonte` única OU várias separadas por vírgula.
 * Resposta: { ok, total, leads[], porFonte{}, erros[], avisos[] }
 */
async function pesquisar(opts) {
  const cidade = String(opts.cidade || '').trim().slice(0, 80);
  const uf = String(opts.uf || '').trim().slice(0, 2).toUpperCase();
  const termo = String(opts.termo || '').trim().slice(0, 60);
  const empresa = String(opts.empresa || '').trim().slice(0, 80);
  const limitePorFonte = Math.min(Math.max(Number(opts.limite) || 25, 5), 40);

  if (!cidade && !uf) return { ok: false, code: 'CIDADE_OBRIGATORIA', message: 'Informe a cidade (e UF) para buscar contatos reais.' };

  let fontes = String(opts.fonte || 'google,maps')
    .split(',').map((s) => s.trim()).filter((s) => FONTES_VALIDAS.includes(s));
  if (!fontes.length) fontes = ['google', 'maps'];

  const chave = JSON.stringify({ cidade, uf, termo, empresa, limitePorFonte, fontes });
  const hit = cache.get(chave);
  if (hit && Date.now() - hit.ts < 900000) return hit.val;

  const ctxBase = { cidade, uf, termo, empresa, limite: limitePorFonte };

  // TODAS as fontes ao MESMO TEMPO — cada fonte usa suas próprias abas do Chrome
  const respostas = await Promise.allSettled(
    fontes.map(async (fonte) => ({ fonte, achados: await rodarFonte(fonte, Object.assign({ fonte }, ctxBase)) }))
  );

  const leads = [];
  const porFonte = {};
  const erros = [];
  const avisos = [];
  let cidadeFalhou = false;

  respostas.forEach((r) => {
    if (r.status === 'fulfilled') {
      const { fonte, achados } = r.value;
      porFonte[fonte] = { encontrados: Array.isArray(achados) ? achados.length : 0 };
      if (Array.isArray(achados)) leads.push(...achados);
    } else {
      const msg = String((r.reason && r.reason.message) || r.reason || 'falhou');
      const mm = msg.match(/^fonte (\S+)/i);
      const fonteDesconhecida = /FONTE_DESCONHECIDA/.test(msg);
      if (msg.includes('CIDADE_NAO_ENCONTRADA')) {
        cidadeFalhou = true;
      } else {
        erros.push({ fonte: (mm && mm[1]) || 'desconhecida', erro: fonteDesconhecida ? 'fonte inexistente' : msg });
        avisos.push(`Uma das fontes falhou (${msg.slice(0, 60)}) — as outras continuaram.`);
      }
    }
  });
  if (cidadeFalhou) {
    return { ok: false, code: 'CIDADE_NAO_ENCONTRADA', message: 'Não encontrei essa cidade na base pública. Confira o nome/UF.' };
  }

  // dedup global por chave de realidade (telefone | e-mail | domínio | nome+cidade)
  const vistas = new Set();
  const finais = [];
  for (const l of leads) {
    const tel = String(l.phone || '').replace(/\D/g, '') || '';
    const dom = dominarioDe(l.website || '') || '';
    const k1 = tel.length >= 10 ? 'tel:' + tel.replace(/^55/, '') : '';
    const k2 = l.email ? 'mail:' + l.email.toLowerCase() : '';
    const k3 = dom ? 'dom:' + dom : '';
    const k4 = 'nom:' + String(l.name || '').toLowerCase().trim() + '|' + String(l.city || '').toLowerCase();
    const chaves = [k1, k2, k3].filter(Boolean);
    if (chaves.some((k) => vistas.has(k))) continue;
    if (!k1 && !k2 && !k3 && vistas.has(k4)) continue;
    [k1, k2, k3, k4].forEach((k) => { if (k) vistas.add(k); });
    finais.push(l);
  }

  // prioriza contato direto (telefone/whats) → depois quem tem site
  finais.sort((a, b) => ((b.phone ? 2 : 0) + (b.website ? 1 : 0)) - ((a.phone ? 2 : 0) + (a.website ? 1 : 0)));

  const val = {
    ok: true,
    total: finais.length,
    leads: finais.slice(0, limitePorFonte * 2),
    porFonte,
    erros,
    aviso: finais.length ? null : 'Nenhum contato público encontrado com esses filtros. Tente outro termo/cidade — nada é inventado pelo sistema.',
  };
  cache.set(chave, { ts: Date.now(), val });
  return val;
}

module.exports = { pesquisar };
