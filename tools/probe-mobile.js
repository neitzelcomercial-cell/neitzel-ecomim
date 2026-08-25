/* Probe MOBILE (390×844) — nada de overflow horizontal, gaveta funciona, modal cabe */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer-core');
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const raiz = 'C:/Users/neitz/OneDrive/ECOMIM';
const PORTA = 8163;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg' };
const servidor = http.createServer((req, res) => {
  let c = decodeURIComponent(req.url.split('?')[0]); if (c === '/') c = '/SISTEMA NEITZEL.html';
  fs.readFile(path.join(raiz, c), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(c)] || 'octet' }); res.end(d); });
});

let falhas = 0;
const registrar = (n, ok, d) => { if (!ok) falhas++; console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${d ? ' (' + d + ')' : ''}`); };

(async () => {
  await new Promise((r) => servidor.listen(PORTA, r));
  const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('ecomim_theme', 'dark');
    localStorage.setItem('ecomim_os_security_v1', JSON.stringify({ onboarding: true }));
    localStorage.setItem('ecomim_aparencia', JSON.stringify({ tema: 'dark' }));
  });
  await page.goto(`http://localhost:${PORTA}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));

  const semOverflow = () => page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - window.innerWidth,
    body: document.body.scrollWidth - window.innerWidth,
  }));

  // Dashboard sem estourar horizontal
  let ov = await semOverflow();
  registrar('dashboard sem scroll horizontal', ov.doc <= 1 && ov.body <= 1, JSON.stringify(ov));

  // Navegar por views via renderView e checar overflow em cada
  const views = ['planner', 'tarefas', 'leads', 'clientes', 'financeiro', 'projetos', 'config'];
  for (const v of views) {
    await page.evaluate((vv) => { try { window.ECOMIM_APP.renderView(vv); } catch (e) {} }, v);
    await new Promise((r) => setTimeout(r, 250));
    ov = await semOverflow();
    registrar(`view ${v} sem overflow`, ov.doc <= 1 && ov.body <= 1, JSON.stringify(ov));
  }

  // Gaveta lateral: burger aparece e abre
  const burgerOk = await page.evaluate(() => {
    const b = document.querySelector('.ecomim-burger');
    return !!b && getComputedStyle(b).display !== 'none';
  });
  registrar('burger visível no celular', burgerOk);
  await page.evaluate(() => document.querySelector('.ecomim-burger')?.click());
  await new Promise((r) => setTimeout(r, 300));
  registrar('gaveta abre (mobile-open)', await page.evaluate(() => !!document.querySelector('.ecomim-sidebar.mobile-open')), await page.evaluate(() => document.querySelector('.ecomim-sidebar')?.className || '<sem sidebar>'));
  // Toca num item do menu → fecha a gaveta e navega
  await page.evaluate(() => [...document.querySelectorAll('.ecomim-nav-item')].find((x) => /Configura/i.test(x.title || ''))?.click());
  await new Promise((r) => setTimeout(r, 350));
  registrar('item do menu fecha a gaveta e navega', !(await page.evaluate(() => !!document.querySelector('.ecomim-sidebar.mobile-open'))) && /Configurações/.test(await page.evaluate(() => document.querySelector('.ecomim-content h1')?.textContent || '')));

  // Modal cabe na tela
  await page.evaluate(() => { try { window.ECOMIM_APP.renderView('planner'); } catch (e) {} });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => document.querySelector('.planner-toolbar .btn-primary')?.click());
  await new Promise((r) => setTimeout(r, 250));
  const modalFit = await page.evaluate(() => {
    const m = document.querySelector('.modal-box');
    if (!m) return null;
    const b = m.getBoundingClientRect();
    return { w: Math.round(b.width), vw: window.innerWidth };
  });
  registrar('modal cabe na largura do celular', !!modalFit && modalFit.w <= modalFit.vw + 1, JSON.stringify(modalFit));

  await browser.close();
  servidor.close();
  console.log(falhas === 0 ? '\nMOBILE: TUDO FUNCIONANDO ✔' : '\nMOBILE FALHOU: ' + falhas);
  process.exit(falhas === 0 ? 0 : 2);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });