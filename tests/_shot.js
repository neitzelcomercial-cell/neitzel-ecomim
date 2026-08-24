'use strict';
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new', args: ['--no-first-run','--mute-audio'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000 });
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('ecomim_os_security_v1', JSON.stringify({ onboarding: true })); } catch (e) {} });
    await page.goto('http://localhost:8088/', { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 3200));
    await page.evaluate(() => { window.ECOMIM_APP.renderApp(true); window.ECOMIM_APP.renderView('config'); });
    await new Promise((r) => setTimeout(r, 700));
    const el = await page.$('.ecomim-content');
    await el.screenshot({ path: 'C:/Users/neitz/AppData/Local/Temp/opencode/config-v2.png' });
    console.log('shot ok');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e.message);process.exit(1);});
