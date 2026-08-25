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
   * MIGRAÇÃO ÚNICA: dados legados (neitzel_*) → módulos ECOMIM
   * Antes desta correção, metade do sistema gravava em neitzel_* e a
   * outra metade lia de ecomim_* — exclusões "não funcionavam" porque o
   * item era apagado numa loja enquanto a tela lia da outra.
   * ============================================ */
  function migrarLegado() {
    const FLAG = 'ecomim_migracao_legado_v1';
    if (E._internals && E._internals.storage && E._internals.storage.get(FLAG) === 'ok') return;
    try {
      const now = (E.nowISO ? E.nowISO() : new Date().toISOString());

      // Serviços legados → ECOMIM (preço/custo já em centavos; duracaoMin → duracao)
      const legServ = JSON.parse(localStorage.getItem('neitzel_servicos_v1') || '[]');
      if (Array.isArray(legServ) && legServ.length) {
        const ids = new Set(E.modules.servicos.servicos.map((s) => s.id));
        legServ.forEach((s) => {
          if (!s || !s.id || ids.has(s.id)) return;
          E.modules.servicos.servicos.push({
            ...s,
            preco: Number(s.preco) || 0,
            custo: Number(s.custo) || 0,
            duracao: s.duracao != null ? s.duracao : (s.duracaoMin || 60),
            created: s.created || s.criadoEm || now,
            updated: s.updated || null
          });
        });
        E.modules.servicos.save();
      }

      // Produtos legados → ECOMIM (mesmo esquema de campos)
      const legProd = JSON.parse(localStorage.getItem('neitzel_produtos_v1') || '[]');
      if (Array.isArray(legProd) && legProd.length) {
        const ids = new Set(E.modules.produtos.produtos.map((p) => p.id));
        legProd.forEach((p) => {
          if (!p || !p.id || ids.has(p.id)) return;
          E.modules.produtos.produtos.push({
            ...p,
            custo: Number(p.custo) || 0,
            preco: Number(p.preco) || 0,
            estoqueAtual: Math.max(0, Number(p.estoqueAtual) || 0),
            estoqueMinimo: Math.max(0, Number(p.estoqueMinimo) || 0),
            created: p.created || p.criadoEm || now,
            updated: p.updated || null
          });
        });
        E.modules.produtos.save();
      }

      // Movimentações de estoque legadas → ECOMIM (data → timestamp; qtd positiva)
      const legMov = JSON.parse(localStorage.getItem('neitzel_estoque_mov_v1') || '[]');
      if (Array.isArray(legMov) && legMov.length) {
        const ids = new Set(E.modules.estoque.movimentos.map((m) => m.id));
        legMov.forEach((m) => {
          if (!m || !m.id || ids.has(m.id)) return;
          const ts = m.data || m.timestamp || now;
          const tipo = m.tipo === 'venda' ? 'saida'
            : m.tipo === 'utilizado_servico' ? 'utilizacao' : (m.tipo || 'ajuste');
          E.modules.estoque.movimentos.push({
            ...m,
            tipo,
            quantidade: tipo === 'ajuste' ? (Number(m.quantidade) || 0)
              : (tipo === 'entrada' || tipo === 'devolucao' ? Math.abs(Number(m.quantidade) || 0)
                : -Math.abs(Number(m.quantidade) || 0)),
            timestamp: ts,
            created: ts
          });
        });
        E.modules.estoque.save();
      }

      if (E._internals.storage) E._internals.storage.set(FLAG, 'ok');
      console.log('✓ Migração de dados legados concluída');
    } catch (e) {
      console.warn('Migração legada falhou (seguindo sem bloquear):', e);
    }
  }
  migrarLegado();

  /* Normalizações de esquema entre os dois mundos */
  const toCentavos = (v) => {
    const n = Number(v);
    return isNaN(n) || n <= 0 ? 0 : Math.round(n * 100);
  };
  const servicoOut = (s) => {
    if (!s) return s;
    return Object.assign({}, s, { duracaoMin: s.duracaoMin != null ? s.duracaoMin : (s.duracao || 60) });
  };
  const movOut = (m) => ({
    id: m.id,
    produtoId: m.produtoId,
    produtoNome: m.produtoNome,
    tipo: m.tipo === 'utilizacao' ? 'utilizado_servico' : m.tipo,
    quantidade: ['saida', 'utilizacao', 'perda'].includes(m.tipo) ? Math.abs(Number(m.quantidade) || 0)
      : ['entrada', 'devolucao'].includes(m.tipo) ? Math.abs(Number(m.quantidade) || 0)
      : (Number(m.quantidade) || 0),
    motivo: m.motivo || '',
    referencia: m.referencia || null,
    data: m.timestamp || m.created || m.data || null
  });
  
  /* ============================================
   * INTEGRAÇÃO DO MÓDULO DE SERVIÇOS
   * ============================================ */
  
  if (E.modules.servicos && O.servicos) {
    console.log('Integrando módulo de serviços...');

    // Sobrescrever/adicionar métodos ao O.servicos
    Object.assign(O.servicos, {
      // Métodos básicos de CRUD
      list: function(filters = {}) {
        return E.modules.servicos.search(filters).map(servicoOut);
      },

      add: function(servico) {
        // A UI sempre envia valores em REAIS — converter para centavos.
        const servicoConvertido = { ...servico };
        servicoConvertido.preco = toCentavos(servicoConvertido.preco);
        servicoConvertido.custo = toCentavos(servicoConvertido.custo);
        if (servicoConvertido.duracaoMin !== undefined) {
          servicoConvertido.duracao = Number(servicoConvertido.duracaoMin) || 60;
          delete servicoConvertido.duracaoMin;
        }
        return E.modules.servicos.add(servicoConvertido);
      },

      update: function(id, patch) {
        const patchConvertido = { ...patch };
        if (patchConvertido.preco !== undefined) patchConvertido.preco = toCentavos(patchConvertido.preco);
        if (patchConvertido.custo !== undefined) patchConvertido.custo = toCentavos(patchConvertido.custo);
        if (patchConvertido.duracaoMin !== undefined) {
          patchConvertido.duracao = Number(patchConvertido.duracaoMin) || 60;
          delete patchConvertido.duracaoMin;
        }
        return E.modules.servicos.update(id, patchConvertido);
      },

      /** Exclusão REAL: remove o item da loja ECOMIM e persiste. */
      remove: function(id) {
        return E.modules.servicos.excluir(id);
      },
      excluir: function(id) {
        return E.modules.servicos.excluir(id);
      },

      // Métodos auxiliares
      get: function(id) {
        return servicoOut(E.modules.servicos.getById(id));
      },

      margem: function(servico) {
        if (!servico) return 0;
        const preco = servico.preco || 0;
        const custo = servico.custo || 0;
        return preco > 0 ? Math.round(((preco - custo) / preco) * 100) : 0;
      },

      // Métodos legados do motor (antes apontavam para a loja errada)
      ativos: function() {
        return E.modules.servicos.getAtivos().map(servicoOut);
      },

      // Novos métodos adicionados
      getAtivos: function() {
        return E.modules.servicos.getAtivos().map(servicoOut);
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
        // A UI sempre envia valores em REAIS — converter para centavos.
        const produtoConvertido = { ...produto };
        produtoConvertido.preco = toCentavos(produtoConvertido.preco);
        produtoConvertido.custo = toCentavos(produtoConvertido.custo);
        return E.modules.produtos.add(produtoConvertido);
      },

      update: function(id, patch) {
        const patchConvertido = { ...patch };
        if (patchConvertido.preco !== undefined) patchConvertido.preco = toCentavos(patchConvertido.preco);
        if (patchConvertido.custo !== undefined) patchConvertido.custo = toCentavos(patchConvertido.custo);
        return E.modules.produtos.update(id, patchConvertido);
      },

      /** Exclusão REAL (antes gravava na loja legada e a linha nunca sumia). */
      excluir: function(id) {
        return E.modules.produtos.excluir(id);
      },
      remove: function(id) {
        return E.modules.produtos.excluir(id);
      },

      // Métodos auxiliares
      get: function(id) {
        return E.modules.produtos.getById(id);
      },

      getBySku: function(sku) {
        return E.modules.produtos.getBySku(sku);
      },

      // Métodos legados do motor (antes apontavam para a loja errada)
      ativos: function() {
        return E.modules.produtos.getAtivos();
      },
      estoqueBaixo: function() {
        return E.modules.produtos.getEstoqueBaixo();
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
      /** Registro unificado: aceita os tipos do motor legado e delega ao módulo
        * ECOMIM (mesma loja que a UI lê). Sem isso, "Finalizar atendimento" e
        * "Registrar movimentação" gravavam num lugar e a tela lia de outro. */
      registrar: function(input) {
        const tipoMap = { venda: 'saida', utilizado_servico: 'utilizacao', perda: 'perda' };
        const tipo = tipoMap[input.tipo] || input.tipo;
        let qtd = Number(input.quantidade) || 0;
        // Motor legado usava quantidade POSITIVA para saída/venda/uso
        if (tipo === 'saida' || tipo === 'utilizacao') qtd = -Math.abs(qtd);
        const r = E.modules.estoque.registrarMovimento({
          produtoId: input.produtoId,
          tipo,
          quantidade: qtd,
          motivo: input.motivo || '',
          referencia: input.referencia || null,
          metadata: input.metadata || {}
        });
        if (!r.ok) return r;
        return { ok: true, mov: movOut(r.movimento), saldo: r.movimento.estoqueAtual };
      },

      historico: function(produtoId, limit = 120) {
        const all = produtoId
          ? E.modules.estoque.getHistoricoProduto(produtoId, limit)
          : E.modules.estoque.getRecentes(limit);
        return all.map(movOut);
      },

      /** Exclui a movimentação e reverte o saldo do produto. */
      excluir: function(id) {
        return E.modules.estoque.excluirMovimento(id);
      },
      excluirMovimento: function(id) {
        return E.modules.estoque.excluirMovimento(id);
      },

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
        return E.modules.estoque.search(filters).map(movOut);
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