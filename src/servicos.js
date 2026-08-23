/* ============================================================================
 * ECOMIM OS — Módulo de Serviços (servicos.js)
 * Sistema operacional empresarial - Expansão Operacional
 * ========================================================================== */

'use strict';

// Aguardar o core.js carregar
if (typeof window.ECOMIM === 'undefined') {
  console.error('ECOMIM core não encontrado. Carregue core.js primeiro.');
} else {
  const E = window.ECOMIM;
  
  // Verificar se módulo de serviços já existe (não sobrescrever)
  if (!E.modules.servicos) {
    /* --- SERVIÇOS --- */
    E.modules.servicos = {
      id: 'servicos',
      name: 'Serviços',
      icon: 'servicos',
      itemsKey: 'ecomim_servicos',
      servicos: [],
      
      // Status disponíveis
      statusValidos: ['ativo', 'inativo', 'arquivado'],
      
      // Categorias pré-definidas
      categorias: [
        'instalacao', 'manutencao', 'consulta', 'treinamento', 
        'suporte', 'desenvolvimento', 'design', 'marketing', 'outro'
      ],
      
      load() {
        try {
          const raw = E._internals.storage.get(this.itemsKey);
          if (raw) this.servicos = JSON.parse(raw);
        } catch (e) { 
          this.servicos = [];
          console.warn('Falha ao carregar serviços:', e);
        }
      },
      
      /**
       * Adicionar novo serviço
       * @param {Object} servico - Dados do serviço
       * @param {string} servico.nome - Nome do serviço
       * @param {string} servico.descricao - Descrição detalhada
       * @param {string} servico.categoria - Categoria do serviço
       * @param {number} servico.preco - Preço em centavos (ex: 50000 = R$ 500,00)
       * @param {number} servico.custo - Custo estimado em centavos
       * @param {number} servico.duracao - Duração em minutos
       * @param {string} servico.status - Status inicial (padrão: 'ativo')
       * @returns {Object} Resultado da operação
       */
      add(servico) {
        // Validações básicas
        if (!servico.nome || servico.nome.trim() === '') {
          return { ok: false, code: 'NOME_REQUIRED', message: 'Nome do serviço é obrigatório' };
        }
        
        if (servico.preco === undefined || servico.preco === null) {
          return { ok: false, code: 'PRECO_REQUIRED', message: 'Preço do serviço é obrigatório' };
        }
        
        const preco = Number(servico.preco);
        const custo = Number(servico.custo) || 0;
        
        if (preco < 0 || custo < 0) {
          return { ok: false, code: 'VALOR_INVALIDO', message: 'Preço e custo não podem ser negativos' };
        }
        
        // Calcular margem bruta
        const margemBruta = preco > 0 ? ((preco - custo) / preco) * 100 : 0;
        
        const item = {
          id: E._internals.uid(),
          nome: E._internals.trimStr(servico.nome),
          descricao: E._internals.trimStr(servico.descricao || ''),
          categoria: servico.categoria || 'outro',
          preco: preco, // em centavos
          custo: custo, // em centavos
          margemBruta: Math.round(margemBruta * 100) / 100, // porcentagem com 2 casas decimais
          duracao: Number(servico.duracao) || 60, // minutos, padrão 1 hora
          status: servico.status && this.statusValidos.includes(servico.status) 
                  ? servico.status 
                  : 'ativo',
          created: E._internals.nowISO(),
          updated: null
        };
        
        this.servicos.push(item);
        this.save();
        
        // Auditoria
        if (E._internals.audit) {
          E._internals.audit.record('servico.criado', 'servicos', null, item);
        }
        
        // Evento
        if (E._internals.eventBus) {
          E._internals.eventBus.emit('servico.created', { 
            servicoId: item.id, 
            nome: item.nome,
            preco: item.preco
          });
        }
        
        return { ok: true, item };
      },
      
      /**
       * Atualizar serviço existente
       * @param {string} id - ID do serviço
       * @param {Object} patch - Dados para atualizar
       * @returns {Object} Resultado da operação
       */
      update(id, patch) {
        const idx = this.servicos.findIndex((s) => s.id === id);
        if (idx === -1) return { ok: false, code: 'NOT_FOUND' };
        
        const before = { ...this.servicos[idx] };
        
        // Atualizar apenas campos permitidos
        const camposPermitidos = ['nome', 'descricao', 'categoria', 'preco', 'custo', 'duracao', 'status'];
        const updateData = {};
        
        camposPermitidos.forEach(campo => {
          if (patch[campo] !== undefined) {
            updateData[campo] = patch[campo];
          }
        });
        
        // Recalcular margem se preço ou custo foram alterados
        if (updateData.preco !== undefined || updateData.custo !== undefined) {
          const preco = updateData.preco !== undefined ? Number(updateData.preco) : this.servicos[idx].preco;
          const custo = updateData.custo !== undefined ? Number(updateData.custo) : this.servicos[idx].custo;
          
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
        
        Object.assign(this.servicos[idx], updateData);
        this.servicos[idx].updated = E._internals.nowISO();
        this.save();
        
        // Auditoria
        if (E._internals.audit) {
          E._internals.audit.record('servico.atualizado', 'servicos', before, this.servicos[idx]);
        }
        
        return { ok: true, item: this.servicos[idx] };
      },
      
      /**
       * Remover serviço (marcar como inativo)
       * @param {string} id - ID do serviço
       * @returns {Object} Resultado da operação
       */
      remove(id) {
        const idx = this.servicos.findIndex((s) => s.id === id);
        if (idx === -1) return { ok: false, code: 'NOT_FOUND' };
        
        // Marcar como inativo em vez de remover (para manter histórico)
        const before = { ...this.servicos[idx] };
        this.servicos[idx].status = 'inativo';
        this.servicos[idx].updated = E._internals.nowISO();
        this.save();
        
        // Auditoria
        if (E._internals.audit) {
          E._internals.audit.record('servico.inativado', 'servicos', before, this.servicos[idx]);
        }
        
        return { ok: true };
      },
      
      /**
       * Buscar serviços com filtros
       * @param {Object} filters - Filtros de busca
       * @param {string} filters.status - Filtrar por status
       * @param {string} filters.categoria - Filtrar por categoria
       * @param {string} filters.search - Busca textual no nome e descrição
       * @returns {Array} Lista de serviços filtrados
       */
      search(filters = {}) {
        let resultados = [...this.servicos];
        
        // Filtrar por status
        if (filters.status) {
          resultados = resultados.filter(s => s.status === filters.status);
        }
        
        // Filtrar por categoria
        if (filters.categoria) {
          resultados = resultados.filter(s => s.categoria === filters.categoria);
        }
        
        // Busca textual
        if (filters.search) {
          const searchTerm = filters.search.toLowerCase();
          resultados = resultados.filter(s => 
            s.nome.toLowerCase().includes(searchTerm) || 
            s.descricao.toLowerCase().includes(searchTerm)
          );
        }
        
        return resultados;
      },
      
      /**
       * Obter serviço por ID
       * @param {string} id - ID do serviço
       * @returns {Object|null} Serviço encontrado ou null
       */
      getById(id) {
        return this.servicos.find(s => s.id === id) || null;
      },
      
      /**
       * Obter serviços ativos
       * @returns {Array} Lista de serviços ativos
       */
      getAtivos() {
        return this.servicos.filter(s => s.status === 'ativo');
      },
      
      /**
       * Obter categorias disponíveis com contagem
       * @returns {Object} Categorias com contagem de serviços
       */
      getCategoriasComContagem() {
        const contagem = {};
        this.servicos.forEach(s => {
          if (s.status === 'ativo') {
            contagem[s.categoria] = (contagem[s.categoria] || 0) + 1;
          }
        });
        return contagem;
      },
      
      /**
       * Obter estatísticas de serviços
       * @returns {Object} Estatísticas
       */
      getEstatisticas() {
        const ativos = this.getAtivos();
        const totalPreco = ativos.reduce((sum, s) => sum + s.preco, 0);
        const totalCusto = ativos.reduce((sum, s) => sum + s.custo, 0);
        const margemMedia = ativos.length > 0 
          ? ativos.reduce((sum, s) => sum + s.margemBruta, 0) / ativos.length 
          : 0;
        
        return {
          total: this.servicos.length,
          ativos: ativos.length,
          inativos: this.servicos.length - ativos.length,
          precoMedio: ativos.length > 0 ? Math.round(totalPreco / ativos.length) : 0,
          custoMedio: ativos.length > 0 ? Math.round(totalCusto / ativos.length) : 0,
          margemMedia: Math.round(margemMedia * 100) / 100,
          categorias: Object.keys(this.getCategoriasComContagem()).length
        };
      },
      
      save() {
        try { 
          E._internals.storage.set(this.itemsKey, JSON.stringify(this.servicos)); 
        } catch (e) {
          console.error('Falha ao salvar serviços:', e);
        }
      },
      
      // Inicializar
      init() {
        this.load();
        console.log('Módulo de Serviços carregado com', this.servicos.length, 'serviços');
      }
    };
    
    // Inicializar automaticamente
    setTimeout(() => {
      E.modules.servicos.init();
    }, 100);
  } else {
    console.log('Módulo de Serviços já existe, usando instância existente.');
  }
  
  // Exportar para uso global (opcional)
  if (typeof window.ECOMIM_OPERACIONAL === 'undefined') {
    window.ECOMIM_OPERACIONAL = {};
  }
  window.ECOMIM_OPERACIONAL.Servicos = E.modules.servicos;
}