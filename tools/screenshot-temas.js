/* Screenshots dos temas claro/escuro — validação visual da direção de arte.
 * Semeia o estado COMPLETO (tema + aparência) para o app nascer pronto no tema alvo.
 * Uso: node tools/screenshot-temas.js  */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const exe = [EDGE, CHROME].find((p) => fs.existsSync(p));
if (!exe) { console.error('Nenhum navegador encontrado'); process.exit(1); }

const raiz = path.join(__dirname, '..');
const PORTA = 8127;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

const servidor = http.createServer((req, res) => {
  let caminho = decodeURIComponent(req.url.split('?')[0]);
  if (caminho === '/') caminho = '/SISTEMA NEITZEL.html';
  const arquivo = path.join(raiz, caminho);
  fs.readFile(arquivo, (err, dados) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(arquivo)] || 'application/octet-stream' });
    res.end(dados);
  });
});

const AP_PADRAO = {
  tema: '', destaque: '', texto: '', animacoes: true, zoom: 100,
  titulo: 'NEITZEL', sufixo: 'Sistema Digital', logoDataUrl: '',
  fundo: '', surface: '', borda: '', fonte: 'sistema', botao: 'padrao',
  menu: 'lateral', cartao: 'padrao', letraTamanho: 'normal',
  somTipo: 'none', somVolume: 50,
  fundoModo: 'arte', fundoOpacidade: 55, temaArt: '',
  arteCor: '', chuva: 'sutil',
  iaAtiva: true, agentesAtivos: true, notificacoesIA: true,
};

async function capturar(browser, tema, arquivo, relatorio) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.on('pageerror', (e) => { relatorio.erros.push(String(e).slice(0, 160)); });

  await page.evaluateOnNewDocument((t) => {
    try {
      localStorage.setItem('ecomim_theme', t);
      localStorage.setItem('ecomim_os_security_v1', JSON.stringify({ onboarding: true }));
      const ap = JSON.parse(localStorage.getItem('ecomim_aparencia') || '{}');
      ap.tema = t; ap.chuva = ap.chuva || 'sutil';
      localStorage.setItem('ecomim_aparencia', JSON.stringify(ap));
    } catch (e) {}
  }, tema);

  await page.goto(`http://localhost:${PORTA}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 4500));

  relatorio.app = await page.evaluate(() => ({
    temaAttr: document.documentElement.getAttribute('data-theme'),
    folhasCss: document.styleSheets.length,
    shellRenderizada: !!document.querySelector('.ecomim-shell'),
    itensMenu: document.querySelectorAll('.ecomim-nav-item').length,
    cards: document.querySelectorAll('.card').length,
    temLogin: !!document.querySelector('.ecomim-login'),
    temOnboarding: !!document.querySelector('.nz-onboarding'),
    chuvaVisivel: (() => { const c = document.querySelector('.fa-chuva'); return !!c && getComputedStyle(c).display !== 'none'; })(),
    bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    brand: getComputedStyle(document.documentElement).getPropertyValue('--e-brand').trim(),
  }));

  // Reforça o tema e limpa overlays residuais antes da foto
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
    const s = document.getElementById('nz-splash'); if (s) s.remove();
    const o = document.querySelector('.nz-onboarding'); if (o) o.remove();
  }, tema);
  await new Promise((r) => setTimeout(r, 1000));

  await page.screenshot({ path: path.join(raiz, arquivo) });
  await page.close();
  await context.close();
}

(async () => {
  await new Promise((r) => servidor.listen(PORTA, r));
  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1440,900', '--lang=pt-BR'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const repEscuro = { erros: [] }, repClaro = { erros: [] };
  try {
    await capturar(browser, 'dark', path.join('_validacao', '_validacao_tema_escuro.png'), repEscuro);
    await capturar(browser, 'light', path.join('_validacao', '_validacao_tema_claro.png'), repClaro);
  } finally {
    await browser.close();
    servidor.close();
  }
  fs.writeFileSync(path.join(raiz, 'tools', '_shot_report.json'),
    JSON.stringify({ escuro: repEscuro, claro: repClaro }, null, 2));
  console.log(JSON.stringify(repEscuro, null, 1));
  console.log(JSON.stringify(repClaro, null, 1));
  const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(raiz, '_validacao', f))).digest('hex');
  console.log(hash('_validacao_tema_escuro.png') === hash('_validacao_tema_claro.png') ? 'AVISO: iguais!' : 'OK — diferentes');
})().catch((e) => { console.error(e); process.exit(1); });