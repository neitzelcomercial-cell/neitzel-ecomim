/* ============================================================================
 * NEITZEL — Expansão Operacional (motor)
 * Serviços, Produtos, Estoque, Atendimento integrado, Receitas/Custos/Despesas
 * Camada de dados persistente (localStorage) seguindo o padrão do core ECOMIM.
 * ========================================================================== */

'use strict';

const NEITZEL_OPS = (() => {
  const E = typeof window !== 'undefined' && window.ECOMIM ? window.ECOMIM : null;

  const KEYS = {
    servicos: 'neitzel_servicos_v1',
    produtos: 'neitzel_produtos_v1',
    estoque_mov: 'neitzel_estoque_mov_v1',
    atendimentos: 'neitzel_atendimentos_v1',
  };

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) return JSON.parse(raw);
      } catch (e) { /* ignore */ }
      return fallback;
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
    },
  };

  const uid = () => (E && E.uid ? E.uid() : 'nz-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  const nowISO = () => (E && E.nowISO ? E.nowISO() : new Date().toISOString());
  const audit = (action, entity, before, after) => {
    if (E && E.audit && E.audit.record) {
      try { E.audit.record(action, entity, before, after); } catch (e) { /* ignore */ }
    }
  };
  const emit = (type, payload) => {
    if (E && E.eventBus && E.eventBus.emit) {
      try { E.eventBus.emit(type, payload); } catch (e) { /* ignore */ }
    }
  };
  const saveDb = () => {
    if (E && E.db && E.db.save) { try { E.db.save(); } catch (e) { /* ignore */ } }
  };

  /* ------------------------------------------------------------------ *
   * SERVIÇOS
   * ------------------------------------------------------------------ */
  const servicos = {
    list() { return store.get(KEYS.servicos, []); },
    _save(list) { store.set(KEYS.servicos, list); },
    add(input) {
      const nome = String(input.nome || '').trim();
      if (!nome) return { ok: false, code: 'SEM_NOME', message: 'Informe o nome do serviço.' };
      const p = Number(input.preco) || 0;
      if (p <= 0) return { ok: false, code: 'PRECO_INVALIDO', message: 'Informe um preço válido.' };
      const s = {
        id: uid(), nome,
        descricao: String(input.descricao || '').trim(),
        categoria: String(input.categoria || '').trim(),
        preco: Math.round(p * 100),
        custo: Math.round((Number(input.custo) || 0) * 100),
        duracaoMin: Math.max(0, Number(input.duracaoMin) || 0),
        status: input.status === 'inativo' ? 'inativo' : 'ativo',
        criadoEm: nowISO(),
      };
      const list = this.list();
      list.push(s);
      this._save(list);
      audit('operacional.servico_criado', 'servico', null, s);
      emit('servico.created', { servicoId: s.id });
      return { ok: true, servico: s };
    },
    update(id, patch) {
      const list = this.list();
      const i = list.findIndex((s) => s.id === id);
      if (i < 0) return { ok: false, code: 'NOT_FOUND' };
      const before = Object.assign({}, list[i]);
      const allow = ['nome', 'descricao', 'categoria', 'preco', 'custo', 'duracaoMin', 'status'];
      allow.forEach((k) => {
        if (patch[k] !== undefined) list[i][k] = patch[k];
      });
      if (patch.preco !== undefined) list[i].preco = Math.round(Number(patch.preco) * 100);
      if (patch.custo !== undefined) list[i].custo = Math.round(Number(patch.custo) * 100);
      this._save(list);
      audit('operacional.servico_atualizado', 'servico', before, list[i]);
      emit('servico.updated', { servicoId: id });
      return { ok: true, servico: list[i] };
    },
    remove(id) {
      const list = this.list();
      const i = list.findIndex((s) => s.id === id);
      if (i < 0) return { ok: false, code: 'NOT_FOUND' };
      const [removed] = list.splice(i, 1);
      this._save(list);
      audit('operacional.servico_removido', 'servico', removed, null);
      emit('servico.deleted', { servicoId: id });
      return { ok: true };
    },
    ativos() { return this.list().filter((s) => s.status !== 'inativo'); },
    margem(s) {
      if (!s || !s.preco) return 0;
      return Math.round(((s.preco - s.custo) / s.preco) * 100);
    },
  };

  /* ------------------------------------------------------------------ *
   * PRODUTOS + ESTOQUE (transacional: entrada/saída/ajuste)
   * ------------------------------------------------------------------ */
  const produtos = {
    list() { return store.get(KEYS.produtos, []); },
    _save(list) { store.set(KEYS.produtos, list); },
    add(input) {
      const nome = String(input.nome || '').trim();
      if (!nome) return { ok: false, code: 'SEM_NOME', message: 'Informe o nome do produto.' };
      const p = {
        id: uid(),
        nome,
        sku: String(input.sku || '').trim(),
        categoria: String(input.categoria || '').trim(),
        descricao: String(input.descricao || '').trim(),
        fornecedor: String(input.fornecedor || '').trim(),
        custo: Math.round((Number(input.custo) || 0) * 100),
        preco: Math.round((Number(input.preco) || 0) * 100),
        estoqueAtual: Math.max(0, Number(input.estoqueAtual) || 0),
        estoqueMinimo: Math.max(0, Number(input.estoqueMinimo) || 0),
        unidade: String(input.unidade || 'un').trim() || 'un',
        status: input.status === 'inativo' ? 'inativo' : 'ativo',
        criadoEm: nowISO(),
      };
      if (p.preco <= 0) return { ok: false, code: 'PRECO_INVALIDO', message: 'Informe um preço de venda válido.' };
      // Persiste o produto ANTES da movimentação inicial, para que
      // `estoque.registrar` encontre o produto (antes, o registro de
      // "Estoque inicial" falhava silenciosamente — PRODUTO_NOT_FOUND).
      const list = this.list();
      list.push(p);
      this._save(list);
      // Entrada inicial de estoque (se informada no cadastro)
      if (p.estoqueAtual > 0) {
        // O produto foi persistido ANTES com `estoqueAtual` já definido; a
        // movimentação de "Estoque inicial" precisa existir no histórico, mas
        // NÃO pode somar novamente ao saldo (isso dobraria a quantidade).
        // `estoque.registrar` soma ao saldo — por isso, registramos a
        // movimentação inicial diretamente no histórico (sem alterar saldo).
        const movs = estoque.list();
        movs.push({
          id: uid(),
          produtoId: p.id,
          produtoNome: p.nome,
          quantidade: p.estoqueAtual,
          tipo: 'entrada',
          motivo: 'Estoque inicial (cadastro)',
          referencia: null,
          data: nowISO(),
        });
        if (movs.length > 5000) movs.splice(0, movs.length - 5000);
        estoque._save(movs);
        audit('operacional.estoque_entrada', 'produto', null, { after: p.estoqueAtual });
        emit('estoque.movimentado', { produtoId: p.id, tipo: 'entrada', quantidade: p.estoqueAtual });
      }
      audit('operacional.produto_criado', 'produto', null, p);
      emit('produto.created', { produtoId: p.id });
      return { ok: true, produto: p };
    },
    update(id, patch) {
      const list = this.list();
      const i = list.findIndex((p) => p.id === id);
      if (i < 0) return { ok: false, code: 'NOT_FOUND' };
      const before = Object.assign({}, list[i]);
      const allow = ['nome', 'sku', 'categoria', 'descricao', 'fornecedor', 'custo', 'preco', 'estoqueMinimo', 'unidade', 'status'];
      allow.forEach((k) => {
        if (patch[k] !== undefined) list[i][k] = patch[k];
      });
      if (patch.custo !== undefined) list[i].custo = Math.round(Number(patch.custo) * 100);
      if (patch.preco !== undefined) list[i].preco = Math.round(Number(patch.preco) * 100);
      this._save(list);
      audit('operacional.produto_atualizado', 'produto', before, list[i]);
      emit('produto.updated', { produtoId: id });
      return { ok: true, produto: list[i] };
    },
    remove(id) {
      const list = this.list();
      const i = list.findIndex((p) => p.id === id);
      if (i < 0) return { ok: false, code: 'NOT_FOUND' };
      const [removed] = list.splice(i, 1);
      this._save(list);
      audit('operacional.produto_removido', 'produto', removed, null);
      emit('produto.deleted', { produtoId: id });
      return { ok: true };
    },
    ativos() { return this.list().filter((p) => p.status !== 'inativo'); },
    estoqueBaixo() { return this.list().filter((p) => p.status !== 'inativo' && p.estoqueMinimo > 0 && p.estoqueAtual < p.estoqueMinimo); },
    margem(p) {
      if (!p || !p.preco) return 0;
      return Math.round(((p.preco - p.custo) / p.preco) * 100);
    },
  };

  const estoque = {
    list() { return store.get(KEYS.estoque_mov, []); },
    _save(list) { store.set(KEYS.estoque_mov, list); },
    /**
     * Registra movimentação e atualiza o saldo do produto de forma transacional.
     * tipos: entrada | saida | ajuste | venda | utilizado_servico
     */
    registrar({ produtoId, produtoNome, quantidade, tipo, motivo, referencia }) {
      const qty = Number(quantidade) || 0;
      // Quantidade zero sempre inválida; negativa só é aceita em ajuste (baixa de inventário)
      if (!produtoId || qty === 0 || (qty < 0 && tipo !== 'ajuste')) return { ok: false, code: 'QUANTIDADE_INVALIDA' };
      const prods = produtos.list();
      const i = prods.findIndex((p) => p.id === produtoId);
      if (i < 0) return { ok: false, code: 'PRODUTO_NOT_FOUND' };
      const before = prods[i].estoqueAtual;
      const mov = {
        id: uid(), produtoId, produtoNome: produtoNome || prods[i].nome,
        quantidade: qty, tipo, motivo: String(motivo || ''),
        referencia: referencia || null, data: nowISO(),
      };
      if (tipo === 'entrada') {
        prods[i].estoqueAtual += qty;
      } else if (tipo === 'ajuste') {
        // Ajuste de inventário: positivo soma, negativo dá baixa (antes, um
        // ajuste negativo virava positivo por causa do Math.abs — impossível
        // corrigir estoque para menos). Valida estoque suficiente na baixa.
        if (qty < 0 && Math.abs(qty) > prods[i].estoqueAtual) {
          return { ok: false, code: 'ESTOQUE_INSUFICIENTE', message: `Ajuste de -${Math.abs(qty)} excede o estoque de ${prods[i].nome} (${prods[i].estoqueAtual}).` };
        }
        prods[i].estoqueAtual += qty;
      } else {
        // saída, venda, utilizado_servico
        if (qty > prods[i].estoqueAtual) return { ok: false, code: 'ESTOQUE_INSUFICIENTE', message: `Estoque insuficiente de ${prods[i].nome}. Disponível: ${prods[i].estoqueAtual}.` };
        prods[i].estoqueAtual -= qty;
      }
      const movs = this.list();
      movs.push(mov);
      if (movs.length > 5000) movs.splice(0, movs.length - 5000);
      this._save(movs);
      produtos._save(prods);
      audit('operacional.estoque_' + tipo, 'produto', { before }, { after: prods[i].estoqueAtual });
      emit('estoque.movimentado', { produtoId, tipo, quantidade: qty });
      saveDb();
      return { ok: true, mov, saldo: prods[i].estoqueAtual };
    },
    historico(produtoId, limit = 120) {
      const all = this.list();
      const f = produtoId ? all.filter((m) => m.produtoId === produtoId) : all;
      return f.slice(-limit).reverse();
    },
  };

  /* ------------------------------------------------------------------ *
   * ATENDIMENTOS OPERACIONAIS (agendados no planner, executados aqui)
   * Convenção monetária: TUDO em centavos (padrão do core ECOMIM).
   * ------------------------------------------------------------------ */
  const normItens = (itens) => (Array.isArray(itens) ? itens : []).map((it) => ({
    produtoId: it.produtoId,
    produtoNome: String(it.produtoNome || ''),
    quantidade: Number(it.quantidade) || 0,
    precoUnitario: Math.round((Number(it.precoUnitario) || 0) * 100),
    custoUnitario: Math.round((Number(it.custoUnitario) || 0) * 100),
  }));
  const normDespesas = (desps) => (Array.isArray(desps) ? desps : []).map((d) => ({
    descricao: String(d.descricao || '').trim(),
    valor: Math.round((Number(d.valor) || 0) * 100),
    categoria: String(d.categoria || 'outros'),
    formaPagamento: String(d.formaPagamento || 'outros'),
    data: d.data || null,
  }));

  const atendimentos = {
    statusDefault: 'agendado',
    statusValidos: ['agendado', 'confirmado', 'em_andamento', 'concluido', 'cancelado', 'nao_compareceu'],
    list() { return store.get(KEYS.atendimentos, []); },
    _save(list) { store.set(KEYS.atendimentos, list); },
    add(input) {
      const cliente = String(input.cliente || '').trim();
      if (!cliente) return { ok: false, code: 'SEM_CLIENTE', message: 'Informe o cliente.' };
      const inicio = input.inicio || nowISO();
      const fim = input.fim || inicio;
      const a = {
        id: uid(),
        cliente,
        clienteId: input.clienteId || null, // vínculo real com Clientes & CS (quando selecionado)
        telefone: String(input.telefone || '').trim(),
        inicio: new Date(inicio).toISOString(),
        fim: new Date(fim).toISOString(),
        servicoNome: String(input.servicoNome || '').trim(),
        servicoId: input.servicoId || null,
        servicoPreco: Math.round((Number(input.servicoPreco) || 0) * 100),
        servicoCusto: Math.round((Number(input.servicoCusto) || 0) * 100),
        responsavel: String(input.responsavel || '').trim(),
        endereco: String(input.endereco || '').trim(),
        observacoes: String(input.observacoes || '').trim(),
        status: input.status && this.statusValidos.includes(input.status) ? input.status : 'agendado',
        itensProdutos: normItens(input.itensProdutos),
        despesas: normDespesas(input.despesas),
        pagamentos: Array.isArray(input.pagamentos) ? input.pagamentos : [],
        criadoEm: nowISO(),
      };
      const list = this.list();
      list.push(a);
      this._save(list);
      audit('operacional.atendimento_criado', 'atendimento', null, a);
      emit('atendimento.created', { atendimentoId: a.id });
      saveDb();
      return { ok: true, atendimento: a };
    },
    update(id, patch) {
      const list = this.list();
      const i = list.findIndex((a) => a.id === id);
      if (i < 0) return { ok: false, code: 'NOT_FOUND' };
      const before = Object.assign({}, list[i]);
      if (patch.servicoPreco !== undefined) list[i].servicoPreco = Math.round(Number(patch.servicoPreco) * 100);
      if (patch.servicoCusto !== undefined) list[i].servicoCusto = Math.round(Number(patch.servicoCusto) * 100);
      if (patch.itensProdutos !== undefined) list[i].itensProdutos = normItens(patch.itensProdutos);
      if (patch.despesas !== undefined) list[i].despesas = normDespesas(patch.despesas);
      const allow = ['cliente', 'clienteId', 'telefone', 'inicio', 'fim', 'servicoNome', 'servicoId', 'responsavel', 'endereco', 'observacoes', 'status', 'pagamentos'];
      allow.forEach((k) => {
        if (patch[k] !== undefined) list[i][k] = patch[k];
      });
      this._save(list);
      audit('operacional.atendimento_atualizado', 'atendimento', before, list[i]);
      emit('atendimento.updated', { atendimentoId: id });
      saveDb();
      return { ok: true, atendimento: list[i] };
    },
    /**
     * Finaliza um atendimento: baixa estoque dos produtos, gera receita
     * (conta a receber) com base no serviço + produtos, registra custos e
     * despesas vinculadas. Tudo de forma idempotente (só executa se status
     * ainda não era 'concluido') e em centavos.
     */
    finalizar(id) {
      const list = this.list();
      const i = list.findIndex((x) => x.id === id);
      if (i < 0) return { ok: false, code: 'NOT_FOUND' };
      const a = list[i];
      if (a.status === 'concluido') return { ok: false, code: 'JA_CONCLUIDO', message: 'Este atendimento já foi concluído.' };
      // 1. Baixa de estoque dos produtos
      const baixas = [];
      for (const item of (a.itensProdutos || [])) {
        if (!item.produtoId) continue;
        const r = estoque.registrar({
          produtoId: item.produtoId, produtoNome: item.produtoNome,
          quantidade: item.quantidade, tipo: 'utilizado_servico',
          motivo: `Atendimento: ${a.cliente} (${a.servicoNome || 'serviço'})`,
          referencia: id,
        });
        if (r.ok) baixas.push({ ok: true });
        else {
          baixas.push({ ok: false, code: r.code, message: r.message, produtoNome: item.produtoNome });
          return { ok: false, code: r.code, message: r.message, item: item };
        }
      }
      // 2. Receita total (serviço + produtos) — interna em centavos;
      // o addConta do núcleo espera REAIS (converte com toCents ×100), por isso
      // dividimos por 100 ao lançar. Nunca lançar o valor em centavos aqui.
      const receitaServico = a.servicoPreco || 0;
      const receitaProdutos = (a.itensProdutos || []).reduce((acc, it) => acc + (it.precoUnitario || 0) * (it.quantidade || 0), 0);
      const receitaTotal = receitaServico + receitaProdutos;
      if (receitaTotal > 0 && E && E.modules && E.modules.financeiro) {
        try {
          E.modules.financeiro.addConta({
            tipo: 'receber',
            descricao: `Atendimento: ${a.cliente} — ${a.servicoNome || 'Serviço'}`,
            valor: receitaTotal / 100,
            vencimento: new Date().toISOString().slice(0, 10),
            status: 'pendente',
            categoria: 'servico',
            formaPagamento: 'outros',
            observacoes: `Atendimento operacional (${a.id}) — inclui serviço e produtos.`,
          });
        } catch (e) { /* se falhar, segue sem quebrar o fluxo */ }
      }
      // 3. Custos (custo do serviço + custo dos produtos) — interna em centavos;
      // idem: addConta espera reais.
      const custoServico = a.servicoCusto || 0;
      const custoProdutos = (a.itensProdutos || []).reduce((acc, it) => acc + (it.custoUnitario || 0) * (it.quantidade || 0), 0);
      const custoTotal = custoServico + custoProdutos;
      if (custoTotal > 0 && E && E.modules && E.modules.financeiro) {
        try {
          E.modules.financeiro.addConta({
            tipo: 'pagar',
            descricao: `Custo do atendimento: ${a.cliente} — ${a.servicoNome || 'Serviço'}`,
            valor: custoTotal / 100,
            vencimento: new Date().toISOString().slice(0, 10),
            status: 'pendente',
            categoria: 'custo_servico',
            observacoes: `Custo vinculado ao atendimento (${a.id}).`,
          });
        } catch (e) { /* ignore */ }
      }
      // 4. Despesas vinculadas — em centavos internamente; idem conversão.
      (a.despesas || []).forEach((d) => {
        if (!d.descricao || !d.valor) return;
        try {
          E.modules.financeiro.addConta({
            tipo: 'pagar',
            descricao: `${d.descricao} — ${a.cliente}`,
            valor: d.valor / 100,
            vencimento: d.data || new Date().toISOString().slice(0, 10),
            status: 'pendente',
            categoria: d.categoria || 'outros',
            formaPagamento: d.formaPagamento || 'outros',
            observacoes: `Despesa vinculada ao atendimento (${a.id}).`,
          });
        } catch (e) { /* ignore */ }
      });
      // 5. Marca como concluído (persistindo no array correto)
      a.status = 'concluido';
      this._save(list);
      audit('operacional.atendimento_finalizado', 'atendimento', null, { id, receita: receitaTotal });
      emit('atendimento.concluido', { atendimentoId: id, receita: receitaTotal });
      saveDb();
      return { ok: true, receita: receitaTotal, custo: custoTotal, despesas: a.despesas.length, baixas };
    },
    /** Reabre um atendimento concluído revertendo os lançamentos atrelados:
     * remove as contas a receber/pagar criadas na finalização (referência pelo
     * `observacoes` com o id do atendimento) e repõe o estoque com a movimentação
     * de reversão (documentada no histórico). Ação humana reversível — sem isso,
     * uma segunda finalização dobraria receita e baixa de estoque.
     */
    reabrir(id) {
      const list = this.list();
      const i = list.findIndex((a) => a.id === id);
      if (i < 0) return { ok: false, code: 'NOT_FOUND' };
      if (list[i].status !== 'concluido') return { ok: false, code: 'NAO_CONCLUIDO' };
      const a = list[i];
      // 1. Remove as contas do Financeiro vinculadas a este atendimento
      if (E && E.modules && E.modules.financeiro && E.modules.financeiro.contas) {
        const refs = [`Atendimento operacional (${id})`, `Custo vinculado ao atendimento (${id})`, `Despesa vinculada ao atendimento (${id})`];
        // Mutação no MESMO array (reatribuir criaria outra referência e nada
        // seria removido para quem já leu o array).
        const manter = E.modules.financeiro.contas.filter((c) => !refs.some((r) => String(c.observacoes || '').includes(r)));
        E.modules.financeiro.contas.splice(0, E.modules.financeiro.contas.length, ...manter);
        E.modules.financeiro.save();
      }
      // 2. Repõe o estoque dos produtos utilizados (movimentação de reversão)
      for (const item of (a.itensProdutos || [])) {
        if (!item.produtoId) continue;
        estoque.registrar({
          produtoId: item.produtoId, produtoNome: item.produtoNome,
          quantidade: item.quantidade, tipo: 'entrada',
          motivo: `Reversão — atendimento ${a.cliente} (${a.servicoNome || 'serviço'}) reaberto`,
          referencia: id,
        });
      }
      // 3. Reabre
      a.status = 'em_andamento';
      this._save(list);
      audit('operacional.atendimento_reaberto', 'atendimento', null, { id });
      emit('atendimento.reaberto', { atendimentoId: id });
      saveDb();
      return { ok: true };
    },
    cancelar(id) {
      const list = this.list();
      const i = list.findIndex((a) => a.id === id);
      if (i < 0) return { ok: false, code: 'NOT_FOUND' };
      list[i].status = 'cancelado';
      this._save(list);
      audit('operacional.atendimento_cancelado', 'atendimento', null, { id });
      return { ok: true };
    },
    between(fromISO, toISO) {
      const f = new Date(fromISO).getTime();
      const t = new Date(toISO).getTime();
      return this.list().filter((a) => {
        const d = new Date(a.inicio).getTime();
        return d >= f && d <= t;
      });
    },
    /** Atendimentos de um cliente (por id ou nome) — alimenta o histórico financeiro do cliente. */
    porClienteId(clienteId) {
      if (!clienteId) return [];
      return this.list().filter((a) => a.clienteId === clienteId);
    },
    hoje() { return this.between(new Date().setHours(0, 0, 0, 0), new Date().setHours(23, 59, 59, 999)); },
    porCliente(cliente) {
      return this.list().filter((a) => String(a.cliente).toLowerCase().includes(String(cliente).toLowerCase()));
    },
    stats() {
      const hoje = new Date().toISOString().slice(0, 10);
      const mes = hoje.slice(0, 7);
      const l = this.list();
      return {
        hoje: l.filter((a) => (a.inicio || '').slice(0, 10) === hoje).length,
        concluidos: l.filter((a) => a.status === 'concluido' && (a.inicio || '').slice(0, 7) === mes).length,
        pendentes: l.filter((a) => ['agendado', 'confirmado', 'em_andamento'].includes(a.status)).length,
      };
    },
  };

  /* ------------------------------------------------------------------ *
   * MÉTRICAS AGREGADAS (dashboards operacional e financeiro)
   * ------------------------------------------------------------------ */
  const metrics = {
    receitaAtendimentos(periodo) {
      const p = new Date(periodo).getTime();
      return atendimentos.list().filter((a) => a.status === 'concluido' && new Date(a.inicio).getTime() >= p)
        .reduce((acc, a) => acc + (a.servicoPreco || 0) + (a.itensProdutos || []).reduce((s, it) => s + (it.precoUnitario || 0) * (it.quantidade || 0), 0), 0);
    },
    custoAtendimentos(periodo) {
      const p = new Date(periodo).getTime();
      return atendimentos.list().filter((a) => a.status === 'concluido' && new Date(a.inicio).getTime() >= p)
        .reduce((acc, a) => acc + (a.servicoCusto || 0) + (a.itensProdutos || []).reduce((s, it) => s + (it.custoUnitario || 0) * (it.quantidade || 0), 0), 0);
    },
    despesasAtendimentos(periodo) {
      const p = new Date(periodo).getTime();
      return atendimentos.list().filter((a) => a.status === 'concluido' && new Date(a.inicio).getTime() >= p)
        .reduce((acc, a) => acc + (a.despesas || []).reduce((s, d) => s + (Number(d.valor) || 0), 0), 0);
    },
    lucroAtendimentos(periodo) {
      return this.receitaAtendimentos(periodo) - this.custoAtendimentos(periodo) - this.despesasAtendimentos(periodo);
    },
  };

  return {
    servicos, produtos, estoque, atendimentos, metrics,
    uid, nowISO,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { NEITZEL_OPS };
if (typeof window !== 'undefined') window.NEITZEL_OPS = NEITZEL_OPS;