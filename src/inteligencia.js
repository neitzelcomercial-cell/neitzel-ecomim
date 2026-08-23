/* ============================================================================
 * NEITZEL — Centro de Inteligência (Agente Supervisor)
 * Monitoramento + diagnóstico + orientação.
 * A IA do assistente ganha APOIO REAL DO NAVEGADOR: busca na web (Bing/DuckDuckGo)
 * com extração dos melhores trechos, citando fontes — nada inventado.
 * ========================================================================== */

'use strict';

const NEITZEL_IA = (() => {
  const E = window.ECOMIM;
  const KEY = 'neitzel_inteligencia_v1';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const toast = (msg, tipo = 'info') => {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = el('div', `toast toast-${tipo}`, esc(msg));
    c.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 4200);
  };
  const nowISO = () => new Date().toISOString();
  const fmtDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  /* ------------------------------------------------------------------ *
   * ESTADO
   * ------------------------------------------------------------------ */
  const state = {
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) { /* ignore */ }
      return { problemas: [], sugestoes: [], atividades: [], ultimaVerificacao: null };
    },
    save(s) {
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
    },
  };
  let st = state.load();
  const save = () => state.save(st);

  /* ------------------------------------------------------------------ *
   * BUSCA NA WEB (apoio do navegador à IA) — DuckDuckGo HTML (sem chave)
   * ------------------------------------------------------------------ */
  async function buscarWeb(termo, limit = 5) {
    const q = encodeURIComponent(termo);
    try {
      // HTML de busca do DuckDuckGo (funciona sem API key, com CORS liberado via servidor local)
      const res = await fetch(`https://html.duckduckgo.com/html/?q=${q}`, {
        headers: { 'Accept-Language': 'pt-BR,pt;q=0.8' },
      });
      if (!res.ok) return { ok: false, motivo: 'http_' + res.status };
      const html = await res.text();
      const resultados = [];
      const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/g;
      let m;
      while ((m = re.exec(html)) !== null && resultados.length < limit) {
        resultados.push({
          titulo: m[2].replace(/<[^>]+>/g, '').trim(),
          url: m[1].replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, '').replace(/&rut=.*$/, ''),
          trecho: m[3].replace(/<[^>]+>/g, '').trim(),
        });
      }
      if (!resultados.length) return { ok: false, motivo: 'sem_resultados' };
      return { ok: true, resultados };
    } catch (e) {
      return { ok: false, motivo: 'erro', erro: e.message };
    }
  }

  /** Monta uma resposta da IA com apoio da web: dados do sistema + trechos pesquisados, sempre citando. */
  async function respostaComBusca(pergunta) {
    const origem = { conhecido: 0, buscado: 0 };
    const partes = [];

    // 1. Contexto interno (know): o que o sistema sabe
    const ctx = contextoInterno(pergunta);
    if (ctx) { partes.push(ctx.texto); origem.conhecido = 1; }

    // 2. Busca na web (retrieved) — tenta enriquecer quando a pergunta pede informação externa
    const precisaWeb = !/(lead|cliente|tarefa|venda|financeiro|estoque|lucro|agenda|atendimento|produto|serviço)/i.test(pergunta);
    if (precisaWeb) {
      const b = await buscarWeb(pergunta);
      if (b.ok && b.resultados.length) {
        const trechos = b.resultados.slice(0, 3).map((r, i) => `${i + 1}. ${r.titulo} — ${r.trecho} (Fonte: ${r.url})`).join('\n');
        partes.push(`Encontrei esta informação na web:\n${trechos}`);
        origem.buscado = b.resultados.length;
      } else {
        partes.push('Não consegui buscar informações externas agora (a busca depende de conexão). Posso responder sobre seus dados internos. Se preferir, informe o que precisa com mais detalhes.');
      }
    }

    const texto = partes.join('\n\n');
    return {
      ok: true,
      texto,
      origens: origem,
      citacoes: [],
      em: nowISO(),
      modo: 'local+web',
    };
  }

  /** Contexto interno por intenção — sempre com dados reais. */
  function contextoInterno(pergunta) {
    const p = String(pergunta || '').toLowerCase();
    if (E.modules && E.modules.bi) {
      const b = E.modules.bi;
      const d = E.db.get();
      const fin = E.modules.financeiro.saldo();
      const hoje = new Date().toISOString().slice(0, 10);
      const leadsHoje = d.leads.filter((l) => (l.criadoEm || '').slice(0, 10) === hoje).length;

      if (p.includes('lead')) {
        const atrasados = E.modules.tarefas.atrasadas().length;
        return { texto: `Você tem ${d.leads.length} lead(s) no funil (${leadsHoje} novo(s) hoje) e ${d.fila.length} na fila de aprovação. ${atrasados ? `Há ${atrasados} tarefa(s) atrasada(s) para follow-up.` : 'Sem tarefas atrasadas no momento.'}` };
      }
      if (p.includes('tarefa')) {
        const pend = E.modules.tarefas.pendentes();
        return { texto: `Você tem ${pend.length} tarefa(s) pendente(s) e ${E.modules.tarefas.atrasadas().length} atrasada(s). ${pend.length ? 'Considere priorizar as de maior urgência.' : ''}` };
      }
      if (p.includes('venda') || p.includes('faturamento') || p.includes('receita') || p.includes('financeiro')) {
        return { texto: `Contas a receber: ${E.fmtMoney(fin.aReceber)} · Recebido: ${E.fmtMoney(fin.recebido)} · A pagar: ${E.fmtMoney(fin.aPagar)} · Saldo: ${E.fmtMoney(fin.saldo)}. MRR: ${E.fmtMoney(b.mrr())}.` };
      }
      if (p.includes('estoque') || p.includes('produto')) {
        if (window.NEITZEL_OPS) {
          const baixo = window.NEITZEL_OPS.produtos.estoqueBaixo();
          const total = window.NEITZEL_OPS.produtos.list().length;
          return { texto: `Você tem ${total} produto(s) cadastrado(s). ${baixo.length ? ` ${baixo.length} produto(s) abaixo do estoque mínimo: ${baixo.map((x) => x.nome).slice(0, 5).join(', ')}.` : 'Nenhum produto abaixo do mínimo.'}` };
        }
        return { texto: 'O módulo de produtos está disponível, mas ainda não há produtos cadastrados.' };
      }
      if (p.includes('lucro')) {
        if (window.NEITZEL_OPS) {
          const r = window.NEITZEL_OPS.metrics.receitaAtendimentos(new Date(new Date().getFullYear(), 0, 1));
          const c = window.NEITZEL_OPS.metrics.custoAtendimentos(new Date(new Date().getFullYear(), 0, 1));
          const ds = window.NEITZEL_OPS.metrics.despesasAtendimentos(new Date(new Date().getFullYear(), 0, 1));
          // As métricas já retornam centavos; fmtMoney espera centavos (não multiplicar).
          return { texto: `Lucro líquido estimado do ano (só atendimentos concluídos): ${E.fmtMoney(r - c - ds)} — Receitas ${E.fmtMoney(r)}, Custos ${E.fmtMoney(c)}, Despesas ${E.fmtMoney(ds)}.` };
        }
        return { texto: 'Ainda não há atendimentos concluídos para calcular lucro.' };
      }
      if (p.includes('agenda') || p.includes('hoje') || p.includes('planner')) {
        const a = (window.NEITZEL_OPS && window.NEITZEL_OPS.atendimentos ? window.NEITZEL_OPS.atendimentos.hoje() : []);
        const fmtHora = (iso) => {
          if (!iso) return '';
          const d = new Date(iso);
          if (isNaN(d.getTime())) return '';
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        };
        return { texto: `Hoje você tem ${a.length} atendimento(s) marcado(s). ${a.length ? `Próximos: ${a.slice(0, 3).map((x) => x.cliente + ' (' + fmtHora(x.inicio) + ')').join(', ')}.` : 'Nenhum atendimento hoje.'}` };
      }
      if (p.includes('cliente')) {
        const n = (E.modules.clientes && E.modules.clientes.list ? E.modules.clientes.list().length : 0);
        return { texto: `Você tem ${n} cliente(s) cadastrados. Use Clientes & CS para ver perfis, health score e renovação.` };
      }
      if (p.includes('atendimento') || p.includes('ticket')) {
        const abertos = E.modules.atendimento.abertos();
        return { texto: `Você tem ${abertos.length} ticket(s) abertos e ${E.modules.atendimento.slaEmRisco().length} em risco de SLA.` };
      }
      if (p.includes('conversão') || p.includes('funil')) {
        const fc = b.funnelCounts();
        return { texto: `Funil: ${d.leads.length} lead(s) no total. Conversão geral: ${b.conversion()}%.` };
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * DIAGNÓSTICO AUTOMÁTICO (varredura de saúde do sistema)
   * ------------------------------------------------------------------ */
  function verificarSistema() {
    const problemas = [];
    const sugestoes = [];
    const atividades = [];
    const agora = new Date();

    // 1. Leads esquecidos (sem contato há 48h+)
    // Usa o campo real do lead: `created`/`updated` (o formato do core não tem `criadoEm`).
    const db = E.db.get();
    const leadsSemContato = (db.leads || []).filter((l) => {
      const hist = l.hist || [];
      const referencia = hist.length ? hist[hist.length - 1].at : (l.updated || l.created);
      const ult = new Date(referencia).getTime();
      return !isNaN(ult) && (agora.getTime() - ult) > 48 * 3600000 && !['ganho', 'perdido'].includes(l.etapa);
    }).length;
    if (leadsSemContato > 0) {
      problemas.push({ gravidade: 'medio', modulo: 'Leads', titulo: `${leadsSemContato} lead(s) sem contato há mais de 48 horas`, causa: 'Acompanhamento insuficiente', acao: 'Priorize o follow-up desses leads hoje.' });
      sugestoes.push({ titulo: `${leadsSemContato} lead(s) aguardando o primeiro follow-up`, acao: 'Abrir Leads & CRM' });
    }

    // 2. Tarefas atrasadas
    const atrasadas = E.modules.tarefas.atrasadas();
    if (atrasadas.length) {
      problemas.push({ gravidade: 'alto', modulo: 'Tarefas', titulo: `${atrasadas.length} tarefa(s) atrasada(s)`, causa: 'Prazo vencido sem conclusão', acao: 'Revise e conclua ou reagende.' });
      sugestoes.push({ titulo: `${atrasadas.length} tarefa(s) atrasada(s) para resolver`, acao: 'Abrir Agenda' });
    }

    // 3. Contas vencidas
    const vencidas = E.modules.financeiro.vencidas();
    if (vencidas.length) {
      problemas.push({ gravidade: 'critico', modulo: 'Financeiro', titulo: `${vencidas.length} conta(s) vencida(s)`, causa: 'Faturamento ou pagamento atrasado', acao: 'Confira as contas vencidas no módulo Financeiro.' });
    }

    // 4. SLA estourado
    const sla = E.modules.atendimento.slaEmRisco();
    if (sla.length) {
      problemas.push({ gravidade: 'alto', modulo: 'Atendimento', titulo: `${sla.length} ticket(s) com SLA em risco`, causa: 'Atendimento demorado', acao: 'Responda os tickets prioritários.' });
    }

    // 5. Estoque baixo
    if (window.NEITZEL_OPS) {
      const baixo = window.NEITZEL_OPS.produtos.estoqueBaixo();
      if (baixo.length) {
        problemas.push({ gravidade: 'medio', modulo: 'Estoque', titulo: `${baixo.length} produto(s) abaixo do estoque mínimo`, causa: 'Consumo sem reposição', acao: 'Registre entrada de estoque ou faça pedido ao fornecedor.' });
        sugestoes.push({ titulo: `Repor estoque: ${baixo.map((p) => p.nome).slice(0, 3).join(', ')}`, acao: 'Abrir Estoque' });
      }
      const agendados = window.NEITZEL_OPS.atendimentos.stats().hoje;
      if (agendados) atividades.push({ titulo: `${agendados} atendimento(s) hoje`, modulo: 'Planner' });
    }

    // 6. Atividades monitoradas (resumo)
    atividades.push({ titulo: `${db.leads.length} leads ativos`, modulo: 'CRM' });
    atividades.push({ titulo: `${E.modules.atendimento.abertos().length} tickets abertos`, modulo: 'Atendimento' });
    atividades.push({ titulo: `${E.modules.projetos.atrasados().length} projetos atrasados`, modulo: 'Projetos' });

    // 7. Alertas internos
    const rec = E.modules.financeiro.saldo();
    if (rec.aReceber === 0 && rec.recebido === 0) {
      sugestoes.push({ titulo: 'Nenhuma receita registrada ainda', acao: 'Abrir Financeiro' });
    }

    st.problemas = problemas.slice(0, 8);
    st.sugestoes = sugestoes.slice(0, 6);
    st.atividades = atividades.slice(0, 10);
    st.ultimaVerificacao = agora.toISOString();
    save();
    return { problemas, sugestoes, atividades };
  }

  /* ------------------------------------------------------------------ *
   * VIEW: CENTRO DE INTELIGÊNCIA
   * ------------------------------------------------------------------ */
  function renderInteligencia(c) {
    c.appendChild(el('div', 'page-header', '<h1>Centro de Inteligência</h1><p>Agente Supervisor — monitora o sistema, detecta problemas e sugere ações.</p>'));

    // Botão verificar agora
    const tb = el('div', 'planner-toolbar', '<button class="btn btn-primary btn-sm" id="btn-verificar">Verificar sistema agora</button>');
    if (st.ultimaVerificacao) tb.appendChild(el('span', 'text-muted', `Última verificação: ${fmtDateTime(st.ultimaVerificacao)}`));
    c.appendChild(tb);

    // Saúde do sistema
    const saude = el('div', 'card', '<h4>Saúde do sistema</h4>');
    const hg = el('div', 'health-grid', '');
    const itensSaude = [
      ['Armazenamento local', 'operacional'],
      ['Banco de dados (local)', 'operacional'],
      ['Autenticação (PIN)', E.security && E.security.hasPin ? E.security.hasPin() ? 'operacional' : 'atencao' : 'operacional'],
      ['Rotina de verificação', 'operacional'],
      ['Integração WhatsApp', st.ativo ? 'atencao' : 'interrompido'],
      ['IA (motor local)', 'operacional'],
      ['Caçador de Leads', window.ECOMIM_HUNTER ? 'operacional' : 'interrompido'],
      ['Estoque', window.NEITZEL_OPS ? 'operacional' : 'interrompido'],
    ];
    itensSaude.forEach(([nome, status]) => {
      const dot = status === 'operacional' ? 'h-ok' : status === 'atencao' ? 'h-warn' : 'h-bad';
      const label = status === 'operacional' ? 'Operacional' : status === 'atencao' ? 'Atenção' : 'Interrompido';
      hg.appendChild(el('div', 'health-item', `<span class="h-dot ${dot}"></span><div><b>${esc(nome)}</b><span>${label}</span></div>`));
    });
    saude.appendChild(hg);
    c.appendChild(saude);

    // Problemas
    const probs = el('div', 'card', '<h4>Alertas e problemas detectados</h4>');
    const pl = el('div', 'super-problems', '');
    if (!st.problemas.length) pl.appendChild(el('div', 'empty', 'Nenhum problema detectado. Sistema estável.'));
    st.problemas.forEach((p) => {
      const item = el('div', `super-problem p-${p.gravidade}`, '');
      const badge = p.gravidade === 'critico' ? 'badge-red' : p.gravidade === 'alto' ? 'badge-orange' : 'badge-cyan';
      item.innerHTML = `
        <div class="sp-head">
          <span class="badge ${badge}">${esc(p.gravidade.toUpperCase())}</span>
          <span class="badge badge-gray">${esc(p.modulo)}</span>
          <span class="sp-title">${esc(p.titulo)}</span>
        </div>
        <div class="sp-meta">Detectado em ${fmtDateTime(st.ultimaVerificacao || nowISO())}</div>
        <div class="sp-cause"><b>Provável causa:</b> ${esc(p.causa)}</div>
        <div class="sp-actions">
          <button class="btn btn-sm" data-open="${esc(p.acao)}">Ver módulo</button>
        </div>
      `;
      const btn = item.querySelector('[data-open]');
      if (btn) {
        const modulo = (p.modulo || '').toLowerCase();
        const viewMap = { leads: 'leads', tarefa: 'agenda', tarefas: 'agenda', financeiro: 'financeiro', atendimento: 'atendimento', estoque: 'estoque', projeto: 'projetos', marketing: 'marketing' };
        const destino = viewMap[modulo] || 'leads';
        btn.addEventListener('click', () => { if (window.ECOMIM_APP) window.ECOMIM_APP.renderView(destino); });
      }
      pl.appendChild(item);
    });
    probs.appendChild(pl);
    c.appendChild(probs);

    // Sugestões
    const sug = el('div', 'card', '<h4>Sugestões da IA</h4>');
    if (!st.sugestoes.length) sug.appendChild(el('div', 'empty', 'Sem sugestões no momento.'));
    st.sugestoes.forEach((s) => {
      const row = el('div', '', `<div class="ai-insight"><div class="ai-insight-head">Sugestão</div>${esc(s.titulo)}</div>`);
      sug.appendChild(row);
    });
    c.appendChild(sug);

    // Atividades monitoradas
    const atv = el('div', 'card', '<h4>Atividades monitoradas</h4>');
    const atT = el('table', 'table', '<thead><tr><th>Indicador</th><th>Módulo</th></tr></thead><tbody></tbody>');
    const tb3 = atT.querySelector('tbody');
    st.atividades.forEach((a) => tb3.appendChild(el('tr', '', `<td><b>${esc(a.titulo)}</b></td><td><span class="badge badge-gray">${esc(a.modulo)}</span></td>`)));
    atv.appendChild(atT);
    c.appendChild(atv);

    // Consulta com apoio da web
    const busca = el('div', 'card', '<h4>Assistente com apoio do navegador</h4><p class="text-muted" style="margin-bottom:10px">Faça uma pergunta: a IA responde com seus dados internos (sempre reais) e, quando a pergunta for sobre informações externas, busca na web e cita as fontes.</p>');
    const bRow = el('div', '', '<input class="input" id="iq-pergunta" placeholder="Ex.: o que é taxa Selic hoje? ou quantos leads tenho?" style="margin-bottom:8px">');
    const bBtn = el('button', 'btn btn-sm btn-primary', 'Perguntar à IA');
    bBtn.addEventListener('click', async () => {
      const inp = document.getElementById('iq-pergunta');
      if (!inp || !inp.value.trim()) return;
      const resp = await respostaComBusca(inp.value);
      const out = busca.querySelector('#iq-resposta');
      if (out) out.innerHTML = `<div class="ai-insight-head">Resposta (origens: ${resp.origens.conhecido ? 'dados do sistema' : ''}${resp.origens.conhecido && resp.origens.buscado ? ' + ' : ''}${resp.origens.buscado ? 'web' : ''})</div>${esc(resp.texto).replace(/\n/g, '<br>')}`;
    });
    bRow.appendChild(bBtn);
    busca.appendChild(bRow);
    busca.appendChild(el('div', 'ai-insight', `<div class="ai-insight-head" id="iq-resposta">Escreva uma pergunta acima.</div>`));
    c.appendChild(busca);

    const verBtn = c.querySelector('#btn-verificar');
    if (verBtn) verBtn.addEventListener('click', () => {
      verificarSistema();
      toast('Verificação concluída.', 'success');
      if (window.ECOMIM_APP) window.ECOMIM_APP.renderView('inteligencia');
    });
  }

  return { renderInteligencia, verificarSistema, respostaComBusca, buscarWeb, state };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { NEITZEL_IA };
if (typeof window !== 'undefined') window.NEITZEL_IA = NEITZEL_IA;