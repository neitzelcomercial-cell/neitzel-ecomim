/* Probe funcional — valida que CADA controle de Configurações e cada animação
 * realmente produzem efeito no DOM. Sai com código != 0 se algo falhar.
 * Uso: node tools/probe-funcional.js */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const puppeteer = require('puppeteer-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const exe = [EDGE, CHROME].find((p) => fs.existsSync(p));
if (!exe) { console.error('Nenhum navegador encontrado'); process.exit(1); }

const raiz = path.join(__dirname, '..');
const PORTA = 8129;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg' };
const servidor = http.createServer((req, res) => {
  let caminho = decodeURIComponent(req.url.split('?')[0]);
  if (caminho === '/') caminho = '/SISTEMA NEITZEL.html';
  fs.readFile(path.join(raiz, caminho), (err, dados) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(caminho)] || 'application/octet-stream' });
    res.end(dados);
  });
});

let falhas = 0;
function registrar(nome, ok, detalhe) {
  if (!ok) falhas++;
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nome}${detalhe ? ' (' + detalhe + ')' : ''}`);
}

(async () => {
  await new Promise((r) => servidor.listen(PORTA, r));
  const browser = await puppeteer.launch({
    executablePath: exe, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'], defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  const errosPagina = [];
  page.on('pageerror', (e) => errosPagina.push(String(e).slice(0, 140)));
  // Headless Edge anuncia reduced-motion por padrão; o sistema respeita — aqui desligamos
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('ecomim_theme', 'dark');
      localStorage.setItem('ecomim_os_security_v1', JSON.stringify({ onboarding: true }));
      const ap = JSON.parse(localStorage.getItem('ecomim_aparencia') || '{}');
      ap.tema = 'dark'; ap.chuva = 'normal';
      localStorage.setItem('ecomim_aparencia', JSON.stringify(ap));
    } catch (e) {}
  });
  await page.goto(`http://localhost:${PORTA}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3500));

  const aplicar = (patch) => page.evaluate((p) => { aplicarAparencia(p); }, patch);
  const cs = (sel, prop, pseudo) => page.evaluate(([s, p, ps]) => {
    const el = document.querySelector(s);
    return el ? getComputedStyle(el, ps || null)[p] : '<sem elemento>';
  }, [sel, prop, pseudo]);
  const attrHtml = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));

  // 1. Tema claro/escuro + favicon
  await aplicar({ tema: 'light' });
  registrar('tema light aplica', (await attrHtml()) === 'light');
  const marcaClaro = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--e-brand').trim());
  registrar('marca azul no claro', marcaClaro === '#2563eb', 'valor=' + marcaClaro);
  registrar('favicon acompanha o tema', (await page.evaluate(() => (document.querySelector('link[rel="icon"]') || {}).href || '')).includes('2563eb'));
  await aplicar({ tema: 'dark' });
  registrar('tema dark volta', (await attrHtml()) === 'dark');

  // 2. Chuva de código: visibilidade + desenho real no canvas
  await aplicar({ chuva: 'off' });
  registrar('chuva OFF esconde canvas', (await cs('.fa-chuva', 'display')) === 'none');
  await aplicar({ chuva: 'normal' });
  const opChuva = parseFloat(await cs('.fa-chuva', 'opacity'));
  registrar('chuva NORMAL com opacidade plena', Math.abs(opChuva - 0.60) < 0.02, 'opacity=' + opChuva);
  await new Promise((r) => setTimeout(r, 1300));
  const glifos = await page.evaluate(() => {
    const c = document.querySelector('.fa-chuva');
    if (!c) return -1;
    const ctx = c.getContext('2d');
    const img = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < img.length; i += 4) if (img[i] > 30) n++;
    return n;
  });
  registrar('chuva DESENHA glifos no canvas', glifos > 150, 'pixels=' + glifos);

  // 3. Modo padrão limpo mantém a chuva viva
  await aplicar({ fundoModo: 'padrao' });
  registrar('modo padrão esconde foto', (await cs('.fa-foto', 'display')) === 'none');
  registrar('modo padrão MANTÉM chuva', (await cs('.fa-chuva', 'display')) !== 'none');
  await aplicar({ fundoModo: 'arte' });

  // 4. Animações autorais realmente pintam
  await aplicar({ temaArt: 'matrix' });
  const bgMatrix = await page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage);
  const animMatrix = await page.evaluate(() => getComputedStyle(document.body, '::before').animationName);
  registrar('autoral MATRIX pinta colunas', /repeating-linear-gradient/.test(bgMatrix), animMatrix);
  await aplicar({ temaArt: 'sakura' });
  registrar('autoral SAKURA pinta pétalas', /radial-gradient/.test(await page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage)));
  await aplicar({ temaArt: '' });
  const conteudoAntes = await page.evaluate(() => getComputedStyle(document.body, '::before').content);
  registrar('autoral NENHUMA limpa o palco', conteudoAntes === 'none' || conteudoAntes === 'normal', 'content=' + conteudoAntes);

  // 5. Controles antes mortos: menu, cartões, letras
  await aplicar({ menu: 'topo' });
  registrar('menu TOPO vira barra horizontal', (await cs('.ecomim-sidebar', 'flexDirection')) === 'row' && await page.evaluate(() => document.documentElement.classList.contains('menu-topo')));
  // compacta exige rebuild da sidebar (mesmo caminho do usuário: select → salvarPz(recriar))
  await page.evaluate(() => { salvarAparencia({ menu: 'compacta' }); aplicarAparencia({ menu: 'compacta' }); try { renderApp(true); } catch (e) {} });
  await new Promise((r) => setTimeout(r, 600));
  registrar('menu COMPACTA colapsa sidebar', await page.evaluate(() => { const s = document.querySelector('.ecomim-sidebar'); return !!s && s.classList.contains('collapsed'); }));
  await page.evaluate(() => { salvarAparencia({ menu: 'lateral' }); aplicarAparencia({ menu: 'lateral' }); try { renderApp(true); } catch (e) {} });
  await new Promise((r) => setTimeout(r, 400));
  registrar('menu LATERAL restaura', (await cs('.ecomim-sidebar', 'flexDirection')) === 'column');
  await aplicar({ cartao: 'flat' });
  const sombraFlat = await page.evaluate(() => {
    const el = document.querySelector('.card, .dbx-card, .kpi-card');
    return el ? getComputedStyle(el).boxShadow : '<sem cartão>';
  });
  registrar('cartão FLAT tira sombra', sombraFlat === 'none', String(sombraFlat).slice(0, 30));
  await aplicar({ cartao: 'padrao' });
  await aplicar({ letraTamanho: 'grande' });
  registrar('letra GRANDE muda o corpo', (await cs('body', 'fontSize')) === '15.5px', await cs('body', 'fontSize'));
  await aplicar({ letraTamanho: 'normal' });
  await aplicar({ botao: 'pill' });
  registrar('botão PÍLULA arredonda', parseFloat(await cs('.btn', 'borderTopLeftRadius')) >= 40, await cs('.btn', 'borderTopLeftRadius'));
  await aplicar({ botao: 'padrao' });
  await aplicar({ fonte: 'mono' });
  registrar('fonte MONO aplica', /Consolas/i.test(await cs('body', 'fontFamily')));
  await aplicar({ fonte: 'sistema' });

  // 6. Destaque personalizado e retorno ao padrão do tema
  await aplicar({ destaque: '#ff8800' });
  registrar('destaque personalizado aplica', (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--e-brand').trim())) === '#ff8800');
  await aplicar({ destaque: '' });
  registrar('destaque vazio volta ao padrão do tema', (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--e-brand').trim())) === '#3ecf8e');

  // 7. Tela de Configurações: os selects agora SALVAM (antes mortos)
  await page.evaluate(() => { try { renderView('config'); } catch (e) {} });
  await new Promise((r) => setTimeout(r, 700));
  const dispara = (id, valor, ev) => page.evaluate(([i, v, e]) => {
    const el = document.getElementById(i);
    if (!el) return false;
    el.value = v;
    el.dispatchEvent(new Event(e || 'change', { bubbles: true }));
    return true;
  }, [id, valor, ev]);
  registrar('abre Configurações', await page.evaluate(() => !!document.getElementById('pz-tamletra')));
  await dispara('pz-tamletra', 'pequeno');
  await dispara('pz-menu', 'compacta');
  await dispara('pz-cartao', 'elevado');
  await dispara('pz-empresa', 'Barbearia Teste LTDA');
  await dispara('pz-empwhats', '51988887777');
  const salvo = await page.evaluate(() => JSON.parse(localStorage.getItem('ecomim_aparencia') || '{}'));
  registrar('select TAMANHO DA LETRA salva', salvo.letraTamanho === 'pequeno', JSON.stringify(salvo.letraTamanho));
  registrar('select MENU salva', salvo.menu === 'compacta', JSON.stringify(salvo.menu));
  registrar('select CARTÃO salva', salvo.cartao === 'elevado', JSON.stringify(salvo.cartao));
  registrar('campo EMPRESA salva na aparência', salvo.empresa === 'Barbearia Teste LTDA');
  const cfgDb = await page.evaluate(() => { try { const c = E.db.get().config; return c && c.empresa ? c.empresa : {}; } catch (e) { return { erro: String(e) }; } });
  registrar('EMPRESA vai para o banco (marca da sidebar)', cfgDb.nome === 'Barbearia Teste LTDA', JSON.stringify(cfgDb.nome || cfgDb.erro || ''));
  registrar('WHATSAPP comercial vai para o banco', cfgDb.whatsapp === '51988887777', JSON.stringify(cfgDb.whatsapp || ''));

  // Estado final limpo para os screenshots seguintes
  await aplicar({ letraTamanho: 'normal', menu: 'lateral', cartao: 'padrao', empresa: '', tema: 'dark' });

  registrar('SEM erros JS na página', errosPagina.filter((e) => !/Failed to fetch/.test(e)).length === 0, errosPagina.join(' | ').slice(0, 120));

  await browser.close();
  servidor.close();
  console.log(falhas === 0 ? '\nPROBE COMPLETO: TUDO FUNCIONANDO ✔' : '\nPROBE FALHOU: ' + falhas + ' item(ns)');
  process.exit(falhas === 0 ? 0 : 2);
})().catch((e) => { console.error(e); process.exit(1); });