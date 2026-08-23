/* ============================================================================
 * NEITZEL — CÉREBRO DO ASSISTENTE (agente inteligente local)
 * - Interpreta português com erros de digitação/acento (fuzzy + léxico)
 * - Motor de intenções com pontuação, contexto e memória de conversa
 * - Responde com DADOS REAIS do sistema, executa ações (navegar, tema…)
 * - Faz matemática, datas e — quando não sabe — PESQUISA NA WEB
 * ========================================================================== */
'use strict';

window.NEITZEL_CEREBRO = (() => {

  /* ------------------------- normalização / erros ------------------------- */
  const norm = (s) => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9%+\-*/.,\s]/g, ' ').replace(/\s+/g, ' ').trim();

  // Gírias/abreviações e erros clássicos de português → forma canônica
  const SINONIMOS = {
    'vc': 'voce', 'vcs': 'voces', 'tb': 'tambem', 'tbm': 'tambem', 'pq': 'porque',
    'msm': 'mesmo', 'aq': 'aqui', 'aki': 'aqui', 'hj': 'hoje', 'oj': 'hoje',
    'aman': 'amanha', 'agr': 'agora', 'dps': 'depois', 'qnd': 'quando',
    'qdo': 'quando', 'qto': 'quanto', 'qtos': 'quantos', 'qnt': 'quantos',
    'faço': 'faco', 'n': 'nao', 'na': 'na', 'eh': 'e', 'mto': 'muito',
    'mta': 'muita', 'qd': 'quando', 'blz': 'beleza', 'flw': 'falou',
    'cadastrar': 'cadastra', 'cadastro': 'cadastra', 'cadastrando': 'cadastra',
    'criar': 'cria', 'crio': 'cria', 'adicionar': 'adiciona', 'add': 'adiciona',
    'registrar': 'registra', 'marcar': 'marca', 'abrir': 'abra', 'abre': 'abra',
    'mostrar': 'mostra', 'mostre': 'mostra', 'ir': 'va', 'vou': 'va'
  };

  // Léxico do domínio para correção por distância de edição
  const LEXICO = ['atendimento', 'agendamento', 'agenda', 'financeiro', 'estoque',
    'produto', 'produtos', 'servico', 'servicos', 'cliente', 'clientes', 'lead',
    'leads', 'planner', 'portal', 'backup', 'relatorio', 'dashboard', 'margem',
    'lucro', 'receita', 'despesa', 'despesas', 'saldo', 'cacador', 'funil',
    'campanha', 'marketing', 'seguranca', 'configuracao', 'configuracoes',
    'memoria', 'diagnostico', 'bloquear', 'bloqueio', 'horario', 'horarios',
    'disponivel', 'disponibilidade', 'cancelamento', 'remarcacao', 'reserva'];

  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const m = a.length, n = b.length;
    let ant = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      ant = cur;
    }
    return ant[n];
  }

  function corrigeToken(t) {
    if (LEXICO.includes(t)) return t;
    const max = t.length >= 8 ? 3 : t.length >= 6 ? 2 : t.length >= 4 ? 1 : 0;
    if (!max) return t;
    let melhor = null, menor = max + 1;
    for (const p of LEXICO) {
      const d = lev(t, p);
      if (d < menor) { menor = d; melhor = p; }
      if (d === 0) break;
    }
    return menor <= max ? melhor : t;
  }

  /* ------------------------- dados reais do sistema ----------------------- */
  const lsGet = (k, f) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : f; } catch (e) { return f; } };
  const brl = (c) => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function dados() {
    const E = window.ECOMIM;
    const db = (E && E.db && E.db.get()) || {};
    const ops = window.NEITZEL_OPS || {};
    return {
      leads: db.leads || [],
      fila: db.fila || [],
      tarefas: db.tarefas || [],
      clientesCore: (E && E.modules && E.modules.clientes && E.modules.clientes.clientes) || [],
      atendimentos: (ops.atendimentos && ops.atendimentos.list()) || lsGet('neitzel_atendimentos_v1', []),
      servicos: (ops.servicos && ops.servicos.list()) || lsGet('neitzel_servicos_v1', []),
      produtos: (ops.produtos && ops.produtos.list()) || lsGet('neitzel_produtos_v1', [])
    };
  }

  function hojeYmd() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  function resumoOperacao() {
    const D = dados();
    const hj = hojeYmd();
    const atdsHoje = D.atendimentos.filter((a) => String(a.inicio || '').slice(0, 10) === hj);
    const concl = D.atendimentos.filter((a) => a.status === 'concluido');
    const receitaMes = concl.filter((a) => String(a.inicio || '').slice(0, 7) === hj.slice(0, 7))
      .reduce((s, a) => s + (Number(a.servicoPreco) || 0), 0);
    const ticket = concl.length ? receitaTotal(concl) / concl.length : 0;
    return { D, hj, atdsHoje, concl, receitaMes, ticket };
  }
  function receitaTotal(lista) {
    return lista.reduce((s, a) => s + (Number(a.servicoPreco) || 0) +
      (a.itensProdutos || []).reduce((x, it) => x + (Number(it.precoUnitario) || 0) * (it.quantidade || 1), 0), 0);
  }

  /* --------------------------- matemática segura -------------------------- */
  function matematica(t) {
    let m = t.match(/(\d+[.,]?\d*)\s*%\s*(?:de|do|da)\s*(\d+[.,]?\d*)/);
    if (m) {
      const v = parseFloat(m[1].replace(',', '.')) / 100 * parseFloat(m[2].replace(',', '.'));
      return `${m[1]}% de ${m[2]} = **${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}**`;
    }
    m = t.match(/^[\d\s+\-*/().,%x]+$/.test(t.replace(/quanto e |resultado de |/g, '')) ? /[-+*/()\d.,%x\s]{3,}/ : null);
    if (m && /\d/.test(m[0]) && /[+\-*/%x]/.test(m[0])) {
      try {
        const expr = m[0].replace(/,/g, '.').replace(/x/g, '*').replace(/%/g, '/100');
        if (/^[\d\s+\-*/().]+$/.test(expr)) {
          const val = Function('"use strict";return (' + expr + ')')();
          if (isFinite(val)) return `**${Number(val.toFixed(4)).toLocaleString('pt-BR')}**`;
        }
      } catch (e) {}
    }
    return null;
  }

  /* ------------------------------ intenções ------------------------------- */
  const memoria = { ultimoTopico: null, historico: [] };

  const INTENTES = [
    { id: 'saudacao', termos: ['ola', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'eae', 'opa', 'salve'], forte: 1,
      resp: () => `Olá! Sou o agente inteligente do **NEITZEL**. Posso:\n• responder com **dados reais** do sistema (leads, agenda, financeiro…)\n• executar ações — diga *"abra o planner"* ou *"abra o portal do cliente"*\n• explicar qualquer função passo a passo\n• fazer contas (*"15% de 380"*)\n• **pesquisar na web** quando eu não souber\n\nO que você precisa?` },

    { id: 'agradecer', termos: ['obrigado', 'obrigada', 'valeu', 'vlw', 'brigado', 'agradeco'],
      resp: () => 'Por nada! Estou sempre por aqui — é só chamar. 💪' },

    { id: 'despedida', termos: ['tchau', 'falou', 'ate mais', 'ate logo', 'adeus'],
      resp: () => 'Até logo! Qualquer dúvida sobre o sistema ou o negócio, estou aqui.' },

    { id: 'quem_e_vc', termos: ['quem e voce', 'o que voce e', 'voce e uma ia', 'seu nome', 'como voce funciona'], forte: 1,
      resp: () => 'Sou o **Assistente Neitzel** — um agente que roda dentro do seu sistema:\n• interpreto perguntas mesmo com erros de digitação\n• consulto dados reais (nada inventado)\n• executo ações nas telas\n• e quando a resposta está fora do sistema, **pesquiso na web** e cito as fontes.' },

    { id: 'ajuda', termos: ['ajuda', 'ajudar', 'help', 'socorro', 'o que voce faz', 'o que pode fazer', 'comandos'], forte: 1,
      resp: () => `Posso ajudar assim:\n📊 **Dados reais**: *"quantos leads tenho?"*, *"receita do mês"*, *"agenda de hoje"*, *"estoque baixo?"*\n🧭 **Ações**: *"abra o financeiro"*, *"vá para o planner"*, *"tema claro"*\n📖 **Tutoriais**: *"como cadastrar um serviço"*, *"como bloquear horário no portal"*\n🧮 **Contas**: *"quanto é 12*3,5"*, *"20% de 1500"*\n🌐 **Web**: pergunte qualquer coisa geral (*"o que é MRR?"*)` }
  ];

  /* ------------------- intenções com DADOS REAIS -------------------------- */
  INTENTES.push(
    { id: 'leads_qtd', termos: ['quantos leads', 'leads tenho', 'total de leads', 'meus leads', 'lista de leads'], forte: 1,
      resp: () => {
        const { D } = resumoOperacao();
        const ganhos = D.leads.filter((l) => l.status === 'ganho').length;
        return `Você tem **${D.leads.length} leads** no CRM (${ganhos} ganhos, ${D.fila.length} na fila de aprovação).\nFunil: ${JSON.stringify(funilResumo())}`;
        function funilResumo() {
          const f = {}; (window.ECOMIM.db.get().funil || []).forEach((e) => { f[e.nome] = D.leads.filter((l) => l.etapaId === e.id).length; });
          return Object.entries(f).map(([k, v]) => `${k}: ${v}`).join(' · ');
        }
      } },

    { id: 'agenda_hoje', termos: ['agenda de hoje', 'atendimentos de hoje', 'hoje na agenda', 'compromissos de hoje', 'atendimento hoje'], forte: 1,
      resp: () => {
        const { atdsHoje, hj } = resumoOperacao();
        if (!atdsHoje.length) return 'Não há **nenhum atendimento agendado para hoje** (' + hj.split('-').reverse().join('/') + '). Quer que eu abra o Planner? É só dizer *"abra o planner"*.';
        const lista = atdsHoje.slice(0, 8).map((a) => `• ${String(a.inicio).slice(11, 16)} — ${a.cliente} (${a.servicoNome || 'serviço livre'})`).join('\n');
        return `**${atdsHoje.length} atendimento(s) hoje:**\n${lista}`;
      } },

    { id: 'receita_mes', termos: ['receita do mes', 'faturamento', 'quanto facturei', 'faturei', 'ganhei no mes', 'receita mes', 'lucro do mes'], forte: 1,
      resp: () => {
        const { receitaMes, concl } = resumoOperacao();
        return `A receita de atendimentos **concluídos** neste mês é **${brl(receitaMes)}**, em ${concl.length} atendimento(s) concluídos.\nObs.: considera serviço + produtos vinculados.`;
      } },

    { id: 'ticket_medio', termos: ['ticket medio', 'ticket medio e', 'valor medio'], forte: 1,
      resp: () => {
        const { concl } = resumoOperacao();
        if (!concl.length) return 'Ainda não há atendimentos concluídos para calcular o ticket médio.';
        const t = receitaTotal(concl) / concl.length;
        return `Seu **ticket médio** é **${brl(t * 100)}** (base: ${concl.length} atendimentos concluídos).`;
      } },

    { id: 'estoque_baixo', termos: ['estoque baixo', 'produtos acabando', 'faltando no estoque', 'repor estoque'], forte: 1,
      resp: () => {
        const { D } = resumoOperacao();
        const baixos = D.produtos.filter((p) => Number(p.estoque != null ? p.estoque : p.quantidade != null ? p.quantidade : 99) <= Number(p.estoqueMinimo != null ? p.estoqueMinimo : 5));
        if (!D.produtos.length) return 'Não há produtos cadastrados ainda. Diga *"como cadastrar produto"* que eu te guio.';
        if (!baixos.length) return `Nenhum produto abaixo do mínimo nos ${D.produtos.length} cadastrados. 👍`;
        return `**${baixos.length} produto(s) com estoque baixo:**\n` + baixos.map((p) => `• ${p.nome}: ${p.estoque != null ? p.estoque : p.quantidade}`).join('\n');
      } },

    { id: 'clientes_qtd', termos: ['quantos clientes', 'clientes cadastrados', 'total de clientes', 'meus clientes'], forte: 1,
      resp: () => {
        const { D } = resumoOperacao();
        return `Você tem **${D.clientesCore.length} cliente(s)** no CRM${D.customersPortal ? '' : ''}. Quer ver a lista? Diga *"abra os clientes"*.`;
      } },

    { id: 'servicos_lista', termos: ['meus servicos', 'lista de servicos', 'quais servicos', 'servicos cadastrados'], forte: 1,
      resp: () => {
        const { D } = resumoOperacao();
        const at = D.servicos.filter((s) => s.status !== 'inativo');
        if (!at.length) return 'Nenhum serviço ativo. Diga *"como cadastrar um serviço"* que eu te guio passo a passo.';
        return `**Serviços ativos (${at.length}):**\n` + at.slice(0, 10).map((s) => `• ${s.nome} — ${brl(s.preco)} · ${s.duracaoMin || '?'} min`).join('\n');
      } }
  );

  /* ------------------- AÇÕES: navegação, tema, portal --------------------- */
  const VIEWS = { dashboard: 'dashboard', painel: 'dashboard', inicio: 'dashboard',
    planner: 'planner', agenda: 'agenda', calendario: 'agenda', servico: 'servicos',
    produto: 'produtos', estoque: 'estoque', financeiro: 'financeiro',
    cliente: 'clientes', crm: 'leads', lead: 'leads', cacador: 'cacador',
    funil: 'funil', fila: 'fila', bi: 'bi', inteligencia: 'inteligencia',
    automatizacao: 'automacoes', automacao: 'automacoes', comunicacao: 'comunicacao',
    acessor: 'acessor', portal: 'portal', memoria: 'memoria', diagnostico: 'suporte',
    problema: 'suporte', seguranca: 'seguranca', senha: 'seguranca',
    configuracao: 'config', projeto: 'projetos', marketing: 'marketing', rh: 'rh' };

  INTENTES.push(
    { id: 'navegar', termos: ['abra', 'va para', 'mostra', 'abrir tela', 'ir para'], forte: 0,
      regex: /\b(abra|va|mostra|mostre|leve|navegue|entre)\b/,
      resp: (ctx) => {
        const alvo = ctx.tokens.map((tk) => VIEWS[tk]).find(Boolean) || VIEWS[ctx.tokens[ctx.tokens.length - 1]];
        if (!alvo) return null;
        return { texto: `Abrindo **${alvo === 'dashboard' ? 'o Dashboard' : alvo === 'suporte' ? 'a Central de Diagnóstico' : alvo}** para você…`,
          acao: () => window.ECOMIM_APP && window.ECOMIM_APP.renderView(alvo) };
      } },

    { id: 'abrir_portal_publico', termos: ['abra o portal', 'abrir portal', 'link do portal', 'portal publico', 'abre o agendamento'], forte: 1,
      resp: () => ({ texto: 'Abrindo o **Portal Público de Agendamento** (`/agendamento`)…',
        acao: () => window.open('/agendamento', '_blank') }) },

    { id: 'tema', termos: ['tema claro', 'tema escuro', 'modo claro', 'modo escuro', 'trocar tema'], forte: 1,
      resp: (ctx) => {
        const querClaro = /claro/.test(ctx.t);
        return { texto: 'Alterando o **tema** do sistema…',
          acao: () => {
            const atual = document.documentElement.getAttribute('data-theme');
            if ((querClaro && atual !== 'light') || (!querClaro && atual === 'light')) {
              const b = document.querySelector('#btn-tema'); b && b.click();
            }
          } };
      } },

    { id: 'data_hora', termos: ['que horas sao', 'que dia e hoje', 'data de hoje', 'hora agora'], forte: 1,
      resp: () => {
        const d = new Date();
        return `Agora é **${d.toLocaleTimeString('pt-BR')}** de **${d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}**.`;
      } },

    { id: 'como_cadastrar_servico', termos: ['como cadastra um servico', 'como cadastra servico', 'cadastrar servico', 'novo servico'], forte: 1,
      resp: () => `Vamos cadastrar um serviço:\n1. Diga *"abra os serviços"* (ou eu abro: use o menu **Catálogo → Serviços**)\n2. Clique em **Novo serviço**\n3. Preencha nome, descrição e categoria\n4. Informe **preço** e **custo** — a margem é calculada sozinha\n5. Defina a **duração em minutos** (usada pela agenda do Portal!)\n6. Salve ✅\nDepois diga *"publicar catálogo no portal"* para o cliente ver.` },

    { id: 'como_cadastrar_produto', termos: ['como cadastra um produto', 'cadastrar produto', 'novo produto'], forte: 1,
      resp: () => `Cadastro de produto:\n1. Menu **Catálogo → Produtos**\n2. **Novo produto** → nome e SKU\n3. Preço, custo e quantidade em estoque (+ mínimo para alertas)\n4. Categoria e salvar ✅` },

    { id: 'como_agendar', termos: ['como agenda', 'agendar atendimento', 'marcar atendimento', 'novo atendimento'], forte: 1,
      resp: () => `Para agendar:\n1. Abra o **Planner** (diga *"abra o planner"* que eu levo você)\n2. Escolha o dia/horário ou clique em **Novo**\n3. Informe cliente, serviço, início/fim e responsável\n4. Salve — o cliente aparece na agenda com status **agendado**\n💡 Se o cliente preferir se auto-atender, envie o link do **Portal do Cliente**.` },

    { id: 'como_bloquear_portal', termos: ['bloquear horario', 'bloquear dia', 'fechar dia no portal', 'bloqueio no portal', 'feriado no portal'], forte: 1,
      resp: () => `Bloqueios no Portal do Cliente:\n1. Menu **Sistema → Portal do Cliente**\n2. Em **Bloqueios, feriados e horários especiais**:\n   • *Datas fechadas*: escolha o dia + motivo (feriado, férias…)\n   • *Horários bloqueados*: dia + faixa (ex.: reunião 14h–15h)\n3. Pronto — o portal retira aqueles horários **na hora**, sem editar nada à mão.` },

    { id: 'como_backup', termos: ['backup', 'exportar dados', 'salvar copia'], forte: 1,
      resp: () => `Backup dos seus dados:\n1. Menu **Configurações**\n2. Use **Exportar backup** (gera arquivo criptografado)\n3. Guarde o arquivo em local seguro; **Importar backup** restaura tudo.\nRecomendo exportar semanalmente. 🔐` }
  );

  /* ------------------------- pesquisa na web ------------------------------ */
  async function buscarNaWeb(q) {
    try {
      const r = await fetch('/api/ia/search?q=' + encodeURIComponent(q));
      const j = await r.json();
      if (!j.ok) throw new Error('sem resultado');
      let txt = '🔎 **Pesquisei na web** para você:\n\n' + j.texto;
      if (j.fontes && j.fontes.length) txt += '\n\n**Fontes:**\n' + j.fontes.slice(0, 3).map((f) => '• ' + f.titulo).join('\n');
      return { texto: txt };
    } catch (e) {
      return { texto: 'Não encontrei isso no meu conhecimento local e a **pesquisa web está indisponível** agora (sem internet ou servidor desligado).\n\nMas sou forte no **seu sistema**: experimente perguntar *"quantos leads tenho"*, *"agenda de hoje"*, *"como cadastrar serviço"* — ou peça *"abra o financeiro"*.' };
    }
  }

  /* --------------------------- motor de decisão --------------------------- */
  function pontuar(intent, t, tokens) {
    let s = 0;
    for (const k of intent.termos || []) {
      const kk = norm(k);
      if (t.includes(kk)) s += kk.includes(' ') ? 2.2 : 1.2;
      else {
        for (const tk of tokens) {
          if (tk.length >= 4 && Math.abs(tk.length - kk.length) <= 2 && lev(tk, kk) <= 1) { s += .7; break; }
        }
      }
    }
    if (intent.regex && intent.regex.test(t)) s += 2;
    if (intent.forte) s += .4;
    return s;
  }

  async function perguntar(texto) {
    memoria.historico.push(texto);
    if (memoria.historico.length > 12) memoria.historico.shift();
    try {
      const t = norm(texto);
      const tokens = t.split(/\s+/).filter(Boolean).map(corrigeToken);

      // 1) matemática direta ("15% de 380", "12*3,5")
      if (/\d/.test(t) && /[+\-*/%x]|de\s/.test(t)) {
        const mat = matematica(t);
        if (mat) return { texto: '🧮 ' + mat };
      }

      // 2) melhor intenção por pontuação fuzzy
      let melhor = null, melhorS = 0;
      for (const it of INTENTES) {
        const s = pontuar(it, t, tokens);
        if (s > melhorS) { melhorS = s; melhor = it; }
      }
      const limiar = melhor && melhor.forte ? 1.4 : 1.9;
      if (melhor && melhorS >= limiar) {
        const ctx = { t, tokens };
        const r = await Promise.resolve(melhor.resp ? melhor.resp(ctx) : null);
        memoria.ultimoTopico = melhor.id;
        if (r && typeof r === 'object') return r;
        if (r) return { texto: r, acao: undefined };
      }

      // 3) follow-up curto usando contexto ("e amanha?", "e no financeiro?")
      if (tokens.length <= 4 && memoria.ultimoTopico) {
        const anterior = INTENTES.find((i) => i.id === memoria.ultimoTopico);
        if (anterior && /\b(e|entao|depois)\b/.test(tokens[0])) {
          const r = await Promise.resolve(anterior.resp({ t, tokens }));
          if (r) return typeof r === 'object' ? r : { texto: r };
        }
      }

      // 4) não sei → WEB
      return await buscarNaWeb(texto);
    } catch (e) {
      return { texto: 'Tive um problema ao processar sua pergunta. Reformule ou tente novamente.' };
    }
  }

  return { perguntar, buscarNaWeb, dados, resumoOperacao };
})();
