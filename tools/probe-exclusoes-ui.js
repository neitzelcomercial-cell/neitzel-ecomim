/* Probe EXCLUSÕES NA UI — clica no 🗑 como usuário real e valida remoção */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer-core');
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const raiz = 'C:/Users/neitz/OneDrive/ECOMIM';
const PORTA = 8171;
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
  page.on('dialog', async (d) => { await d.accept(); }); // usuário aceita TODOS os confirms
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('ecomim_theme', 'dark');
    localStorage.setItem('ecomim_os_security_v1', JSON.stringify({ onboarding: true }));
    localStorage.setItem('ecomim_aparencia', JSON.stringify({ tema: 'dark' }));
  });
  await page.goto(`http://localhost:${PORTA}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));

  // Semente: 1 serviço, 1 produto
  await page.evaluate(() => {
    const O = window.NEITZEL_OPS;
    O.servicos.add({ nome: 'Servico UI', preco: 1000, custo: 100 });
    O.produtos.add({ nome: 'Produto UI', preco: 2000, custo: 300 });
  });

  /* ---- SERVIÇOS ---- */
  await page.evaluate(() => { try { window.ECOMIM_APP.renderView('servicos'); } catch (e) {} });
  await new Promise((r) => setTimeout(r, 300));
  const temLinhaServ = await page.evaluate(() => [...document.querySelectorAll('.ecomim-content td')].some((td) => /Servico UI/.test(td.textContent)));
  registrar('SERVIÇOS: linha aparece na tabela', temLinhaServ);
  const clicouDelServ = await page.evaluate(() => { const b = document.querySelector('[data-del]'); if (!b) return false; b.click(); return true; });
  await new Promise((r) => setTimeout(r, 400));
  const diagServ = await page.evaluate(() => {
    const b = document.querySelector('[data-del]');
    if (!b) return { erro: 'sem botão' };
    window.__confirms = [];
    window.confirm = (m) => { window.__confirms.push(m); return true; };
    let resultadoClick;
    try { b.click(); resultadoClick = 'ok'; } catch (e) { resultadoClick = 'THROW:' + e.message; }
    return { resultadoClick, confirms: window.__confirms };
  });
  await new Promise((r) => setTimeout(r, 400));
  const pos = await page.evaluate(() => ({
    confirms: window.__confirms,
    naLista: !!window.NEITZEL_OPS.servicos.list().some((s) => s.nome === 'Servico UI'),
    toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent).join('|').slice(0, 120),
  }));
  console.log('[DIAG CLICK]', JSON.stringify(diagServ));
  console.log('[DIAG POS ]', JSON.stringify(pos));
  const sumiuServDOM = !(await page.evaluate(() => [...document.querySelectorAll('.ecomim-content td')].some((td) => /Servico UI/.test(td.textContent))));
  const sumiuServStore = await page.evaluate(() => !window.NEITZEL_OPS.servicos.list().some((s) => s.nome === 'Servico UI'));
  registrar('SERVIÇOS: botão 🗑 clicável', clicouDelServ);
  registrar('SERVIÇOS: some da tela', sumiuServDOM);
  registrar('SERVIÇOS: some do banco', sumiuServStore);

  /* ---- PRODUTOS ---- */
  await page.evaluate(() => { try { window.ECOMIM_APP.renderView('produtos'); } catch (e) {} });
  await new Promise((r) => setTimeout(r, 300));
  const temLinhaProd = await page.evaluate(() => [...document.querySelectorAll('.ecomim-content td')].some((td) => /Produto UI/.test(td.textContent)));
  registrar('PRODUTOS: linha aparece na tabela', temLinhaProd);
  await page.evaluate(() => document.querySelector('[data-del]')?.click());
  await new Promise((r) => setTimeout(r, 400));
  const sumiuProdStore = await page.evaluate(() => !window.NEITZEL_OPS.produtos.list().some((p) => p.nome === 'Produto UI'));
  const sumiuProdDOM = !(await page.evaluate(() => [...document.querySelectorAll('.ecomim-content td')].some((td) => /Produto UI/.test(td.textContent))));
  registrar('PRODUTOS: some da tela', sumiuProdDOM);
  registrar('PRODUTOS: some do banco', sumiuProdStore);

  await browser.close();
  servidor.close();
  console.log(falhas === 0 ? '\nUI EXCLUSÕES: OK ✔' : '\nUI EXCLUSÕES FALHOU: ' + falhas);
  process.exit(falhas === 0 ? 0 : 2);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });