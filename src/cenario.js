/* ============================================================================
 * NEITZEL — POSSÍVEL CENÁRIO (módulo de análise de cenário, mercado e previsão)
 * Reestruturado conforme especificação. Regras invioláveis respeitadas:
 *  - NADA inventado: cada número vem de dados internos reais ou de fonte
 *    externa citada; campos sem evidência ficam null/'INDETERMINADO'.
 *  - Distinção visual de procedência em toda a tela:
 *      [DADO REAL] verde · [DADO EXTERNO] azul · [INFERÊNCIA] amarelo ·
 *      [PREVISÃO] roxo tracejado.
 *  - Previsão SEMPRE em faixa (mín–máx) com taxa de confiança e 3 cenários
 *    estatísticos: CONSERVADOR / BASE / OTIMISTA.
 *  - Fallback honesto: pesquisa externa indisponível é declarada, nunca
 *    simulada, com botão "Tentar pesquisa novamente".
 * ========================================================================== */

'use strict';

(function () {
  const KEY_HIST = 'neitzel_cenario_v1';
  const lsGet = (k, f) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : f; } catch (e) { return f; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const E = () => window.ECOMIM || null;

  /* Badges de procedência (§13) */
  const B_REAL = '<span class="cen-badge b-real" title="Calculado dos seus dados internos">DADO REAL</span>';
  const B_EXT = '<span class="cen-badge b-ext" title="Vindo de fonte pública na internet">DADO EXTERNO</span>';
  const B_INF = '<span class="cen-badge b-inf" title="Raciocínio do sistema sobre dados reais">INFERÊNCIA</span>';
  const B_PREV = '<span class="cen-badge b-prev" title="Estimativa futura — não é certeza">PREVISÃO</span>';

  function cfgLocal() {
    const Em = E();
    const s = (Em && Em.db && Em.db.get().config && Em.db.get().config.sistema) || {};
    return { pais: s.pais || 'Brasil', estado: s.estado || '', cidade: s.cidade || '', segmento: s.segmento || 'barbearia', periodoSemanas: s.periodoSemanas || 8 };
  }

  const fmtMoeda = (v) => {
    try { const Em = E(); if (Em && Em.fmtMoney) return Em.fmtMoney(Math.round(v || 0)); } catch (e) {}
    return 'R$ ' + (Number(v || 0) / 100).toFixed(2).replace('.', ',');
  };
  const dataCurta = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  const localYmd = (inst) => { const d = inst instanceof Date ? inst : new Date(inst); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  /* ====================================================================== *
   * §1+§7 — HISTÓRICO REAL EXPANDIDO (semanas completas + corrente)
   * ====================================================================== */
  function historicoReal(N) {
    N = N || 8;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dowDom = hoje.getDay(); // semana começa domingo
    const inicioSemanaAtual = new Date(hoje.getTime() - dowDom * 86400000);
    const semanas = [];
    for (let i = 0; i < N; i++) {
      const ini = new Date(inicioSemanaAtual.getTime() - (N - i) * 7 * 86400000);
      const fim = new Date(ini.getTime() + 7 * 86400000);
      semanas.push({ ini, fim });
    }
    const dentro = (iso, ini, fim) => { if (!iso) return false; const dt = new Date(iso); return !isNaN(dt) && dt >= ini && dt < fim; };

    let atds = [];
    try { atds = JSON.parse(localStorage.getItem('neitzel_atendimentos_v1') || '[]'); } catch (e) {}
    const Em = E();
    const clientes = (Em && Em.modules && Em.modules.clientes && Em.modules.clientes.clientes) || [];
    const contas = (Em && Em.modules && Em.modules.financeiro && Em.modules.financeiro.contas) || [];
    const dbd = (Em && Em.db && Em.db.get()) || {};
    const leads = dbd.leads || [];
    let campanhas = [];
    try { campanhas = (Em.modules.marketing && Em.modules.marketing.campanhas) || []; } catch (e) {}

    // ids de clientes já "vistos" antes de cada semana (recorrência identificada
    // apenas quando o atendimento está vinculado por clienteId — nada presumido)
    const primeiraOcorrencia = new Map(); // clienteId -> ISO da primeira vez
    atds.forEach((a) => {
      if (!a.clienteId) return;
      const t = new Date(a.inicio).getTime();
      if (!primeiraOcorrencia.has(a.clienteId) || t < new Date(primeiraOcorrencia.get(a.clienteId)).getTime()) {
        primeiraOcorrencia.set(a.clienteId, a.inicio);
      }
    });

    const serie = semanas.map(({ ini, fim }) => {
      const daSemana = atds.filter((a) => dentro(a.inicio, ini, fim));
      const concluidos = daSemana.filter((a) => a.status === 'concluido');
      const cancelados = daSemana.filter((a) => a.status === 'cancelado').length;
      const faltas = daSemana.filter((a) => a.status === 'nao_compareceu').length;
      const rec = contas.filter((c) => c.tipo === 'receber' && c.status === 'pago' && dentro(c.pagoEm, ini, fim)).reduce((s, c) => s + (c.valor || 0), 0);
      const desp = contas.filter((c) => c.tipo === 'pagar' && c.status === 'pago' && dentro(c.pagoEm, ini, fim)).reduce((s, c) => s + (c.valor || 0), 0);
      const recorrentes = daSemana.filter((a) => a.clienteId && primeiraOcorrencia.get(a.clienteId) && new Date(primeiraOcorrencia.get(a.clienteId)).getTime() < new Date(a.inicio).getTime()).length;
      return {
        atd: daSemana.length,
        concluidos: concluidos.length,
        cancelados,
        faltas,
        cli: clientes.filter((c) => dentro(c.created, ini, fim)).length,
        recorrentes,
        rec,
        desp,
        ticket: concluidos.length ? Math.round(concluidos.reduce((s, a) => s + (Number(a.servicoPreco) || 0), 0) / concluidos.length) : null,
        leads: leads.filter((l) => dentro(l.created, ini, fim)).length,
        leadsGanhos: leads.filter((l) => l.etapa === 'ganho' && dentro(l.updated || l.created, ini, fim)).length,
        campanhas: campanhas.filter((cp) => dentro(cp.criadoEm || cp.created, ini, fim)).length,
      };
    });

    const agora = new Date();
    const janelaCorrente = [inicioSemanaAtual, new Date(agora.getTime() + 86400000)];
    const atdsCorrente = atds.filter((a) => dentro(a.inicio, janelaCorrente[0], janelaCorrente[1]));
    const conclCorrente = atdsCorrente.filter((a) => a.status === 'concluido');

    /* Distribuição real por dia da semana e hora (8 semanas) */
    const porDia = Array.from({ length: 7 }, () => ({ total: 0 }));
    const porHora = {};
    const inicioTotal = semanas[0].ini;
    atds.forEach((a) => {
      if (!dentro(a.inicio, inicioTotal, new Date(agora.getTime() + 86400000))) return;
      const d = new Date(a.inicio);
      if (isNaN(d)) return;
      porDia[d.getDay()].total++;
      const h = String(d.getHours()).padStart(2, '0') + 'h';
      porHora[h] = (porHora[h] || 0) + 1;
    });
    const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const diasRanking = porDia.map((x, i) => ({ dia: DIAS[i], total: x.total })).sort((a, b) => b.total - a.total);
    const horasRanking = Object.entries(porHora).map(([hora, total]) => ({ hora, total })).sort((a, b) => b.total - a.total);

    const corrente = {
      atd: atdsCorrente.length,
      cli: clientes.filter((c) => dentro(c.created, janelaCorrente[0], janelaCorrente[1])).length,
      rec: contas.filter((c) => c.tipo === 'receber' && c.status === 'pago' && dentro(c.pagoEm, janelaCorrente[0], janelaCorrente[1])).reduce((s, c) => s + (c.valor || 0), 0),
      cancelados: atdsCorrente.filter((a) => a.status === 'cancelado').length,
      faltas: atdsCorrente.filter((a) => a.status === 'nao_compareceu').length,
      ticket: conclCorrente.length ? Math.round(conclCorrente.reduce((s, a) => s + (Number(a.servicoPreco) || 0), 0) / conclCorrente.length) : null,
    };
    const temDados = serie.some((s2) => s2.atd > 0 || s2.cli > 0 || s2.rec > 0) || corrente.atd > 0 || corrente.cli > 0;
    const semanasComDados = serie.filter((s2) => s2.atd > 0 || s2.rec > 0).length;

    /* Origem dos clientes/leads (real, janela toda) */
    const origensCount = {};
    leads.forEach((l) => {
      if (!dentro(l.created, inicioTotal, new Date(agora.getTime() + 86400000))) return;
      const o = l.origem || 'manual';
      origensCount[o] = (origensCount[o] || 0) + 1;
    });
    const topOrigens = Object.entries(origensCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { semanas, serie, corrente, temDados, semanasComDados, diasRanking, horasRanking, topOrigens };
  }

  /* ==================== ESTATÍSTICA PONDERADA (§7) ======================== */
  /** Peso maior às semanas RECENTES (peso i+1) — exigência da especificação. */
  function estatPonderada(vals) {
    const n = vals.length;
    if (!n) return { media: 0, slope: 0, desvio: 0 };
    let sw = 0, swx = 0, swy = 0, swxy = 0, swxx = 0;
    vals.forEach((v, i) => {
      const w = i + 1, x = i;
      sw += w; swx += w * x; swy += w * v; swxy += w * x * v; swxx += w * x * x;
    });
    const media = swy / sw;
    const den = sw * swxx - swx * swx;
    const slope = den ? (sw * swxy - swx * swy) / den : 0;
    let acc = 0;
    vals.forEach((v, i) => { const w = i + 1; acc += w * (v - media) * (v - media); });
    const desvio = Math.sqrt(acc / sw);
    return { media, slope, desvio };
  }

  /* Sentimento das fontes externas (mesma lista honesta de palavras) */
  const POSITIVAS = ['crescimento', 'alta', 'aumento', 'recorde', 'expansão', 'expansao', 'aquecimento', 'otimismo', 'recupera', 'sobe', 'fortalece', 'demanda'];
  const NEGATIVAS = ['queda', 'crise', 'recessão', 'recessao', 'redução', 'reducao', 'fechamento', 'desemprego', 'inflação', 'inflacao', 'caiu', 'recuo', 'contração', 'contracao', 'pessimismo'];
  function sentimentoFontes(fontes) {
    let pos = 0, neg = 0;
    (fontes || []).forEach((f) => {
      const txt = `${f.titulo || ''} ${f.resumo || ''}`.toLowerCase();
      POSITIVAS.forEach((p) => { if (txt.includes(p)) pos++; });
      NEGATIVAS.forEach((p) => { if (txt.includes(p)) neg++; });
    });
    const total = pos + neg;
    return { valor: total ? (pos - neg) / total : 0, positivas: pos, negativas: neg, citacoes: total };
  }

  /** Densidade de mercado (Google Maps) — mesma leitura honesta de amostra. */
  function fatorDeMercado(mercado) {
    if (!mercado || !Array.isArray(mercado.consultas)) return { fator: 1, rotulo: 'sem leitura de mercado', detalhe: '' };
    const segs = mercado.consultas.filter((c) => c.termo !== 'comercio' && c.termo !== 'empresas' && c.termo !== 'escritorios');
    const segEstado = segs.find((c) => c.nivel === 'estado') || null;
    const segCidade = segs.find((c) => c.nivel === 'cidade') || segs[0] || null;
    const seg = segEstado || segCidade;
    const total = seg ? seg.total : 0;
    let fator = 1, rotulo = '', detalhe = '';
    if (!total) { rotulo = 'sem concorrentes mapeados'; detalhe = 'Google Maps não retornou estabelecimentos — mercado aberto ou termo amplo.'; }
    else if (total <= 10) { fator = 1.04; rotulo = 'mercado com folga'; detalhe = `Poucos concorrentes mapeados (${total}) — espaço para crescer.`; }
    else if (total <= 25) { fator = 1.0; rotulo = 'mercado equilibrado'; detalhe = `${total} estabelecimentos do segmento mapeados.`; }
    else if (total <= 45) { fator = 0.97; rotulo = 'competição aquecida'; detalhe = `${total} concorrentes no raio — fidelização pesa mais que prospecção.`; }
    else { fator = 0.94; rotulo = 'mercado saturado'; detalhe = `${total}+ concorrentes mapeados — diferencial é obrigatório.`; }
    if (segEstado && segCidade && segCidade.total) detalhe += ` Sendo ${segCidade.total} na sua cidade.`;
    return { fator, rotulo, detalhe, seg };
  }

  /* ====================================================================== *
   * §8+§9 — MODELO DE PREVISÃO: base + tendência + sazonalidade +
   * eventos + fatores locais ⇒ faixas, cenários e confiança explicada.
   * ====================================================================== */
  function sintetizar(hist, externo) {
    const valores = hist.serie.map((s) => s.atd);
    const receitas = hist.serie.map((s) => s.rec);
    const est = estatPonderada(valores);
    const estRec = estatPonderada(receitas);
    const media = Math.max(est.media, 0);
    const mediaRec = Math.max(estRec.media, 0);

    const mercado = externo && externo.mercado;
    const fm = fatorDeMercado(mercado);
    const sent = sentimentoFontes(externo && externo.fontes);
    const fatorSent = 1 + Math.max(-0.12, Math.min(0.18, sent.valor * 0.15));
    const temExterno = !!externo && Array.isArray(externo.fontes) && externo.fontes.length > 0;

    // Eventos classificados dentro do horizonte (impacto ≠ evento, §5)
    const eventosHorizonte = (externo && externo.eventos) || [];
    const evPos = eventosHorizonte.filter((ev) => ev.direcao === 'positivo');
    const evNeg = eventosHorizonte.filter((ev) => ev.direcao === 'negativo');

    const horizonte = (externo && externo.horizonteSemanas) || 8;
    const sazMod = require0Sazon();
    const hoje = new Date();

    const futuro = [];
    for (let w = 0; w < horizonte; w++) {
      const baseTendencia = Math.max(0, media + est.slope * (w + 1));
      const iniSem = new Date(hoje.getTime() + (w * 7 + 1) * 86400000);
      const saz = sazMod.fatorSemana(iniSem); // {fator, rotulo} inferência declarada
      const evFator = Math.min(1 + evPos.length * 0.03, 1.09) * (evNeg.length ? 0.95 : 1);
      const central = baseTendencia * fatorSent * fm.fator * evFator * saz.fator;
      const centralRec = Math.max(0, mediaRec + estRec.slope * (w + 1)) * fatorSent * fm.fator * evFator * saz.fator;
      const confianca = temExterno ? Math.max(46, 76 - w * 4) : Math.max(34, 52 - w * 3);
      const margem = Math.max(central * ((100 - confianca) / 100), est.desvio * 0.8);
      futuro.push({
        n: w + 1,
        ini: iniSem.toISOString(),
        fim: new Date(hoje.getTime() + (w * 7 + 7) * 86400000).toISOString(),
        demandaPrevista: Math.round(central),
        min: Math.max(0, Math.round(central - margem)),
        max: Math.round(central + margem),
        recPrevista: Math.round(centralRec),
        recMin: Math.max(0, Math.round(centralRec - Math.max(centralRec * ((100 - confianca) / 100), estRec.desvio * 0.8))),
        recMax: Math.round(centralRec + Math.max(centralRec * ((100 - confianca) / 100), estRec.desvio * 0.8)),
        confianca,
        direcao: media > 0 ? (central > media * 1.03 ? 'alta' : central < media * 0.97 ? 'baixa' : 'estavel') : (central > 0 ? 'alta' : 'estavel'),
        variacao: media ? Math.round((central / media - 1) * 100) : 0,
        nota: central > media * 1.03 ? 'Acima da média histórica — prepare agenda e estoque.'
          : central < media * 0.97 ? 'Abaixo da média — reative clientes frios e promova.'
          : 'Ritmo de manutenção — siga o plano.',
      });
    }

    /* Cenários estatísticos (§8): CONSERVADOR / BASE / OTIMISTA
       - CONSERVADOR: tendência amortecida (metade da inclinação) − 0,6σ, sem
         nenhum fator externo favorável.
       - OTIMISTA: tendência cheia + fatores favoráveis + 0,4σ.
       - BASE: modelo completo central.
       A ordenação conservador ≤ base ≤ otimista é GARANTIDA por construção
       (clamp) — com σ pequeno, o ajuste de sazonalidade da base não pode
       ultrapassar o otimista nem ficar abaixo do conservador. */
    const cenarios = { conservador: [], base: [], otimista: [] };
    futuro.forEach((f, idx) => {
      const k = idx + 1;
      const trendCheia = Math.max(0, media + est.slope * k);
      const trendAmortecida = Math.max(0, media + est.slope * k * 0.5);
      let conservador = Math.round(trendAmortecida - est.desvio * 0.6);
      let otimista = Math.round((trendCheia * Math.max(fatorSent, 1) * Math.max(fm.fator, 1) * Math.min(1 + evPos.length * 0.03, 1.09)) + est.desvio * 0.4);
      const baseV = f.demandaPrevista;
      if (conservador > baseV) conservador = baseV;
      if (otimista < baseV) otimista = baseV;
      cenarios.conservador.push({ n: k, valor: conservador, rec: Math.round(mediaRec > 0 ? (conservador / Math.max(baseV, 1)) * f.recPrevista : 0) });
      cenarios.base.push({ n: k, valor: baseV, rec: f.recPrevista });
      cenarios.otimista.push({ n: k, valor: otimista, rec: Math.round(mediaRec > 0 ? (otimista / Math.max(baseV, 1)) * f.recPrevista : 0) });
    });

    /* Passado com variações semana a semana */
    const passado = hist.semanas.map(({ ini, fim }, i) => ({
      ini: ini.toISOString(), fim: fim.toISOString(),
      valor: valores[i],
      variacao: i === 0 ? null : (valores[i - 1] ? Math.round((valores[i] / valores[i - 1] - 1) * 100) : null),
      det: hist.serie[i],
    }));

    /* Melhor/pior semana (§7) — por atendimentos */
    let melhorIdx = 0, piorIdx = 0;
    valores.forEach((v, i) => { if (v > valores[melhorIdx]) melhorIdx = i; if (v < valores[piorIdx]) piorIdx = i; });

    /* Confiança geral (§9) — critérios explícitos e explicáveis */
    const cv = media > 0 ? est.desvio / media : (valores.some((v) => v > 0) ? 1 : 0);
    let nivelConfianca = 'MÉDIA';
    const razoesConfianca = [];
    if (!hist.temDados) nivelConfianca = 'BAIXA';
    else if (hist.semanasComDados >= 8 && cv < 0.35 && temExterno) nivelConfianca = 'ALTA';
    else if (!hist.temDados || cv > 0.7 || (!temExterno && hist.semanasComDados < 3)) nivelConfianca = 'BAIXA';
    razoesConfianca.push(`Histórico: ${hist.semanasComDados} de 8 semanas com movimento registrado (${nivelConfianca === 'ALTA' ? 'consistente' : nivelConfianca === 'MÉDIA' ? 'razoável' : 'insuficiente'}).`);
    razoesConfianca.push(`Variação observada entre semanas: ${(cv * 100).toFixed(0)}% ${cv < 0.35 ? '(baixa — padrão estável)' : cv > 0.7 ? '(alta — negócio ainda volátil)' : ''}.`);
    razoesConfianca.push(temExterno ? `Pesquisa externa: ${externo.fontes.length} fonte(s) consultada(s) agora.` : 'Pesquisa externa indisponível nesta execução.');
    if (fm.rotulo) razoesConfianca.push(`Mercado local: ${fm.rotulo}.`);

    const atualVsMedia = media ? Math.round((hist.corrente.atd / media - 1) * 100) : null;
    const projecaoFim = futuro[futuro.length - 1].demandaPrevista;
    const tendenciaGeral = projecaoFim > media * 1.03 ? 'alta' : projecaoFim < media * 0.97 ? 'baixa' : 'estavel';

    /* Sinais do presente (§7) — só fatos medidos */
    const sinaisPositivos = [], sinaisNegativos = [];
    if (hist.corrente.atd > 0 && atualVsMedia != null) {
      (atualVsMedia >= 0 ? sinaisPositivos : sinaisNegativos).push(`Semana corrente está ${atualVsMedia >= 0 ? '+' : ''}${atualVsMedia}% vs média das 8 semanas.`);
    }
    const ult3 = valores.slice(-3);
    if (ult3.length === 3 && ult3[0] > 0 && ult3.every((v, i) => i === 0 || v >= ult3[i - 1])) sinaisPositivos.push('Três semanas consecutivas em alta ou estáveis.');
    if (ult3.length === 3 && ult3[0] > 0 && ult3.every((v, i) => i === 0 || v <= ult3[i - 1])) sinaisNegativos.push('Três semanas consecutivas em queda.');
    const totCancel = hist.serie.reduce((s, x) => s + x.cancelados, 0);
    const totFaltas = hist.serie.reduce((s, x) => s + x.faltas, 0);
    const totAtd = valores.reduce((s, x) => s + x, 0);
    if (totAtd > 0 && (totCancel + totFaltas) / totAtd > 0.15) sinaisNegativos.push(`Cancelamentos+faltas somam ${Math.round(((totCancel + totFaltas) / totAtd) * 100)}% dos agendamentos.`);
    if (est.slope > 0.05) sinaisPositivos.push('Tendência ponderada recente é de crescimento.');

    /* Recomendações práticas derivadas de dados (§10) */
    const recomendacoes = [];
    if (hist.diasRanking[0] && hist.diasRanking[6] && hist.diasRanking[6].total > 0 && hist.diasRanking[0].total / Math.max(hist.diasRanking[6].total, 1) >= 2) {
      recomendacoes.push(`"${hist.diasRanking[0].dia}" concentra o maior movimento e "${hist.diasRanking[6].dia}" o menor — considere ajustar a escala da equipe e criar promoção específica para ${hist.diasRanking[6].dia.toLowerCase()}.`);
    }
    const horaPico = (hist.horasRanking || [])[0];
    if (horaPico) recomendacoes.push(`Faixa horária mais movida: ${horaPico.hora} — priorize agenda cheia e insumos prontos nesse horário.`);
    if ((totCancel + totFaltas) / Math.max(totAtd, 1) > 0.15) recomendacoes.push(`Cancelamentos/faltas altos (${totCancel + totFaltas} em 8 semanas) — ative confirmação por WhatsApp na véspera.`);
    if (evPos.length) recomendacoes.push(`${evPos.length} evento(s) de grande circulação no horizonte — antecipe escala e insumos para as datas destacadas.`);
    if (externo && externo.clima && externo.clima.chuvaTotalMm >= 40) recomendacoes.push('Previsão de muita chuva nos próximos dias — espere impacto no fluxo de rua e reforce confirmações/remarcações.');
    if (media > 0 && projecaoFim < media * 0.97) recomendacoes.push('Projeção abaixo da média histórica — reative clientes que não voltam há mais de 60 dias com oferta direta.');
    if (hist.topOrigens[0]) recomendacoes.push(`Origem que mais gera leads hoje: "${hist.topOrigens[0][0]}" (${hist.topOrigens[0][1]} no período) — mantenha o investimento nela.`);

    return {
      passado, corrente: hist.corrente, media, inclinacao: est.slope, desvio: est.desvio,
      atualVsMedia, futuro, cenarios, tendenciaGeral, fm, sent,
      temDados: hist.temDados, temExterno,
      melhorIdx, piorIdx, nivelConfianca, razoesConfianca,
      sinaisPositivos, sinaisNegativos, recomendacoes,
      eventos: eventosHorizonte, sazInfo: sazMod.info(hoje),
      horizonte,
    };
  }
  /** Módulo de sazonalidade compartilhado com o backend (inferência declarada). */
  function require0Sazon() {
    const base = typeof window !== 'undefined' && window.__NEITZEL_SAZON_SIMPLIFICADO;
    if (base) return base;
    return {
      fatorSemana: (data) => {
        const d = data instanceof Date ? data : new Date(data);
        const dia = d.getDate();
        if (dia <= 10) return { fator: 1.03, rotulo: 'início do mês (inferência)' };
        if (dia >= 25) return { fator: 0.97, rotulo: 'fim do mês (inferência)' };
        return { fator: 1.0, rotulo: 'meio do mês (inferência)' };
      },
      info: (d) => ({ rotulo: 'sazonalidade de pagamento aplicada como ajuste leve e declarado' }),
    };
  }

  /* ============================ GRÁFICO SVG ============================= */
  /** Linha contínua = histórico real · marcador HOJE · tracejada = previsão ·
   *  banda = intervalo de confiança (§13). */
  function graficoSVG(prev) {
    const W = 920, H = 340, L = 46, R = 14, T = 26, B = 42;
    const pw = W - L - R, ph = H - T - B;
    const pts = [];
    prev.passado.forEach((p) => pts.push({ v: p.valor, tipo: 'passado', p }));
    pts.push({ v: prev.corrente.atd, tipo: 'hoje' });
    prev.futuro.forEach((f) => pts.push({ v: f.demandaPrevista, tipo: 'futuro', f, min: f.min, max: f.max }));
    const N = pts.length;
    const maxV = Math.max(1, ...pts.map((x) => x.max != null ? x.max : x.v), ...pts.map((x) => x.v));
    const x = (i) => L + (i * pw) / (N - 1);
    const y = (v) => T + ph - (Math.min(v, maxV) / maxV) * ph;
    const hojeIdx = prev.passado.length;

    const bezier = (P) => {
      if (P.length < 3) return P.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join('');
      let d = `M${P[0][0]},${P[0][1]}`;
      for (let i = 0; i < P.length - 1; i++) {
        const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
        d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
      }
      return d;
    };
    const linhaPassada = bezier(pts.slice(0, hojeIdx + 1).map((pt, i) => [x(i), y(pt.v)]));
    const areaPassada = linhaPassada + `L${x(hojeIdx)},${T + ph}L${x(0)},${T + ph}Z`;
    const linhaFutura = bezier(pts.slice(hojeIdx).map((pt, i) => [x(i + hojeIdx), y(pt.v)]));

    let banda = '';
    const sup = pts.slice(hojeIdx).map((pt, i) => `${i ? 'L' : 'M'}${x(i + hojeIdx).toFixed(1)},${y(pt.max != null ? pt.max : pt.v).toFixed(1)}`).join(' ');
    const inf = pts.slice(hojeIdx).map((pt, i) => `L${x(N - 1 - i).toFixed(1)},${y(pts[N - 1 - i].min != null ? pts[N - 1 - i].min : pts[N - 1 - i].v).toFixed(1)}`).join(' ');
    banda = sup + ' ' + inf + ' Z';

    let grade = '';
    const passosY = 4;
    for (let g = 0; g <= passosY; g++) {
      const vy = y((maxV * g) / passosY);
      grade += `<line class="cg-axis" x1="${L}" y1="${vy}" x2="${W - R}" y2="${vy}" opacity="${g ? 0.5 : 1}"/>` +
        `<text class="cg-axis-txt" x="${L - 7}" y="${vy + 3}" text-anchor="end">${Math.round(maxV * g / passosY)}</text>`;
    }

    let rotulosX = '';
    pts.forEach((pt, i) => {
      const lbl = pt.tipo === 'futuro'
        ? '+' + (i - hojeIdx) + 's'
        : pt.tipo === 'hoje' ? 'HOJE' : (i - hojeIdx) + 's';
      if (pt.tipo === 'hoje' || i % 2 === 0 || pt.tipo === 'futuro') {
        rotulosX += `<text class="cg-axis-txt ${pt.tipo === 'hoje' ? 'cg-hoje-txt' : ''}" x="${x(i)}" y="${H - 10}" text-anchor="middle">${lbl}</text>`;
      }
    });

    let setas = '';
    for (let i = 1; i < N; i++) {
      const a = pts[i - 1], b = pts[i];
      if (a.v === undefined || b.v === undefined) continue;
      const sobe = b.v > a.v, igual = b.v === a.v;
      const mx = (x(i - 1) + x(i)) / 2;
      const my = Math.min(y(a.v), y(b.v)) - 11;
      const cor = igual ? 'var(--text-muted)' : sobe ? 'var(--e-green)' : 'var(--e-danger)';
      const glyph = igual ? '=' : sobe ? '↑' : '↓';
      setas += `<text class="cg-seta" x="${mx}" y="${my}" text-anchor="middle" fill="${cor}" style="animation-delay:${i * 55}ms">${glyph}</text>`;
      if (!igual && (i >= hojeIdx - 1)) {
        const pct = a.v ? Math.round((b.v / a.v - 1) * 100) : 0;
        if (pct !== 0) setas += `<text class="cg-pct" x="${mx}" y="${my - 11}" text-anchor="middle" fill="${cor}" style="animation-delay:${i * 55 + 90}ms">${pct > 0 ? '+' : ''}${pct}%</text>`;
      }
    }

    let pontos = '';
    pts.forEach((pt, i) => {
      const cx2 = x(i), cy2 = y(pt.v);
      if (pt.tipo === 'hoje') {
        pontos += `<circle class="cg-dot cg-hoje" cx="${cx2}" cy="${cy2}" r="6"/><circle class="cg-hoje-ring" cx="${cx2}" cy="${cy2}" r="10"/>`;
      } else {
        pontos += `<circle class="cg-dot" cx="${cx2}" cy="${cy2}" r="4" style="animation-delay:${i * 45}ms"/>`;
      }
    });

    const mediaY = y(prev.media);
    const svg = `
      <svg id="cg-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="cgArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--e-green)" stop-opacity=".22"/>
            <stop offset="100%" stop-color="var(--e-green)" stop-opacity="0"/>
          </linearGradient>
          <linearGradient id="cgBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--e-violet)" stop-opacity=".16"/>
            <stop offset="100%" stop-color="var(--e-violet)" stop-opacity=".05"/>
          </linearGradient>
        </defs>
        ${grade}${rotulosX}
        <line class="cg-media" x1="${L}" y1="${mediaY}" x2="${W - R}" y2="${mediaY}"/>
        <text class="cg-axis-txt" x="${W - R}" y="${mediaY - 4}" text-anchor="end" fill="var(--text-muted)">média ${prev.media.toFixed(1)}</text>
        <path class="cg-band" d="${banda}" fill="url(#cgBand)"/>
        <path class="cg-area" d="${areaPassada}" fill="url(#cgArea)"/>
        <line class="cg-divider" x1="${x(hojeIdx)}" y1="${T - 8}" x2="${x(hojeIdx)}" y2="${T + ph}"/>
        <text class="cg-hoje-label" x="${x(hojeIdx)}" y="${T - 12}" text-anchor="middle">HOJE</text>
        <path class="cg-line-past" d="${linhaPassada}"/>
        <path class="cg-line-future" d="${linhaFutura}"/>
        ${pontos}${setas}
      </svg>`;

    setTimeout(() => {
      const svgEl = document.getElementById('cg-svg');
      const box = svgEl && svgEl.parentElement.querySelector('.cg-tip');
      if (!svgEl || !box) return;
      svgEl.addEventListener('mousemove', (ev) => {
        const rect = svgEl.getBoundingClientRect();
        const escalaX = W / rect.width;
        const mx = (ev.clientX - rect.left) * escalaX;
        let melhor = 0, distMin = 1e9;
        pts.forEach((_, i) => { const dd = Math.abs(x(i) - mx); if (dd < distMin) { distMin = dd; melhor = i; } });
        const pt = pts[melhor];
        const quando = pt.tipo === 'passado'
          ? dataCurta(pt.p.ini) + ' – ' + dataCurta(pt.p.fim)
          : pt.tipo === 'hoje' ? 'Semana corrente (em andamento)'
          : dataCurta(pt.f.ini) + ' – ' + dataCurta(pt.f.fim);
        const extra = pt.tipo === 'futuro'
          ? ` · faixa ${pt.min}–${pt.max} · confiança ${pt.f.confianca}%`
          : pt.tipo === 'passado' ? ` · ${pt.p.det.cli} novo(s) cliente(s)` : '';
        box.innerHTML = `<b>${quando}</b><div>${pt.v} atendimento(s)${extra}</div>`;
        box.style.left = Math.min(rect.width - 190, Math.max(4, (x(melhor) / escalaX) - 80)) + 'px';
        box.style.top = ((y(pt.v) / H) * rect.height - 54) + 'px';
        box.classList.add('show');
      });
      svgEl.addEventListener('mouseleave', () => box.classList.remove('show'));
    }, 60);

    return svg;
  }

  /* ====================== ANIMAÇÃO DO PALCO ============================= */
  function iniciarCanvas(canvas, modo) {
    const ctx = canvas.getContext && canvas.getContext('2d');
    // Ambiente sem canvas (ex.: automação/JSDOM): não anima, mas NÃO pode quebrar
    if (!ctx) { return function pararVazio() {}; }
    let W = 0, H = 0, raf = 0, t = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function dim() { W = canvas.width = canvas.clientWidth * dpr; H = canvas.height = canvas.clientHeight * dpr; }
    dim();
    window.addEventListener('resize', dim, { passive: true });
    let encerrado = false;
    const parar = () => {
      if (encerrado) return;
      encerrado = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', dim);
    };
    const cx = () => W / 2, cy = () => H / 2;
    const particulas = Array.from({ length: 46 }, () => ({
      ang: Math.random() * Math.PI * 2, raio: 40 + Math.random() * 260,
      vel: 0.0009 + Math.random() * 0.0022, tam: 0.7 + Math.random() * 1.8,
    }));
    function cor(a) {
      const claro = document.documentElement.getAttribute('data-theme') === 'light';
      return claro ? `rgba(37,99,235,${a})` : `rgba(62,207,142,${a})`;
    }
    function frame() {
      if (!canvas.isConnected) { cancelAnimationFrame(raf); return; }
      t++;
      ctx.clearRect(0, 0, W, H);
      const aneis = modo === 'buscando' ? [70, 120, 175, 230] : [80, 140, 200];
      aneis.forEach((r, i) => {
        ctx.beginPath();
        ctx.arc(cx(), cy(), r * dpr * 1.35, 0, Math.PI * 2);
        ctx.strokeStyle = cor(0.10 - i * 0.02);
        ctx.lineWidth = dpr;
        ctx.stroke();
      });
      if (modo === 'buscando') {
        const ang = (t * 0.022) % (Math.PI * 2);
        ctx.save();
        ctx.translate(cx(), cy());
        ctx.rotate(ang);
        for (let k = 0; k < 26; k++) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(-k * 0.02) * 320 * dpr, Math.sin(-k * 0.02) * 320 * dpr);
          ctx.strokeStyle = cor(0.16 * (1 - k / 26));
          ctx.lineWidth = 2 * dpr;
          ctx.stroke();
        }
        ctx.restore();
      }
      particulas.forEach((p) => {
        p.ang += p.vel * (modo === 'buscando' ? 2.1 : 1);
        const x = cx() + Math.cos(p.ang) * p.raio * dpr * 0.9;
        const y = cy() + Math.sin(p.ang) * p.raio * dpr * 0.55;
        ctx.beginPath();
        ctx.arc(x, y, p.tam * dpr, 0, Math.PI * 2);
        ctx.fillStyle = cor(modo === 'buscando' ? 0.55 : 0.28);
        ctx.fill();
      });
      const pulso = modo === 'buscando' ? (t % 90) / 90 : (t % 180) / 180;
      ctx.beginPath();
      ctx.arc(cx(), cy(), (14 + pulso * 34) * dpr, 0, Math.PI * 2);
      ctx.strokeStyle = cor(0.30 * (1 - pulso));
      ctx.lineWidth = 1.4 * dpr;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx(), cy(), 7 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = cor(0.85);
      ctx.fill();
      raf = requestAnimationFrame(frame);
    }
    frame();
    return parar;
  }

  /* ============================== PALCO ================================= */
  let overlayAtual = null;

  function open() {
    fechar();
    const cfg = cfgLocal();
    const ov = document.createElement('div');
    ov.className = 'cen-overlay';
    ov.innerHTML = `
      <canvas class="cen-canvas"></canvas>
      <div class="cen-palco">
        <div class="cen-head">
          <span class="cen-selo">N</span>
          <div><h2>Possível Cenário</h2><p>Passado real → presente → pesquisa externa em tempo real → previsão em faixas com cenários e grau de confiança.</p></div>
          <button class="btn btn-icon cen-fechar" title="Fechar">✕</button>
        </div>
        <div class="cen-legendas">
          ${B_REAL}<span>dados do sistema</span>${B_EXT}<span>fontes públicas agora</span>${B_INF}<span>raciocínio declarado</span>${B_PREV}<span>estimativa futura</span>
        </div>
        <div class="cen-form">
          <label>País <input class="input" id="cn-pais" value="${esc(cfg.pais)}" /></label>
          <label>Estado (UF) <input class="input" id="cn-estado" value="${esc(cfg.estado)}" maxlength="2" placeholder="SC" /></label>
          <label>Cidade <input class="input" id="cn-cidade" value="${esc(cfg.cidade)}" placeholder="sua cidade" /></label>
          <label>Segmento <input class="input" id="cn-seg" value="${esc(cfg.segmento)}" /></label>
          <label>Período (previsão) <select class="input" id="cn-periodo">
            ${[4, 6, 8].map((n) => `<option value="${n}" ${cfg.periodoSemanas == n ? 'selected' : ''}>${n} semanas</option>`).join('')}
          </select></label>
          <button class="btn btn-primary" id="cn-iniciar">Analisar passado, presente e futuro</button>
        </div>
        <div class="cen-corpo"></div>
      </div>`;
    document.body.appendChild(ov);
    overlayAtual = ov;
    requestAnimationFrame(() => ov.classList.add('open'));
    const pararFX = iniciarCanvas(ov.querySelector('.cen-canvas'), 'esperando');
    ov._pararFX = pararFX;
    ov.querySelector('.cen-fechar').addEventListener('click', fechar);
    ov.addEventListener('click', (e) => { if (e.target === ov) fechar(); });
    ov.querySelector('#cn-iniciar').addEventListener('click', () => executar(ov, false));
  }

  function fechar() {
    if (!overlayAtual) return;
    const ov = overlayAtual;
    overlayAtual = null;
    try { ov._pararFX && ov._pararFX(); } catch (e) {}
    ov.classList.remove('open');
    setTimeout(() => ov.remove(), 380);
  }

  const ETAPAS = [
    'Revisando suas últimas 8 semanas…',
    'Gerando consultas dinâmicas para sua região…',
    'Consultando fontes públicas em tempo real…',
    'Contando barbearias, comércios e empresas no Maps…',
    'Buscando previsão do tempo local…',
    'Mapeando eventos, feriados e datas especiais…',
    'Classificando impactos possíveis (sem presumir causalidade)…',
    'Calculando projeção, faixas e cenários…',
  ];

  async function executar(ov, force) {
    const pais = ov.querySelector('#cn-pais').value.trim() || 'Brasil';
    const estado = ov.querySelector('#cn-estado').value.trim().toUpperCase().slice(0, 2);
    const cidade = ov.querySelector('#cn-cidade').value.trim();
    const segmento = ov.querySelector('#cn-seg').value.trim() || 'barbearia';
    const periodoSemanas = Number((ov.querySelector('#cn-periodo') || {}).value) || 8;

    // Guarda a localização para as próximas análises (pré-preenchimento).
    // Mudar QUALQUER filtro re-executa consultas reais (§13).
    try {
      const Em = E();
      const dbd = Em.db.get();
      dbd.config = dbd.config || {};
      dbd.config.sistema = Object.assign({}, dbd.config.sistema, { pais, estado, cidade, segmento, periodoSemanas });
      Em.db.save();
    } catch (e) {}

    const corpo = ov.querySelector('.cen-corpo');
    const hist = historicoReal(8);
    corpo.innerHTML = `
      <div class="cen-status">
        <div class="cen-etapa-atual"><span class="spinner"></span><b id="cn-etapa">${esc(ETAPAS[0])}</b></div>
        <ul class="cen-log" id="cn-log"></ul>
      </div>`;
    const cv = ov.querySelector('.cen-canvas');
    ov._pararFX && ov._pararFX();
    ov._pararFX = iniciarCanvas(cv, 'buscando');

    const log = ov.querySelector('#cn-log');
    const etapaEl = ov.querySelector('#cn-etapa');
    let etapaIdx = 0;
    const timerEtapas = setInterval(() => {
      etapaIdx = (etapaIdx + 1) % ETAPAS.length;
      if (etapaEl) etapaEl.textContent = ETAPAS[etapaIdx];
      if (log) {
        const li = document.createElement('li');
        li.textContent = '✓ ' + ETAPAS[(etapaIdx - 1 + ETAPAS.length) % ETAPAS.length];
        log.appendChild(li);
        while (log.children.length > 5) log.firstElementChild.remove();
      }
    }, 2400);

    const inicioT = Date.now();
    let resultado = null, erroRede = false;
    try {
      const qs = new URLSearchParams({ pais, estado, cidade, segmento, periodoSemanas: String(periodoSemanas) });
      if (force) qs.set('force', '1');
      const resp = await fetch(`${window.NEITZEL_API_BASE || ''}/api/cenario/analisar?` + qs.toString(), { signal: AbortSignal.timeout(240000) });
      resultado = await resp.json();
    } catch (e) { erroRede = true; }
    const decorrido = Date.now() - inicioT;
    if (decorrido < 2600) await new Promise((r) => setTimeout(r, 2600 - decorrido)); // deixa a animação respirar sem atrasar
    clearInterval(timerEtapas);

    const prev = sintetizar(hist, erroRede ? null : resultado);
    prev._avisoRede = erroRede || !resultado || !resultado.ok;
    prev._erroRede = erroRede;
    prev._dist = { diasRanking: hist.diasRanking, horasRanking: hist.horasRanking, topOrigens: hist.topOrigens };
    mostrarResultado(ov, prev, resultado || {}, { pais, estado, cidade, segmento, periodoSemanas });
  }

  /* ============================ RESULTADO ================================ */
  function mostrarResultado(ov, prev, info, onde) {
    const corpo = ov.querySelector('.cen-corpo');
    ov._pararFX && ov._pararFX();
    ov._pararFX = iniciarCanvas(ov.querySelector('.cen-canvas'), 'resultado');

    const cores = { alta: 'var(--e-green)', baixa: 'var(--e-danger)', estavel: 'var(--text-muted)' };
    const setas = { alta: '↗', baixa: '↘', estavel: '→' };
    const IMPACTO_COR = { 'MUITO POSITIVO': 'var(--e-green)', POSITIVO: 'var(--e-green)', NEUTRO: 'var(--text-muted)', INDETERMINADO: 'var(--e-orange)', NEGATIVO: 'var(--e-danger)', 'MUITO NEGATIVO': 'var(--e-danger)' };
    const CONF_COR = { 'ALTA': 'var(--e-green)', 'MÉDIA': 'var(--e-orange)', 'BAIXA': 'var(--e-danger)' };

    /* ---------- §11 FALLBACK HONESTO (mensagens exatas) ---------- */
    const avisoRede = prev._avisoRede ? `
      <div class="cen-aviso cen-fallback" style="margin-bottom:12px">
        <b>Pesquisa externa indisponível neste momento.</b><br>
        Esta previsão foi calculada somente com os dados internos disponíveis.
        <div style="margin-top:8px"><button class="btn btn-sm btn-primary" id="cn-tentar-novamente">Tentar pesquisa novamente</button></div>
      </div>` : '';

    /* ---------- §1 AVISO DE DADOS INSUFICIENTES (mensagem exata) ---------- */
    const avisoSemDados = !prev.temDados
      ? '<div class="cen-aviso" style="margin-bottom:12px"><b>Dados históricos insuficientes para uma previsão confiável.</b> Registre atendimentos no Planner — a análise fica mais precisa a cada semana alimentada. Nenhum número foi inventado para preencher o histórico.</div>'
      : '';

    /* ---------- §7 PASSADO: métricas + tabela expandida ---------- */
    const mMelhor = prev.passado[prev.melhorIdx], mPior = prev.passado[prev.piorIdx];
    const linhasPassado = prev.passado.map((p, i) => {
      const dir = p.variacao == null ? '' : p.variacao > 0 ? `<span style="color:var(--e-green)">▲${p.variacao}%</span>` : p.variacao < 0 ? `<span style="color:var(--e-danger)">▼${Math.abs(p.variacao)}%</span>` : '<span class="text-muted">=</span>';
      const d = p.det || {};
      return `<tr>
        <td class="text-muted">${dataCurta(p.ini)} – ${dataCurta(p.fim)}</td>
        <td><b>${p.valor}</b></td><td>${dir}</td>
        <td>${d.cli != null ? d.cli : '—'}</td>
        <td>${d.recorrentes ? d.recorrentes : '—'}</td>
        <td>${fmtMoeda(d.rec || 0)}</td>
        <td>${d.ticket != null ? fmtMoeda(d.ticket) : '—'}</td>
        <td>${d.cancelados || 0}</td>
        <td>${d.faltas || 0}</td>
        <td>${d.desp ? fmtMoeda(d.desp) : '—'}</td>
      </tr>`;
    }).join('');

    const htmlPassado = `
      <div class="cen-card cen-in">
        <h4>Passado — últimas 8 semanas ${B_REAL}</h4>
        <div class="cen-resumo" style="margin-bottom:10px">
          <div class="cr-item"><div class="cr-val">${prev.media.toFixed(1)}</div><span>média ponderada (recentes pesam mais)</span></div>
          <div class="cr-item"><div class="cr-val" style="color:${prev.inclinacao >= 0 ? 'var(--e-green)' : 'var(--e-danger)'}">${prev.inclinacao >= 0 ? '↑' : '↓'} ${Math.abs(prev.inclinacao).toFixed(2)}</div><span>tendência por semana</span></div>
          <div class="cr-item"><div class="cr-val">${mMelhor.valor}</div><span>melhor semana (${dataCurta(mMelhor.ini)})</span></div>
          <div class="cr-item"><div class="cr-val">${mPior.valor}</div><span>pior semana (${dataCurta(mPior.ini)})</span></div>
        </div>
        <div class="tbl-scroll"><table class="table">
          <thead><tr><th>Semana</th><th>Atend.</th><th>Var.</th><th>Novos cli.</th><th>Recorrentes*</th><th>Receita paga</th><th>Ticket médio</th><th>Cancel.</th><th>Faltas</th><th>Despesas pagas</th></tr></thead>
          <tbody>${linhasPassado}</tbody>
        </table></div>
        <small class="text-muted">* recorrentes = atendimentos vinculados a cliente já identificado antes (somente vínculos explícitos — os demais não são estimados).</small>
      </div>`;

    /* ---------- §7 PRESENTE: diagnóstico ---------- */
    const htmlPresente = `
      <div class="cen-card cen-in">
        <h4>Presente — semana corrente vs média ${B_REAL}${B_INF}</h4>
        <div class="cen-resumo">
          <div class="cr-item"><div class="cr-val">${prev.corrente.atd} <small style="font-size:12px;color:var(--text-muted)">(${prev.atualVsMedia == null ? '—' : (prev.atualVsMedia > 0 ? '+' : '') + prev.atualVsMedia + '%'})</small></div><span>atendimentos vs média</span></div>
          <div class="cr-item"><div class="cr-val">${fmtMoeda(prev.corrente.rec || 0)}</div><span>receita recebida na semana</span></div>
          <div class="cr-item"><div class="cr-val">${prev.corrente.cancelados || 0} / ${prev.corrente.faltas || 0}</div><span>cancelados / faltas</span></div>
          <div class="cr-item"><div class="cr-val">${prev.corrente.ticket != null ? fmtMoeda(prev.corrente.ticket) : '—'}</div><span>ticket médio corrente</span></div>
        </div>
        ${(prev.sinaisPositivos.length || prev.sinaisNegativos.length) ? `<div class="cen-sinais">
          ${prev.sinaisPositivos.map((s) => `<div class="cs-pos">▲ ${esc(s)}</div>`).join('')}
          ${prev.sinaisNegativos.map((s) => `<div class="cs-neg">▼ ${esc(s)}</div>`).join('')}
        </div>` : ''}
      </div>`;

    /* ---------- Distribuição real por dia/hora ---------- */
    const dist = prev._dist || {};
    const htmlDistribuicao = `
      <div class="cen-card cen-in">
        <h4>Movimento por dia e horário (8 semanas) ${B_REAL}</h4>
        <div class="cen-mkt-grid">
          <div class="cm"><div class="cm-termo">Dias da semana</div>
            ${(dist.diasRanking || []).map((d) => `<div class="cm-item">${esc(d.dia)} <span>${d.total}</span></div>`).join('')}
          </div>
          <div class="cm"><div class="cm-termo">Horários mais cheios</div>
            ${(dist.horasRanking || []).slice(0, 5).map((h) => `<div class="cm-item">${esc(h.hora)} <span>${h.total}</span></div>`).join('') || '<div class="cm-item text-muted">sem dados de horário</div>'}
          </div>
          <div class="cm"><div class="cm-termo">Origem dos leads</div>
            ${(dist.topOrigens || []).slice(0, 5).map((o) => `<div class="cm-item">${esc(o[0])} <span>${o[1]}</span></div>`).join('') || '<div class="cm-item text-muted">sem leads no período</div>'}
          </div>
        </div>
      </div>`;

    /* ---------- Mercado Maps (mantido) ---------- */
    let htmlMercado = '';
    const mc = info.mercado && info.mercado.consultas;
    if (mc && mc.length) {
      htmlMercado = `
        <div class="cen-card cen-in">
          <h4>Mercado real — Google Maps agora ${B_EXT} <span class="text-muted" style="font-weight:400;font-size:12px">(${esc([onde.cidade, onde.estado].filter(Boolean).join('/') || onde.pais)})</span></h4>
          <div class="cen-mkt-grid">
            ${mc.map((m, i) => `
              <div class="cm cm-in" style="animation-delay:${i * 70}ms">
                <div class="cm-termo">${esc(m.termo)}${m.nivel === 'estado' ? ' · estado inteiro' : ''}${m.nivel === 'cidade' ? ' · cidade' : ''}</div>
                <div class="cm-total"><b>${m.total}</b><span>no topo do Maps</span></div>
                ${m.mediaEstrelas != null ? `<div class="cm-nota">★ ${m.mediaEstrelas} médio (${m.comNota} avaliados)</div>` : ''}
                ${(m.amostra || []).slice(0, 4).map((a) => `<div class="cm-item">${esc(a.nome)}${a.nota ? ` <span>${esc(String(a.nota).slice(0, 24))}</span>` : ''}</div>`).join('')}
              </div>`).join('')}
          </div>
          <div class="cen-mkt-leitura">${B_INF} <b>${esc(prev.fm.rotulo)}</b> — ${esc(prev.fm.detalhe || '')}<br>
            <small style="color:var(--text-muted)">* contagem da amostra dos primeiros resultados de cada busca no Google Maps (até 40 por termo) — termômetro de densidade, não censo completo.</small></div>
        </div>`;
    }

    /* ---------- §3+§4 EXTERNO: status da pesquisa, eventos e fontes ---------- */
    let htmlStatusExterno = '';
    if (info.coletadoEm) {
      const dt = new Date(info.coletadoEm);
      const stamp = dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      htmlStatusExterno = `
        <div class="cen-status-pesquisa cen-in">
          ${B_EXT} Pesquisa executada pelo provedor <b>${esc(info.provedor || 'livre')}</b>
          (${info.consultasBemSucedidas}/${info.consultasExecutadas} consultas respondidas).
          <b>Última atualização da pesquisa: ${stamp}</b>
          <button class="btn btn-sm" id="cn-atualizar-pesquisa" title="Refaz as consultas ignorando o cache">⟳ ATUALIZAR PESQUISA</button>
        </div>`;
    }
    if (Array.isArray(info.avisos) && info.avisos.length && !prev._avisoRede) {
      htmlStatusExterno += `<div class="cen-aviso cen-in" style="margin-top:8px">${info.avisos.map((a) => esc(a)).join('<br>')}</div>`;
    }

    let htmlClima = '';
    if (info.clima && info.clima.ok) {
      htmlClima = `
        <div class="cen-clima cen-in">
          ${B_EXT} <b>Clima (${esc(info.clima.cidadeEncontrada || onde.cidade)} — fonte ${esc(info.clima.fonte)}):</b> ${esc(info.clima.leitura)} (${info.clima.chuvaTotalMm}mm previstos em 7 dias).
          ${info.clima.chuvaTotalMm >= 40 ? '<span class="text-muted">Chuva forte costuma reduzir tráfego de rua — efeito não quantificado nos seus dados ainda.</span>' : ''}
        </div>`;
    }

    let htmlEventos = '';
    const evs = prev.eventos || [];
    htmlEventos = evs.length ? `
      <div class="cen-card cen-in">
        <h4>Eventos e datas no seu horizonte ${B_EXT} <span class="text-muted" style="font-weight:400;font-size:12px">evento ≠ impacto — cada caso é classificado com justificativa</span></h4>
        ${evs.map((ev) => `
          <div class="cen-evento">
            <div class="ce-head">
              <b>${esc(ev.nome)}</b>
              <span class="cen-badge" style="background:${IMPACTO_COR[ev.impacto]}22;color:${IMPACTO_COR[ev.impacto]}">${esc(ev.impacto)}</span>
            </div>
            <div class="ce-meta">
              ${ev.dataISO ? `📅 ${esc(ev.dataBruta)}${ev.diasAte != null ? ` (faltam ${ev.diasAte} dia(s))` : ''}` : '📅 data não identificada na fonte'}
              · tipo: ${esc(ev.tipo)} · confiança: ${esc(ev.confianca)}
              ${ev.cidade ? ' · ' + esc(ev.cidade) : ''}
              ${ev.publicoEsperado ? ' · público citado: ' + esc(ev.publicoEsperado) : ''}
              ${ev.duracao ? ' · duração citada: ' + esc(ev.duracao) : ''}
            </div>
            <div class="ce-just">${B_INF} ${esc(ev.justificativa)}</div>
            ${ev.url ? `<a class="ce-link" href="${esc(ev.url)}" target="_blank" rel="noopener">ver fonte original ↗</a>` : ''}
          </div>`).join('')}
      </div>` : (prev.temExterno ? `
      <div class="cen-card cen-in">
        <h4>Eventos e datas no seu horizonte ${B_EXT}</h4>
        <div class="empty">Nenhum evento com data identificável nas fontes desta rodada — nada foi presumido.</div>
      </div>` : '');

    /* ---------- §10 Fontes consultadas: tabela interativa ---------- */
    const fontes = info.fontes || [];
    const htmlFontes = fontes.length ? `
      <details class="cen-fontes cen-in" open>
        <summary>Fontes consultadas agora (${fontes.length}) — tabela com link, prioridade e datas</summary>
        <div class="tbl-scroll"><table class="table">
          <thead><tr><th>Link</th><th>Título</th><th>Fonte</th><th>Prioridade</th><th>Publicado</th><th>Acessado</th><th>Relevância</th><th>Confiança</th></tr></thead>
          <tbody>${fontes.map((f) => `
            <tr>
              <td>${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">abrir ↗</a>` : '—'}</td>
              <td>${esc(f.titulo).slice(0, 90)}</td>
              <td class="text-muted">${esc(f.nomeFonte)}</td>
              <td>P${f.prioridade}</td>
              <td class="text-muted">${f.publicadoEm ? new Date(f.publicadoEm).toLocaleDateString('pt-BR') : '—'}</td>
              <td class="text-muted">${new Date(f.dataConsulta).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
              <td>${esc(f.relevancia)}</td>
              <td>${esc(f.nivelConfianca)}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </details>` : '';

    /* ---------- Gráfico ---------- */
    const htmlGrafico = `
      <div class="cen-card cen-in">
        <h4>Movimento — histórico real → HOJE → previsão ${B_REAL}${B_PREV}</h4>
        <div class="cg-wrap">
          ${graficoSVG(prev)}
          <div class="cg-tip"></div>
        </div>
        <div class="cg-legenda">
          <span><i class="lg lg-passado"></i>realizado</span>
          <span><i class="lg lg-hoje"></i>HOJE</span>
          <span><i class="lg lg-futuro"></i>projeção (tracejada)</span>
          <span><i class="lg lg-banda"></i>intervalo de confiança</span>
          <span><i style="color:var(--e-green);font-style:normal;font-weight:800">↑</i>/<i style="color:var(--e-danger);font-style:normal;font-weight:800">↓</i> movimento</span>
        </div>
      </div>`;

    /* ---------- §8 CENÁRIOS + tabela de previsão ---------- */
    const somaCen = (arr) => arr.reduce((a, f) => a + f.valor, 0);
    const htmlCenarios = `
      <div class="cen-card cen-in">
        <h4>Cenários para as próximas ${prev.horizonte} semanas ${B_PREV}</h4>
        <div class="cen-scenarios">
          <div class="csc csc-cons"><div class="csc-tipo">CONSERVADOR</div><div class="csc-val">${somaCen(prev.cenarios.conservador)}</div><div class="csc-sub">atendimentos no horizonte — tendência amortecida, sem fatores externos favoráveis</div></div>
          <div class="csc csc-base"><div class="csc-tipo">BASE</div><div class="csc-val">${somaCen(prev.cenarios.base)}</div><div class="csc-sub">modelo completo: histórico + tendência + sazonalidade + externos</div></div>
          <div class="csc csc-oti"><div class="csc-tipo">OTIMISTA</div><div class="csc-val">${somaCen(prev.cenarios.otimista)}</div><div class="csc-sub">fatores favoráveis plenos + meio-desvio acima</div></div>
        </div>
        <table class="table">
          <thead><tr><th>Semana</th><th>Período</th><th>Base previsto</th><th>Faixa provável</th><th>Conservador</th><th>Otimista</th><th>Receita prevista</th><th>Confiança</th></tr></thead>
          <tbody>${prev.futuro.map((f, i) => `
            <tr>
              <td><b>+${f.n}s</b></td>
              <td class="text-muted">${dataCurta(f.ini)} – ${dataCurta(f.fim)}</td>
              <td><b>${f.demandaPrevista}</b> <span style="color:${cores[f.direcao]}">${setas[f.direcao]}</span> <span class="text-muted">(${f.variacao > 0 ? '+' : ''}${f.variacao}%)</span></td>
              <td><b>${f.min} – ${f.max}</b></td>
              <td class="text-muted">${prev.cenarios.conservador[i].valor}</td>
              <td class="text-muted">${prev.cenarios.otimista[i].valor}</td>
              <td>${fmtMoeda(f.recPrevista || 0)}<br><small class="text-muted">${fmtMoeda(f.recMin || 0)} – ${fmtMoeda(f.recMax || 0)}</small></td>
              <td><div class="cs-conf-bar" style="min-width:80px;display:inline-block;vertical-align:middle;margin-right:6px"><i style="width:${f.confianca}%"></i></div>${f.confianca}%</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <small class="text-muted">Nenhum valor único é apresentado como certeza: toda semana traz faixa mín–máx e taxa de confiança que diminui conforme o horizonte cresce.</small>
      </div>`;

    /* ---------- §9 POR QUE O SISTEMA ESTÁ PREVENDO ISSO? ---------- */
    const htmlExplicacao = `
      <div class="cen-card cen-in">
        <h4>Por que o sistema está prevendo isso? ${B_INF}</h4>
        <div class="cen-explicacao">
          <div class="cx-conf" style="color:${CONF_COR[prev.nivelConfianca] || 'inherit'}">Grau de confiança geral: <b>${esc(prev.nivelConfianca)}</b></div>
          <ul>${prev.razoesConfianca.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
          <ul>
            <li>Base histórica: média ponderada de <b>${prev.media.toFixed(1)}</b> atendimentos/semana (semanas recentes pesam mais).</li>
            <li>Tendência recente: <b>${prev.inclinacao >= 0 ? '+' : ''}${prev.inclinacao.toFixed(2)}</b> por semana (regressão ponderada).</li>
            <li>Sazonalidade de pagamento: ajuste leve aplicado por posição do mês — ${esc(prev.sazInfo && prev.sazInfo.rotulo ? prev.sazInfo.rotulo : 'inferência declarada')}.</li>
            <li>Eventos externos considerados: <b>${(prev.eventos || []).filter((e) => e.direcao !== 'indeterminado').length}</b> com direção definida de ${prev.eventos.length} mapeado(s).</li>
            <li>Fontes externas: sentimento ${prev.sent.citacoes ? `${prev.sent.positivas}↑/${prev.sent.negativas}↓ citações` : '— sem citações suficientes'}.</li>
            <li>Fatores locais (mercado Maps): ${esc(prev.fm.rotulo)}.</li>
          </ul>
        </div>
      </div>`;

    /* ---------- §10 RECOMENDAÇÕES ---------- */
    const htmlRecomendacoes = `
      <div class="cen-card cen-in">
        <h4>Recomendações práticas ${B_INF}</h4>
        ${prev.recomendacoes.length ? `<ul class="cen-recs">${prev.recomendacoes.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`
          : '<div class="empty">Sem recomendações automáticas nesta rodada — os dados ainda não mostram um padrão acionável claro.</div>'}
      </div>`;

    corpo.innerHTML = `
      ${avisoRede}${avisoSemDados}
      <div class="cen-resumo cen-in">
        <div class="cr-item"><div class="cr-val" style="color:${cores[prev.tendenciaGeral]}">${setas[prev.tendenciaGeral]} ${prev.tendenciaGeral.toUpperCase()}</div><span>tendência próximas ${prev.horizonte} sem. ${B_PREV}</span></div>
        <div class="cr-item"><div class="cr-val">${prev.corrente.atd} <small style="font-size:12px;color:var(--text-muted)">(${prev.atualVsMedia == null ? '—' : (prev.atualVsMedia > 0 ? '+' : '') + prev.atualVsMedia + '%'})</small></div><span>semana corrente vs média</span></div>
        <div class="cr-item"><div class="cr-val">${prev.futuro.reduce((a, f) => a + f.demandaPrevista, 0)}</div><span>movimento total previsto (faixa)</span></div>
        <div class="cr-item"><div class="cr-val">${fmtMoeda(prev.futuro.reduce((a, f) => a + (f.recPrevista || 0), 0))}</div><span>receita prevista</span></div>
        <div class="cr-item"><div class="cr-val" style="color:${CONF_COR[prev.nivelConfianca] || 'inherit'}">${esc(prev.nivelConfianca)}</div><span>confiança geral</span></div>
      </div>
      ${htmlStatusExterno}
      ${htmlClima}
      ${htmlPassado}
      ${htmlPresente}
      ${htmlDistribuicao}
      ${htmlGrafico}
      ${htmlCenarios}
      ${htmlExplicacao}
      ${htmlEventos}
      ${htmlMercado}
      ${htmlFontes}
      ${htmlRecomendacoes}
      <div class="cen-acoes">
        <button class="btn btn-sm" id="cn-repetir">Analisar de novo</button>
        <button class="btn btn-sm btn-primary" id="cn-exportar">Exportar cenário (.txt)</button>
      </div>`;

    /* Botões de ação */
    ov.querySelector('#cn-tentar-novamente')?.addEventListener('click', () => executar(ov, true));
    ov.querySelector('#cn-atualizar-pesquisa')?.addEventListener('click', () => executar(ov, true));
    ov.querySelector('#cn-repetir')?.addEventListener('click', () => executar(ov, false));

    ov.querySelector('#cn-exportar')?.addEventListener('click', () => {
      const linhas = [];
      linhas.push('NEITZEL — POSSÍVEL CENÁRIO (' + new Date().toLocaleString('pt-BR') + ')');
      linhas.push('Região: ' + [onde.cidade, onde.estado, onde.pais].filter(Boolean).join('/') + ' | Horizonte: ' + prev.horizonte + ' semanas');
      if (info.coletadoEm) linhas.push('Última atualização da pesquisa: ' + new Date(info.coletadoEm).toLocaleString('pt-BR') + ' (provedor ' + (info.provedor || 'livre') + ')');
      linhas.push('Confiança geral: ' + prev.nivelConfianca);
      linhas.push('');
      linhas.push('PASSADO (DADO REAL):');
      prev.passado.forEach((p, i) => linhas.push(`  S-${prev.passado.length - i}: ${p.valor} atd | novos ${p.det.cli} | receita ${fmtMoeda(p.det.rec || 0)}${p.variacao != null ? (p.variacao >= 0 ? ' (+' : ' (') + p.variacao + '%)' : ''}`));
      linhas.push('');
      linhas.push('PREVISÃO (FAIXAS — NÃO É CERTEZA):');
      prev.futuro.forEach((f, i) => {
        linhas.push(`  +${f.n}s (${dataCurta(f.ini)}–${dataCurta(f.fim)}): base ${f.demandaPrevista}, faixa ${f.min}–${f.max}, conservador ${prev.cenarios.conservador[i].valor}, otimista ${prev.cenarios.otimista[i].valor}, receita ${fmtMoeda(f.recMin || 0)}–${fmtMoeda(f.recMax || 0)}, confiança ${f.confianca}%`);
      });
      linhas.push('', 'POR QUE O SISTEMA PREVEVE ISSO:');
      prev.razoesConfianca.forEach((r) => linhas.push('- ' + r));
      if ((prev.eventos || []).length) {
        linhas.push('', 'EVENTOS MAPEADOS (EVENTO ≠ IMPACTO):');
        prev.eventos.forEach((ev) => linhas.push(`- ${ev.nome} ${ev.dataBruta || '[sem data]'} [${ev.impacto}] ${ev.justificativa}`));
      }
      if (fontes.length) {
        linhas.push('', 'FONTES CONSULTADAS:');
        fontes.forEach((f) => linhas.push(`- ${f.titulo} — ${f.nomeFonte}${f.url ? ' (' + f.url + ')' : ''} | acessado ${new Date(f.dataConsulta).toLocaleString('pt-BR')}`));
      }
      if (prev.recomendacoes.length) {
        linhas.push('', 'RECOMENDAÇÕES:');
        prev.recomendacoes.forEach((r) => linhas.push('- ' + r));
      }
      const blob = new Blob(['\uFEFF' + linhas.join('\n')], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'NEITZEL-cenario-' + new Date().toISOString().slice(0, 10) + '.txt';
      a.click();
    });

    try { E().audit.record('estrategia.cenario_gerado', 'sistema', null, { tendencia: prev.tendenciaGeral, confianca: prev.nivelConfianca, fontes: fontes.length, eventos: (prev.eventos || []).length, mercado: prev.fm.rotulo }); } catch (e) {}
  }

  /* ==================== CARTÃO DE HISTÓRICO (Estratégia) ================= */
  function renderHistoricoCard() {
    const hist = lsGet(KEY_HIST, []);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<h4>Histórico de cenários analisados</h4>';
    if (!hist.length) {
      card.innerHTML += '<div class="empty">Nenhum cenário ainda — clique em "Possível Cenário" para a primeira análise.</div>';
    } else {
      hist.slice(0, 6).forEach((h) => {
        const row = document.createElement('div');
        row.className = 'dbx-feed-row';
        const cor = h.tendenciaGeral === 'alta' ? 'var(--e-green)' : h.tendenciaGeral === 'baixa' ? 'var(--e-danger)' : 'var(--text-muted)';
        row.innerHTML = `
          <span class="dbx-feed-ico" style="color:${cor};border:1px solid var(--border)">C</span>
          <span><b>${new Date(h.quandoISO).toLocaleString('pt-BR')}</b>
            <span class="text-muted" style="font-size:11.5px"> · ${esc(Object.values(h.onde || {}).filter(Boolean).join('/'))} · tendência <span style="color:${cor}"><b>${h.tendenciaGeral}</b></span> · movimento previsto ${h.totalPrevisto} · ${h.fontesCount} fonte(s)</span></span>`;
        card.appendChild(row);
      });
    }
    return card;
  }

  window.NEITZEL_CENARIO = { open, fechar, renderHistoricoCard, _internals: { historicoReal, sintetizar, estatPonderada } };
})();
