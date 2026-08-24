/* E2E da PersonalizaÃ§Ã£o: tÃ­tulo, logo, cores, botÃµes, fontes, sons e reset. */
'use strict';
const puppeteer = require('puppeteer-core');
(async () => {
  let falhas = 0;
  const ok = (cond, nome) => { console.log((cond ? 'OK   ' : 'FALHOU ') + nome); if (!cond) falhas++; };
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new', args: ['--no-first-run', '--mute-audio'],
  });
  try {
    const page = await browser.newPage();
        await page.evaluateOnNewDocument(() => { try { localStorage.setItem('ecomim_os_security_v1', JSON.stringify({ onboarding: true, createdAt: new Date().toISOString() })); } catch (e) {} });
    await page.setViewport({ width: 1400, height: 950 });
    const erros = [];
    page.on('pageerror', (e) => erros.push(String(e && e.message || e)));
    await page.goto('http://localhost:8088/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 3500));
    await page.evaluate(() => { document.querySelectorAll('.ecomim-login, .nz-onboarding').forEach((n) => n.remove()); window.ECOMIM_APP.renderApp(true); });
    await new Promise((r) => setTimeout(r, 800));

    // Abre ConfiguraÃ§Ãµes
    await page.evaluate(() => window.ECOMIM_APP.renderView('config'));
    await new Promise((r) => setTimeout(r, 400));
    ok(await page.evaluate(() => !!document.querySelector('#pz-titulo')), 'campo de tÃ­tulo presente');
    ok(await page.evaluate(() => !!document.querySelector('#pz-logo')), 'campo de logo presente');
    ok(await page.evaluate(() => !!document.querySelector('#pz-fundo')), 'seletor de cor de fundo presente');
    ok(await page.evaluate(() => !!document.querySelector('#pz-btn')), 'modelo de botÃµes presente');
    ok(await page.evaluate(() => !!document.querySelector('#pz-font')), 'modelo de letras presente');
    ok(await page.evaluate(() => !!document.querySelector('#pz-somtipo')), 'seletor de som presente');
    ok(await page.evaluate(() => !document.querySelector('#sis-pais') && !document.querySelector('#cfg-emp')), 'Empresa/Sistema-EstratÃ©gia removidos da configuraÃ§Ã£o');

    // Muda o tÃ­tulo e verifica identidade
    await page.evaluate(() => {
      const t = document.querySelector('#pz-titulo');
      t.value = 'MEU SISTEMA';
      t.dispatchEvent(new Event('change'));
    });
    await new Promise((r) => setTimeout(r, 700));
    const tituloOk = await page.evaluate(() => document.querySelector('.ecomim-brand-name')?.textContent === 'MEUSISTEMA' || document.title.includes('MEU SISTEMA'));
    ok(tituloOk, 'tÃ­tulo do sistema aplicado ao vivo');

    // Aplica tema completo Oceano (família 2, modelo escuro)
    await page.evaluate(() => document.querySelector('[data-tema-familia="2"][data-modelo="escuro"]').click());
    await new Promise((r) => setTimeout(r, 500));
    const bgOceano = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
    ok(bgOceano.toLowerCase() === '#081019', 'tema pronto aplica cor de fundo (' + bgOceano + ')');
    const arteCorOk = await page.evaluate(() => document.documentElement.getAttribute('data-arte-cor') === 'oceano' && document.documentElement.getAttribute('data-tema-art') === 'oceano');
    ok(arteCorOk, 'arte de fundo acompanha a cor do tema (oceano)');

    // Modelo claro da mesma família troca o tema base
    await page.evaluate(() => window.ECOMIM_APP.renderView('config'));
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => document.querySelector('[data-tema-familia="2"][data-modelo="claro"]').click());
    await new Promise((r) => setTimeout(r, 500));
    const claroOk = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme') === 'light' &&
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().toLowerCase() === '#edf4fa');
    ok(claroOk, 'modelo claro da família aplica tema claro (#edf4fa)');

    // Modelo de botÃµes pÃ­lula
    await page.evaluate(() => {
      const s = document.querySelector('#pz-btn');
      s.value = 'pill'; s.dispatchEvent(new Event('change'));
    });
    await new Promise((r) => setTimeout(r, 300));
    const raioBtn = await page.evaluate(() => {
      const b = document.querySelector('.btn');
      return b ? getComputedStyle(b).borderRadius : '';
    });
    ok(raioBtn.includes('999'), 'modelo de botÃ£o pÃ­lula aplicado (' + raioBtn + ')');

    // Fonte serif
    await page.evaluate(() => {
      const s = document.querySelector('#pz-font');
      s.value = 'serif'; s.dispatchEvent(new Event('change'));
    });
    await new Promise((r) => setTimeout(r, 300));
    const fonteBody = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    ok(/georgia/i.test(fonteBody), 'modelo de letra serifa aplicado');

    // Arte de fundo: ativa por padrão e alterna para padrão limpo
    const arteOn = await page.evaluate(() =>
      document.documentElement.getAttribute('data-fundo') === 'arte' && !!document.querySelector('.nz-fundo-arte .fa-foto'));
    ok(arteOn, 'obra de fundo da logo ativa por padrão');
    await page.evaluate(() => {
      window.ECOMIM_APP.renderView('config');
    });
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => {
      const s = document.querySelector('#pz-fundomodo');
      s.value = 'padrao'; s.dispatchEvent(new Event('change'));
    });
    await new Promise((r) => setTimeout(r, 200));
    const arteOff = await page.evaluate(() => document.documentElement.getAttribute('data-fundo') === 'padrao');
    ok(arteOff, 'fundo alternado para padrão limpo');
    await page.evaluate(() => {
      const s = document.querySelector('#pz-fundomodo');
      s.value = 'arte'; s.dispatchEvent(new Event('change'));
    });

    // Animação autoral do tema (neon)
    await page.evaluate(() => {
      const s = document.querySelector('#pz-temaart');
      s.value = 'neon'; s.dispatchEvent(new Event('change'));
    });
    const neonOk = await page.evaluate(() => document.documentElement.getAttribute('data-tema-art') === 'neon');
    ok(neonOk, 'animação autoral do tema aplicada (neon)');

    // IA & Agentes: desligar assistente oculta o balão flutuante
    await page.evaluate(() => {
      window.ECOMIM_APP.renderView('config');
    });
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => {
      const cb = document.querySelector('#pz-iaativa');
      cb.checked = false; cb.dispatchEvent(new Event('change'));
    });
    await new Promise((r) => setTimeout(r, 200));
    const iaOff = await page.evaluate(() => {
      const off = document.documentElement.classList.contains('ia-off');
      const visivel = (() => { const b = document.querySelector('.ecomim-ai-floating'); return b && getComputedStyle(b).display !== 'none'; })();
      return off && !visivel;
    });
    ok(iaOff, 'IA desligada oculta o balão flutuante');
    await page.evaluate(() => {
      const cb = document.querySelector('#pz-iaativa');
      cb.checked = true; cb.dispatchEvent(new Event('change'));
    });

    // Som ligado (tipo tick)
    await page.evaluate(() => {
      const s = document.querySelector('#pz-somtipo');
      s.value = 'tick'; s.dispatchEvent(new Event('change'));
    });
    const somOn = await page.evaluate(() => JSON.parse(localStorage.getItem('ecomim_aparencia')).somTipo === 'tick');
    ok(somOn, 'preferÃªncia de som salva');

    // BotÃ£o "Nova tarefa" do painel funciona
    await page.evaluate(() => window.ECOMIM_APP.renderView('dashboard'));
    await new Promise((r) => setTimeout(r, 600));
    const botoesPainel = await page.evaluate(() => Array.from(document.querySelectorAll('.dbx-actions .btn')).map((b) => b.textContent.trim()));
    await page.evaluate(() => {
      const bt = Array.from(document.querySelectorAll('.dbx-actions .btn')).find((b) => /Nova tarefa/.test(b.textContent));
      if (bt) bt.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    const modalTarefa = await page.evaluate(() => !!document.querySelector('#tf-titulo'));
    ok(modalTarefa, 'botÃ£o Nova tarefa abre modal funcional (botÃµes: ' + botoesPainel.join(', ') + ')');
    if (modalTarefa) {
      await page.type('#tf-titulo', 'Teste automÃ¡tico');
      await page.click('#tf-salvar');
      await new Promise((r) => setTimeout(r, 400));
      const criada = await page.evaluate(() => window.ECOMIM.modules.tarefas.pendentes().some((t) => t.titulo === 'Teste automÃ¡tico'));
      ok(criada, 'tarefa realmente criada no mÃ³dulo');
    }

    // REGRESSÃO: mudanças combinadas não podem se desfazer mutuamente
    await page.evaluate(() => window.ECOMIM_APP.renderView('config'));
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => {
      const fm = document.querySelector('#pz-fundomodo');
      fm.value = 'padrao'; fm.dispatchEvent(new Event('change'));
      const ta = document.querySelector('#pz-temaart');
      ta.value = 'neon'; ta.dispatchEvent(new Event('change'));
      const ia = document.querySelector('#pz-iaativa');
      ia.checked = false; ia.dispatchEvent(new Event('change'));
    });
    await new Promise((r) => setTimeout(r, 200));
    // agora mexe em OUTRAS opções (zoom e cor) — nada acima pode ser desfeito
    await page.evaluate(() => {
      const z = document.querySelector('#pz-zoom');
      z.value = '110'; z.dispatchEvent(new Event('change'));
      const cor = document.querySelector('#pz-destaque');
      cor.value = '#ff8800'; cor.dispatchEvent(new Event('input'));
    });
    await new Promise((r) => setTimeout(r, 300));
    const combinado = await page.evaluate(() => ({
      fundo: document.documentElement.getAttribute('data-fundo'),
      arte: document.documentElement.getAttribute('data-tema-art'),
      iaOff: document.documentElement.classList.contains('ia-off'),
      zoomSalvo: JSON.parse(localStorage.getItem('ecomim_aparencia')).zoom,
      destaqueSalvo: JSON.parse(localStorage.getItem('ecomim_aparencia')).destaque,
    }));
    ok(combinado.fundo === 'padrao' && combinado.arte === 'neon' && combinado.iaOff &&
       combinado.zoomSalvo === 110 && combinado.destaqueSalvo === '#ff8800',
      'mudança em zoom/cor preserva fundo, animação e IA (' + JSON.stringify(combinado) + ')');

    // Persistência após recarregar a página
    await page.reload({ waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 2500));
    const posReload = await page.evaluate(() => ({
      fundo: document.documentElement.getAttribute('data-fundo'),
      arte: document.documentElement.getAttribute('data-tema-art'),
      iaOff: document.documentElement.classList.contains('ia-off'),
    }));
    ok(posReload.fundo === 'padrao' && posReload.arte === 'neon' && posReload.iaOff,
      'configurações sobrevivem ao recarregar (' + JSON.stringify(posReload) + ')');

    // RESET GERAL
    await page.evaluate(() => window.ECOMIM_APP.renderView('config'));
    await new Promise((r) => setTimeout(r, 300));
    // clique via DOM: o botão fica abaixo da dobra e o hit-test do puppeteer falha
    await page.evaluate(() => { window.confirm = () => true; document.querySelector('#pz-reset').click(); });
    await new Promise((r) => setTimeout(r, 1200));
    const resetOk = await page.evaluate(() => {
      const ap = JSON.parse(localStorage.getItem('ecomim_aparencia') || '{}');
      return {
        bgDiferente: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().toLowerCase() !== '#0a1118',
        semCores: !ap.destaque && !ap.fundo,
        marcaNEITZEL: document.querySelector('.ecomim-brand-name')?.textContent === 'NEITZEL',
      };
    });
    ok(resetOk.bgDiferente && resetOk.semCores && resetOk.marcaNEITZEL,
      'reset geral restaura cores e identidade (' + JSON.stringify(resetOk) + ')');

    ok(erros.length === 0, 'sem erros JS' + (erros.length ? ' â†’ ' + erros.slice(0, 3).join(' | ') : ''));
  } finally { await browser.close().catch(() => {}); }
  console.log(falhas ? '\nE2E PERSONALIZAÃ‡ÃƒO COM FALHAS: ' + falhas : '\nE2E DA PERSONALIZAÃ‡ÃƒO PASSOU âœ”');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('ERRO FATAL:', e.message); process.exit(1); });
