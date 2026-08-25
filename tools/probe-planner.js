/* Probe do PLANNER — fluxos reais no navegador (dia/mês, modal, conflitos).
 * Uso: node tools/probe-planner.js */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const puppeteer = require('puppeteer-core');

const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
if (!exe) { console.error('Nenhum navegador'); process.exit(1); }
const raiz = 'C:/Users/neitz/OneDrive/ECOMIM';
const PORTA = 8151;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg' };
const servidor = http.createServer((req, res) => {
  let c = decodeURIComponent(req.url.split('?')[0]); if (c === '/') c = '/SISTEMA NEITZEL.html';
  fs.readFile(path.join(raiz, c), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(c)] || 'octet' }); res.end(d); });
});

let falhas = 0;
function registrar(nome, ok, detalhe) {
  if (!ok) falhas++;
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nome}${detalhe ? ' (' + detalhe + ')' : ''}`);
}

(async () => {
  await new Promise((r) => servidor.listen(PORTA, r));
  const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1400, height: 900 } });
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  page.on('dialog', async (d) => { await d.accept(); });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('ecomim_theme', 'dark');
    localStorage.setItem('ecomim_os_security_v1', JSON.stringify({ onboarding: true }));
    localStorage.setItem('ecomim_aparencia', JSON.stringify({ tema: 'dark' }));
  });
  await page.goto(`http://localhost:${PORTA}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));

  const irPlanner = () => page.evaluate(() => { try { window.ECOMIM_APP.renderView('planner'); } catch (e) {} });

  // Semear serviço + cliente para o modal
  await page.evaluate(() => {
    const O = window.NEITZEL_OPS || window.O;
    try {
      O.servicos.add({ nome: 'Corte Masculino', preco: 5000, custo: 1500, duracaoMin: 40 });
      O.servicos.add({ nome: 'Barba Terapia', preco: 3500, custo: 800, duracaoMin: 30 });
    } catch (e) {}
    try { window.ECOMIM.modules.clientes.addCliente({ nome: 'Cliente Teste Zulu', telefone: '51999990000' }); } catch (e) {}
  });

  /* ---------- 1. NAVEGAÇÃO DE MÊS NÃO PULA MESES ---------- */
  await irPlanner();
  await page.evaluate(() => {
    const st = document.querySelector('.planner-toolbar');
    // força estado: março de 2026 (31/mar é terça)
    const ui = window.NEITZEL_OPS_UI;
    // acessa o estado interno via botão: renderiza mês de março indo pelo DOM não dá; usa API interna:
  });
  // Semeia direto no estado interno através de re-render com base manipulada:
  const labelMar = await page.evaluate(() => {
    const ui = window.NEITZEL_OPS_UI;
    // hack controlado: recria view com base em 31/mar/2026 usando função exposta? Não exposta.
    return null;
  });

  /* Estratégia robusta: clicar Anterior/Próximo partindo do mês ATUAL até ler labels distintos.
     Melhor: injetar data-base via closure não é possível; usamos o fluxo real:
     vai para Mês, clica "Próximo" 1× e compara o rótulo <b> antes/depois. */
  await irPlanner();
  await page.evaluate(() => { [...document.querySelectorAll('.planner-views button')].find((b) => b.dataset.v === 'mes').click(); });
  const rot0 = await page.evaluate(() => document.querySelector('.planner-toolbar b').textContent);
  // Escolhe um dia 31 se existir no mês exibido; senão pula meses até achar
  const temDia31 = await page.evaluate(() => [...document.querySelectorAll('.planner-mday .pm-n')].some((n) => n.textContent === '31'));
  if (!temDia31) {
    for (let i = 0; i < 12 && !(await page.evaluate(() => [...document.querySelectorAll('.planner-mday .pm-n')].some((n) => n.textContent === '31'))); i++) {
      await page.evaluate(() => [...document.querySelectorAll('.planner-toolbar button')].find((b) => /Próximo/.test(b.textContent)).click());
      await new Promise((r) => setTimeout(r, 60));
    }
  }
  const mesCom31 = await page.evaluate(() => document.querySelector('.planner-toolbar b').textContent);
  // Estar no DIA 31 (clique na célula) e então Próximo → deve ir para o mês seguinte (não pular 2)
  await page.evaluate(() => { [...document.querySelectorAll('.planner-mday')].find((c) => c.querySelector('.pm-n') && c.querySelector('.pm-n').textContent === '31' && !c.classList.contains('other')).click(); });
  await new Promise((r) => setTimeout(r, 80));
  registrar('célula dia 31 → visão DIA', await page.evaluate(() => !!document.querySelector('.planner-day-list')));
  const rotDia31 = await page.evaluate(() => document.querySelector('.planner-toolbar b').textContent);
  await page.evaluate(() => { [...document.querySelectorAll('.planner-toolbar button')].find((b) => b.dataset.v === 'mes').click(); });
  await new Promise((r) => setTimeout(r, 60));
  await page.evaluate(() => { [...document.querySelectorAll('.planner-toolbar button')].find((b) => /Próximo/.test(b.textContent)).click(); });
  await new Promise((r) => setTimeout(r, 80));
  const rotPos = await page.evaluate(() => document.querySelector('.planner-toolbar b').textContent);
  const mesIdx = (s) => ['january','february','march','april','may','june','july','august','september','october','november','december'].findIndex((m) => s.toLowerCase().includes(m));
  const diferencaOk = (() => {
    const a = new Date(rotDia31 + ' 2026'); const b = new Date(rotPos + ' 2026');
    if (isNaN(a) || isNaN(b)) return true; // fallback: apenas exige rótulo diferente e sem pulo de 2 via nomes pt-BR abaixo
    return true;
  })();
  const mesesPt = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const idx = (s) => mesesPt.findIndex((m) => s.toLowerCase().includes(m));
  registrar('navegação mensal avança EXATAMENTE 1 mês (dia 31)', idx(rotPos) !== -1 && idx(rotDia31) !== -1 && ((idx(rotPos) - idx(rotDia31) + 12) % 12) === 1, `${rotDia31} → ${rotPos}`);

  /* ---------- 2. CÉLULA DE MÊS VIZINHO VAI PARA A DATA CERTA ---------- */
  const clicouVizinhanca = await page.evaluate(() => {
    const celulas = [...document.querySelectorAll('.planner-mday.other')];
    if (!celulas.length) return null;
    const alvo = celulas[0];
    const num = alvo.querySelector('.pm-n').textContent;
    alvo.click();
    return num;
  });
  if (clicouVizinhanca !== null) {
    await new Promise((r) => setTimeout(r, 80));
    const tituloDia = await page.evaluate(() => (document.querySelector('.planner-day-list')?.closest('.card')?.querySelector('h4')?.textContent) || '');
    registrar('clique em célula vizinha abre dia correspondente', new RegExp('\\b' + clicouVizinhanca + '\\b').test(tituloDia), tituloDia.trim().slice(0, 50));
  } else registrar('clique em célula vizinha abre dia correspondente', true, 'sem células vizinhas neste grid');

  /* ---------- 3. VALIDAÇÃO FIM <= INÍCIO BLOQUEIA ---------- */
  await irPlanner();
  await page.evaluate(() => { document.querySelector('#btn-novo-atendimento, .planner-toolbar .btn-primary')?.click(); });
  await new Promise((r) => setTimeout(r, 120));
  const abriuModal = await page.evaluate(() => !!document.getElementById('at-clinome'));
  registrar('modal de atendimento abre', abriuModal);
  if (abriuModal) {
    await page.evaluate(() => {
      document.getElementById('at-clinome').value = 'Paciente Horário';
      document.getElementById('at-data').value = '2026-03-31';
      document.getElementById('at-hini').value = '10:00';
      document.getElementById('at-hfim').value = '09:00';
      document.querySelector('[data-save]').click();
    });
    await new Promise((r) => setTimeout(r, 120));
    const aindaAberto = await page.evaluate(() => !!document.getElementById('at-clinome'));
    const toastTxt = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | '));
    registrar('FIM antes do INÍCIO é bloqueado', aindaAberto && /DEPOIS/i.test(toastTxt), toastTxt.slice(0, 60));

    /* ---------- 4. TROCA DE SERVIÇO GRAVA PREÇO CERTO ---------- */
    await page.evaluate(() => {
      const cli = [...document.querySelectorAll('#at-cli option')].find((o) => /Cliente Teste Zulu/.test(o.textContent));
      if (cli) { document.getElementById('at-cli').value = cli.value; document.getElementById('at-cli').dispatchEvent(new Event('change')); }
      document.getElementById('at-hfim').value = '11:00';
      document.getElementById('at-resp').value = 'Mesmo Resp';
      const sv = [...document.querySelectorAll('#at-serv option')].find((o) => /Barba Terapia/.test(o.textContent));
      if (sv) { document.getElementById('at-serv').value = sv.value; document.getElementById('at-serv').dispatchEvent(new Event('change')); }
    });
    const precoCampo = await page.evaluate(() => document.getElementById('at-prec').value);
    registrar('trocar serviço atualiza preço ao vivo (35,00)', precoCampo === '35.00', precoCampo);
    const nomeSync = await page.evaluate(() => document.getElementById('at-clinome').value);
    registrar('escolher cliente sincroniza nome', nomeSync === 'Cliente Teste Zulu', nomeSync);
    await page.evaluate(() => document.querySelector('[data-save]').click());
    await new Promise((r) => setTimeout(r, 200));
    const gravado = await page.evaluate(() => {
      const O = window.NEITZEL_OPS || window.O;
      const a = (O.atendimentos.list() || []).find((x) => x.cliente === 'Cliente Teste Zulu');
      return a ? { preco: a.servicoPreco, ini: a.inicio } : null;
    });
    registrar('atendimento gravado com preço do serviço escolhido (centavos)', !!gravado && gravado.preco === 3500, gravado ? String(gravado.preco) : 'não gravou');

    /* ---------- 5. CONFLITO DE HORÁRIO EMITE AVISO ---------- */
    await page.evaluate(() => { document.querySelector('.planner-toolbar .btn-primary')?.click(); });
    await new Promise((r) => setTimeout(r, 120));
    await page.evaluate(() => {
      document.getElementById('at-clinome').value = 'Outro Cliente';
      document.getElementById('at-data').value = '2026-03-31';
      document.getElementById('at-hini').value = '10:30';
      document.getElementById('at-hfim').value = '11:30';
      const resp = document.getElementById('at-resp'); resp.value = 'Mesmo Resp';
      document.querySelector('[data-save]').click();
    });
    await new Promise((r) => setTimeout(r, 200));
    const avisos = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | '));
    registrar('conflito de horário emite aviso', /sobrepõe/i.test(avisos), avisos.slice(-80));
  }

  await browser.close();
  servidor.close();
  console.log(falhas === 0 ? '\nPLANNER: TUDO FUNCIONANDO ✔' : '\nPLANNER FALHOU: ' + falhas);
  process.exit(falhas === 0 ? 0 : 2);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });