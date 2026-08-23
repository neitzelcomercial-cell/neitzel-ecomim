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

  /* ------------------- 3. BASE DE CONHECIMENTO COMPLETA ------------------- */
  const KB = {
    dashboard: { nome:'Dashboard', tela:'dashboard', chaves:['dashboard','painel','inicio','resumo','visao geral','kpis'],
      oQue:'o painel inicial com KPIs do negócio: leads, receita, tarefas e alertas em uma tela.',
      passos:['Abra pelo menu Operação → Dashboard.','Leia os cartões de indicadores no topo.','Use os atalhos de cada cartão para ir direto ao módulo.'],
      dicas:['Comece o dia por aqui: ele mostra o que precisa de ação primeiro.'] },
    planner: { nome:'Planner', tela:'planner', chaves:['planner','agenda visual','compromissos','atendimentos','atendimento','dia','semana'],
      oQue:'a agenda operacional real: cada atendimento com cliente, serviço, horário, status e produtos.',
      passos:['Menu Agenda → Planner (ou diga "abra o planner").','Clique no dia/horário desejado ou em Novo.','Preencha cliente, serviço, início/fim e responsável.','Salve — o status inicia como agendado.'],
      dicas:['Agendamentos vindos do Portal aparecem aqui sozinhos com origem PORTAL_CLIENTE.','Cancele pelo próprio card quando o cliente desistir — tudo sincroniza.'] },
    agenda: { nome:'Agenda', tela:'agenda', chaves:['agenda','calendario','calendario','eventos'],
      oQue:'o calendário de eventos e compromissos gerais do negócio.',
      passos:['Menu Agenda → Agenda.','Selecione a data e crie o evento.','Edite ou exclua clicando sobre o evento.'] },
    servicos: { nome:'Serviços', tela:'servicos', chaves:['servico','servicos','catalogo de servicos','preco do servico'],
      oQue:'o catálogo de serviços com preço, custo, margem e duração.',
      passos:['Menu Catálogo → Serviços (diga "abra os serviços").','Clique Novo serviço.','Nome, descrição e categoria.','Preço e custo (a margem calcula sozinha).','Defina a DURAÇÃO em minutos — o Portal usa isso para montar horários.','Salve e depois publique o catálogo no Portal.'],
      dicas:['Serviço sem duração faz o Portal não conseguir calcular slots — sempre preencha.'] },
    produtos: { nome:'Produtos', tela:'produtos', chaves:['produto','produtos','vender produto'],
      oQue:'o catálogo de produtos com preço e vínculo às vendas/agendamentos.',
      passos:['Menu Catálogo → Produtos.','Novo produto: nome, SKU, categoria.','Preço, custo e quantidade em estoque (+ mínimo).','Salve — pode ser oferecido no Portal também.'],
      dicas:['Produto vendido num atendimento baixa o estoque automaticamente na conclusão.'] },
    estoque: { nome:'Estoque', tela:'estoque', chaves:['estoque','inventario','entrada','saida','repor','reposicao'],
      oQue:'o controle transacional de entradas, saídas e ajustes de inventário.',
      passos:['Menu Catálogo → Estoque.','Registrar entrada (compra) ou saída (uso/perda).','Ajuste corrige diferenças de contagem.','Acompanhe o histórico de movimentações.'],
      dicas:['Cadastre um ESTOQUE MÍNIMO por produto para receber alerta de reposição.'] },
    financeiro: { nome:'Financeiro', tela:'financeiro', chaves:['financeiro','receita','receitas','despesa','despesas','lucro','saldo','fluxo','conta','pagar','receber','dinheiro','faturamento'],
      oQue:'entradas, saídas, contas a pagar/receber e lucro do negócio.',
      passos:['Menu Operação & Gestão → Financeiro.','Registre receita/despesa com categoria e forma de pagamento.','Acompanhe contas vencidas e a receber.','Concluir um atendimento no Planner gera a receita automaticamente.'],
      dicas:['Nunca marque pagamento só porque agendaram — pagamento é registrado quando acontece.'] },
    clientes: { nome:'Clientes & CS', tela:'clientes', chaves:['cliente','clientes','crm de clientes','historico do cliente'],
      oQue:'o cadastro e histórico dos seus clientes (atendimentos, notas, contato).',
      passos:['Menu Gestão → Clientes.','Novo cliente: nome, WhatsApp, e-mail, observações.','O histórico alimenta sozinho com atendimentos.','Clientes do Portal entram aqui automaticamente (por telefone).'] },
    leads: { nome:'Leads & CRM', tela:'leads', chaves:['lead','leads','prospeccao','prospectar','crm','oportunidade'],
      oQue:'o funil comercial: captura, etapas, follow-ups e conversão de novos clientes.',
      passos:['Menu Operação → Leads.','Crie/mova cards entre etapas do funil.','Use a ficha do lead para registrar contatos e follow-up.','O Caçador traz leads automáticos — aprove na Fila.'],
      dicas:['Lead parado há dias? Use o botão de sugerir follow-up com IA.'] },
    cacador: { nome:'Caçador de Leads', tela:'cacador', chaves:['cacador','cacar leads','varredura','captura automatica','buscar leads'],
      oQue:'prospecção automática: varre fontes públicas e enfileira contatos para aprovação.',
      passos:['Menu Operação → Caçador de Leads.','Ajuste segmento/cidades em Configurações.','Rode a varredura e revise resultados.','Aprove bons contatos na Fila — vão para o funil.'] },
    funil: { nome:'Funil', tela:'funil', chaves:['funil','etapas','conversao'],
      oQue:'a visão visual das etapas comerciais e conversão dos leads.',
      passos:['Arraste cards entre colunas para mover de etapa.','Clique para abrir detalhes e histórico.'] },
    fila: { nome:'Fila de aprovação', tela:'fila', chaves:['fila','aprovar','recusar','pendentes'],
      oQue:'onde você aprova contatos encontrados antes de virarem leads.',
      passos:['Revise cada item: aprovar ou recusar.','Nada entra no CRM sem sua aprovação.'] },
    projetos: { nome:'Projetos', tela:'projetos', chaves:['projeto','projetos','obra','entrega'],
      oQue:'acompanhamento de projetos com prazos e status.' },
    marketing: { nome:'Marketing', tela:'marketing', chaves:['marketing','campanha','campanhas','promocao','divulgacao'],
      oQue:'campanhas e ações promocionais com acompanhamento.',
      dicas:['Ofereça um produto barato no Portal para aumentar ticket.'] },
    rh: { nome:'RH', tela:'rh', chaves:['rh','colaborador','colaboradores','funcionario','funcionarios','equipe'],
      oQue:'cadastro da equipe e dados trabalhistas básicos.' },
    bi: { nome:'BI & Analytics', tela:'bi', chaves:['bi','analytics','indicadores','metricas','relatorio','relatorios'],
      oQue:'indicadores consolidados: funil, financeiro, atendimento e projetos.',
      dicas:['Compare mês atual vs anterior para decidir promoções.'] },
    inteligencia: { nome:'Centro de Inteligência', tela:'inteligencia', chaves:['inteligencia','supervisor','insights','sugestoes'],
      oQue:'agente supervisor com sugestões automáticas baseadas nos seus dados.' },
    automacoes: { nome:'Automações', tela:'automacoes', chaves:['automacao','automacoes','automatizar','rotina'],
      oQue:'regras que executam ações sozinhas (alertas, tarefas, follow-ups).' },
    comunicacao: { nome:'Comunicação', tela:'comunicacao', chaves:['comunicacao','email','smtp','envio','canais'],
      oQue:'canais de envio (e-mail etc.). Configure SMTP com App Password.',
      dicas:['Configure o e-mail ANTES de usar recuperação por código.'] },
    acessor: { nome:'Acessor WhatsApp', tela:'acessor', chaves:['acessor','whatsapp','mensagens','zap'],
      oQue:'auxiliar de mensagens WhatsApp para atender e confirmar clientes.' },
    memoria: { nome:'Memória', tela:'memoria', chaves:['memoria','historico','registros','relatorio mensal'],
      oQue:'memória do sistema: consolida meses, gera relatórios e mantém histórico leve.',
      dicas:['Gere o relatório mensal todo dia 1º — fica guardado na Memória.'] },
    suporte: { nome:'Diagnóstico', tela:'suporte', chaves:['diagnostico','problema','problemas','erro','erros','bateria','internet'],
      oQue:'saúde do ambiente: internet, bateria, armazenamento e erros registrados.',
      dicas:['Balanço central aparece por 3 segundos quando algo é registrado.'] },
    seguranca: { nome:'Segurança', tela:'seguranca', chaves:['seguranca','senha','pin','trocar senha','mfa','backup','lgpd'],
      oQue:'senha de 6 dígitos, recuperação por WhatsApp/e-mail e backup criptografado.',
      passos:['Menu Sistema → Segurança.','Definir/Trocar senha (6 números).','Cadastre recuperação (WhatsApp/e-mail).','Exporte backup periodicamente.'] },
    config: { nome:'Configurações', tela:'config', chaves:['configuracoes','configuracao','ajustes','segmento','cidades','empresa'],
      oQue:'dados da empresa, segmento, cidades de atuação e ajustes do Caçador.' },
    portal: { nome:'Portal do Cliente', tela:'portal',
      chaves:['portal','portal do cliente','link','site','compartilhar','instagram','publicar','publicacao','github','paginas','pagina publica','cliente agenda','auto agendamento','online'],
      oQue:'sua página pública de agendamento: cliente escolhe serviço, profissional, dia, horário, produtos e confirma — cai direto no Planner.',
      passos:['Menu Sistema → Portal do Cliente.','Conecte o painel (token de data/admin-token.txt).','Ajuste HORÁRIOS de funcionamento e bloqueios (feriados/folgas).','Publique o catálogo (serviços visíveis).','Copie o LINK local/rede — ou publique no GitHub e compartilhe o link público.','Cliente agenda → sistema recebe na hora (Planner + CRM).'],
      dicas:['Link do GitHub fica no cartão "Link do GitHub para compartilhar" do painel.','Modo ADM dentro do portal: 5 toques no logo → código começando com 00.','Alterou horários/bloqueios? O portal reflete na hora; no link publicado clique em Publicar novamente.'] },
    assistente: { nome:'Assistente Neitzel', tela:null,
      chaves:['assistente','ia','voce','robo','bot'],
      oQue:'eu: interpreto pedidos, respondo com dados reais, executo ações e pesquiso na web.' },
    primeiro_uso: { nome:'Primeiros passos', tela:'dashboard',
      chaves:['comecar','primeiros passos','iniciando','do zero','setup','configurar sistema','por onde começo'],
      oQue:'roteiro rápido para colocar o sistema no ar.',
      passos:['1. Configurações: empresa, segmento, cidades.','2. Segurança: senha + recuperação.','3. Catálogo: serviços (com DURAÇÃO!) e produtos.','4. Portal: horários de funcionamento + publicar catálogo + copiar link.','5. Caçador/Funil: alimentar novos clientes.','6. Planner: rodar o dia a dia; Financeiro acompanha sozinho.'] }
  };

  /* ------------------- 4. TIPOS DE PERGUNTA + TÓPICOS --------------------- */
  const TIPOS = {
    como:    { re:/\b(como|passo a passo|passos|tutorial|ensine|me ensine|maneira|forma de)\b/ },
    oque:    { re:/\b(o que e|o que sao|que e|significa|pra que serve|para que serve|o que faz|o que faz)\b/ },
    onde:    { re:/\b(onde|em qual tela|qual tela|aonde)\b/ },
    dica:    { re:/\b(dica|dicas|melhoria|melhorias|sugestao|sugestoes|conselho|posso melhorar)\b/ },
    problema:{ re:/\b(nao consigo|nao funciona|deu erro|erro|bug|problema|travou|sumiu)\b/ },
    quanto:  { re:/\b(quantos|quantas|quanto|total de)\b/ },
    abrir:   { re:/\b(abra|va para|vai para|mostra|leve|entre no|navegue)\b/ }
  };

  function detectarTopico(frase) {
    let melhor = null, melhorScore = 0;
    for (const [id, top] of Object.entries(KB)) {
      let s = 0;
      for (const chave of top.chaves) {
        const kk = norm(chave);
        if (frase.includes(kk)) s += kk.includes(' ') ? 3 : 1.4;
        else {
          const partes = kk.split(' ');
          if (partes.length === 1 && frase.split(' ').some((tk) => tk.length >= 4 && Math.abs(tk.length - kk.length) <= 2 && lev(tk, kk) <= 1)) s += .8;
        }
      }
      if (s > melhorScore) { melhorScore = s; melhor = id; }
    }
    return melhor && melhorScore >= 1.2 ? melhor : null;
  }

  /* --------------------------- 5. AÇÕES ----------------------------------- */
  function acaoNavegar(viewId) {
    return () => { try { window.ECOMIM_APP && window.ECOMIM_APP.renderView(viewId); } catch (e) {} };
  }

  /* ------------------ 6. DICAS GERADAS DOS DADOS REAIS -------------------- */
  function dicasContextuais() {
    const m = metricas(), tips = [];
    if (m.svSemDuracao.length) tips.push(`**${m.svSemDuracao.length} serviço(s) sem duração** — o Portal não consegue montar horários sem isso. Abra Serviços e preencha.`);
    if (m.estBaixo.length) tips.push(`Estoque baixo: ${m.estBaixo.slice(0,3).map((p)=>p.nome).join(', ')} — repõe antes de faltar na agenda.`);
    if (!m.D.leads.length) tips.push('Sem leads no funil — rode o **Caçador de Leads** hoje e aprove os melhores na Fila.');
    if (m.filaPend = m.D.fila.length) tips.push(`**${m.D.fila.length} contato(s) na Fila** esperando sua aprovação.`);
    if (!m.hoje_.length) tips.push('Nenhum atendimento agendado para hoje — divulgue o link do Portal no Instagram para encher a agenda.');
    if (!m.conclMes.length) tips.push('Mês sem atendimentos concluídos ainda: conclua pelo Planner para alimentar receita e ticket médio.');
    if (!tips.length) tips.push('Operação saudável! Momento bom para publicar uma promoção no Portal e antecipar a semana.');
    return tips;
  }

  /* ------------------------- 7. RESPOSTAS COMPOSTAS ----------------------- */
  function responderTopico(topId, tipo) {
    const top = KB[topId];
    if (!top) return null;
    const abrirTxt = top.tela ? `\n\n💬 Diga *"abra ${norm(top.nome)}"* que eu abro a tela para você.` : '';
    if (tipo === 'como' || tipo === 'problema') {
      const passos = (top.passos || []).map((p,i)=>`${i+1}. ${p}`).join('\n');
      if (!passos) return `**${top.nome}**: ${top.oQue}${abrirTxt}`;
      const dica = top.dicas && top.dicas[0] ? `\n\n💡 ${top.dicas[0]}` : '';
      return `Como usar **${top.nome}**:\n\n${passos}${dica}${abrirTxt}`;
    }
    if (tipo === 'dica') {
      const extra = (top.dicas||[]).slice(0,2).map((d)=>`• ${d}`).join('\n');
      return `Dicas para **${top.nome}**:\n${extra || '• ' + top.oQue}` + (top.tela ? abrirTxt : '');
    }
    if (tipo === 'onde') return `${top.nome} fica em ${top.tela ? '**'+top.nome+'** (menu)' : 'no sistema'}.${abrirTxt}`;
    return `**${top.nome}** é ${top.oQue}\n` + (top.passos?`\nResumo rápido:\n${top.passos.slice(0,3).map((p,i)=>`${i+1}. ${p}`).join('\n')}`:'') + abrirTxt;
  }

  /* ------------------- 8. SAUDAÇÕES / IDENTIDADE / MATEMÁTICA ------------- */
  function matematica(frase) {
    let m = frase.match(/(\d+[.,]?\d*)\s*%\s*(?:de|do|da)\s*(\d+[.,]?\d*)/);
    if (m) {
      const v = parseFloat(m[1].replace(',','.'))/100*parseFloat(m[2].replace(',','.'));
      return `🧮 ${m[1]}% de ${m[2]} = **${v.toLocaleString('pt-BR',{maximumFractionDigits:2})}**`;
    }
    if (/\d\s*[-+*/x]\s*\d/.test(frase)) {
      try {
        const expr = frase.replace(/[^0-9+\-*/().,\sx]/g,' ').replace(/,/g,'.').replace(/x/g,'*').trim();
        if (expr && /^[\d\s+\-*/().]+$/.test(expr)) {
          const val = Function('"use strict";return (' + expr + ')')();
          if (isFinite(val)) return `🧮 **${Number(val.toFixed(4)).toLocaleString('pt-BR')}**`;
        }
      } catch(e){}
    }
    return null;
  }

  const CONVERSAS = {
    saudacao: { re:/\b(ola|oi|bom dia|boa tarde|boa noite|eae|opa|salve|fala)\b/,
      resp:()=>`Olá! Sou o **Assistente Neitzel** 🤖\n\nPosso:\n• **ensinar** qualquer parte do sistema ("como cadastrar serviço", "como usar o portal")\n• responder com **dados reais** ("quantos leads tenho?", "receita do mês", "agenda de hoje")\n• **executar ações** ("abra o planner", "abra o financeiro")\n• dar **dicas** do que melhorar agora\n• fazer contas e **pesquisar na web**\n\nO que você precisa?` },
    obrigado: { re:/\b(obrigado|obrigada|valeu|brigado|agradeco)\b/, resp:()=>'Por nada! Estou por aqui 24h — é só chamar. 💪' },
    tchau:    { re:/\b(tchau|falou|ate mais|ate logo|adeus)\b/, resp:()=>'Até logo! Qualquer dúvida, estou aqui.' },
    quem:     { re:/\b(quem e voce|o que voce e|voce e uma ia|seu nome|como voce funciona|o que voce faz)\b/,
      resp:()=>`Sou o **Assistente Neitzel**, agente do seu sistema:\n• interpreto perguntas mesmo com erros de digitação\n• respondo com dados REAIS (nada inventado)\n• abro telas e executo ações\n• ensino passo a passo qualquer módulo, incluindo o **Portal do Cliente**\n• pesquiso na web quando algo foge do sistema` },
    ajuda:    { re:/\b(ajuda|ajudar|help|socorro|o que voce pode)\b/,
      resp:()=>`Experimente perguntar:\n📖 "como cadastrar um serviço" · "como funciona o portal" · "como bloquear horário"\n📊 "quantos leads tenho?" · "agenda de hoje" · "receita do mês" · "estoque baixo?"\n🧭 "abra o planner" · "abre o portal" · "tema claro"\n💡 "dicas para melhorar" · "o que é ticket médio"\n🧮 "15% de 380" · "12*3,5"` },
    horas:    { re:/\b(que horas sao|que dia e hoje|data de hoje|hora agora)\b/,
      resp:()=>{ const d=new Date(); return `Agora são **${d.toLocaleTimeString('pt-BR')}** de **${d.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}**.`; } },
    conceitos:{ re:/\b(o que e mrr|o que e ticket|o que e churn|o que e lgpd|o que e roi|o que e funil de vendas|o que e nps)\b/,
      resp:(ctx)=>{
        const f = ctx.frase;
        const defs = {
          'mrr':'**MRR** = receita recorrente mensal: soma dos valores fixos que entram todo mês.',
          'ticket':'**Ticket médio** = faturamento ÷ número de atendimentos/vendas. Quanto maior, melhor.',
          'churn':'**Churn** = % de clientes que pararam de comprar/cancelar num período.',
          'lgpd':'**LGPD** = Lei Geral de Proteção de Dados: regras para coletar/guardar dados de pessoas.',
          'roi':'**ROI** = retorno sobre investimento: lucro ÷ quanto gastou.',
          'funil de vendas':'**Funil** = jornada do lead: primeiro contato → negociação → fechamento.',
          'nps':'**NPS** = nota de 0 a 10 que clientes dão ao seu atendimento; mede recomendação.'
        };
        for (const k of Object.keys(defs)) if (f.includes(k)) return defs[k];
        return null;
      } }
  };

  /* ------------------- 9. PESQUISA NA WEB (fallback) ---------------------- */
  async function buscarNaWeb(q) {
    try {
      const r = await fetch('/api/ia/search?q=' + encodeURIComponent(q));
      const j = await r.json();
      if (!j.ok) throw new Error('sem resultado');
      let txt = '🔎 **Pesquisei na web** para você:\n\n' + j.texto;
      if (j.fontes && j.fontes.length) txt += '\n\n**Fontes:**\n' + j.fontes.slice(0,3).map((f)=>'• '+f.titulo).join('\n');
      return { texto: txt };
    } catch(e) {
      return { texto: 'Não tenho isso no meu conhecimento local e a **pesquisa web está indisponível** agora.\n\nSou forte no **seu sistema** — tente: "como usar o portal", "quantos leads tenho", "dicas para hoje".' };
    }
  }

  /* ------------------------- 10. MOTOR PRINCIPAL -------------------------- */
  const memoria = { ultimoTopico: null, historico: [] };

  async function perguntar(texto) {
    memoria.historico.push(texto);
    if (memoria.historico.length > 12) memoria.historico.shift();
    try {
      const ctx = interpretar(texto);
      const { frase } = ctx;

      // 1) matemática
      if (/\d/.test(frase)) {
        const mat = matematica(frase);
        if (mat) return { texto: mat };
      }

      // 2) conversas rápidas
      for (const c of Object.values(CONVERSAS)) {
        if (c.re.test(frase)) {
          if (c === CONVERSAS.conceitos) {
            const r = c.resp(ctx); if (r) return { texto: r }; continue;
          }
          return { texto: c.resp(ctx) };
        }
      }

      // 3) ação: abrir tela
      const querAbrir = TIPOS.abrir.re.test(frase);
      if (querAbrir) {
        const alvo = ctx.tokens.map((tk)=>({ planner:'planner', dashboard:'dashboard', financeiro:'financeiro', clientes:'clientes', cliente:'clientes', leads:'leads', servicos:'servicos', servico:'servicos', produtos:'produtos', produto:'produtos', estoque:'estoque', portal:'portal', agenda:'agenda', bi:'bi', memoria:'memoria', suporte:'suporte', diagnostico:'suporte', seguranca:'seguranca', configuracoes:'config', funil:'funil', fila:'fila', cacador:'cacador', projetos:'projetos', marketing:'marketing', rh:'rh', inteligencia:'inteligencia', automacoes:'automacoes', comunicacao:'comunicacao', acessor:'acessor' })[tk]).find(Boolean)
          || ({ 'portal do cliente':'portal', 'caçador':'cacador' }[frase]);
        if (alvo) {
          return { texto:`Abrindo **${alvo}** para você…`, acao: acaoNavegar(alvo) };
        }
      }

      // 4) tipo + tópico
      let tipo = null;
      for (const [id,t] of Object.entries(TIPOS)) { if (t.re.test(frase)) { tipo = id; break; } }
      const topico = detectarTopico(frase);

      if (topico) {
        memoria.ultimoTopico = topico;
        // perguntas de quantidade → dados reais quando fizer sentido
        if (tipo === 'quanto') {
          const m = metricas();
          if (/lead/.test(topico)) {
            return { texto:`Você tem **${m.D.leads.length} lead(s)** no CRM e **${m.D.fila.length}** na fila de aprovação.`, acao: null };
          }
          if (/atendimento|planner|agenda/.test(topico)) {
            return { texto: m.hoje_.length ? `**${m.hoje_.length} atendimento(s) hoje:**\n${m.hoje_.slice(0,8).map((a)=>`• ${String(a.inicio).slice(11,16)} — ${a.cliente} (${a.servicoNome||'—'})`).join('\n')}` : 'Nenhum atendimento agendado para hoje.', acao:null };
          }
          if (/cliente/.test(topico)) return { texto:`**${m.D.clientesCore.length} cliente(s)** cadastrados.`, acao:null };
          if (/financeiro|receita|faturamento|lucro/.test(topico)) {
            return { texto:`Receita de atendimentos concluídos no mês: **${brl(m.receitaMes)}** (${m.conclMes.length} concluídos). Ticket médio: **${brl(m.ticketMedio)}**.` };
          }
        }
        if ((tipo==='quanto'||tipo==='onde') && topico==='estoque') {
          const m = metricas();
          return { texto: m.estBaixo.length ? `**Produtos com estoque baixo:**\n${m.estBaixo.map((p)=>`• ${p.nome}`).join('\n')}` : `Nenhum produto abaixo do mínimo nos ${m.D.produtos.length} cadastrados. 👍` };
        }
        const resposta = responderTopico(topico, tipo || 'oque');
        if (resposta) return { texto: resposta };
      }

      // 5) pedido genérico de dicas
      if (/\b(dica|dicas|melhorar|melhorias|sugest)\b/.test(frase)) {
        return { texto:'💡 **O que eu faria agora, olhando seus dados reais:**\n\n' + dicasContextuais().map((d,i)=>`${i+1}. ${d}`).join('\n') };
      }

      // 6) follow-up curto
      if (ctx.tokens.length <= 4 && memoria.ultimoTopico && /^(e |entao |mais |proxima )/.test(frase+' ')) {
        const r = responderTopico(memoria.ultimoTopico, 'dica');
        if (r) return { texto:r };
      }

      // 7) fallback: web
      return await buscarNaWeb(texto);
    } catch(e) {
      return { texto:'Tive um problema ao processar. Reformule ou tente novamente.' };
    }
  }

  return { perguntar, buscarNaWeb, dados, metricas, dicasContextuais };
})();
