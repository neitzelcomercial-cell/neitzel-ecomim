/* Probe PRIMEIRA VEZ — navegador zerado: onboarding → senha → app funcional.
 * Uso: node tools/probe-primeira-vez.js */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer-core');
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const raiz = 'C:/Users/neitz/OneDrive/ECOMIM';
const PORTA = 8157;
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
  const erros = [];
  page.on('pageerror', (e) => { const s = String(e); if (!/Failed to fetch/.test(s)) erros.push(s.slice(0, 140)); });

  // ZERO dados: nada é semeado — primeira execução real
  await page.goto(`http://localhost:${PORTA}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));

  registrar('onboarding de primeira execução aparece', await page.evaluate(() => !!document.querySelector('.nz-onboarding')));
  registrar('etapa 1 pede a senha de 6 dígitos', await page.evaluate(() => /senha/i.test(document.querySelector('.nz-onboarding')?.textContent || '')));

  // Conclui o onboarding pelo caminho oficial das features de segurança
  await page.evaluate(async () => {
    const sec = window.ECOMIM_EXT.security;
    await sec.setupPin('123456');
    try { await sec.setupRecovery({ whatsapp: '51999999999', email: 'cliente@teste.com' }); } catch (e) {}
    try { await sec.setupGoogle({ nome: 'Cliente', email: 'c@gmail.com' }); } catch (e) {}
    sec.completeOnboarding(true);
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => { try { window.ECOMIM_APP.renderApp(true); } catch (e) {} });
  await new Promise((r) => setTimeout(r, 900));

  registrar('app principal renderiza após onboarding', await page.evaluate(() => !!document.querySelector('.ecomim-shell')));
  registrar('menu lateral com seções', (await page.evaluate(() => document.querySelectorAll('.ecomim-nav-item').length)) >= 15);
  registrar('sem tela de login bloqueando (PIN recém-definido desbloqueia sessão)', !(await page.evaluate(() => !!document.querySelector('.ecomim-login'))));

  /* Clique REAL num item do menu (Configurações) — o botão mais simples precisa funcionar */
  const clicou = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.ecomim-nav-item')].find((x) => /Configurações/i.test(x.title || x.textContent));
    if (!b) return false;
    b.click();
    return true;
  });
  await new Promise((r) => setTimeout(r, 500));
  registrar('clique no menu abre Configurações', clicou && await page.evaluate(() => /Configurações/.test(document.querySelector('.ecomim-content h1')?.textContent || '')));

  /* Botão zero-dado existe na aba Backup */
  registrar('botão "começar do zero" disponível', await page.evaluate(() => !!document.getElementById('bk-zero')));

  registrar('nenhum erro JS além de backend ausente', erros.length === 0, erros.join(' | ').slice(0, 120));

  await browser.close();
  servidor.close();
  console.log(falhas === 0 ? '\nPRIMEIRA VEZ: TUDO FUNCIONANDO ✔' : '\nPRIMEIRA VEZ FALHOU: ' + falhas);
  process.exit(falhas === 0 ? 0 : 2);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });