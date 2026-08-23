/* ============================================================================
 * NEITZEL — IA Assistente Inteligente (ia-assistente.js)
 * Assistente com contexto, interpretação humana e balão flutuante
 * ========================================================================== */

'use strict';

// Namespace para IA Assistente
if (typeof window.NEITZEL_IA_ASSISTENTE === 'undefined') {
  window.NEITZEL_IA_ASSISTENTE = (() => {
    const E = window.ECOMIM;
    let assistenteAtivo = false;
    let contextoAtual = {
      modulo: null,
      tela: null,
      elemento: null,
      dados: {}
    };
    
    // Configurações do assistente
    const config = {
      posicao: 'bottom-right', // bottom-right, bottom-left
      icone: '🤖',
      titulo: 'Assistente Neitzel',
      subtitulo: 'Estou aqui para ajudar você a entender e usar o sistema.',
      corPrimaria: '#166a43',
      corSecundaria: '#0c0d12'
    };
    
    // Base de conhecimento do sistema
    const conhecimento = {
      modulos: {
        dashboard: {
          nome: 'Dashboard',
          descricao: 'Visão geral do sistema com KPIs e indicadores importantes.',
          funcionalidades: ['Ver métricas', 'Monitorar desempenho', 'Acompanhar tendências'],
          acoes: ['Analisar dados', 'Identificar oportunidades', 'Monitorar progresso']
        },
        leads: {
          nome: 'Leads',
          descricao: 'Gerenciamento de potenciais clientes e prospecção.',
          funcionalidades: ['Cadastrar leads', 'Classificar leads', 'Acompanhar contatos'],
          acoes: ['Adicionar novo lead', 'Filtrar leads', 'Alterar status']
        },
        agenda: {
          nome: 'Agenda',
          descricao: 'Calendário de compromissos, reuniões e tarefas.',
          funcionalidades: ['Agendar eventos', 'Visualizar calendário', 'Gerenciar compromissos'],
          acoes: ['Criar novo evento', 'Ver agenda do dia', 'Editar compromisso']
        },
        servicos: {
          nome: 'Serviços',
          descricao: 'Catálogo de serviços oferecidos com preços e custos.',
          funcionalidades: ['Cadastrar serviços', 'Calcular margens', 'Gerenciar catálogo'],
          acoes: ['Adicionar serviço', 'Calcular lucro', 'Editar serviço']
        },
        produtos: {
          nome: 'Produtos',
          descricao: 'Controle de produtos, estoque e catálogo.',
          funcionalidades: ['Cadastrar produtos', 'Controlar estoque', 'Gerenciar preços'],
          acoes: ['Adicionar produto', 'Ver estoque', 'Atualizar preço']
        },
        estoque: {
          nome: 'Estoque',
          descricao: 'Movimentações e controle de inventário.',
          funcionalidades: ['Registrar entradas/saídas', 'Controlar inventário', 'Emitir alertas'],
          acoes: ['Registrar movimentação', 'Ver histórico', 'Ajustar estoque']
        },
        financeiro: {
          nome: 'Financeiro',
          descricao: 'Controle de receitas, custos, despesas e lucro.',
          funcionalidades: ['Registrar transações', 'Calcular lucratividade', 'Emitir relatórios'],
          acoes: ['Registrar receita', 'Registrar despesa', 'Ver lucro']
        }
      },
      
      // Respostas pré-definidas para perguntas comuns
      respostas: {
        saudacao: [
          "Olá! Eu sou o Assistente Neitzel. Como posso ajudar você hoje?",
          "Oi! Estou aqui para te ajudar a usar o sistema. O que você gostaria de saber?",
          "Olá! Precisa de ajuda para entender alguma função do sistema?"
        ],
        
        ajuda_geral: [
          "Posso te ajudar a entender como usar cada parte do sistema, explicar para que serve cada função e guiar você passo a passo.",
          "Eu conheço todo o sistema Neitzel! Posso explicar funções, ajudar com dúvidas e orientar você no que precisar fazer.",
          "Estou aqui para ser seu guia no sistema. Me pergunte sobre qualquer função, botão ou processo que você não entender."
        ],
        
        contexto_perdido: [
          "Sem problemas! Vou te explicar: você está na área de **{modulo}**. Aqui você pode {descricao}.",
          "Você está na parte de **{modulo}**. Esta área serve para {descricao}.",
          "Esta é a tela de **{modulo}**. Aqui você consegue {funcionalidades}."
        ],
        
        passo_a_passo: [
          "Claro! Vamos fazer juntos:\n\n{passos}",
          "Sem problemas. Siga estes passos:\n\n{passos}",
          "Vou te guiar passo a passo:\n\n{passos}"
        ]
      },
      
      // Fluxos passo a passo
      fluxos: {
        cadastrar_servico: [
          "1. Clique em **Novo serviço**",
          "2. Preencha o nome do serviço",
          "3. Informe o preço e custo",
          "4. Selecione a categoria",
          "5. Clique em **Salvar**"
        ],
        
        cadastrar_produto: [
          "1. Clique em **Novo produto**",
          "2. Preencha nome e SKU",
          "3. Informe preço, custo e estoque",
          "4. Selecione a categoria",
          "5. Clique em **Salvar**"
        ],
        
        agendar_evento: [
          "1. Vá para **Agenda**",
          "2. Clique em **Novo evento**",
          "3. Escolha data e hora",
          "4. Preencha título e descrição",
          "5. Clique em **Salvar**"
        ],
        
        registrar_venda: [
          "1. Encontre o cliente",
          "2. Adicione produtos/serviços",
          "3. Informe forma de pagamento",
          "4. Confirme os valores",
          "5. Finalize a venda"
        ]
      }
    };
    
    /* ============================================
     * FUNÇÕES PRINCIPAIS
     * ============================================ */
    
    /**
     * Inicializar assistente
     */
    function init() {
      if (assistenteAtivo) return;
      
      console.log('Inicializando Assistente Neitzel IA...');
      
      // Criar elementos da interface
      criarElementosUI();
      
      // Configurar monitoramento de contexto
      configurarMonitoramentoContexto();
      
      assistenteAtivo = true;
      console.log('Assistente Neitzel IA inicializado');
      
      return true;
    }
    
    /**
     * Criar elementos da interface
     */
    function criarElementosUI() {
      // Remover elementos existentes (se houver)
      document.querySelectorAll('.neitzel-ia-assistente').forEach(el => el.remove());
      
      // Criar balão flutuante
      const balao = document.createElement('div');
      balao.className = 'neitzel-ia-assistente balao-flutuante';
      balao.innerHTML = `
        <div class="ia-balao-conteudo">
          <div class="ia-icone">${config.icone}</div>
          <div class="ia-tooltip">Precisa de ajuda?</div>
        </div>
      `;
      
      // Estilos do balão
      balao.style.cssText = `
        position: fixed;
        ${config.posicao === 'bottom-right' ? 'right: 20px;' : 'left: 20px;'}
        bottom: 20px;
        width: 60px;
        height: 60px;
        background: ${config.corPrimaria};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 9999;
        transition: all 0.3s ease;
      `;
      
      balao.querySelector('.ia-balao-conteudo').style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      `;
      
      balao.querySelector('.ia-icone').style.cssText = `
        font-size: 24px;
        color: white;
      `;
      
      balao.querySelector('.ia-tooltip').style.cssText = `
        position: absolute;
        bottom: 70px;
        background: ${config.corSecundaria};
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.3s ease;
        pointer-events: none;
      `;
      
      // Eventos do balão
      balao.addEventListener('mouseenter', function() {
        this.querySelector('.ia-tooltip').style.opacity = '1';
        this.querySelector('.ia-tooltip').style.visibility = 'visible';
        this.style.transform = 'scale(1.1)';
      });
      
      balao.addEventListener('mouseleave', function() {
        this.querySelector('.ia-tooltip').style.opacity = '0';
        this.querySelector('.ia-tooltip').style.visibility = 'hidden';
        this.style.transform = 'scale(1)';
      });
      
      balao.addEventListener('click', abrirChat);
      
      document.body.appendChild(balao);
      
      // Criar chat (inicialmente escondido)
      criarChatInterface();
    }
    
    /**
     * Criar interface do chat
     */
    function criarChatInterface() {
      const chatContainer = document.createElement('div');
      chatContainer.className = 'neitzel-ia-assistente chat-container';
      chatContainer.style.cssText = `
        position: fixed;
        ${config.posicao === 'bottom-right' ? 'right: 20px;' : 'left: 20px;'}
        bottom: 100px;
        width: 350px;
        height: 500px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15);
        z-index: 9998;
        display: none;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid #e5e7eb;
      `;
      
      chatContainer.innerHTML = `
        <div class="ia-chat-header" style="padding: 16px; background: ${config.corPrimaria}; color: white; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: bold; font-size: 16px;">${config.titulo}</div>
            <div style="font-size: 12px; opacity: 0.9;">${config.subtitulo}</div>
          </div>
          <button class="ia-btn-fechar" style="background: none; border: none; color: white; cursor: pointer; font-size: 20px;">×</button>
        </div>
        
        <div class="ia-chat-mensagens" style="flex: 1; padding: 16px; overflow-y: auto; background: #f9fafb;">
          <div class="ia-mensagem-bem-vindo" style="text-align: center; color: #6b7280; font-size: 14px; margin-bottom: 16px;">
            O assistente está carregando...
          </div>
        </div>
        
        <div class="ia-chat-input-area" style="border-top: 1px solid #e5e7eb; padding: 16px; background: white;">
          <div class="ia-sugestoes-rapidas" style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
            <button class="ia-sugestao-btn" data-pergunta="O que posso fazer aqui?" style="background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 16px; padding: 6px 12px; font-size: 12px; cursor: pointer; color: #374151;">O que posso fazer aqui?</button>
            <button class="ia-sugestao-btn" data-pergunta="Como faço isso?" style="background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 16px; padding: 6px 12px; font-size: 12px; cursor: pointer; color: #374151;">Como faço isso?</button>
            <button class="ia-sugestao-btn" data-pergunta="Me explique de forma simples" style="background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 16px; padding: 6px 12px; font-size: 12px; cursor: pointer; color: #374151;">Me explique de forma simples</button>
          </div>
          
          <div style="display: flex; gap: 8px;">
            <input type="text" class="ia-chat-input" placeholder="Digite sua dúvida..." style="flex: 1; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px;">
            <button class="ia-btn-enviar" style="background: ${config.corPrimaria}; color: white; border: none; border-radius: 8px; padding: 10px 16px; cursor: pointer; font-size: 14px;">Enviar</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(chatContainer);
      
      // Configurar eventos do chat
      const chatElement = document.querySelector('.neitzel-ia-assistente.chat-container');
      const btnFechar = chatElement.querySelector('.ia-btn-fechar');
      const btnEnviar = chatElement.querySelector('.ia-btn-enviar');
      const inputChat = chatElement.querySelector('.ia-chat-input');
      const mensagensContainer = chatElement.querySelector('.ia-chat-mensagens');
      
      btnFechar.addEventListener('click', fecharChat);
      
      btnEnviar.addEventListener('click', function() {
        const mensagem = inputChat.value.trim();
        if (mensagem) {
          enviarMensagemUsuario(mensagem);
          inputChat.value = '';
        }
      });
      
      inputChat.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          const mensagem = this.value.trim();
          if (mensagem) {
            enviarMensagemUsuario(mensagem);
            this.value = '';
          }
        }
      });
      
      // Eventos para sugestões rápidas
      document.querySelectorAll('.ia-sugestao-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          const pergunta = this.getAttribute('data-pergunta');
          enviarMensagemUsuario(pergunta);
        });
      });
    }
    
    /**
     * Abrir chat
     */
    function abrirChat() {
      const chat = document.querySelector('.neitzel-ia-assistente.chat-container');
      if (chat) {
        chat.style.display = 'flex';
        
        // Adicionar mensagem de boas-vindas
        const mensagensContainer = chat.querySelector('.ia-chat-mensagens');
        const bemVindoElement = mensagensContainer.querySelector('.ia-mensagem-bem-vindo');
        
        if (bemVindoElement) {
          bemVindoElement.innerHTML = '';
          
          // Saudação aleatória
          const saudacoes = conhecimento.respostas.saudacao;
          const saudacao = saudacoes[Math.floor(Math.random() * saudacoes.length)];
          
          // Adicionar mensagem do assistente
          adicionarMensagemChat('assistente', saudacao);
          
          // Adicionar contexto atual se disponível
          if (contextoAtual.modulo && conhecimento.modulos[contextoAtual.modulo]) {
            setTimeout(() => {
              const moduloInfo = conhecimento.modulos[contextoAtual.modulo];
              adicionarMensagemChat('assistente', 
                `Vejo que você está na área de **${moduloInfo.nome}**. ` +
                `Posso te ajudar com algo específico dessa parte?`
              );
            }, 500);
          }
        }
        
        // Focar no input
        setTimeout(() => {
          const input = chat.querySelector('.ia-chat-input');
          if (input) input.focus();
        }, 100);
      }
    }
    
    /**
     * Fechar chat
     */
    function fecharChat() {
      const chat = document.querySelector('.neitzel-ia-assistente.chat-container');
      if (chat) {
        chat.style.display = 'none';
      }
    }
    
    /**
     * Adicionar mensagem ao chat
     */
    function adicionarMensagemChat(remetente, texto) {
      const chat = document.querySelector('.neitzel-ia-assistente.chat-container');
      if (!chat) return;
      
      const mensagensContainer = chat.querySelector('.ia-chat-mensagens');
      const mensagemElement = document.createElement('div');
      
      mensagemElement.className = `ia-mensagem ia-mensagem-${remetente}`;
      mensagemElement.style.cssText = `
        margin-bottom: 12px;
        max-width: 80%;
        ${remetente === 'usuario' ? 'margin-left: auto;' : ''}
      `;
      
      // Formatar texto (simples markdown)
      let textoFormatado = texto
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
      
      mensagemElement.innerHTML = `
        <div style="
          background: ${remetente === 'usuario' ? config.corPrimaria : '#f3f4f6'};
          color: ${remetente === 'usuario' ? 'white' : '#1f2937'};
          padding: 10px 14px;
          border-radius: ${remetente === 'usuario' ? '12px 12px 0 12px' : '12px 12px 12px 0'};
          font-size: 14px;
          line-height: 1.4;
        ">
          ${textoFormatado}
        </div>
        <div style="
          font-size: 11px;
          color: #6b7280;
          margin-top: 4px;
          text-align: ${remetente === 'usuario' ? 'right' : 'left'};
        ">
          ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      `;
      
      mensagensContainer.appendChild(mensagemElement);
      
      // Scroll para baixo
      setTimeout(() => {
        mensagensContainer.scrollTop = mensagensContainer.scrollHeight;
      }, 10);
    }
    
    /**
     * Enviar mensagem do usuário
     */
    function enviarMensagemUsuario(texto) {
      if (!texto.trim()) return;
      
      // Adicionar mensagem do usuário
      adicionarMensagemChat('usuario', texto);
      
      // Processar mensagem
      setTimeout(() => {
        processarMensagemUsuario(texto);
      }, 500);
    }
    
    /**
     * Processar mensagem do usuário
     */
    function processarMensagemUsuario(texto) {
      // Delega para o CÉREBRO do agente: interpretação tolerante a erros,
      // dados reais, ações nas telas e pesquisa na web como fallback.
      const chatBox = document.querySelector('.ia-chat-mensagens');
      let typingEl = null;
      try {
        typingEl = document.createElement('div');
        typingEl.className = 'ia-mensagem ia-mensagem-assistente';
        typingEl.innerHTML = '<div class="ai-typing"><span></span><span></span><span></span></div>';
        if (chatBox) { chatBox.appendChild(typingEl); chatBox.scrollTop = chatBox.scrollHeight; }
      } catch (e) {}
      const concluir = (r) => {
        try { typingEl && typingEl.remove(); } catch (e) {}
        r = r || {};
        if (typeof r.acao === 'function') { try { r.acao(); } catch (e) {} }
        adicionarMensagemChat('assistente', r.texto || 'Não consegui responder agora — reformule, por favor.');
      };
      const cerebro = window.NEITZEL_CEREBRO;
      if (cerebro && cerebro.perguntar) cerebro.perguntar(texto).then(concluir).catch(() => concluir({}));
      else concluir({ texto: 'Meu módulo de inteligência não carregou (ia-cerebro.js). Recarregue a página.' });
    }

    function processarMensagemUsuarioAntigo(texto) {
      const textoLower = texto.toLowerCase();
      let resposta = '';

      // Análise de intenção
      if (textoLower.includes('oi') || textoLower.includes('olá') || textoLower.includes('ola')) {
        // Saudação
        const saudacoes = conhecimento.respostas.saudacao;
        resposta = saudacoes[Math.floor(Math.random() * saudacoes.length)];
      }
      else if (textoLower.includes('ajuda') || textoLower.includes('help')) {
        // Ajuda geral
        const ajudas = conhecimento.respostas.ajuda_geral;
        resposta = ajudas[Math.floor(Math.random() * ajudas.length)];
      }
      else if (textoLower.includes('que posso fazer') || textoLower.includes('o que fazer aqui')) {
        // Contexto específico
        resposta = gerarRespostaContexto();
      }
      else if (textoLower.includes('como fazer') || textoLower.includes('como faço')) {
        // Instruções passo a passo
        resposta = gerarRespostaPassoAPasso(textoLower);
      }
      else if (textoLower.includes('serviço') || textoLower.includes('servico')) {
        // Tópico: serviços
        resposta = gerarRespostaModulo('servicos', textoLower);
      }
      else if (textoLower.includes('produto')) {
        // Tópico: produtos
        resposta = gerarRespostaModulo('produtos', textoLower);
      }
      else if (textoLower.includes('estoque')) {
        // Tópico: estoque
        resposta = gerarRespostaModulo('estoque', textoLower);
      }
      else if (textoLower.includes('agenda') || textoLower.includes('calendário')) {
        // Tópico: agenda
        resposta = gerarRespostaModulo('agenda', textoLower);
      }
      else if (textoLower.includes('financeiro') || textoLower.includes('lucro') || textoLower.includes('dinheiro')) {
        // Tópico: financeiro
        resposta = gerarRespostaModulo('financeiro', textoLower);
      }
      else if (textoLower.includes('lead') || textoLower.includes('cliente')) {
        // Tópico: leads/clientes
        resposta = gerarRespostaModulo('leads', textoLower);
      }
      else {
        // Resposta padrão
        resposta = "Entendi sua pergunta! Para te ajudar melhor, você poderia me dizer se é sobre:\n\n" +
                  "• **Serviços** - cadastro e preços\n" +
                  "• **Produtos** - estoque e catálogo\n" +
                  "• **Agenda** - compromissos e calendário\n" +
                  "• **Financeiro** - receitas e lucro\n" +
                  "• **Leads** - clientes e prospecção\n\n" +
                  "Ou me explique o que você quer fazer no sistema.";
      }
      
      // Adicionar resposta do assistente (com delay para simular processamento)
      setTimeout(() => {
        adicionarMensagemChat('assistente', resposta);
      }, 800);
    }
    
    /**
     * Gerar resposta baseada no contexto
     */
    function gerarRespostaContexto() {
      if (!contextoAtual.modulo || !conhecimento.modulos[contextoAtual.modulo]) {
        return "Não consegui identificar onde você está no sistema. Você poderia me dizer em qual área está? (Dashboard, Serviços, Produtos, etc.)";
      }
      
      const modulo = conhecimento.modulos[contextoAtual.modulo];
      const contextos = conhecimento.respostas.contexto_perdido;
      const contexto = contextos[Math.floor(Math.random() * contextos.length)];
      
      return contexto
        .replace('{modulo}', modulo.nome)
        .replace('{descricao}', modulo.descricao)
        .replace('{funcionalidades}', modulo.funcionalidades.join(', '));
    }
    
    /**
     * Gerar resposta passo a passo
     */
    function gerarRespostaPassoAPasso(texto) {
      let fluxo = null;
      
      if (texto.includes('serviço') || texto.includes('servico')) {
        fluxo = conhecimento.fluxos.cadastrar_servico;
      } else if (texto.includes('produto')) {
        fluxo = conhecimento.fluxos.cadastrar_produto;
      } else if (texto.includes('agenda') || texto.includes('evento')) {
        fluxo = conhecimento.fluxos.agendar_evento;
      } else if (texto.includes('venda') || texto.includes('vender')) {
        fluxo = conhecimento.fluxos.registrar_venda;
      }
      
      if (fluxo) {
        const passos = conhecimento.respostas.passo_a_passo;
        const passo = passos[Math.floor(Math.random() * passos.length)];
        return passo.replace('{passos}', fluxo.join('\n'));
      } else {
        return "Para te dar instruções passo a passo, preciso saber o que você quer fazer. É sobre cadastrar um serviço, produto, agendar algo ou outra tarefa?";
      }
    }
    
    /**
     * Gerar resposta específica do módulo
     */
    function gerarRespostaModulo(moduloChave, texto) {
      const modulo = conhecimento.modulos[moduloChave];
      if (!modulo) return "Desculpe, não tenho informações sobre essa área do sistema.";
      
      if (texto.includes('para que serve') || texto.includes('o que é')) {
        return `A área de **${modulo.nome}** serve para ${modulo.descricao}\n\n` +
               `Principais funcionalidades:\n` +
               modulo.funcionalidades.map(f => `• ${f}`).join('\n');
      } else if (texto.includes('como usar') || texto.includes('como funciona')) {
        return `Para usar a área de **${modulo.nome}**:\n\n` +
               `Você pode:\n` +
               modulo.acoes.map(a => `• ${a}`).join('\n') + '\n\n' +
               `Quer que eu te explique alguma dessas ações em detalhes?`;
      } else {
        return `Sobre **${modulo.nome}**: ${modulo.descricao}\n\n` +
               `Posso te ajudar com:\n` +
               modulo.funcionalidades.slice(0, 3).map(f => `• ${f}`).join('\n') + '\n\n' +
               `O que você gostaria de saber especificamente?`;
      }
    }
    
    /**
     * Configurar monitoramento de contexto
     */
    function configurarMonitoramentoContexto() {
      // Monitorar mudanças na interface
      if (typeof window.ECOMIM_APP !== 'undefined' && window.ECOMIM_APP.renderView) {
        // Hook na função renderView para capturar contexto
        const renderViewOriginal = window.ECOMIM_APP.renderView;
        window.ECOMIM_APP.renderView = function(viewId) {
          // Chamar função original
          const resultado = renderViewOriginal.apply(this, arguments);
          
          // Atualizar contexto
          atualizarContexto(viewId);
          
          return resultado;
        };
        
        console.log('Monitoramento de contexto configurado');
      }
    }
    
    /**
     * Atualizar contexto atual
     */
    function atualizarContexto(viewId) {
      // Mapear viewId para módulos conhecidos
      const mapeamento = {
        'dashboard': 'dashboard',
        'leads': 'leads',
        'funil': 'leads',
        'cacador': 'leads',
        'fila': 'leads',
        'planner': 'agenda',
        'agenda': 'agenda',
        'servicos': 'servicos',
        'produtos': 'produtos',
        'estoque': 'estoque',
        'atendimento_ops': 'servicos',
        'financeiro': 'financeiro',
        'atendimento': 'servicos',
        'clientes': 'leads',
        'projetos': 'servicos',
        'marketing': 'leads',
        'rh': 'servicos',
        'bi': 'dashboard',
        'inteligencia': 'dashboard',
        'automacoes': 'servicos',
        'comunicacao': 'servicos',
        'acessor': 'servicos',
        'seu_acessor': 'servicos',
        'seguranca': 'dashboard',
        'config': 'dashboard'
      };
      
      contextoAtual = {
        modulo: mapeamento[viewId] || null,
        tela: viewId,
        elemento: null,
        dados: {
          timestamp: new Date().toISOString(),
          view: viewId
        }
      };
      
      console.log(`Contexto atualizado: ${viewId} → ${contextoAtual.modulo}`);
    }
    
    /**
     * Adicionar botão de ajuda em elementos específicos
     */
    function adicionarBotaoAjuda(elemento, textoAjuda) {
      const botaoAjuda = document.createElement('button');
      botaoAjuda.className = 'ia-botao-ajuda-elemento';
      botaoAjuda.innerHTML = '?';
      botaoAjuda.title = 'Explicar com IA';
      botaoAjuda.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        background: ${config.corPrimaria};
        color: white;
        border: none;
        border-radius: 50%;
        font-size: 12px;
        cursor: help;
        margin-left: 8px;
        vertical-align: middle;
      `;
      
      botaoAjuda.addEventListener('click', function(e) {
        e.stopPropagation();
        abrirChat();
        setTimeout(() => {
          enviarMensagemUsuario(`O que é "${textoAjuda}"?`);
        }, 500);
      });
      
      elemento.appendChild(botaoAjuda);
    }
    
    /* ============================================
     * API PÚBLICA
     * ============================================ */
    
    return {
      // Controle do assistente
      init: init,
      abrirChat: abrirChat,
      fecharChat: fecharChat,
      
      // Contexto
      getContexto: () => contextoAtual,
      setContexto: (novoContexto) => { contextoAtual = { ...contextoAtual, ...novoContexto }; },
      
      // Interação programática
      enviarMensagem: enviarMensagemUsuario,
      adicionarBotaoAjuda: adicionarBotaoAjuda,
      
      // Status
      isAtivo: () => assistenteAtivo,
      
      // Configuração
      configurar: (novasConfigs) => { Object.assign(config, novasConfigs); },
      
      // Conhecimento
      adicionarConhecimento: (categoria, dados) => {
        if (!conhecimento[categoria]) conhecimento[categoria] = {};
        Object.assign(conhecimento[categoria], dados);
      }
    };
  })();
  
  // Balão flutuante PRÓPRIO desativado: o sistema já tem o balão oficial
  // (.ecomim-ai-floating em app.js) — aqui ficava um segundo balão atrás dele.
  // O módulo continua disponível via window.NEITZEL_IA_ASSISTENTE.init().
  if (false) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
          window.NEITZEL_IA_ASSISTENTE.init();
        }, 2000);
      });
    } else {
      setTimeout(() => {
        window.NEITZEL_IA_ASSISTENTE.init();
      }, 2000);
    }
  }
}

// Adicionar estilos CSS
if (!document.querySelector('#neitzel-ia-estilos')) {
  const estilos = document.createElement('style');
  estilos.id = 'neitzel-ia-estilos';
  estilos.textContent = `
    .neitzel-ia-assistente * {
      box-sizing: border-box;
    }
    
    .ia-mensagem strong {
      font-weight: bold;
    }
    
    .ia-chat-mensagens::-webkit-scrollbar {
      width: 6px;
    }
    
    .ia-chat-mensagens::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 3px;
    }
    
    .ia-chat-mensagens::-webkit-scrollbar-thumb {
      background: #c1c1c1;
      border-radius: 3px;
    }
    
    .ia-chat-mensagens::-webkit-scrollbar-thumb:hover {
      background: #a1a1a1;
    }
    
    .ia-btn-fechar:hover,
    .ia-btn-enviar:hover,
    .ia-sugestao-btn:hover {
      opacity: 0.9;
    }
    
    .ia-sugestao-btn:hover {
      background: #e5e7eb !important;
    }
    
    .ia-chat-input:focus {
      outline: none;
      border-color: ${window.NEITZEL_IA_ASSISTENTE ? window.NEITZEL_IA_ASSISTENTE.config.corPrimaria : '#d81e2c'} !important;
      box-shadow: 0 0 0 2px rgba(22, 106, 67, 0.12);
    }
  `;
  document.head.appendChild(estilos);
}