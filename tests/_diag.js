'use strict';
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new', args: ['--no-first-run','--mute-audio'] });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log('PAGEERROR:', String(e && e.message || e).slice(0,200)));
    page.on('console', (m) => { if (m.type()==='error') console.log('CONSOLE:', m.text().slice(0,200)); });
    await page.goto('http://localhost:8088/', { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 3000));
    await page.evaluate(() => { document.querySelectorAll('.ecomim-login,.nz-onboarding').forEach(n=>n.remove()); window.ECOMIM_APP.renderApp(true); });
    await new Promise((r) => setTimeout(r, 600));
    const antes = await page.evaluate(() => window.ECOMIM.modules.tarefas.pendentes().length);
    // Chama direto a função interna do fluxo real
    await page.evaluate(() => {
      const bt = Array.from(document.querySelectorAll('.dbx-actions .btn')).find(b=>/Nova tarefa/.test(b.textContent));
      bt.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    const estadoModal = await page.evaluate(() => ({
      existe: !!document.querySelector('#tf-titulo'),
      valor: (document.querySelector('#tf-titulo')||{}).value,
      botaoExiste: !!document.querySelector('#tf-salvar'),
    }));
    console.log('antes=', antes, 'estadoModal=', JSON.stringify(estadoModal));
    await page.evaluate(() => {
      document.querySelector('#tf-titulo').value = 'Diagnostico Direto';
      document.querySelector('#tf-salvar').click();
    });
    await new Promise((r) => setTimeout(r, 400));
    const depois = await page.evaluate(() => ({
      n: window.ECOMIM.modules.tarefas.pendentes().length,
      titulos: window.ECOMIM.modules.tarefas.pendentes().map(t=>t.titulo).slice(0,5),
      modalAindaAberto: !!document.querySelector('.modal'),
    }));
    console.log('depois=', JSON.stringify(depois));
  } finally { await browser.close(); }
})().catch(e=>{console.error('FATAL:',e.message);process.exit(1);});
