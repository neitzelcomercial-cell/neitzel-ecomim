/* ============================================================================
 * ECOMIM OS — Módulo de Produtos (produtos.js)
 * Sistema operacional empresarial - Expansão Operacional
 * ========================================================================== */

'use strict';

// Aguardar o core.js carregar
if (typeof window.ECOMIM === 'undefined') {
  console.error('ECOMIM core não encontrado. Carregue core.js primeiro.');
} else {
  const E = window.ECOMIM;
  
  // Verificar se módulo de produtos já existe (não sobrescrever)
  if (!E.modules.produtos) {
    /* --- PRODUTOS --- */
    E.modules.produtos = {
      id: 'produtos',
      name: 'Produtos',
      icon: 'produtos',
      itemsKey: 'ecomim_produtos',
      produtos: [],
      
      // Status disponíveis
      statusValidos: ['ativo', 'inativo', 'esgotado', 'arquivado'],
      
      // Unidades de medida
      unidades: ['un', 'kg', 'g', 'm', 'cm', 'l', 'ml', 'cx', 'pct', 'outro'],
      
      // Categorias pré-definidas
      categorias: [
        'material', 'equipamento', 'ferramenta', 'consumivel', 
        'eletronico', 'moveis', 'vestuario', 'alimenticio', 'outro'
      ],
      
      load() {
        try {
          const raw = E._internals.storage.get(this.itemsKey);
          if (raw) this.produtos = JSON.parse(raw);
        } catch (e) { 
          this.produtos = [];
          console.warn('Falha ao carregar produtos:', e);
        }
      },
      
      /**
       * Adicionar novo produto
       * @param {Object} produto - Dados do produto
       * @param {string} produto.nome - Nome do produto
       * @param {string} produto.sku - Código SKU (opcional)
       * @param {string} produto.descricao - Descrição detalhada
       * @param {string} produto.categoria - Categoria do produto
       * @param {string} produto.fornecedor - Nome do fornecedor
       * @param {number} produto.custo - Custo de aquisição em centavos
       * @param {number} produto.preco - Preço de venda em centavos
       * @param {number} produto.estoqueAtual - Quantidade em estoque
       * @param {number} produto.estoqueMinimo - Estoque mínimo para alerta
       * @param {string} produto.unidade - Unidade de medida
       * @param {string} produto.status - Status inicial (padrão: 'ativo')
       * @returns {Object} Resultado da operação
       */
      add(produto) {
        // Validações básicas
        if (!produto.nome || produto.nome.trim() === '') {
          return { ok: false, code: 'NOME_REQUIRED', message: 'Nome do produto é obrigatório' };
        }
        
        const custo = Number(produto.custo) || 0;
        const preco = Number(produto.preco) || 0;
        const estoqueAtual = Number(produto.estoqueAtual) || 0;
        const estoqueMinimo = Number(produto.estoqueMinimo) || 0;
        
        if (custo < 0 || preco < 0 || estoqueAtual < 0 || estoqueMinimo < 0) {
          return { ok: false, code: 'VALOR_INVALIDO', message: 'Valores não podem ser negativos' };
        }
        
        if (preco > 0 && custo > preco) {
          console.warn('Produto com custo maior que preço de venda:', produto.nome);
        }
        
        // Calcular margem
        const margemBruta = preco > 0 ? ((preco - custo) / preco) * 100 : 0;
        
        // Gerar SKU automático se não fornecido
        let sku = produto.sku || '';
        if (!sku) {
          const prefixo = produto.categoria ? produto.categoria.substring(0, 3).toUpperCase() : 'PRO';
          const timestamp = Date.now().toString().slice(-6);
          const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
          sku = `${prefixo}-${timestamp}-${random}`;
        }
        
        const item = {
          id: E._internals.uid(),
          nome: E._internals.trimStr(produto.nome),
          sku: sku,
          descricao: E._internals.trimStr(produto.descricao || ''),
          categoria: produto.categoria || 'outro',
          fornecedor: E._internals.trimStr(produto.fornecedor || ''),
          custo: custo, // em centavos
          preco: preco, // em centavos
          margemBruta: Math.round(margemBruta * 100) / 100, // porcentagem com 2 casas decimais
          estoqueAtual: estoqueAtual,
          estoqueMinimo: estoqueMinimo,
          unidade: produto.unidade && this.unidades.includes(produto.unidade) 
                   ? produto.unidade 
                   : 'un',
          status: produto.status && this.statusValidos.includes(produto.status) 
                  ? produto.status 
                  : 'ativo',
          created: E._internals.nowISO(),
          updated: null
        };
        
        // Verificar se estoque está baixo
        if (item.estoqueAtual <= item.estoqueMinimo && item.status === 'ativo') {
          item.status = 'esgotado';
        }
        
        this.produtos.push(item);
        this.save();
        
        // Auditoria
        if (E._internals.audit) {
          E._internals.audit.record('produto.criado', 'produtos', null, item);
        }
        
        // Evento
        if (E._internals.eventBus) {
          E._internals.eventBus.emit('produto.created', { 
            produtoId: item.id, 
            nome: item.nome,
            sku: item.sku,
            estoqueAtual: item.estoqueAtual
          });
          
          // Emitir alerta se estoque baixo
          if (item.estoqueAtual <= item.estoqueMinimo) {
            E._internals.eventBus.emit('estoque.baixo', {
              produtoId: item.id,
              nome: item.nome,
              estoqueAtual: item.estoqueAtual,
              estoqueMinimo: item.estoqueMinimo
            });
          }
        }
        
        return { ok: true, item };
      },
      
      /**
       * Atualizar produto existente
       * @param {string} id - ID do produto
       * @param {Object} patch - Dados para atualizar
       * @returns {Object} Resultado da operação
       */
      update(id, patch) {
        const idx = this.produtos.findIndex((p) => p.id === id);
        if (idx === -1) return { ok: false, code: 'NOT_FOUND' };
        
        const before = { ...this.produtos[idx] };
        
        // Atualizar apenas campos permitidos
        const camposPermitidos = [
          'nome', 'sku', 'descricao', 'categoria', 'fornecedor', 
          'custo', 'preco', 'estoqueAtual', 'estoqueMinimo', 
          'unidade', 'status'
        ];
        
        const updateData = {};
        camposPermitidos.forEach(campo => {
          if (patch[campo] !== undefined) {
            updateData[campo] = patch[campo];
          }
        });
        
        // Recalcular margem se preço ou custo foram alterados
        if (updateData.preco !== undefined || updateData.custo !== undefined) {
          const preco = updateData.preco !== undefined ? Number(updateData.preco) : this.produtos[idx].preco;
          const custo = updateData.custo !== undefined ? Number(updateData.custo) : this.produtos[idx].custo;
          
          if (preco < 0 || custo < 0) {
            return { ok: false, code: 'VALOR_INVALIDO', message: 'Preço e custo não podem ser negativos' };
          }
          
          const margemBruta = preco > 0 ? ((preco - custo) / preco) * 100 : 0;
          updateData.margemBruta = Math.round(margemBruta * 100) / 100;
        }
        
        // Validar status
        if (updateData.status && !this.statusValidos.includes(updateData.status)) {
          delete updateData.status;
        }
        
        // Validar unidade
        if (updateData.unidade && !this.unidades.includes(updateData.unidade)) {
          delete updateData.unidade;
        }
        
        // Atualizar estoque e verificar status
        if (updateData.estoqueAtual !== undefined) {
          const estoqueAtual = Number(updateData.estoqueAtual);
          if (estoqueAtual < 0) {
            return { ok: false, code: 'ESTOQUE_INVALIDO', message: 'Estoque não pode ser negativo' };
          }
          
          const estoqueMinimo = updateData.estoqueMinimo !== undefined 
            ? Number(updateData.estoqueMinimo) 
            : this.produtos[idx].estoqueMinimo;
          
          // Atualizar status baseado no estoque
          if (estoqueAtual <= estoqueMinimo && updateData.status !== 'inativo') {
            updateData.status = 'esgotado';
          } else if (updateData.status === 'esgotado' && estoqueAtual > estoqueMinimo) {
            updateData.status = 'ativo';
          }
        }
        
        Object.assign(this.produtos[idx], updateData);
        this.produtos[idx].updated = E._internals.nowISO();
        this.save();
        
        // Auditoria
        if (E._internals.audit) {
          E._internals.audit.record('produto.atualizado', 'produtos', before, this.produtos[idx]);
        }
        
        // Evento de estoque baixo
        if (E._internals.eventBus && updateData.estoqueAtual !== undefined) {
          const produto = this.produtos[idx];
          if (produto.estoqueAtual <= produto.estoqueMinimo && produto.status === 'ativo') {
            E._internals.eventBus.emit('estoque.baixo', {
              produtoId: produto.id,
              nome: produto.nome,
              estoqueAtual: produto.estoqueAtual,
              estoqueMinimo: produto.estoqueMinimo
            });
          }
        }
        
        return { ok: true, item: this.produtos[idx] };
      },
      
      /**
       * Remover produto (marcar como inativo)
       * @param {string} id - ID do produto
       * @returns {Object} Resultado da operação
       */
      remove(id) {
        const idx = this.produtos.findIndex((p) => p.id === id);
        if (idx === -1) return { ok: false, code: 'NOT_FOUND' };
        
        // Marcar como inativo em vez de remover (para manter histórico)
        const before = { ...this.produtos[idx] };
        this.produtos[idx].status = 'inativo';
        this.produtos[idx].updated = E._internals.nowISO();
        this.save();
        
        // Auditoria
        if (E._internals.audit) {
          E._internals.audit.record('produto.inativado', 'produtos', before, this.produtos[idx]);
        }
        
        return { ok: true };
      },
      
      /**
       * Excluir produto DEFINITIVAMENTE (remove da lista e persiste).
       * Histórico de estoque/atendimentos permanece (dados denormalizados por nome).
       * @param {string} id - ID do produto
       * @returns {Object} Resultado da operação
       */
      excluir(id) {
        const idx = this.produtos.findIndex((p) => p.id === id);
        if (idx === -1) return { ok: false, code: 'NOT_FOUND' };

        const before = { ...this.produtos[idx] };
        this.produtos.splice(idx, 1);
        this.save();

        if (E._internals.audit) {
          E._internals.audit.record('produto.excluido', 'produtos', before, null);
        }

        if (E._internals.eventBus) {
          E._internals.eventBus.emit('produto.deleted', { produtoId: id });
        }

        return { ok: true };
      },

      /**
       * Buscar produtos com filtros
       * @param {Object} filters - Filtros de busca
       * @returns {Array} Lista de produtos filtrados
       */
      search(filters = {}) {
        let resultados = [...this.produtos];
        
        // Filtrar por status
        if (filters.status) {
          resultados = resultados.filter(p => p.status === filters.status);
        }
        
        // Filtrar por categoria
        if (filters.categoria) {
          resultados = resultados.filter(p => p.categoria === filters.categoria);
        }
        
        // Filtrar por fornecedor
        if (filters.fornecedor) {
          resultados = resultados.filter(p => 
            p.fornecedor.toLowerCase().includes(filters.fornecedor.toLowerCase())
          );
        }
        
        // Busca textual
        if (filters.search) {
          const searchTerm = filters.search.toLowerCase();
          resultados = resultados.filter(p => 
            p.nome.toLowerCase().includes(searchTerm) || 
            p.sku.toLowerCase().includes(searchTerm) ||
            p.descricao.toLowerCase().includes(searchTerm)
          );
        }
        
        // Filtrar estoque baixo
        if (filters.estoqueBaixo === true) {
          resultados = resultados.filter(p => 
            p.estoqueAtual <= p.estoqueMinimo && p.status === 'ativo'
          );
        }
        
        return resultados;
      },
      
      /**
       * Obter produto por ID
       * @param {string} id - ID do produto
       * @returns {Object|null} Produto encontrado ou null
       */
      getById(id) {
        return this.produtos.find(p => p.id === id) || null;
      },
      
      /**
       * Obter produto por SKU
       * @param {string} sku - Código SKU
       * @returns {Object|null} Produto encontrado ou null
       */
      getBySku(sku) {
        return this.produtos.find(p => p.sku === sku) || null;
      },
      
      /**
       * Obter produtos ativos
       * @returns {Array} Lista de produtos ativos
       */
      getAtivos() {
        return this.produtos.filter(p => p.status === 'ativo');
      },
      
      /**
       * Obter produtos com estoque baixo
       * @returns {Array} Lista de produtos com estoque abaixo do mínimo
       */
      getEstoqueBaixo() {
        return this.produtos.filter(p => 
          p.estoqueAtual <= p.estoqueMinimo && 
          p.status === 'ativo'
        );
      },
      
      /**
       * Atualizar estoque (para integração com vendas/serviços)
       * @param {string} produtoId - ID do produto
       * @param {number} quantidade - Quantidade positiva para entrada, negativa para saída
       * @param {string} motivo - Motivo da movimentação
       * @param {string} referencia - Referência externa (venda, serviço, etc.)
       * @returns {Object} Resultado da operação
       */
      atualizarEstoque(produtoId, quantidade, motivo = 'ajuste', referencia = null) {
        const produto = this.getById(produtoId);
        if (!produto) return { ok: false, code: 'PRODUTO_NAO_ENCONTRADO' };
        
        // 'esgotado' é estado automático de saldo baixo — deve aceitar movimento
        // (reposição/venda), senão o produto fica travado. Bloqueia só desativados.
        if (produto.status === 'inativo' || produto.status === 'arquivado') {
          return { ok: false, code: 'PRODUTO_INATIVO', message: 'Produto não está ativo' };
        }
        
        const novoEstoque = produto.estoqueAtual + quantidade;
        if (novoEstoque < 0) {
          return { ok: false, code: 'ESTOQUE_INSUFICIENTE', 
                   message: `Estoque insuficiente. Disponível: ${produto.estoqueAtual}, Requerido: ${-quantidade}` };
        }
        
        return this.update(produtoId, { 
          estoqueAtual: novoEstoque 
        });
      },
      
      /**
       * Obter estatísticas de produtos
       * @returns {Object} Estatísticas
       */
      getEstatisticas() {
        const ativos = this.getAtivos();
        const estoqueBaixo = this.getEstoqueBaixo();
        
        const valorEstoque = ativos.reduce((sum, p) => sum + (p.custo * p.estoqueAtual), 0);
        const valorVendaEstoque = ativos.reduce((sum, p) => sum + (p.preco * p.estoqueAtual), 0);
        
        return {
          total: this.produtos.length,
          ativos: ativos.length,
          inativos: this.produtos.length - ativos.length,
          estoqueBaixo: estoqueBaixo.length,
          valorEstoque: valorEstoque, // em centavos
          valorVendaEstoque: valorVendaEstoque, // em centavos
          margemMedia: ativos.length > 0 
            ? ativos.reduce((sum, p) => sum + p.margemBruta, 0) / ativos.length 
            : 0,
          categorias: [...new Set(ativos.map(p => p.categoria))].length
        };
      },
      
      /**
       * Obter valor total do estoque
       * @param {string} tipo - 'custo' ou 'venda'
       * @returns {number} Valor total em centavos
       */
      getValorTotalEstoque(tipo = 'custo') {
        const ativos = this.getAtivos();
        return ativos.reduce((sum, p) => {
          const valor = tipo === 'custo' ? p.custo : p.preco;
          return sum + (valor * p.estoqueAtual);
        }, 0);
      },
      
      save() {
        try { 
          E._internals.storage.set(this.itemsKey, JSON.stringify(this.produtos)); 
        } catch (e) {
          console.error('Falha ao salvar produtos:', e);
        }
      },
      
      // Inicializar
      init() {
        this.load();
        console.log('Módulo de Produtos carregado com', this.produtos.length, 'produtos');
        
        // Verificar estoque baixo ao inicializar
        const estoqueBaixo = this.getEstoqueBaixo();
        if (estoqueBaixo.length > 0 && E._internals.eventBus) {
          E._internals.eventBus.emit('estoque.inicial.baixo', {
            quantidade: estoqueBaixo.length,
            produtos: estoqueBaixo.map(p => ({ id: p.id, nome: p.nome, estoqueAtual: p.estoqueAtual }))
          });
        }
      }
    };
    
    // Inicializar automaticamente
    setTimeout(() => {
      E.modules.produtos.init();
    }, 100);
  } else {
    console.log('Módulo de Produtos já existe, usando instância existente.');
  }
  
  // Exportar para uso global
  if (typeof window.ECOMIM_OPERACIONAL === 'undefined') {
    window.ECOMIM_OPERACIONAL = {};
  }
  window.ECOMIM_OPERACIONAL.Produtos = E.modules.produtos;
}