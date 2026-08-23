/* ============================================================================
 * NEITZEL — CÉREBRO DO ASSISTENTE v2 (agente local inteligente)
 * - Interpreta português com erros (acentos, digitação, gírias) via pipeline
 *   normalizar → corrigir léxico → detectar TIPO de pergunta + TÓPICO
 * - Base de conhecimento COMPLETA do sistema (passo a passo de tudo,
 *   portal, dicas) + respostas com DADOS REAIS + ações nas telas
 * - Dicas de negócio geradas a partir do estado real dos dados
 * - Pesquisa na web quando não sabe (com fontes)
 * ========================================================================== */
'use strict';

window.NEITZEL_CEREBRO = (() => {

  /* ------------------------- 1. PIPELINE LINGUÍSTICO ---------------------- */
  const norm = (s) => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9%+\-*/.,\s]/g, ' ').replace(/\s+/g, ' ').trim();

  const SINONIMOS = {
    vc:'voce', vcs:'voces', tb:'tambem', tbm:'tambem', pq:'porque', msm:'mesmo',
    aq:'aqui', aki:'aqui', hj:'hoje', oj:'hoje', agr:'agora', dps:'depois',
    qnd:'quando', qdo:'quando', qto:'quanto', qtos:'quantos', qnts:'quantos',
    qnt:'quanto', mto:'muito', mta:'muita', blz:'beleza', vlw:'valeu',
    cadastrar:'cadastra', cadastro:'cadastra', cadastrando:'cadastra', cadastrou:'cadastra',
    criar:'cria', crio:'cria', criando:'cria', adicionar:'adiciona', add:'adiciona',
    registrar:'registra', registro:'registra', marcar:'marca', marcando:'marca',
    abrir:'abra', abre:'abra', abri:'abra', mostrar:'mostra', mostre:'mostra',
    ir:'va', vou:'va', vai:'va', levar:'leve', ensina:'ensine', ensinar:'ensine',
    explica:'explique', explicar:'explique', funcionar:'funciona'
  };

  const LEXICO = ['atendimento','agendamento','agenda','financeiro','estoque',
    'produto','produtos','servico','servicos','cliente','clientes','lead','leads',
    'planner','portal','backup','relatorio','dashboard','margem','lucro','receita',
    'despesa','despesas','saldo','cacador','funil','fila','campanha','marketing',
    'projeto','projetos','colaborador','seguranca','senha','configuracoes',
    'memoria','diagnostico','bloquear','bloqueio','horario','horarios','disponivel',
    'disponibilidade','cancelamento','remarcacao','reserva','profissional',
    'profissionais','tema','logo','publicar','publicacao','instagram','whatsapp',
    'ticket','medio','fluxo','caixa','conta','pagamento','receber','pagar'];

  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const m = a.length, n = b.length;
    let ant = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++)
        cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      ant = cur;
    }
    return ant[n];
  }
  const corrigeToken = (t) => {
    if (LEXICO.includes(t)) return t;
    const max = t.length >= 8 ? 2 : t.length >= 5 ? 1 : 0;
    if (!max) return t;
    let melhor = t, menor = max + 1;
    for (const p of LEXICO) { const d = lev(t, p); if (d < menor) { menor = d; melhor = p; if (!d) break; } }
    return menor <= max ? melhor : t;
  };
  function interpretar(texto) {
    const t = norm(texto);
    const tokens = t.split(' ').filter(Boolean).map((tk) => {
      const base = SINONIMOS[tk] !== undefined ? SINONIMOS[tk] : tk;
      return corrigeToken(base);
    });
    return { t, tokens, frase: tokens.join(' ') };
  }

  /* --------------------------- 2. DADOS REAIS ----------------------------- */
  const lsGet = (k, f) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : f; } catch (e) { return f; } };
  const brl = (centavos) => (Number(centavos || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function dados() {
    const E = window.ECOMIM;
    const db = (E && E.db && E.db.get()) || {};
    const ops = window.NEITZEL_OPS || {};
    return {
      leads: db.leads || [], funil: db.funil || [], fila: db.fila || [],
      clientesCore: (E && E.modules && E.modules.clientes && E.modules.clientes.clientes) || lsGet('ecomim_clientes', []),
      atendimentos: (ops.atendimentos && ops.atendimentos.list()) || lsGet('neitzel_atendimentos_v1', []),
      servicos: (ops.servicos && ops.servicos.list()) || lsGet('neitzel_servicos_v1', []),
      produtos: (ops.produtos && ops.produtos.list()) || lsGet('neitzel_produtos_v1', [])
    };
  }
  const hojeYmd = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
  function receitaTotal(listaCentavos) { return listaCentavos.reduce((s,a)=>s+a,0); }

  function metricas() {
    const D = dados();
    const hj = hojeYmd(), mes = hj.slice(0,7);
    const ativos = D.atendimentos.filter((a)=>a.status!=='cancelado');
    const hoje_ = ativos.filter((a)=>String(a.inicio||'').slice(0,10)===hj);
    const conclMes = ativos.filter((a)=>a.status==='concluido' && String(a.inicio||'').slice(0,7)===mes);
    const valorAt = (a)=> (Number(a.servicoPreco)||0) + (a.itensProdutos||[]).reduce((s,it)=>s+(Number(it.precoUnitario)||0)*(it.quantidade||1),0);
    const receitaMes = receitaTotal(conclMes.map(valorAt));
    const ticketMedio = conclMes.length ? receitaMes/conclMes.length : 0;
    const proximo = hoje_.filter((a)=>['agendado','confirmado'].includes(a.status))
      .sort((a,b)=>String(a.inicio).localeCompare(String(b.inicio)))[0];
    const estBaixo = D.produtos.filter((p)=>{
      const q = Number(p.estoque != null ? p.estoque : p.quantidade != null ? p.quantidade : 99);
      return q <= Number(p.estoqueMinimo != null ? p.estoqueMinimo : 5);
    });
    const svSemDuracao = D.servicos.filter((s)=>s.status!=='inativo' && !(Number(s.duracaoMin)>0));
    return { D, hj, mes, hoje_, conclMes, receitaMes, ticketMedio, proximo, estBaixo, svSemDuracao };
  }

/*__C2__*/
})();
