/* ============================================================================
 * ECOMIM OS — Módulo de Expansão Operacional (operacional-expansao.js)
 * Sistema operacional empresarial - Central Operacional Completa
 * ========================================================================== */

'use strict';

// Aguardar o core.js carregar
if (typeof window.ECOMIM === 'undefined') {
  console.error('ECOMIM core não encontrado. Carregue core.js primeiro.');
} else {
  const E = window.ECOMIM;
  
  // Criar namespace para módulos operacionais se não existir
  if (typeof window.ECOMIM_OPERACIONAL === 'undefined') {
    window.ECOMIM_OPERACIONAL = {};
  }
  
  /* --- MÓDULO PRINCIPAL DE EXPANSÃO OPERACIONAL --- */
  E.modules.operacional = {
    id: 'operacional',
    name: 'Central Operacional',
    icon: 'operacional',
    version: '1.0.0',
    
    // Módulos dependentes
    modulosCarregados: {
      servicos: false,
      produtos: false,
      estoque: false,
      financeiro: false
    },
    
    /**
     * Inicializar módulo de expansão operacional
     */
    init() {
      console.log('Inicializando Central Operacional ECOMIM...');
      
      // Verificar e carregar módulos dependentes
      this.verificarModulos();
      
      // Configurar integrações
      this.configurarIntegracoes();
      
      // Inicializar sistema de eventos
      this.inicializarEventos();
      
      console.log('Central Operacional inicializada com sucesso');
      return true;
    },
    
    /**
     * Verificar e carregar módulos dependentes
     */
    verificarModulos() {
      const modulos = ['servicos', 'produtos', 'estoque'];
      
      modulos.forEach(modulo => {
        if (E.modules[modulo]) {
          this.modulosCarregados[modulo] = true;
          console.log(`✓ Módulo ${modulo} carregado`);
        } else {
          console.warn(`⚠️ Módulo ${modulo} não encontrado. Algumas funcionalidades podem não estar disponíveis.`);
        }
      });
    },
    
    /**
     * Configurar integrações entre módulos
     */
    configurarIntegracoes() {
      if (!E._internals.eventBus) {
        console.warn('EventBus não disponível. Integrações limitadas.');
        return;
      }
      
      // Integração: Serviço concluído → Atualizar estoque e financeiro
      E._internals.eventBus.on('servico.concluido', (evento) => {
        this.processarServicoConcluido(evento);
      });
      
      // Integração: Produto vendido → Atualizar estoque e financeiro
      E._internals.eventBus.on('produto.vendido', (evento) => {
        this.processarProdutoVendido(evento);
      });
      
      // Integração: Estoque baixo → Notificar
      E._internals.eventBus.on('estoque.baixo', (evento) => {
        this.notificarEstoqueBaixo(evento);
      });
      
      // Integração: Agenda → Serviço
      E._internals.eventBus.on('agenda.created', (evento) => {
        this.relacionarAgendaServico(evento);
      });
      
      console.log('Integrações configuradas entre módulos');
    },
    
    /**
     * Processar serviço concluído
     */
    processarServicoConcluido(evento) {
      console.log('Processando serviço concluído:', evento);
      
      // 1. Registrar receita do serviço
      if (evento.servicoId && evento.valor) {
        this.registrarReceita({
          tipo: 'servico',
          referenciaId: evento.servicoId,
          valor: evento.valor,
          clienteId: evento.clienteId,
          descricao: `Serviço: ${evento.servicoNome || 'Não especificado'}`,
          data: evento.data || E._internals.nowISO()
        });
      }
      
      // 2. Atualizar estoque se houver produtos utilizados
      if (evento.produtosUtilizados && Array.isArray(evento.produtosUtilizados)) {
        evento.produtosUtilizados.forEach(produto => {
          if (E.modules.estoque && produto.produtoId && produto.quantidade) {
            E.modules.estoque.registrarSaida(
              produto.produtoId,
              produto.quantidade,
              'utilizacao',
              evento.servicoId,
              { servico: evento.servicoNome, clienteId: evento.clienteId }
            );
          }
        });
      }
      
      // 3. Registrar despesas do serviço
      if (evento.despesas && Array.isArray(evento.despesas)) {
        evento.despesas.forEach(despesa => {
          this.registrarDespesa({
            ...despesa,
            referenciaId: evento.servicoId,
            tipo: 'servico'
          });
        });
      }
      
      // 4. Calcular e registrar lucro
      this.calcularLucroServico(evento);
    },
    
    /**
     * Processar produto vendido
     */
    processarProdutoVendido(evento) {
      console.log('Processando produto vendido:', evento);
      
      // 1. Registrar receita da venda
      if (evento.produtoId && evento.valor) {
        this.registrarReceita({
          tipo: 'produto',
          referenciaId: evento.produtoId,
          valor: evento.valor,
          clienteId: evento.clienteId,
          descricao: `Produto: ${evento.produtoNome || 'Não especificado'} (${evento.quantidade || 1} un)`,
          data: evento.data || E._internals.nowISO()
        });
      }
      
      // 2. Atualizar estoque
      if (evento.produtoId && evento.quantidade) {
        if (E.modules.estoque) {
          E.modules.estoque.registrarSaida(
            evento.produtoId,
            evento.quantidade,
            'venda',
            evento.vendaId,
            { clienteId: evento.clienteId, valor: evento.valor }
          );
        }
      }
      
      // 3. Registrar custo do produto
      if (evento.produtoId && evento.custo) {
        this.registrarCusto({
          tipo: 'produto',
          referenciaId: evento.produtoId,
          valor: evento.custo,
          descricao: `Custo produto: ${evento.produtoNome || 'Não especificado'}`,
          data: evento.data || E._internals.nowISO()
        });
      }
    },
    
    /**
     * Notificar estoque baixo
     */
    notificarEstoqueBaixo(evento) {
      console.warn(`⚠️ ESTOQUE BAIXO: ${evento.produtoNome} (${evento.estoqueAtual}/${evento.estoqueMinimo})`);
      
      // Emitir evento para interface
      if (E._internals.eventBus) {
        E._internals.eventBus.emit('operacional.alerta.estoque', evento);
      }
      
      // Aqui poderia enviar notificação por email/WhatsApp no futuro
    },
    
    /**
     * Relacionar agenda com serviço
     */
    relacionarAgendaServico(evento) {
      // Esta função pode ser expandida para vincular automaticamente
      // agendamentos com serviços quando o contexto permitir
      console.log('Evento de agenda criada:', evento);
    },
    
    /**
     * Calcular lucro de serviço
     */
    calcularLucroServico(evento) {
      if (!evento.valor || !evento.custo) return;
      
      const receita = Number(evento.valor);
      const custo = Number(evento.custo) || 0;
      const despesas = Number(evento.despesasTotal) || 0;
      
      const lucroBruto = receita - custo;
      const lucroLiquido = receita - custo - despesas;
      const margemBruta = receita > 0 ? (lucroBruto / receita) * 100 : 0;
      const margemLiquida = receita > 0 ? (lucroLiquido / receita) * 100 : 0;
      
      console.log(`📊 Lucro Servico ${evento.servicoId || 'N/A'}:`);
      console.log(`  Receita: R$ ${(receita / 100).toFixed(2)}`);
      console.log(`  Custo: R$ ${(custo / 100).toFixed(2)}`);
      console.log(`  Despesas: R$ ${(despesas / 100).toFixed(2)}`);
      console.log(`  Lucro Bruto: R$ ${(lucroBruto / 100).toFixed(2)} (${margemBruta.toFixed(1)}%)`);
      console.log(`  Lucro Líquido: R$ ${(lucroLiquido / 100).toFixed(2)} (${margemLiquida.toFixed(1)}%)`);
      
      // Emitir evento com cálculo de lucro
      if (E._internals.eventBus) {
        E._internals.eventBus.emit('servico.lucro.calculado', {
          servicoId: evento.servicoId,
          receita,
          custo,
          despesas,
          lucroBruto,
          lucroLiquido,
          margemBruta: Math.round(margemBruta * 10) / 10,
          margemLiquida: Math.round(margemLiquida * 10) / 10
        });
      }
    },
    
    /**
     * Registrar receita
     */
    registrarReceiva(receita) {
      // Implementação básica - pode ser expandida
      console.log('Registrando receita:', receita);
      
      if (E._internals.eventBus) {
        E._internals.eventBus.emit('operacional.receita.registrada', receita);
      }
      
      return { ok: true, receita };
    },
    
    registrarReceita(receita) {
      // Implementação básica - pode ser expandida
      console.log('Registrando receita:', receita);
      
      if (E._internals.eventBus) {
        E._internals.eventBus.emit('operacional.receita.registrada', receita);
      }
      
      return { ok: true, receita };
    },
    
    /**
     * Registrar custo
     */
    registrarCusto(custo) {
      console.log('Registrando custo:', custo);
      
      if (E._internals.eventBus) {
        E._internals.eventBus.emit('operacional.custo.registrado', custo);
      }
      
      return { ok: true, custo };
    },
    
    /**
     * Registrar despesa
     */
    registrarDespesa(despesa) {
      console.log('Registrando despesa:', despesa);
      
      if (E._internals.eventBus) {
        E._internals.eventBus.emit('operacional.despesa.registrada', despesa);
      }
      
      return { ok: true, despesa };
    },
    
    /**
     * Inicializar sistema de eventos
     */
    inicializarEventos() {
      if (!E._internals.eventBus) return;
      
      // Eventos do sistema operacional
      const eventos = [
        'operacional.inicializada',
        'operacional.modulo.carregado',
        'operacional.alerta.estoque',
        'operacional.receita.registrada',
        'operacional.custo.registrado',
        'operacional.despesa.registrada',
        'operacional.lucro.calculado'
      ];
      
      eventos.forEach(evento => {
        E._internals.eventBus.on(evento, (dados) => {
          console.log(`[Operacional] Evento ${evento}:`, dados);
        });
      });
    },
    
    /**
     * Verificar saúde do sistema operacional
     */
    verificarSaude() {
      const saude = {
        modulo: 'operacional',
        status: 'ok',
        timestamp: E._internals.nowISO(),
        modulos: this.modulosCarregados,
        estatisticas: {}
      };
      
      // Coletar estatísticas de módulos carregados
      Object.keys(this.modulosCarregados).forEach(modulo => {
        if (this.modulosCarregados[modulo] && E.modules[modulo] && E.modules[modulo].getEstatisticas) {
          try {
            saude.estatisticas[modulo] = E.modules[modulo].getEstatisticas();
          } catch (e) {
            saude.estatisticas[modulo] = { erro: e.message };
          }
        }
      });
      
      // Verificar alertas
      const alertas = [];
      
      // Verificar estoque baixo
      if (this.modulosCarregados.produtos && E.modules.produtos) {
        const estoqueBaixo = E.modules.produtos.getEstoqueBaixo();
        if (estoqueBaixo.length > 0) {
          alertas.push({
            tipo: 'estoque_baixo',
            severidade: 'alta',
            mensagem: `${estoqueBaixo.length} produto(s) com estoque abaixo do mínimo`,
            detalhes: estoqueBaixo.map(p => `${p.nome} (${p.estoqueAtual}/${p.estoqueMinimo})`)
          });
        }
      }
      
      saude.alertas = alertas;
      saude.totalAlertas = alertas.length;
      
      if (alertas.length > 0) {
        saude.status = 'alertas';
      }
      
      return saude;
    },
    
    /**
     * Obter dashboard operacional
     */
    getDashboardOperacional() {
      const dashboard = {
        titulo: 'Dashboard Operacional',
        atualizado: E._internals.nowISO(),
        modulos: {}
      };
      
      // Dashboard de Serviços
      if (this.modulosCarregados.servicos && E.modules.servicos) {
        try {
          dashboard.modulos.servicos = {
            total: E.modules.servicos.getEstatisticas(),
            ativos: E.modules.servicos.getAtivos().length,
            categorias: E.modules.servicos.getCategoriasComContagem()
          };
        } catch (e) {
          dashboard.modulos.servicos = { erro: e.message };
        }
      }
      
      // Dashboard de Produtos
      if (this.modulosCarregados.produtos && E.modules.produtos) {
        try {
          dashboard.modulos.produtos = {
            total: E.modules.produtos.getEstatisticas(),
            ativos: E.modules.produtos.getAtivos().length,
            estoqueBaixo: E.modules.produtos.getEstoqueBaixo().length,
            valorEstoque: E.modules.produtos.getValorTotalEstoque('custo'),
            valorVendaEstoque: E.modules.produtos.getValorTotalEstoque('venda')
          };
        } catch (e) {
          dashboard.modulos.produtos = { erro: e.message };
        }
      }
      
      // Dashboard de Estoque
      if (this.modulosCarregados.estoque && E.modules.estoque) {
        try {
          const ultimos30Dias = new Date();
          ultimos30Dias.setDate(ultimos30Dias.getDate() - 30);
          
          dashboard.modulos.estoque = {
            movimentosRecentes: E.modules.estoque.getRecentes(10),
            estatisticas30dias: E.modules.estoque.getEstatisticas({
              dataInicio: ultimos30Dias.toISOString()
            })
          };
        } catch (e) {
          dashboard.modulos.estoque = { erro: e.message };
        }
      }
      
      // KPIs consolidados
      dashboard.kpis = {
        servicosAtivos: dashboard.modulos.servicos?.ativos || 0,
        produtosAtivos: dashboard.modulos.produtos?.ativos || 0,
        produtosEstoqueBaixo: dashboard.modulos.produtos?.estoqueBaixo || 0,
        valorTotalEstoque: dashboard.modulos.produtos?.valorEstoque || 0,
        movimentos30dias: dashboard.modulos.estoque?.estatisticas30dias?.totalMovimentos || 0
      };
      
      return dashboard;
    },
    
    /**
     * Obter resumo executivo
     */
    getResumoExecutivo() {
      const dashboard = this.getDashboardOperacional();
      const saude = this.verificarSaude();
      
      const resumo = {
        titulo: 'Resumo Executivo - Central Operacional',
        atualizado: E._internals.nowISO(),
        status: saude.status,
        alertas: saude.totalAlertas,
        kpis: dashboard.kpis,
        recomendacoes: []
      };
      
      // Gerar recomendações baseadas nos dados
      if (dashboard.kpis.produtosEstoqueBaixo > 0) {
        resumo.recomendacoes.push({
          tipo: 'estoque',
          prioridade: 'alta',
          mensagem: `Repor estoque de ${dashboard.kpis.produtosEstoqueBaixo} produto(s) com estoque baixo`,
          acao: 'Verificar relatório de estoque baixo'
        });
      }
      
      if (dashboard.kpis.servicosAtivos === 0) {
        resumo.recomendacoes.push({
          tipo: 'servicos',
          prioridade: 'media',
          mensagem: 'Nenhum serviço cadastrado. Cadastre seus serviços para começar.',
          acao: 'Cadastrar primeiro serviço'
        });
      }
      
      if (dashboard.kpis.produtosAtivos === 0) {
        resumo.recomendacoes.push({
          tipo: 'produtos',
          prioridade: 'media',
          mensagem: 'Nenhum produto cadastrado. Cadastre seus produtos para controle de estoque.',
          acao: 'Cadastrar primeiro produto'
        });
      }
      
      return resumo;
    }
  };
  
  // Inicializar automaticamente após um breve delay
  setTimeout(() => {
    E.modules.operacional.init();
    
    // Exportar para uso global
    window.ECOMIM_OPERACIONAL.Core = E.modules.operacional;
    
    // Log de inicialização
    console.log('=========================================');
    console.log('ECOMIM EXPANSÃO OPERACIONAL INICIALIZADA');
    console.log('=========================================');
    console.log('Módulos carregados:');
    Object.keys(E.modules.operacional.modulosCarregados).forEach(modulo => {
      const status = E.modules.operacional.modulosCarregados[modulo] ? '✓' : '✗';
      console.log(`  ${status} ${modulo}`);
    });
    console.log('=========================================');
    
    // Emitir evento de inicialização
    if (E._internals.eventBus) {
      E._internals.eventBus.emit('operacional.inicializada', {
        timestamp: E._internals.nowISO(),
        modulos: E.modules.operacional.modulosCarregados
      });
    }
  }, 500);
}