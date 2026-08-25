/* ============================================================================
 * ECOMIM OS — Módulo de Controle de Estoque (estoque.js)
 * Sistema operacional empresarial - Expansão Operacional
 * ========================================================================== */

'use strict';

// Aguardar o core.js carregar
if (typeof window.ECOMIM === 'undefined') {
  console.error('ECOMIM core não encontrado. Carregue core.js primeiro.');
} else {
  const E = window.ECOMIM;
  
  // Verificar se módulo de estoque já existe (não sobrescrever)
  if (!E.modules.estoque) {
    /* --- CONTROLE DE ESTOQUE --- */
    E.modules.estoque = {
      id: 'estoque',
      name: 'Controle de Estoque',
      icon: 'estoque',
      movimentosKey: 'ecomim_estoque_movimentos',
      movimentos: [],
      
      // Tipos de movimentação
      tiposMovimentacao: [
        'entrada',      // Compra/recebimento
        'saida',        // Venda direta
        'ajuste',       // Correção de inventário
        'utilizacao',   // Uso em serviço
        'transferencia', // Transferência entre locais
        'perda',        // Perda/avaria
        'devolucao'     // Devolução de cliente
      ],
      
      load() {
        try {
          const raw = E._internals.storage.get(this.movimentosKey);
          if (raw) this.movimentos = JSON.parse(raw);
        } catch (e) { 
          this.movimentos = [];
          console.warn('Falha ao carregar movimentos de estoque:', e);
        }
      },
      
      /**
       * Registrar movimentação de estoque
       * @param {Object} movimento - Dados da movimentação
       * @param {string} movimento.produtoId - ID do produto
       * @param {string} movimento.tipo - Tipo de movimentação
       * @param {number} movimento.quantidade - Quantidade (positiva para entrada, negativa para saída)
       * @param {string} movimento.motivo - Motivo da movimentação
       * @param {string} movimento.referencia - Referência externa (venda, serviço, etc.)
       * @param {Object} movimento.metadata - Metadados adicionais
       * @returns {Object} Resultado da operação
       */
      registrarMovimento(movimento) {
        // Validações básicas
        if (!movimento.produtoId) {
          return { ok: false, code: 'PRODUTO_REQUIRED', message: 'ID do produto é obrigatório' };
        }
        
        if (!movimento.tipo || !this.tiposMovimentacao.includes(movimento.tipo)) {
          return { ok: false, code: 'TIPO_INVALIDO', message: 'Tipo de movimentação inválido' };
        }
        
        const quantidade = Number(movimento.quantidade);
        if (isNaN(quantidade) || quantidade === 0) {
          return { ok: false, code: 'QUANTIDADE_INVALIDA', message: 'Quantidade inválida' };
        }
        
        // Verificar se produto existe e está ativo
        const produto = E.modules.produtos ? E.modules.produtos.getById(movimento.produtoId) : null;
        if (!produto) {
          return { ok: false, code: 'PRODUTO_NAO_ENCONTRADO', message: 'Produto não encontrado' };
        }
        
        // Bloqueia movimentação apenas para produtos desativados/arquivados.
        // 'esgotado' é um estado automático de saldo baixo — DEVE aceitar
        // entrada (reposição) e saída (venda), senão o produto "trava".
        if (produto.status === 'inativo' || produto.status === 'arquivado') {
          return { ok: false, code: 'PRODUTO_INATIVO', message: 'Produto não está ativo' };
        }
        
        // Verificar estoque suficiente para saídas
        if (quantidade < 0 && Math.abs(quantidade) > produto.estoqueAtual) {
          return { ok: false, code: 'ESTOQUE_INSUFICIENTE', 
                   message: `Estoque insuficiente. Disponível: ${produto.estoqueAtual}, Requerido: ${Math.abs(quantidade)}` };
        }
        
        const movimentoId = E._internals.uid();
        const timestamp = E._internals.nowISO();
        
        const item = {
          id: movimentoId,
          produtoId: movimento.produtoId,
          produtoNome: produto.nome,
          produtoSku: produto.sku,
          tipo: movimento.tipo,
          quantidade: quantidade,
          estoqueAnterior: produto.estoqueAtual,
          estoqueAtual: produto.estoqueAtual + quantidade,
          motivo: E._internals.trimStr(movimento.motivo || ''),
          referencia: movimento.referencia || null,
          metadata: movimento.metadata || {},
          usuarioId: E._internals.usuarioAtual ? E._internals.usuarioAtual.id : 'sistema',
          timestamp: timestamp,
          created: timestamp
        };
        
        // Atualizar estoque do produto
        if (E.modules.produtos && E.modules.produtos.atualizarEstoque) {
          const resultadoAtualizacao = E.modules.produtos.atualizarEstoque(
            movimento.produtoId, 
            quantidade, 
            movimento.motivo,
            movimento.referencia
          );
          
          if (!resultadoAtualizacao.ok) {
            return resultadoAtualizacao;
          }
          
          // Atualizar estoque atual no movimento com o valor real
          const produtoAtualizado = E.modules.produtos.getById(movimento.produtoId);
          item.estoqueAtual = produtoAtualizado.estoqueAtual;
        }
        
        this.movimentos.push(item);
        this.save();
        
        // Auditoria
        if (E._internals.audit) {
          E._internals.audit.record('estoque.movimentado', 'estoque', null, item);
        }
        
        // Evento
        if (E._internals.eventBus) {
          E._internals.eventBus.emit('estoque.movimentado', {
            movimentoId: item.id,
            produtoId: item.produtoId,
            produtoNome: item.produtoNome,
            tipo: item.tipo,
            quantidade: item.quantidade,
            estoqueAtual: item.estoqueAtual
          });
          
          // Emitir alerta se estoque ficou baixo
          if (item.estoqueAtual <= produto.estoqueMinimo) {
            E._internals.eventBus.emit('estoque.baixo.apos.movimento', {
              produtoId: item.produtoId,
              produtoNome: item.produtoNome,
              estoqueAtual: item.estoqueAtual,
              estoqueMinimo: produto.estoqueMinimo,
              movimentoId: item.id
            });
          }
        }
        
        return { ok: true, movimento: item };
      },
      
      /**
       * Excluir DEFINITIVAMENTE uma movimentação do histórico e REVERTER
       * o efeito dela no saldo do produto:
       *  - entrada (+N) excluída → saldo volta a diminuir N
       *  - saída/utilização/perda (−N) excluída → saldo volta a receber N
       *  - ajuste → reverte o valor com sinal
       * Bloqueia se a reversão deixaria o saldo negativo.
       * @param {string} id - ID da movimentação
       * @returns {Object} Resultado ({ ok, saldo } quando bem-sucedida)
       */
      excluirMovimento(id) {
        const idx = this.movimentos.findIndex((m) => m.id === id);
        if (idx === -1) return { ok: false, code: 'NOT_FOUND', message: 'Movimentação não encontrada' };

        const mov = this.movimentos[idx];
        const qtd = Number(mov.quantidade) || 0;
        const produto = E.modules.produtos ? E.modules.produtos.getById(mov.produtoId) : null;

        let saldoNovo = null;
        if (produto && qtd !== 0) {
          saldoNovo = Number(produto.estoqueAtual) - qtd; // reversão exata do efeito
          if (saldoNovo < 0) {
            return {
              ok: false,
              code: 'SALDO_FICARIA_NEGATIVO',
              message: `Não é possível excluir: o saldo de "${produto.nome}" ficaria negativo (${saldoNovo}). Registre as baixas correspondentes primeiro.`
            };
          }
          // Reverte pelo caminho oficial (valida, transiciona status e persiste)
          const r = E.modules.produtos.update(produto.id, { estoqueAtual: saldoNovo });
          if (!r.ok) {
            return { ok: false, code: r.code || 'REVERSAO_FALHOU', message: r.message || ('Falha ao reverter o saldo (' + r.code + ').') };
          }
        }

        const before = { ...mov };
        this.movimentos.splice(idx, 1);
        this.save();

        if (E._internals.audit) {
          E._internals.audit.record('estoque.movimento_excluido', 'estoque', before, null);
        }

        if (E._internals.eventBus) {
          E._internals.eventBus.emit('estoque.movimento.excluido', {
            movimentoId: id,
            produtoId: mov.produtoId,
            saldo: saldoNovo
          });
        }

        return { ok: true, saldo: saldoNovo };
      },

      /**
       * Registrar entrada de estoque (compra/recebimento)
       * @param {string} produtoId - ID do produto
       * @param {number} quantidade - Quantidade positiva
       * @param {string} motivo - Motivo da entrada
       * @param {Object} metadata - Metadados adicionais
       * @returns {Object} Resultado da operação
       */
      registrarEntrada(produtoId, quantidade, motivo = 'compra', metadata = {}) {
        if (quantidade <= 0) {
          return { ok: false, code: 'QUANTIDADE_INVALIDA', message: 'Quantidade de entrada deve ser positiva' };
        }
        
        return this.registrarMovimento({
          produtoId: produtoId,
          tipo: 'entrada',
          quantidade: quantidade,
          motivo: motivo,
          metadata: metadata
        });
      },
      
      /**
       * Registrar saída de estoque (venda/uso)
       * @param {string} produtoId - ID do produto
       * @param {number} quantidade - Quantidade positiva (será convertida para negativa)
       * @param {string} motivo - Motivo da saída
       * @param {string} referencia - Referência da venda/serviço
       * @param {Object} metadata - Metadados adicionais
       * @returns {Object} Resultado da operação
       */
      registrarSaida(produtoId, quantidade, motivo = 'venda', referencia = null, metadata = {}) {
        if (quantidade <= 0) {
          return { ok: false, code: 'QUANTIDADE_INVALIDA', message: 'Quantidade de saída deve ser positiva' };
        }
        
        return this.registrarMovimento({
          produtoId: produtoId,
          tipo: motivo === 'venda' ? 'saida' : 'utilizacao',
          quantidade: -quantidade, // Negativo para saída
          motivo: motivo,
          referencia: referencia,
          metadata: metadata
        });
      },
      
      /**
       * Registrar ajuste de estoque (correção)
       * @param {string} produtoId - ID do produto
       * @param {number} quantidade - Quantidade positiva ou negativa
       * @param {string} motivo - Motivo do ajuste
       * @param {Object} metadata - Metadados adicionais
       * @returns {Object} Resultado da operação
       */
      registrarAjuste(produtoId, quantidade, motivo = 'inventario', metadata = {}) {
        return this.registrarMovimento({
          produtoId: produtoId,
          tipo: 'ajuste',
          quantidade: quantidade,
          motivo: motivo,
          metadata: metadata
        });
      },
      
      /**
       * Buscar movimentações com filtros
       * @param {Object} filters - Filtros de busca
       * @returns {Array} Lista de movimentações filtradas
       */
      search(filters = {}) {
        let resultados = [...this.movimentos];
        
        // Filtrar por produto
        if (filters.produtoId) {
          resultados = resultados.filter(m => m.produtoId === filters.produtoId);
        }
        
        // Filtrar por tipo
        if (filters.tipo) {
          resultados = resultados.filter(m => m.tipo === filters.tipo);
        }
        
        // Filtrar por período
        if (filters.dataInicio || filters.dataFim) {
          const inicio = filters.dataInicio ? new Date(filters.dataInicio).getTime() : 0;
          const fim = filters.dataFim ? new Date(filters.dataFim).getTime() : Date.now();
          
          resultados = resultados.filter(m => {
            const dataMov = new Date(m.timestamp).getTime();
            return dataMov >= inicio && dataMov <= fim;
          });
        }
        
        // Filtrar por referência
        if (filters.referencia) {
          resultados = resultados.filter(m => 
            m.referencia && m.referencia.includes(filters.referencia)
          );
        }
        
        // Ordenar por data (mais recente primeiro)
        resultados.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        return resultados;
      },
      
      /**
       * Obter histórico de movimentações de um produto
       * @param {string} produtoId - ID do produto
       * @param {number} limite - Limite de resultados (opcional)
       * @returns {Array} Histórico de movimentações
       */
      getHistoricoProduto(produtoId, limite = 50) {
        const historico = this.movimentos
          .filter(m => m.produtoId === produtoId)
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, limite);
        
        return historico;
      },
      
      /**
       * Obter saldo atual de um produto
       * @param {string} produtoId - ID do produto
       * @returns {number} Saldo atual do estoque
       */
      getSaldoProduto(produtoId) {
        const produto = E.modules.produtos ? E.modules.produtos.getById(produtoId) : null;
        return produto ? produto.estoqueAtual : 0;
      },
      
      /**
       * Obter movimentações recentes
       * @param {number} limite - Limite de resultados
       * @returns {Array} Movimentações recentes
       */
      getRecentes(limite = 20) {
        return this.movimentos
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, limite);
      },
      
      /**
       * Obter estatísticas de movimentações
       * @param {Object} periodo - Período para estatísticas
       * @returns {Object} Estatísticas
       */
      getEstatisticas(periodo = {}) {
        const movimentosFiltrados = this.search(periodo);
        
        const entradas = movimentosFiltrados.filter(m => m.quantidade > 0);
        const saidas = movimentosFiltrados.filter(m => m.quantidade < 0);
        
        const totalEntradas = entradas.reduce((sum, m) => sum + m.quantidade, 0);
        const totalSaidas = saidas.reduce((sum, m) => sum + Math.abs(m.quantidade), 0);
        
        // Agrupar por tipo
        const porTipo = {};
        movimentosFiltrados.forEach(m => {
          porTipo[m.tipo] = (porTipo[m.tipo] || 0) + Math.abs(m.quantidade);
        });
        
        // Agrupar por produto (top 10)
        const porProduto = {};
        movimentosFiltrados.forEach(m => {
          if (!porProduto[m.produtoId]) {
            porProduto[m.produtoId] = {
              nome: m.produtoNome,
              sku: m.produtoSku,
              quantidade: 0
            };
          }
          porProduto[m.produtoId].quantidade += Math.abs(m.quantidade);
        });
        
        const topProdutos = Object.values(porProduto)
          .sort((a, b) => b.quantidade - a.quantidade)
          .slice(0, 10);
        
        return {
          totalMovimentos: movimentosFiltrados.length,
          entradas: entradas.length,
          saidas: saidas.length,
          totalEntradas: totalEntradas,
          totalSaidas: totalSaidas,
          saldoPeriodo: totalEntradas - totalSaidas,
          porTipo: porTipo,
          topProdutos: topProdutos
        };
      },
      
      /**
       * Obter relatório de movimentações por período
       * @param {string} dataInicio - Data de início (ISO string)
       * @param {string} dataFim - Data de fim (ISO string)
       * @returns {Object} Relatório detalhado
       */
      getRelatorioPeriodo(dataInicio, dataFim) {
        const movimentos = this.search({ dataInicio, dataFim });
        const estatisticas = this.getEstatisticas({ dataInicio, dataFim });
        
        // Produtos mais movimentados
        const produtosMovimentados = [...new Set(movimentos.map(m => m.produtoId))];
        
        return {
          periodo: { dataInicio, dataFim },
          resumo: estatisticas,
          totalMovimentos: movimentos.length,
          produtosMovimentados: produtosMovimentados.length,
          movimentos: movimentos.slice(0, 100) // Limitar para não sobrecarregar
        };
      },
      
      save() {
        try { 
          E._internals.storage.set(this.movimentosKey, JSON.stringify(this.movimentos)); 
        } catch (e) {
          console.error('Falha ao salvar movimentos de estoque:', e);
        }
      },
      
      // Inicializar
      init() {
        // Aguardar módulo de produtos carregar
        const initInterval = setInterval(() => {
          if (E.modules.produtos) {
            clearInterval(initInterval);
            this.load();
            console.log('Módulo de Controle de Estoque carregado com', this.movimentos.length, 'movimentações');
            
            // Registrar evento para integração com vendas/serviços
            if (E._internals.eventBus) {
              // Escutar eventos de vendas para atualizar estoque
              E._internals.eventBus.on('venda.realizada', (evento) => {
                if (evento.produtos && Array.isArray(evento.produtos)) {
                  evento.produtos.forEach(produtoVenda => {
                    this.registrarSaida(
                      produtoVenda.produtoId,
                      produtoVenda.quantidade,
                      'venda',
                      evento.vendaId,
                      { clienteId: evento.clienteId, valor: produtoVenda.valor }
                    );
                  });
                }
              });
              
              // Escutar eventos de serviços para atualizar estoque
              E._internals.eventBus.on('servico.concluido', (evento) => {
                if (evento.produtosUtilizados && Array.isArray(evento.produtosUtilizados)) {
                  evento.produtosUtilizados.forEach(produtoUtilizado => {
                    this.registrarSaida(
                      produtoUtilizado.produtoId,
                      produtoUtilizado.quantidade,
                      'utilizacao',
                      evento.servicoId,
                      { clienteId: evento.clienteId, servico: evento.servicoNome }
                    );
                  });
                }
              });
            }
          }
        }, 100);
      }
    };
    
    // Inicializar automaticamente
    setTimeout(() => {
      E.modules.estoque.init();
    }, 200);
  } else {
    console.log('Módulo de Controle de Estoque já existe, usando instância existente.');
  }
  
  // Exportar para uso global
  if (typeof window.ECOMIM_OPERACIONAL === 'undefined') {
    window.ECOMIM_OPERACIONAL = {};
  }
  window.ECOMIM_OPERACIONAL.Estoque = E.modules.estoque;
}