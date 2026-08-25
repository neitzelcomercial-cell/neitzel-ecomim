/* Probe TOPBAR — X e Esc fecham os painéis de Notificações e Usuário */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer-core');
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const raiz = 'C:/Users/neitz/OneDrive/ECOMIM';
const PORTA = 8159;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg' };
const servidor = http.createServer((req, res) => {
  let c = decodeURIComponent(req.url.split('?')[0]); if (c === '/') c = '/SISTEMA NEITZEL.html';
  fs.readFile(path.join(raiz, c), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(c)] || 'octet' }); res.end(d); });
});

let falhas = 0;
const registrar = (n, ok, d) => { if (!ok) falhas++; console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${d ? ' (' + d + ')' : ''}`); };

(async () => {
  await new Promise((r) => servidor.listen(PORTA, r));
  const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1400, height: 900 } });
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('ecomim_theme', 'dark');
    localStorage.setItem('ecomim_os_security_v1', JSON.stringify({ onboarding: true }));
  });
  await page.goto(`http://localhost:${PORTA}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));

  /* Se houver tela de login (onboarding semeado sem PIN concluído), passa por ela
     usando o fluxo REAL: define o PIN e entra digitando. */
  const temLogin = await page.evaluate(() => !!document.querySelector('.ecomim-login'));
  if (temLogin) {
    await page.evaluate(async () => { await window.ECOMIM_EXT.security.setupPassword('123456'); });
    await page.type('#login-pin', '123456');
    await page.click('#login-btn');
    await new Promise((r) => setTimeout(r, 800));
  }
  registrar(temLogin ? 'login aceita o PIN e abre o sistema' : 'sem bloqueio de login', !(await page.evaluate(() => !!document.querySelector('.ecomim-login'))));

  // Notificações
  await page.click('#btn-notif');
  await new Promise((r) => setTimeout(r, 200));
  registrar('sino abre painel com X', await page.evaluate(() => {
    const p = document.querySelector('.notif-panel');
    return !!p && p.classList.contains('open') && !!p.querySelector('.notif-x');
  }));
  await page.evaluate(() => document.querySelector('.notif-panel .notif-x').click());
  await new Promise((r) => setTimeout(r, 150));
  registrar('X fecha notificações', !(await page.evaluate(() => document.querySelector('.notif-panel')?.classList.contains('open'))));
  await page.click('#btn-notif');
  await new Promise((r) => setTimeout(r, 150));
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 150));
  registrar('ESC fecha notificações', !(await page.evaluate(() => document.querySelector('.notif-panel')?.classList.contains('open'))));

  // Usuário
  await page.click('#btn-user');
  await new Promise((r) => setTimeout(r, 200));
  registrar('usuário abre painel com X', await page.evaluate(() => {
    const p = [...document.querySelectorAll('.user-menu')][0];
    return !!p && p.classList.contains('open') && !!p.querySelector('.notif-x');
  }));
  await page.evaluate(() => document.querySelector('.user-menu .notif-x').click());
  await new Promise((r) => setTimeout(r, 150));
  registrar('X fecha usuário', !(await page.evaluate(() => document.querySelector('.user-menu')?.classList.contains('open'))));
  await page.click('#btn-user');
  await new Promise((r) => setTimeout(r, 150));
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 150));
  registrar('ESC fecha usuário', !(await page.evaluate(() => document.querySelector('.user-menu')?.classList.contains('open'))));

  await browser.close();
  servidor.close();
  console.log(falhas === 0 ? '\nTOPBAR: TUDO FUNCIONANDO ✔' : '\nTOPBAR FALHOU: ' + falhas);
  process.exit(falhas === 0 ? 0 : 2);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });