/* ============================================================================
 * NEITZEL — POSSÍVEL CENÁRIO (agente de previsão estratégica v2)
 * Como funciona (nada inventado):
 *   1) REVISÃO REAL — lê as últimas 8 SEMANAS dos seus dados internos:
 *      atendimentos realizados, novos clientes e receita recebida,
 *      semana a semana, com setas de queda/aumento entre elas.
 *   2) PRESENTE — marca a semana corrente ao vivo contra a média histórica.
 *   3) INVESTIGAÇÃO EXTERNA — o agente pesquisa fontes reais (Chrome
 *      headless: Google/DDG/Bing + APIs abertas) sobre economia local,
 *      índices de consumo, eventos e o MERCADO do seu estado: conta
 *      barbearias/segmento + comércio + empresas no Google Maps.
 *   4) PROJEÇÃO — regressão linear das 8 semanas reais × fatores externos
 *      (sentimento das fontes + densidade do mercado), semana a semana,
 *      com faixa de confiança que diminui no horizonte.
 *   5) GRÁFICO — linha sólida do passado, divisor HOJE, projeção
 *      tracejada com banda de confiança e setas ↑↓ de movimento.
 * ========================================================================== */

'use strict';

(function () {
  const KEY_HIST = 'neitzel_cenario_v1';
  const lsGet = (k, f) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : f; } catch (e) { return f; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const E = () => window.ECOMIM || null;

  function cfgLocal() {
    const Em = E();
    const s = (Em && Em.db && Em.db.get().config && Em.db.get().config.sistema) || {};
    return { pais: s.pais || 'Brasil', estado: s.estado || '', cidade: s.cidade || '', segmento: s.segmento || 'barbearia' };
  }

  /* ==================== 1. HISTÓRICO REAL (8 SEMANAS) =================== */
  /** Retorna séries semanais REAIS das últimas N semanas completas +
   *  a semana corrente em andamento. */
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

    const serie = semanas.map(({ ini, fim }) => {
      const atd = atds.filter((a) => dentro(a.inicio, ini, fim)).length;
      const cli = clientes.filter((c) => dentro(c.created, ini, fim)).length;
      const rec = contas.filter((c) => c.tipo === 'receber' && c.status === 'pago' && dentro(c.pagoEm, ini, fim)).reduce((s, c) => s + (c.valor || 0), 0);
      return { atd, cli, rec };
    });

    // Semana corrente (parcial, ao vivo)
    const agora = new Date();
    const corrente = {
      atd: atds.filter((a) => dentro(a.inicio, inicioSemanaAtual, new Date(agora.getTime() + 86400000))).length,
      cli: clientes.filter((c) => dentro(c.created, inicioSemanaAtual, new Date(agora.getTime() + 86400000))).length,
      rec: contas.filter((c) => c.tipo === 'receber' && c.status === 'pago' && dentro(c.pagoEm, inicioSemanaAtual, new Date(agora.getTime() + 86400000))).reduce((s, c) => s + (c.valor || 0), 0),
    };
    const temDados = serie.some((s) => s.atd > 0 || s.cli > 0 || s.rec > 0) || corrente.atd > 0 || corrente.cli > 0;
    return { semanas, serie, corrente, temDados };
  }

  /* ======================= 2. MODELO DE PROJEÇÃO ======================== */
  function regressao(vals) {
    const n = vals.length;
    const sx = vals.reduce((a, _, i) => a + i, 0);
    const sy = vals.reduce((a, v) => a + v, 0);
    const sxx = vals.reduce((a, _, i) => a + i * i, 0);
    const sxy = vals.reduce((a, v, i) => a + i * v, 0);
    const den = n * sxx - sx * sx;
    const b = den ? (n * sxy - sx * sy) / den : 0;
    const a0 = (sy - b * sx) / n;
    return { b, a0, media: sy / n };
  }

  /** Desvio-padrão populacional — alimenta a faixa de confiança real. */
  function desvioPadrao(vals, media) {
    if (!vals.length) return 0;
    const m = media != null ? media : vals.reduce((a, v) => a + v, 0) / vals.length;
    return Math.sqrt(vals.reduce((a, v) => a + (v - m) * (v - m), 0) / vals.length);
  }

  const POSITIVAS = ['crescimento', 'alta', 'aumento', 'recorde', 'expansão', 'expansao', 'aquecimento', 'otimismo', 'recupera', 'sobe', 'fortalece', 'demanda'];
  const NEGATIVAS = ['queda', 'crise', 'recessão', 'recessao', 'redução', 'reducao', 'fechamento', 'desemprego', 'inflação', 'inflacao', 'caiu', 'recuo', 'contração', 'contracao', 'pessimismo'];

  function analisarFontes(fontes) {
    let pos = 0, neg = 0;
    const evidencias = [];
    const eventos = [];
    const mesesTxt = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    (fontes || []).forEach((f) => (f.resultados || []).forEach((r) => {
      const txt = `${r.titulo || ''} ${r.trecho || ''}`.toLowerCase();
      POSITIVAS.forEach((p) => { if (txt.includes(p)) pos++; });
      NEGATIVAS.forEach((p) => { if (txt.includes(p)) neg++; });
      if (r.titulo) evidencias.push({ titulo: r.titulo, url: r.url, trecho: r.trecho || '' });
      const mMes = txt.match(new RegExp('(' + mesesTxt.join('|') + ')'));
      if (mMes && /(evento|feriado|festival|feira|show|congresso|data especial|dia)/.test(txt)) {
        if (!eventos.some((e) => e.nome.toLowerCase() === r.titulo.toLowerCase().slice(0, 60))) {
          eventos.push({ nome: String(r.titulo).slice(0, 70), mes: mMes[1], url: r.url });
        }
      }
    }));
    const total = pos + neg;
    return { sentimento: total ? (pos - neg) / total : 0, positivas: pos, negativas: neg, evidencias: evidencias.slice(0, 14), eventos: eventos.slice(0, 6) };
  }

  /** Densidade de mercado a partir da contagem real do Maps. Usa o ESTADO
   *  inteiro quando disponível (visão macro) e mostra a cidade junto. */
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
    if (segEstado && segCidade && segCidade.total) {
      detalhe += ` Sendo ${segCidade.total} na sua cidade.`;
    }
    return { fator, rotulo, detalhe, seg };
  }

  /** Monta passado + presente + projeção de 8 semanas. */
  function sintetizar(hist, analise, mercado) {
    const valores = hist.serie.map((s) => s.atd);
    const receitas = hist.serie.map((s) => s.rec);
    const reg = regressao(valores.length ? valores : [0, 0, 0, 0, 0, 0, 0, 0]);
    const regRec = regressao(receitas.length ? receitas : [0, 0, 0, 0, 0, 0, 0, 0]);
    const media = Math.max(reg.media, 0);
    const mediaRec = Math.max(regRec.media, 0);
    const desvio = desvioPadrao(valores, media);
    const fm = fatorDeMercado(mercado);
    const fatorSent = 1 + Math.max(-0.12, Math.min(0.18, analise.sentimento * 0.15));
    const temExterno = analise.evidencias.length > 0;

    // Projeção futura (8 semanas) — movimento + receita
    const futuro = [];
    const hoje = new Date();
    for (let w = 0; w < 8; w++) {
      const tendencia = Math.max(0, media + reg.b * (w + 1));
      const central = tendencia * fatorSent * fm.fator;
      const confianca = temExterno ? Math.max(46, 76 - w * 4) : Math.max(34, 52 - w * 3);
      // Faixa real: nunca menor que o desvio-padrão observado — a promessa
      // não pode ser mais estreita do que a variação que o negócio já mostrou.
      const margem = Math.max(central * ((100 - confianca) / 100), desvio * 0.8);
      const recCentral = Math.max(0, mediaRec + regRec.b * (w + 1)) * fatorSent * fm.fator;
      const ini = new Date(hoje.getTime() + (w * 7 + 1) * 86400000);
      const fim = new Date(hoje.getTime() + (w * 7 + 7) * 86400000);
      futuro.push({
        n: w + 1,
        ini: ini.toISOString(), fim: fim.toISOString(),
        demandaPrevista: Math.round(central),
        min: Math.max(0, Math.round(central - margem)),
        max: Math.round(central + margem),
        recPrevista: Math.round(recCentral),
        confianca,
        direcao: media > 0 ? (central > media * 1.03 ? 'alta' : central < media * 0.97 ? 'baixa' : 'estavel')
                           : (central > 0 ? 'alta' : 'estavel'),
        variacao: media ? Math.round((central / media - 1) * 100) : 0,
        nota: central > media * 1.03
          ? 'Acima da média histórica — prepare agenda e estoque.'
          : central < media * 0.97
            ? 'Abaixo da média — reative clientes frios e promova.'
            : 'Ritmo de manutenção — siga o plano.',
      });
    }

    // Passado com variações semana a semana
    const passado = hist.semanas.map(({ ini, fim }, i) => ({
      ini: ini.toISOString(), fim: fim.toISOString(),
      valor: valores[i],
      variacao: i === 0 ? null : (valores[i - 1] ? Math.round((valores[i] / valores[i - 1] - 1) * 100) : null),
      cli: hist.serie[i].cli,
      rec: hist.serie[i].rec,
    }));

    const atualVsMedia = media ? Math.round((hist.corrente.atd / media - 1) * 100) : null;
    const projecaoFim = futuro[7].demandaPrevista;
    const tendenciaGeral = projecaoFim > media * 1.03 ? 'alta' : projecaoFim < media * 0.97 ? 'baixa' : 'estavel';
    return { passado, corrente: hist.corrente, media, inclinacao: reg.b, atualVsMedia, futuro, tendenciaGeral, analise, fm, temDados: hist.temDados, temExterno };
  }

  /* ============================ GRÁFICO SVG ============================= */
  /** Gráfico: 8 semanas passadas | HOJE | 8 semanas projetadas.
   *  Seta verde sobe / vermelha desce entre pontos; banda de confiança. */
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

    const suave = (() => {
      // Catmull-Rom para Bézier
      const P = pts.map((pt, i) => [x(i), y(pt.v)]);
      if (P.length < 3) return P.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join('');
      let d = `M${P[0][0]},${P[0][1]}`;
      for (let i = 0; i < P.length - 1; i++) {
        const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
        d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
      }
      return d;
    })();
    const linhaPassada = (() => {
      const P = pts.slice(0, hojeIdx + 1).map((pt, i) => [x(i), y(pt.v)]);
      let d = `M${P[0][0]},${P[0][1]}`;
      for (let i = 0; i < P.length - 1; i++) {
        const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
        d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
      }
      return d;
    })();
    const areaPassada = linhaPassada + `L${x(hojeIdx)},${T + ph}L${x(0)},${T + ph}Z`;
    const linhaFutura = (() => {
      const P = pts.slice(hojeIdx).map((pt, i) => [x(i + hojeIdx), y(pt.v)]);
      let d = `M${P[0][0]},${P[0][1]}`;
      for (let i = 0; i < P.length - 1; i++) {
        const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
        d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
      }
      return d;
    })();

    // Banda de confiança futura
    let banda = '';
    const sup = pts.slice(hojeIdx).map((pt, i) => `${i ? 'L' : 'M'}${x(i + hojeIdx).toFixed(1)},${y(pt.max != null ? pt.max : pt.v).toFixed(1)}`).join(' ');
    const inf = pts.slice(hojeIdx).map((pt, i) => `L${x(N - 1 - i).toFixed(1)},${y(pts[N - 1 - i].min != null ? pts[N - 1 - i].min : pts[N - 1 - i].v).toFixed(1)}`).join(' ');
    banda = sup + ' ' + inf + ' Z';

    // Grade horizontal
    let grade = '';
    const passosY = 4;
    for (let g = 0; g <= passosY; g++) {
      const vy = y((maxV * g) / passosY);
      grade += `<line class="cg-axis" x1="${L}" y1="${vy}" x2="${W - R}" y2="${vy}" opacity="${g ? 0.5 : 1}"/>` +
        `<text class="cg-axis-txt" x="${L - 7}" y="${vy + 3}" text-anchor="end">${Math.round(maxV * g / passosY)}</text>`;
    }

    // Rótulos do eixo X (semanas)
    let rotulosX = '';
    pts.forEach((pt, i) => {
      const lbl = pt.tipo === 'futuro'
        ? '+' + (i - hojeIdx) + 's'
        : pt.tipo === 'hoje' ? 'HOJE' : (i - hojeIdx) + 's';
      if (pt.tipo === 'hoje' || i % 2 === 0 || pt.tipo === 'futuro') {
        rotulosX += `<text class="cg-axis-txt ${pt.tipo === 'hoje' ? 'cg-hoje-txt' : ''}" x="${x(i)}" y="${H - 10}" text-anchor="middle">${lbl}</text>`;
      }
    });

    // Setas de variação entre pontos (movimento ↑↓)
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
      // % só nas transções relevantes (a cada ponto futuro e nas últimas passadas)
      if (!igual && (i >= hojeIdx - 1)) {
        const pct = a.v ? Math.round((b.v / a.v - 1) * 100) : 0;
        if (pct !== 0) setas += `<text class="cg-pct" x="${mx}" y="${my - 11}" text-anchor="middle" fill="${cor}" style="animation-delay:${i * 55 + 90}ms">${pct > 0 ? '+' : ''}${pct}%</text>`;
      }
    }

    // Pontos
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
            <stop offset="0%" stop-color="var(--e-cyan)" stop-opacity=".14"/>
            <stop offset="100%" stop-color="var(--e-cyan)" stop-opacity=".05"/>
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

    // Tooltip interativo
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
          ? new Date(pt.p.ini).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ' – ' + new Date(pt.p.fim).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
          : pt.tipo === 'hoje'
            ? 'Semana corrente (em andamento)'
            : new Date(pt.f.ini).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ' – ' + new Date(pt.f.fim).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
        const extra = pt.tipo === 'futuro'
          ? ` · faixa ${pt.min}–${pt.max} · confiança ${pt.f.confianca}%`
          : pt.tipo === 'passado' ? ` · ${pt.p.cli} novo(s) cliente(s)` : '';
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
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, raf = 0, t = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function dim() { W = canvas.width = canvas.clientWidth * dpr; H = canvas.height = canvas.clientHeight * dpr; }
    dim();
    window.addEventListener('resize', dim, { passive: true });
    // Teardown completo: sem isso cada análise acumulava um listener de resize
    // (com o canvas desanexado na memória) para sempre.
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
          <div><h2>Possível Cenário</h2><p>Revisão real das últimas 8 semanas + investigação do mercado do seu estado + projeção fundamentada.</p></div>
          <button class="btn btn-icon cen-fechar" title="Fechar">✕</button>
        </div>
        <div class="cen-form">
          <label>País <input class="input" id="cn-pais" value="${esc(cfg.pais)}" /></label>
          <label>Estado (UF) <input class="input" id="cn-estado" value="${esc(cfg.estado)}" maxlength="2" placeholder="RS" /></label>
          <label>Cidade <input class="input" id="cn-cidade" value="${esc(cfg.cidade)}" placeholder="sua cidade" /></label>
          <label>Segmento <input class="input" id="cn-seg" value="${esc(cfg.segmento)}" /></label>
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
    ov.querySelector('#cn-iniciar').addEventListener('click', () => executar(ov));
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
    'Conectando aos motores de busca…',
    'Contando barbearias, comércios e empresas no Maps…',
    'Consultando índices de consumo e confiança…',
    'Procurando eventos e datas especiais próximas…',
    'Cruzando dados locais com o cenário externo…',
    'Calculando a projeção semana a semana…',
  ];

  async function executar(ov) {
    const pais = ov.querySelector('#cn-pais').value.trim() || 'Brasil';
    const estado = ov.querySelector('#cn-estado').value.trim().toUpperCase().slice(0, 2);
    const cidade = ov.querySelector('#cn-cidade').value.trim();
    const segmento = ov.querySelector('#cn-seg').value.trim() || 'barbearia';

    // Guarda a localização para as próximas análises (pré-preenchimento)
    try {
      const Em = E();
      const dbd = Em.db.get();
      dbd.config = dbd.config || {};
      dbd.config.sistema = Object.assign({}, dbd.config.sistema, { pais, estado, cidade, segmento });
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
      const qs = new URLSearchParams({ pais, estado, cidade, segmento });
      const resp = await fetch(`${window.NEITZEL_API_BASE || ''}/api/cenario/analisar?` + qs.toString(), { signal: AbortSignal.timeout(180000) });
      resultado = await resp.json();
    } catch (e) { erroRede = true; }
    const decorrido = Date.now() - inicioT;
    if (decorrido < 4200) await new Promise((r) => setTimeout(r, 4200 - decorrido));
    clearInterval(timerEtapas);

    const analise = analisarFontes(resultado && resultado.fontes || []);
    const prev = sintetizar(hist, analise, resultado && resultado.mercado);
    prev._avisoRede = erroRede || !resultado || !resultado.ok;
    mostrarResultado(ov, prev, { fontes: resultado && resultado.fontes || [], mercado: resultado && resultado.mercado || null }, { pais, estado, cidade, segmento });
  }

  function mostrarResultado(ov, prev, info, onde) {
    const corpo = ov.querySelector('.cen-corpo');
    ov._pararFX && ov._pararFX();
    ov._pararFX = iniciarCanvas(ov.querySelector('.cen-canvas'), 'resultado');

    const cores = { alta: 'var(--e-green)', baixa: 'var(--e-danger)', estavel: 'var(--text-muted)' };
    const setas = { alta: '↗', baixa: '↘', estavel: '→' };
    /* Os valores das contas já estão em CENTAVOS (padrão do core) — fmtMoney
       divide por 100. Multiplicar de novo inflava a projeção 100×. */
    const fmtMoeda = (v) => {
      try { const Em = E(); if (Em && Em.fmtMoney) return Em.fmtMoney(Math.round(v || 0)); } catch (e) {}
      return 'R$ ' + (Number(v || 0) / 100).toFixed(2).replace('.', ',');
    };

    /* ---- Revisão das 8 semanas passadas ---- */
    const revPast = prev.passado.map((p, i) => {
      const dir = p.variacao == null ? '' : p.variacao > 0 ? `<span style="color:var(--e-green)">▲${p.variacao}%</span>` : p.variacao < 0 ? `<span style="color:var(--e-danger)">▼${Math.abs(p.variacao)}%</span>` : '<span class="text-muted">=</span>';
      return `<div class="cw cw-in" style="animation-delay:${i * 50}ms">
        <div class="cw-top">S-${prev.passado.length - i}</div>
        <div class="cw-val">${p.valor}</div>
        <div class="cw-var">${dir}</div>
        <div class="cw-sub">${new Date(p.ini).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</div>
      </div>`;
    }).join('');

    const avisoSemDados = !prev.temDados
      ? '<div class="cen-aviso" style="margin-bottom:12px"><b>Suas séries ainda estão começando:</b> poucos atendimentos registrados nas últimas 8 semanas. A projeção usa a média atual + o cenário externo — ela fica mais precisa conforme o Planner for alimentado.</div>'
      : '';

    const avisoRede = prev._avisoRede
      ? '<div class="cen-aviso" style="margin-bottom:12px"><b>Investigação externa indisponível agora</b> — verifique se o servidor está aberto (Abrir Sistema.bat). Mostrando a análise com seus dados internos.</div>'
      : '';

    /* ---- Mercado real (Maps) ---- */
    let htmlMercado = '';
    const mc = info.mercado && info.mercado.consultas;
    if (mc && mc.length) {
      htmlMercado = `
        <div class="cen-card cen-in">
          <h4>Mercado real — lido do Google Maps agora (${esc([onde.cidade, onde.estado].filter(Boolean).join('/') || onde.pais)})</h4>
          <div class="cen-mkt-grid">
            ${mc.map((m, i) => `
              <div class="cm cm-in" style="animation-delay:${i * 70}ms">
                <div class="cm-termo">${esc(m.termo)}${m.nivel === 'estado' ? ' · estado inteiro' : ''}${m.nivel === 'cidade' ? ' · cidade' : ''}</div>
                <div class="cm-total"><b>${m.total}</b><span>no topo do Maps</span></div>
                ${m.mediaEstrelas != null ? `<div class="cm-nota">★ ${m.mediaEstrelas} médio (${m.comNota} avaliados)</div>` : ''}
                ${(m.amostra || []).slice(0, 4).map((a) => `<div class="cm-item">${esc(a.nome)}${a.nota ? ` <span>${esc(String(a.nota).slice(0, 24))}</span>` : ''}</div>`).join('')}
              </div>`).join('')}
          </div>
          <div class="cen-mkt-leitura"><b>${esc(prev.fm.rotulo)}</b> — ${esc(prev.fm.detalhe || '')}<br>
            <small style="color:var(--text-muted)">* contagem da amostra dos primeiros resultados de cada busca no Google Maps (até 40 por termo) — termômetro de densidade, não censo completo.</small></div>
        </div>`;
    }

    corpo.innerHTML = `
      ${avisoRede}${avisoSemDados}
      <div class="cen-resumo cen-in">
        <div class="cr-item"><div class="cr-val" style="color:${cores[prev.tendenciaGeral]}">${setas[prev.tendenciaGeral]} ${prev.tendenciaGeral.toUpperCase()}</div><span>tendência próximas 8 sem.</span></div>
        <div class="cr-item"><div class="cr-val">${prev.corrente.atd} <small style="font-size:12px;color:var(--text-muted)">(${prev.atualVsMedia == null ? '—' : (prev.atualVsMedia > 0 ? '+' : '') + prev.atualVsMedia + '%'})</small></div><span>semana corrente vs média</span></div>
        <div class="cr-item"><div class="cr-val">${prev.futuro.reduce((a, f) => a + f.demandaPrevista, 0)}</div><span>movimento total previsto (8 sem.)</span></div>
        <div class="cr-item"><div class="cr-val">${fmtMoeda(prev.futuro.reduce((a, f) => a + (f.recPrevista || 0), 0))}</div><span>receita prevista (8 sem.)</span></div>
        <div class="cr-item"><div class="cr-val">${esc(prev.fm.rotulo)}</div><span>leitura do mercado</span></div>
      </div>

      <div class="cen-card cen-in">
        <h4>Gráfico do movimento — 8 semanas passadas (real) → HOJE → 8 semanas (projeção)</h4>
        <div class="cg-wrap">
          ${graficoSVG(prev)}
          <div class="cg-tip"></div>
        </div>
        <div class="cg-legenda">
          <span><i class="lg lg-passado"></i>realizado</span>
          <span><i class="lg lg-hoje"></i>HOJE</span>
          <span><i class="lg lg-futuro"></i>projeção (tracejada)</span>
          <span><i class="lg lg-banda"></i>faixa de confiança</span>
          <span><i style="color:var(--e-green);font-style:normal;font-weight:800">↑</i>/<i style="color:var(--e-danger);font-style:normal;font-weight:800">↓</i> movimento</span>
        </div>
      </div>

      <div class="cen-card cen-in">
        <h4>Revisão das 8 semanas passadas (dados reais)</h4>
        <div class="cen-rev-grid">${revPast}</div>
      </div>

      ${htmlMercado}

      <div class="cen-card cen-in">
        <h4>Detalhe da projeção semana a semana</h4>
        <table class="table">
          <thead><tr><th>Semana</th><th>Período</th><th>Movimento previsto</th><th>Faixa</th><th>Receita prevista</th><th>Confiança</th><th>Leitura</th></tr></thead>
          <tbody>${prev.futuro.map((f) => `
            <tr>
              <td><b>+${f.n}s</b></td>
              <td class="text-muted">${new Date(f.ini).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${new Date(f.fim).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</td>
              <td><b>${f.demandaPrevista}</b> <span style="color:${cores[f.direcao]}">${setas[f.direcao]}</span> <span class="text-muted">(${f.variacao > 0 ? '+' : ''}${f.variacao}%)</span></td>
              <td class="text-muted">${f.min}–${f.max}</td>
              <td><b>${fmtMoeda(f.recPrevista || 0)}</b></td>
              <td><div class="cs-conf-bar" style="min-width:80px;display:inline-block;vertical-align:middle;margin-right:6px"><i style="width:${f.confianca}%"></i></div>${f.confianca}%</td>
              <td class="text-muted" style="font-size:12px">${esc(f.nota)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>

      ${prev.analise.eventos.length ? `<div class="cen-eventos cen-in"><b>Datas & eventos que podem mudar o jogo:</b> ${prev.analise.eventos.map((e) => `<a href="${esc(e.url || '#')}" target="_blank" rel="noopener">${esc(e.mes)} — ${esc(e.nome)}</a>`).join(' · ')}</div>` : ''}
      ${prev.analise.evidencias.length ? `
        <details class="cen-fontes cen-in">
          <summary>O agente leu ${prev.analise.evidencias.length} fonte(s) real(is) — ver o que encontrou</summary>
          <ul>${prev.analise.evidencias.map((ev) => `<li><a href="${esc(ev.url)}" target="_blank" rel="noopener">${esc(ev.titulo)}</a>${ev.trecho ? `<span>${esc(ev.trecho)}</span>` : ''}</li>`).join('')}</ul>
        </details>` : ''}
      <div class="cen-acoes">
        <button class="btn btn-sm" id="cn-repetir">Analisar de novo</button>
        <button class="btn btn-sm btn-primary" id="cn-exportar">Exportar cenário (.txt)</button>
      </div>`;

    // Histórico
    const histSave = lsGet(KEY_HIST, []);
    histSave.unshift({
      id: 'c-' + Date.now().toString(36),
      quandoISO: new Date().toISOString(),
      onde, tendenciaGeral: prev.tendenciaGeral,
      mediaHistorica: Number(prev.media.toFixed(1)),
      totalPrevisto: prev.futuro.reduce((a, f) => a + f.demandaPrevista, 0),
      corrente: prev.corrente.atd,
      mercadoTotal: info.mercado && info.mercado.consultas ? info.mercado.consultas.reduce((mx, c) => Math.max(mx, c.total), 0) : 0,
      sentimento: Number(prev.analise.sentimento.toFixed(2)),
      fontesCount: prev.analise.evidencias.length,
    });
    lsSet(KEY_HIST, histSave.slice(0, 20));

    ov.querySelector('#cn-repetir')?.addEventListener('click', () => executar(ov));
    ov.querySelector('#cn-exportar')?.addEventListener('click', () => {
      const linhas = [];
      linhas.push('NEITZEL — POSSÍVEL CENÁRIO (' + new Date().toLocaleString('pt-BR') + ')');
      linhas.push('Região: ' + [onde.cidade, onde.estado, onde.pais].filter(Boolean).join('/'));
      linhas.push('Média histórica semanal: ' + prev.media.toFixed(1) + ' · Semana corrente: ' + prev.corrente.atd + ' (' + (prev.atualVsMedia == null ? '—' : (prev.atualVsMedia > 0 ? '+' : '') + prev.atualVsMedia + '%') + ')');
      linhas.push('Mercado: ' + prev.fm.rotulo + (info.mercado && info.mercado.consultas ? ' — ' + info.mercado.consultas.map((c) => c.termo + ': ' + c.total).join(', ') : ''));
      linhas.push('Tendência 8 semanas: ' + prev.tendenciaGeral.toUpperCase());
      linhas.push('');
      linhas.push('PASSADO (real):');
      prev.passado.forEach((p, i) => linhas.push(`  S-${prev.passado.length - i}: ${p.valor} atendimentos${p.variacao != null ? (p.variacao >= 0 ? ' (+' : ' (') + p.variacao + '%)' : ''}`));
      linhas.push('');
      linhas.push('PROJEÇÃO:');
      prev.futuro.forEach((f) => {
        linhas.push(`  +${f.n}s (${new Date(f.ini).toLocaleDateString('pt-BR')}–${new Date(f.fim).toLocaleDateString('pt-BR')}): ${f.demandaPrevista} previsto, faixa ${f.min}–${f.max}, receita prevista ${fmtMoeda(f.recPrevista || 0)}, confiança ${f.confianca}%`);
      });
      if (prev.analise.evidencias.length) {
        linhas.push('', 'FONTES CONSULTADAS:');
        prev.analise.evidencias.forEach((ev) => linhas.push('- ' + ev.titulo + (ev.url ? ' (' + ev.url + ')' : '')));
      }
      const blob = new Blob(['\uFEFF' + linhas.join('\n')], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'NEITZEL-cenario-' + new Date().toISOString().slice(0, 10) + '.txt';
      a.click();
    });

    try { E().audit.record('estrategia.cenario_gerado', 'sistema', null, { tendencia: prev.tendenciaGeral, fontes: prev.analise.evidencias.length, mercado: prev.fm.rotulo }); } catch (e) {}
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

  window.NEITZEL_CENARIO = { open, fechar, renderHistoricoCard };
})();
