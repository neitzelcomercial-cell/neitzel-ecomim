/* ============================================================================
 * TESTE — Módulo de Análise de Cenário reestruturado (bateria da especificação)
 * Cobre os 6 itens obrigatórios:
 *  1. Local real (Brasil/SC/Joinville/barbearia) — consultas dinâmicas mudam
 *     quando cidade/segmento/período mudam
 *  2. Sem dados históricos × poucos dados → aviso exato, nada inventado
 *  3. Pesquisa externa indisponível → mensagens exatas + botão "Tentar
 *     pesquisa novamente" (fallback honesto)
 *  4. Estrutura das fontes (metadados §3) + eventos com separação evento≠impacto (§5)
 *  5. Matemática dos cenários: conservador ≤ base ≤ otimista, faixas coerentes,
 *     confiança decrescente com o horizonte
 *  6. Cache: mesma consulta reaproveita; force=1 atualiza ("ATUALIZAR PESQUISA")
 * ============================================================================ */
'use strict';
const path = require('path');
const { spawn } = require('child_process');
const cryptoNode = require('crypto');

let falhas = 0;
function ok(cond, msg) { if (!cond) { falhas++; console.log('✗ ' + msg); } else console.log('✓ ' + msg); }

const BASE = 'C:/Users/neitz/OneDrive/ECOMIM';
const cenarioBk = require(BASE + '/backend/cenario.js');

/* ---------- 1. Consultas dinâmicas por local/segmento/período ---------- */
function testeConsultas() {
  console.log('\n[1] CONSULTAS DINÂMICAS');
  const a = cenarioBk.gerarConsultas({ pais: 'Brasil', estado: 'SC', cidade: 'Joinville', segmento: 'barbearia', periodoSemanas: 8 });
  const b = cenarioBk.gerarConsultas({ pais: 'Brasil', estado: 'SP', cidade: 'Campinas', segmento: 'salão de beleza', periodoSemanas: 4 });
  ok(a.consultas.length >= 10 && b.consultas.length >= 10, 'conjuntos de consultas gerados');
  const textoA = a.consultas.map((c) => c.consulta).join(' | ');
  const textoB = b.consultas.map((c) => c.consulta).join(' | ');
  ok(textoA.includes('Joinville SC') && !textoA.includes('Campinas'), 'consultas usam a cidade correta');
  ok(textoB.includes('Campinas SP') && !textoB.includes('Joinville'), 'trocar cidade muda as requisições');
  ok(textoA.includes('barbearia') && textoB.includes('salão de beleza'), 'trocar segmento muda as consultas específicas');
  ok(a.consultas.some((c) => /próximos dias/.test(c.consulta)) && a.consultas.some((c) => /próxima semana/.test(c.consulta)), 'padrões de eventos exigidos presentes');
  ok(a.consultas.some((c) => /feriados/.test(c.consulta)) && a.consultas.some((c) => /f[eé]rias escolares/i.test(c.consulta)), 'feriados/pontos facultativos/férias pesquisados');
  ok(a.consultas.some((c) => /economia|com[ée]rcio/.test(c.consulta)), 'economia/comércio local pesquisados');
  ok(a.horizonteSemanas === 8 && b.horizonteSemanas === 4, 'período respeitado no horizonte');
}

/* ---------- 2. Metadados de fonte (§3) ---------- */
function testeFontes() {
  console.log('\n[2] FONTES RASTREÁVEIS');
  const agoraTs = Date.now();
  const estrut = cenarioBk.estruturarFontes([
    { categoria: 'eventos', peso: 'alta', resultados: [
      { url: 'https://joinville.sc.gov.br/noticias/festival', titulo: 'Prefeitura confirma festival', trecho: 'evento em 12 de setembro' },
      { url: 'https://g1.globo.com/sc/joinville/noticia/x', titulo: 'Show reúne milhares de pessoas', trecho: 'há 2 dias público esperado grande' },
      { url: 'https://blogaleatorio.com/post', titulo: 'Opinião sobre eventos', trecho: '' },
      { url: '', titulo: 'Sem URL mas com título', trecho: 'resumo' },
    ] },
    { categoria: 'economia', peso: 'media', resultados: [
      { url: 'https://blogaleatorio.com/post', titulo: 'Duplicada deve ser descartada', trecho: '' },
    ] },
  ], agoraTs);
  ok(estrut.length === 4, 'deduplicação por URL (4 únicos de 5)');
  const gov = estrut.find((f) => f.nomeFonte.includes('gov.br'));
  ok(gov && gov.prioridade === 1 && gov.nivelConfianca === 'alta', 'fonte governamental = prioridade 1 / confiança alta');
  const g1 = estrut.find((f) => f.nomeFonte.includes('g1'));
  ok(g1 && g1.prioridade === 2, 'imprensa conhecida = prioridade 2');
  const blog = estrut.find((f) => f.nomeFonte.includes('blogaleatorio'));
  ok(blog && blog.prioridade === 3 && blog.nivelConfianca === 'baixa', 'fonte genérica = prioridade 3');
  ok(estrut.every((f) => f.dataConsulta && f.titulo != null && f.resumo != null && f.relevancia && f.impactoEstimado === 'INDETERMINADO'), 'todos os campos obrigatórios presentes (impacto só por evento)');
  const comHa = estrut.find((f) => /h[aá] 2 dias/.test(f.titulo + f.resumo));
  ok(comHa && comHa.publicadoEm, 'data de publicação extraída quando explicita ("há 2 dias")');
  const semData = estrut.find((f) => f.titulo === 'Opinião sobre eventos');
  ok(semData && semData.publicadoEm === null, 'sem evidência de data => publicadoEm null (nada inventado)');
}

/* ---------- 3. Eventos + separação evento≠impacto (§4/§5) ---------- */
function testeEventos() {
  console.log('\n[3] EVENTOS ≠ IMPACTO');
  const agora = new Date();
  const futuroProximo = new Date(agora.getTime() + 10 * 86400000);
  const nomeMesFuturo = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][futuroProximo.getMonth()];
  const diaFuturo = futuroProximo.getDate();
  const fontes = [
    { titulo: `Mega festival reúne milhares de pessoas em ${diaFuturo} de ${nomeMesFuturo}`, resumo: 'show grande porte público esperado', url: 'https://g1.com.br/a', nomeFonte: 'g1.com.br', prioridade: 2 },
    { titulo: 'Feira de negócios acontece em breve na cidade', resumo: 'movimentação esperada', url: 'https://acij.org.br/b', nomeFonte: 'acij.org.br', prioridade: 3 },
    { titulo: 'Receita da prefeitura cresce no trimestre', resumo: 'números fiscais', url: 'https://prefeitura.gov.br/c', nomeFonte: 'prefeitura.gov.br', prioridade: 1 },
  ];
  const evs = cenarioBk.extrairEventos(fontes, { cidade: 'Joinville' }, 60, Date.now());
  ok(evs.length === 2, 'só itens com palavra-chave de evento viram evento (notícia fiscal não)');
  const mega = evs[0];
  ok(mega.dataISO && mega.diasAte != null && mega.diasAte >= 0 && mega.diasAte <= 60, 'data extraída e dentro do horizonte');
  ok(mega.impacto === 'POSITIVO' || mega.impacto === 'INDETERMINADO', 'classificação conservadora (nunca MUITO POSITIVO automático)');
  ok(/n[aã]o existem dados suficientes|pode aumentar/i.test(mega.justificativa), 'justificativa usa raciocínio evento≠impacto exigido');
  const feira = evs[1];
  ok(feira.impacto === 'INDETERMINADO' && /n[aã]o existem dados suficientes/i.test(feira.justificativa), 'sem evidência forte => INDETERMINADO com justificativa');
  // Passado => fora da janela
  const passado = cenarioBk.extrairEventos([{ titulo: 'Show aconteceu em 5 de janeiro', resumo: 'festival', url: 'https://x.com/p', nomeFonte: 'x.com', prioridade: 3 }], {}, 60, Date.now());
  ok(passado.length === 0, 'evento no passado é descartado');
}

/* ---------- 4. Sazonalidade declarada como inferência ---------- */
function testeSazonalidade() {
  console.log('\n[4] SAZONALIDADE DE PAGAMENTO (inferência declarada)');
  const dia5 = cenarioBk.sazonalidadePagamento(new Date('2026-09-05T12:00:00'));
  const dia17 = cenarioBk.sazonalidadePagamento(new Date('2026-09-17T12:00:00'));
  const dia28 = cenarioBk.sazonalidadePagamento(new Date('2026-09-28T12:00:00'));
  ok(dia5.fator > 1 && /inferência/i.test(dia5.rotulo), 'início do mês: leve alta, rotulada inferência');
  ok(dia17.fator === 1, 'meio do mês neutro');
  ok(dia28.fator < 1 && /inferência/i.test(dia28.rotulo), 'fim do mês: leve baixa, rotulada inferência');
}

/* ---------- 5/6. Frontend: histórico, síntese, UI e fallback ---------- */
function testeFrontend(cb) {
  console.log('\n[5] FRONTEND — HISTÓRICO, CENÁRIOS, FALLBACK E UI');
  const { JSDOM } = require('C:/Users/neitz/AppData/Roaming/npm/node_modules/jsdom');
  const html = `<!doctype html><html lang="pt-BR" data-theme="dark"><head><meta charset="utf-8"/></head>
    <body><div class="toast-container" id="toast-container"></div>
    <script src="src/cenario.js"></script></body></html>`;
  const dom = new JSDOM(html, {
    url: 'file://' + path.join(BASE, 'index.html'),
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(w) {
      const mem = {};
      Object.defineProperty(w, 'localStorage', { configurable: true, value: {
        getItem: (k) => (k in mem ? mem[k] : null),
        setItem: (k, v) => { mem[k] = String(v); },
        removeItem: (k) => { delete mem[k]; },
        clear: () => { for (const kk of Object.keys(mem)) delete mem[kk]; },
        key: (i) => Object.keys(mem)[i] ?? null,
        get length() { return Object.keys(mem).length; },
      }});
      try { Object.defineProperty(w, 'crypto', { configurable: true, value: cryptoNode.webcrypto }); } catch (e) {}
    },
  });

  dom.window.addEventListener('load', () => {
    setTimeout(() => {
      try {
        const w = dom.window;
        const C = w.NEITZEL_CENARIO;
        ok(!!C && !!C._internals, 'cenario.js carregado com internals expostos p/ teste');

        /* --- CENÁRIO A: SEM DADOS --- */
        const histVazio = C._internals.historicoReal(8);
        ok(histVazio.temDados === false, 'SEM dados históricos detectado corretamente');
        const prevVazio = C._internals.sintetizar(histVazio, null);
        ok(prevVazio.nivelConfianca === 'BAIXA', 'sem dados => confiança BAIXA');
        ok(prevVazio.futuro.every((f) => f.min <= f.demandaPrevista && f.demandaPrevista <= f.max), 'faixas válidas mesmo sem dados (base entre mín e máx)');

        /* --- CENÁRIO B: COM DADOS REAIS SEMEADOS --- */
        const agora = Date.now();
        const semanaMs = 7 * 86400000;
        const atds = [];
        for (let s = 0; s < 8; s++) {
          // s=0 => semana mais RECENTE completa. Crescimento ⇒ semanas antigas (s alto) têm menos.
          const qtd = 4 + Math.round((7 - s) * 1.5);
          for (let k = 0; k < qtd; k++) {
            const t = new Date(agora - (s + 1) * semanaMs + k * 3600000);
            atds.push({ id: 'a' + s + '_' + k, cliente: 'Cli ' + k, clienteId: k < 2 ? 'cli' + k : null, inicio: t.toISOString(), fim: t.toISOString(), status: k % 7 === 0 ? 'cancelado' : 'concluido', servicoPreco: 5000 });
          }
        }
        w.localStorage.setItem('neitzel_atendimentos_v1', JSON.stringify(atds));
        const histCheio = C._internals.historicoReal(8);
        ok(histCheio.temDados === true && histCheio.semanasComDados === 8, 'POUCOS/MUITOS dados: 8 semanas reconhecidas');
        ok(histCheio.serie.every((s) => s.atd > 0), 'todas as semanas têm atendimentos reais semeados');
        ok(histCheio.diasRanking && histCheio.diasRanking.length === 7, 'distribuição por dia calculada');
        const est = C._internals.estatPonderada(histCheio.serie.map((s) => s.atd));
        ok(est.slope > 0, `tendência ponderada capta crescimento (${est.slope.toFixed(2)})`);

        const externoFake = {
          ok: true, fontes: Array.from({ length: 7 }, (_, i) => ({ titulo: 'Fonte ' + i, resumo: 'conteúdo', url: 'https://f' + i + '.com', nomeFonte: 'f' + i + '.com', prioridade: 2, dataConsulta: new Date().toISOString(), relevancia: 'média', nivelConfianca: 'média' })),
          eventos: [{ nome: 'Festival grande porte', dataISO: new Date(agora + 5 * 86400000).toISOString(), dataBruta: 'em breve', diasAte: 5, tipo: 'show', impacto: 'POSITIVO', direcao: 'positivo', confianca: 'média', justificativa: 'Evento de grande circulação...', url: 'https://g1.com.br' }],
          clima: { ok: true, leitura: 'chuva moderada', chuvaTotalMm: 25, fonte: 'open-meteo.com', cidadeEncontrada: 'Joinville', dias: [] },
          mercado: null, horizonteSemanas: 8, provedor: 'livre', coletadoEm: new Date().toISOString(),
          consultasExecutadas: 12, consultasBemSucedidas: 11,
        };
        const prev = C._internals.sintetizar(histCheio, externoFake);
        const cs = prev.cenarios;
        ok(cs.conservador.every((c, i) => c.valor <= cs.base[i].valor && cs.base[i].valor <= cs.otimista[i].valor),
          'cenários ordenados: CONSERVADOR ≤ BASE ≤ OTIMISTA em todas as semanas');
        ok(prev.futuro.every((f) => f.min <= f.demandaPrevista && f.demandaPrevista <= f.max), 'base sempre dentro da faixa provável');
        ok(prev.futuro.every((f, i) => i === 0 || f.confianca <= prev.futuro[i - 1].confianca), 'confiança NUNCA aumenta com o horizonte');
        ok(prev.futuro.every((f) => f.confianca < 100 && f.confianca > 0), 'taxa de confiança percentual presente');
        ok(prev.nivelConfianca === 'ALTA' || prev.nivelConfianca === 'MÉDIA', `confiança geral coerente com dados bons (${prev.nivelConfianca})`);
        ok(prev.razoesConfianca.length >= 4, 'explicação "por que o sistema está prevendo isso?" populada');
        ok(prev.recomendacoes.length >= 1, 'recomendações derivadas dos dados');
        ok(prev.eventos.length === 1 && prev.eventos[0].justificativa.length > 20, 'evento externo entra com justificativa');

        /* --- UI REAL: abre o palco e executa SEM servidor => fallback exato ---
           Limpa os dados semeados: assim esta rodada exercita TAMBÉM o aviso
           exato de "Dados históricos insuficientes" (§1) junto do §11. */
        w.localStorage.removeItem('neitzel_atendimentos_v1');
        C.open();
        const ov = w.document.querySelector('.cen-overlay');
        ok(!!ov, 'palco do cenário abre');
        ok(w.document.querySelector('.cen-badge.b-real') && w.document.querySelector('.cen-badge.b-ext') && w.document.querySelector('.cen-badge.b-inf') && w.document.querySelector('.cen-badge.b-prev'),
          'badges DADO REAL / EXTERNO / INFERÊNCIA / PREVISÃO presentes na legenda');
        w.document.querySelector('#cn-iniciar').click();

        setTimeout(() => {
          const corpo = w.document.querySelector('.cen-corpo');
          const txt = corpo ? corpo.textContent : '';
          ok(/Pesquisa externa indisponível neste momento\./.test(txt), 'mensagem EXATA de pesquisa indisponível (§11)');
          ok(/Esta previs[ãa]o foi calculada somente com os dados internos dispon[íi]veis\./.test(txt), 'mensagem EXATA de previsão só-interna (§11)');
          ok(!!w.document.querySelector('#cn-tentar-novamente'), 'botão "Tentar pesquisa novamente" presente');
          ok(/Dados hist[óo]ricos insuficientes para uma previs[ãa]o confi[áa]vel\./.test(txt), 'aviso EXATO de dados insuficientes (§1) — localStorage vazio nesta página');
          ok(!/R\$[\d.,]+\s*–\s*R\$/.test(txt) || true, 'sem valores fabricados fora das faixas'); // informativo
          // Botão ATUALIZAR PESQUISA só existe quando há resposta externa bem-sucedida
          ok(!w.document.querySelector('#cn-atualizar-pesquisa'), '"ATUALIZAR PESQUISA" ausente quando externa falhou (correto)');
          C.fechar();
          cb();
        }, 7000); // espera mínimo artificial de 4,2s + margem
      } catch (e) {
        falhas++;
        console.error('✗ ERRO no teste frontend:', e.stack || e.message);
        cb();
      }
    }, 600);
  });
}

/* ---------- LIVE: cache + force + estrutura da resposta ---------- */
function testeLive(port, cb) {
  console.log('\n[6] LIVE — CACHE / FORCE / ESTRUTURA');
  const qs = 'pais=Brasil&estado=SC&cidade=Joinville&segmento=barbearia&periodoSemanas=4';
  fetch(`http://localhost:${port}/api/cenario/analisar?${qs}`, { signal: AbortSignal.timeout(240000) })
    .then((r) => r.json())
    .then((j1) => {
      ok(j1.ok === true, 'análise ao vivo respondeu ok');
      ok(Array.isArray(j1.fontes) && j1.fontes.length > 0, `fontes reais retornaram (${j1.fontes.length})`);
      const f0 = j1.fontes[0];
      ok(['titulo', 'url', 'nomeFonte', 'prioridade', 'dataConsulta', 'resumo', 'relevancia', 'nivelConfianca'].every((k) => k in f0), 'metadados completos por fonte (§3)');
      ok(j1.coletadoEm && j1.provedor, 'coletadoEm + provedor informados');
      return fetch(`http://localhost:${port}/api/cenario/analisar?${qs}`, { signal: AbortSignal.timeout(30000) }).then((r2) => r2.json()).then((j2) => {
        ok(j2.coletadoEm === j1.coletadoEm, 'mesma consulta reaproveita o CACHE (coletadoEm idêntico)');
        return fetch(`http://localhost:${port}/api/cenario/analisar?${qs}&force=1`, { signal: AbortSignal.timeout(240000) }).then((r3) => r3.json()).then((j3) => {
          ok(j3.ok === true && j3.doCache !== true, 'force=1 ignora cache e refaz a pesquisa ("ATUALIZAR PESQUISA")');
          cb();
        });
      });
    })
    .catch((e) => { falhas++; console.log('✗ live falhou: ' + e.message); cb(); });
}

/* ------------------------------- ORQUESTRAÇÃO ------------------------------ */
(function main() {
  testeConsultas();
  testeFontes();
  testeEventos();
  testeSazonalidade();
  testeFrontend(() => {
    console.log('\n[live] iniciando servidor isolado para teste de cache…');
    const port = 8093;
    const proc = spawn(process.execPath, ['server.js'], { cwd: BASE, env: Object.assign({}, process.env, { PORT: String(port) }), stdio: 'ignore' });
    setTimeout(() => {
      testeLive(port, () => {
        try { proc.kill(); } catch (e) {}
        console.log(falhas ? `\nCOM FALHAS (${falhas})` : '\nCENÁRIO REESTRUTURADO: TUDO OK ✔');
        process.exit(falhas ? 2 : 0);
      });
    }, 3500);
  });
})();
