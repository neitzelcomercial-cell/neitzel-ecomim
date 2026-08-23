/* ============================================================================
 * ECOMIM OS — Integração de Módulos Operacionais
 * Conecta os novos módulos (servicos.js, produtos.js, estoque.js) com NEITZEL_OPS
 * ========================================================================== */

'use strict';

// Aguardar ambos os sistemas carregarem
function inicializarIntegracao() {
  // Verificar se ECOMIM está disponível
  if (typeof window.ECOMIM === 'undefined') {
    console.warn('ECOMIM não disponível para integração');
    return;
  }
  
  // Verificar se NEITZEL_OPS está disponível
  if (typeof window.NEITZEL_OPS === 'undefined') {
    console.warn('NEITZEL_OPS não disponível para integração');
    return;
  }
  
  const E = window.ECOMIM;
  const O = window.NEITZEL_OPS;
  
  console.log('Iniciando integração entre ECOMIM e NEITZEL_OPS...');
  
  /* ============================================
   * INTEGRAÇÃO DO MÓDULO DE SERVIÇOS
   * ============================================ */
  
  if (E.modules.servicos && O.servicos) {
    console.log('Integrando módulo de serviços...');
    
    // Sobrescrever/adicionar métodos ao O.servicos
    Object.assign(O.servicos, {
      // Métodos básicos de CRUD
      list: function(filters = {}) {
        return E.modules.servicos.search(filters);
      },
      
      add: function(servico) {
        // Converter preços para centavos se necessário
        const servicoConvertido = { ...servico };
        
        if (servicoConvertido.preco && servicoConvertido.preco > 0 && servicoConvertido.preco < 1000) {
          // Assume que está em reais (ex: 500 = R$ 500,00) e converte para centavos
          servicoConvertido.preco = Math.round(servicoConvertido.preco * 100);
        }
        
        if (servicoConvertido.custo && servicoConvertido.custo > 0 && servicoConvertido.custo < 1000) {
          servicoConvertido.custo = Math.round(servicoConvertido.custo * 100);
        }
        
        return E.modules.servicos.add(servicoConvertido);
      },
      
      update: function(id, patch) {
        // Converter preços para centavos se necessário
        const patchConvertido = { ...patch };
        
        if (patchConvertido.preco !== undefined && patchConvertido.preco > 0 && patchConvertido.preco < 1000) {
          patchConvertido.preco = Math.round(patchConvertido.preco * 100);
        }
        
        if (patchConvertido.custo !== undefined && patchConvertido.custo > 0 && patchConvertido.custo < 1000) {
          patchConvertido.custo = Math.round(patchConvertido.custo * 100);
        }
        
        return E.modules.servicos.update(id, patchConvertido);
      },
      
      remove: function(id) {
        return E.modules.servicos.remove(id);
      },
      
      // Métodos auxiliares
      get: function(id) {
        return E.modules.servicos.getById(id);
      },
      
      margem: function(servico) {
        if (!servico) return 0;
        const preco = servico.preco || 0;
        const custo = servico.custo || 0;
        return preco > 0 ? Math.round(((preco - custo) / preco) * 100) : 0;
      },
      
      // Novos métodos adicionados
      getAtivos: function() {
        return E.modules.servicos.getAtivos();
      },
      
      getEstatisticas: function() {
        return E.modules.servicos.getEstatisticas();
      },
      
      getCategoriasComContagem: function() {
        return E.modules.servicos.getCategoriasComContagem();
      }
    });
    
    console.log('✓ Módulo de serviços integrado');
  }
  
  /* ============================================
   * INTEGRAÇÃO DO MÓDULO DE PRODUTOS
   * ============================================ */
  
  if (E.modules.produtos && O.produtos) {
    console.log('Integrando módulo de produtos...');
    
    Object.assign(O.produtos, {
      // Métodos básicos de CRUD
      list: function(filters = {}) {
        return E.modules.produtos.search(filters);
      },
      
      add: function(produto) {
        // Converter preços para centavos se necessário
        const produtoConvertido = { ...produto };
        
        if (produtoConvertido.preco && produtoConvertido.preco > 0 && produtoConvertido.preco < 1000) {
          produtoConvertido.preco = Math.round(produtoConvertido.preco * 100);
        }
        
        if (produtoConvertido.custo && produtoConvertido.custo > 0 && produtoConvertido.custo < 1000) {
          produtoConvertido.custo = Math.round(produtoConvertido.custo * 100);
        }
        
        return E.modules.produtos.add(produtoConvertido);
      },
      
      update: function(id, patch) {
        // Converter preços para centavos se necessário
        const patchConvertido = { ...patch };
        
        if (patchConvertido.preco !== undefined && patchConvertido.preco > 0 && patchConvertido.preco < 1000) {
          patchConvertido.preco = Math.round(patchConvertido.preco * 100);
        }
        
        if (patchConvertido.custo !== undefined && patchConvertido.custo > 0 && patchConvertido.custo < 1000) {
          patchConvertido.custo = Math.round(patchConvertido.custo * 100);
        }
        
        return E.modules.produtos.update(id, patchConvertido);
      },
      
      remove: function(id) {
        return E.modules.produtos.remove(id);
      },
      
      // Métodos auxiliares
      get: function(id) {
        return E.modules.produtos.getById(id);
      },
      
      getBySku: function(sku) {
        return E.modules.produtos.getBySku(sku);
      },
      
      // Novos métodos adicionados
      getAtivos: function() {
        return E.modules.produtos.getAtivos();
      },
      
      getEstoqueBaixo: function() {
        return E.modules.produtos.getEstoqueBaixo();
      },
      
      getEstatisticas: function() {
        return E.modules.produtos.getEstatisticas();
      },
      
      getValorTotalEstoque: function(tipo = 'custo') {
        return E.modules.produtos.getValorTotalEstoque(tipo);
      },
      
      atualizarEstoque: function(produtoId, quantidade, motivo = 'ajuste', referencia = null) {
        return E.modules.produtos.atualizarEstoque(produtoId, quantidade, motivo, referencia);
      }
    });
    
    console.log('✓ Módulo de produtos integrado');
  }
  
  /* ============================================
   * INTEGRAÇÃO DO MÓDULO DE ESTOQUE
   * ============================================ */
  
  if (E.modules.estoque && O.estoque) {
    console.log('Integrando módulo de estoque...');
    
    Object.assign(O.estoque, {
      // Métodos básicos
      movimentar: function(movimento) {
        return E.modules.estoque.registrarMovimento(movimento);
      },
      
      entrada: function(produtoId, quantidade, motivo = 'compra', metadata = {}) {
        return E.modules.estoque.registrarEntrada(produtoId, quantidade, motivo, metadata);
      },
      
      saida: function(produtoId, quantidade, motivo = 'venda', referencia = null, metadata = {}) {
        return E.modules.estoque.registrarSaida(produtoId, quantidade, motivo, referencia, metadata);
      },
      
      ajuste: function(produtoId, quantidade, motivo = 'inventario', metadata = {}) {
        return E.modules.estoque.registrarAjuste(produtoId, quantidade, motivo, metadata);
      },
      
      // Métodos de consulta
      list: function(filters = {}) {
        return E.modules.estoque.search(filters);
      },
      
      getHistoricoProduto: function(produtoId, limite = 50) {
        return E.modules.estoque.getHistoricoProduto(produtoId, limite);
      },
      
      getSaldoProduto: function(produtoId) {
        return E.modules.estoque.getSaldoProduto(produtoId);
      },
      
      getRecentes: function(limite = 20) {
        return E.modules.estoque.getRecentes(limite);
      },
      
      // Novos métodos adicionados
      getEstatisticas: function(periodo = {}) {
        return E.modules.estoque.getEstatisticas(periodo);
      },
      
      getRelatorioPeriodo: function(dataInicio, dataFim) {
        return E.modules.estoque.getRelatorioPeriodo(dataInicio, dataFim);
      }
    });
    
    console.log('✓ Módulo de estoque integrado');
  }
  
  /* ============================================
   * INTEGRAÇÃO DO MÓDULO OPERACIONAL
   * ============================================ */
  
  if (E.modules.operacional) {
    console.log('Adicionando módulo operacional ao NEITZEL_OPS...');
    
    // Adicionar módulo operacional se não existir
    if (!O.operacional) {
      O.operacional = {};
    }
    
    Object.assign(O.operacional, {
      // Métodos do módulo operacional
      getDashboard: function() {
        return E.modules.operacional.getDashboardOperacional();
      },
      
      getResumoExecutivo: function() {
        return E.modules.operacional.getResumoExecutivo();
      },
      
      verificarSaude: function() {
        return E.modules.operacional.verificarSaude();
      },
      
      // Métodos de integração
      processarServicoConcluido: function(evento) {
        return E.modules.operacional.processarServicoConcluido(evento);
      },
      
      processarProdutoVendido: function(evento) {
        return E.modules.operacional.processarProdutoVendido(evento);
      },
      
      notificarEstoqueBaixo: function(evento) {
        return E.modules.operacional.notificarEstoqueBaixo(evento);
      },
      
      // Métodos financeiros
      registrarReceita: function(receita) {
        return E.modules.operacional.registrarReceita(receita);
      },
      
      registrarCusto: function(custo) {
        return E.modules.operacional.registrarCusto(custo);
      },
      
      registrarDespesa: function(despesa) {
        return E.modules.operacional.registrarDespesa(despesa);
      }
    });
    
    console.log('✓ Módulo operacional integrado');
  }
  
  /* ============================================
   * CONFIGURAÇÃO DE EVENTOS
   * ============================================ */
  
  // Configurar eventos cruzados entre sistemas
  if (E._internals && E._internals.eventBus) {
    console.log('Configurando eventos de integração...');
    
    // Quando um serviço é criado no novo sistema, notificar o sistema antigo
    E._internals.eventBus.on('servico.created', (evento) => {
      if (O.servicos && O.servicos.onCreated) {
        O.servicos.onCreated(evento);
      }
    });
    
    // Quando um produto é criado no novo sistema, notificar o sistema antigo
    E._internals.eventBus.on('produto.created', (evento) => {
      if (O.produtos && O.produtos.onCreated) {
        O.produtos.onCreated(evento);
      }
    });
    
    // Quando estoque é movimentado, notificar o sistema antigo
    E._internals.eventBus.on('estoque.movimentado', (evento) => {
      if (O.estoque && O.estoque.onMovimentado) {
        O.estoque.onMovimentado(evento);
      }
    });
    
    console.log('✓ Eventos configurados');
  }
  
  console.log('=========================================');
  console.log('INTEGRAÇÃO COMPLETA: ECOMIM ↔ NEITZEL_OPS');
  console.log('=========================================');
  console.log('Módulos integrados:');
  console.log(`  ✓ Serviços: ${E.modules.servicos ? 'SIM' : 'NÃO'}`);
  console.log(`  ✓ Produtos: ${E.modules.produtos ? 'SIM' : 'NÃO'}`);
  console.log(`  ✓ Estoque: ${E.modules.estoque ? 'SIM' : 'NÃO'}`);
  console.log(`  ✓ Operacional: ${E.modules.operacional ? 'SIM' : 'NÃO'}`);
  console.log('=========================================');
  
  // Emitir evento de integração concluída
  if (E._internals && E._internals.eventBus) {
    E._internals.eventBus.emit('integracao.concluida', {
      timestamp: new Date().toISOString(),
      modulos: {
        servicos: !!E.modules.servicos,
        produtos: !!E.modules.produtos,
        estoque: !!E.modules.estoque,
        operacional: !!E.modules.operacional
      }
    });
  }
  
  return true;
}

// Inicializar integração quando ambos sistemas estiverem prontos
let tentativas = 0;
const maxTentativas = 10;
const intervalo = 500;

const verificarSistemas = setInterval(() => {
  tentativas++;
  
  if (typeof window.ECOMIM !== 'undefined' && typeof window.NEITZEL_OPS !== 'undefined') {
    clearInterval(verificarSistemas);
    console.log('Sistemas detectados, iniciando integração...');
    setTimeout(() => {
      inicializarIntegracao();
    }, 1000);
  } else if (tentativas >= maxTentativas) {
    clearInterval(verificarSistemas);
    console.warn('Timeout: sistemas não carregados após', maxTentativas * intervalo / 1000, 'segundos');
  }
}, intervalo);

// Exportar função para uso manual
if (typeof window !== 'undefined') {
  window.integrarECOMIM_NEITZEL_OPS = inicializarIntegracao;
}