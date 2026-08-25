/* Probe do MENU TOPO — ícones lado a lado numa única linha */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer-core');
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const raiz = 'C:/Users/neitz/OneDrive/ECOMIM';
const servidor = http.createServer((req, res) => {
  let c = decodeURIComponent(req.url.split('?')[0]); if (c === '/') c = '/SISTEMA NEITZEL.html';
  fs.readFile(path.join(raiz, c), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200); res.end(d); });
});

(async () => {
  await new Promise((r) => servidor.listen(8155, r));
  const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1400, height: 900 } });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('ecomim_theme', 'dark');
    localStorage.setItem('ecomim_os_security_v1', JSON.stringify({ onboarding: true }));
    localStorage.setItem('ecomim_aparencia', JSON.stringify({ tema: 'dark', menu: 'topo' }));
  });
  await page.goto('http://localhost:8155/', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 3000));

  const r15 = await page.evaluate(() => {
    const itens = [...document.querySelectorAll('.ecomim-nav-item')];
    const caixas = itens.map((el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; });
    const ys = caixas.map((c) => c.y);
    const mesmaLinha = ys.length > 0 && Math.max(...ys) - Math.min(...ys) <= 2;
    const larguraIcone = caixas.every((c) => c.w <= 90);
    const cabemNaTela = caixas.every((c) => c.x >= 0 && c.x + c.w <= window.innerWidth);
    const semRotulo = [...document.querySelectorAll('.ecomim-nav-item .nav-label')].every((l) => getComputedStyle(l).display === 'none');
    const comTooltip = itens.every((b) => !!b.title);
    return { qtd: caixas.length, mesmaLinha, larguraIcone, cabemNaTela, semRotulo, comTooltip, amostra: caixas.slice(0, 4) };
  });

  fs.writeFileSync('C:/Users/neitz/AppData/Local/Temp/opencode/menutopo.json', JSON.stringify(r15, null, 1));
  console.log('MENUTOPO-OK');
  await browser.close();
  servidor.close();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });