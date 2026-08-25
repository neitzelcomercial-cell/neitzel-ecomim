/* Probe ANIMAÇÕES AUTORAIS — todas devem pintar ::before/::after com animação */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer-core');
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const raiz = 'C:/Users/neitz/OneDrive/ECOMIM';
const PORTA = 8161;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg' };
const servidor = http.createServer((req, res) => {
  let c = decodeURIComponent(req.url.split('?')[0]); if (c === '/') c = '/SISTEMA NEITZEL.html';
  fs.readFile(path.join(raiz, c), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(c)] || 'octet' }); res.end(d); });
});

(async () => {
  await new Promise((r) => servidor.listen(PORTA, r));
  const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1400, height: 900 } });
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('ecomim_theme', 'dark');
    localStorage.setItem('ecomim_os_security_v1', JSON.stringify({ onboarding: true }));
    localStorage.setItem('ecomim_aparencia', JSON.stringify({ tema: 'dark', fundoModo: 'padrao' }));
  });
  await page.goto(`http://localhost:${PORTA}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));

  const checar = (art) => page.evaluate(async (a) => {
    aplicarAparencia({ temaArt: a });
    await new Promise((r) => requestAnimationFrame(r));
    const b = getComputedStyle(document.body, '::before');
    const af = getComputedStyle(document.body, '::after');
    return {
      bgBefore: b.backgroundImage.slice(0, 60),
      animB: b.animationName,
      bgAfter: af.backgroundImage.slice(0, 60),
      animA: af.animationName,
      zB: b.zIndex,
    };
  }, art);

  const esperados = {
    aurora:   /linear-gradient/,
    neon:     /linear-gradient.*linear-gradient|gradient/,
    sakura:   /radial-gradient/,
    matrix:   /repeating-linear-gradient/,
    oceano:   /radial-gradient/,
    deserto:  /radial-gradient/,
  };
  let falhas = 0;
  for (const [art, regex] of Object.entries(esperados)) {
    const r = await checar(art);
    const bg = art === 'neon' ? r.bgAfter + r.bgBefore : r.bgBefore;
    const anim = art === 'neon' ? (r.animA !== 'none' ? r.animA : r.animB) : r.animB;
    const ok = regex.test(bg) && anim !== 'none';
    if (!ok) falhas++;
    console.log(`${ok ? 'PASS' : 'FAIL'} — autoral ${art.toUpperCase()} pinta e anima (${anim}, z=${r.zB})`);
  }
  // Limpar
  await checar('');

  await browser.close();
  servidor.close();
  console.log(falhas === 0 ? '\nAUTORAIS: TODAS PINTAM E ANIMAM ✔' : '\nAUTORAIS FALHARAM: ' + falhas);
  process.exit(falhas === 0 ? 0 : 2);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });