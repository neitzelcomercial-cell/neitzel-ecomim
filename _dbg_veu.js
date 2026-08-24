'use strict';
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new', args: ['--no-first-run', '--mute-audio'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('ecomim_os_security_v1', JSON.stringify({ onboarding: true })); } catch (e) {} });
    await page.goto('http://localhost:8088/', { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 3000));
    await page.evaluate(() => window.ECOMIM_APP.renderApp(true));
    await new Promise((r) => setTimeout(r, 800));
    await page.tap('.ecomim-burger');
    await new Promise((r) => setTimeout(r, 350));
    console.log('aberto1:', await page.evaluate(() => !!document.querySelector('.nav-veu')));
    await page.tap('.nav-veu');
    await new Promise((r) => setTimeout(r, 250));
    console.log('fechou1:', await page.evaluate(() => !document.querySelector('.ecomim-sidebar').classList.contains('mobile-open')));
    // reabre
    await page.tap('.ecomim-burger');
    await new Promise((r) => setTimeout(r, 400));
    console.log('estado pos-reabrir:', await page.evaluate(() => JSON.stringify({
      aberta: document.querySelector('.ecomim-sidebar').classList.contains('mobile-open'),
      veu: !!document.querySelector('.nav-veu'),
      burgerRect: (() => { const b = document.querySelector('.ecomim-burger'); const r = b.getBoundingClientRect(); return [r.x, r.y, r.width].join(','); })(),
      noPontoDoBurger: (() => { const b = document.querySelector('.ecomim-burger'); const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e ? e.tagName + '.' + String(e.className).slice(0, 30) : null; })(),
    })));
  } finally { await browser.close(); }
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
