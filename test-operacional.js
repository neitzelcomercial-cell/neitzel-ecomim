/* Teste funcional do motor NEITZEL_OPS (Expansão Operacional) em Node */
'use strict';

// Mock mínimo do ECOMIM core para o teste
const mockDB = { leads: [], fila: [], funil: [], config: {} };
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] !== undefined ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};
global.window = global;

const E = {
  uid: () => 'test-' + Math.random().toString(36).slice(2, 10),
  nowISO: () => new Date().toISOString(),
  fmtMoney: (c) => 'R$ ' + (c / 100).toFixed(2),
  audit: { record: () => {} },
  eventBus: { emit: () => {} },
  db: { get: () => mockDB, save: () => {} },
  modules: {
    financeiro: { addConta: () => ({ ok: true }), saldo: () => ({ aReceber: 0, recebido: 0, aPagar: 0, pago: 0, saldo: 0 }) },
    clientes: { list: () => [] },
    leads: { addToQueue: () => ({ ok: true }) },
    tarefas: { pendentes: () => [], atrasadas: () => [] },
    atendimento: { abertos: () => [], slaEmRisco: () => [] },
    projetos: { atrasados: () => [] },
    bi: { mrr: () => 0, conversion: () => 0, funnelCounts: () => ({}) },
  },
};
global.ECOMIM = E;

require('./src/operacional-core.js');
const O = global.NEITZEL_OPS;

let falhas = 0;
const check = (nome, cond) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + nome);
  if (!cond) falhas++;
};

// 1. Criar serviço
const r1 = O.servicos.add({ nome: 'Instalação', preco: 800, custo: 180, duracaoMin: 120, categoria: 'Instalação' });
check('Serviço criado', r1.ok && r1.servico.preco === 80000 && r1.servico.custo === 18000);
check('Margem do serviço (78%)', O.servicos.margem(r1.servico) === 78);

// 2. Criar produto com estoque inicial
const r2 = O.produtos.add({ nome: 'Produto A', preco: 100, custo: 40, estoqueAtual: 10, estoqueMinimo: 3, unidade: 'un' });
check('Produto criado', r2.ok && r2.produto.estoqueAtual === 10);

// 3. Movimentação de entrada (pós-correção A6: o estoque inicial do cadastro
//    agora gera sua própria movimentação "Estoque inicial"; a entrada de 5 soma por cima)
const r3 = O.estoque.registrar({ produtoId: r2.produto.id, quantidade: 5, tipo: 'entrada', motivo: 'Compra' });
check('Entrada de estoque (10 inicial + 5 = 15)', r3.ok && r3.saldo === 15);
const movInit = O.estoque.historico().some((m) => m.motivo && m.motivo.includes('Estoque inicial'));
check('Movimentação de estoque inicial registrada', movInit);

// 4. Saída além do estoque → deve falhar
const r4 = O.estoque.registrar({ produtoId: r2.produto.id, quantidade: 999, tipo: 'saida', motivo: 'x' });
check('Saída com estoque insuficiente bloqueada', !r4.ok && r4.code === 'ESTOQUE_INSUFICIENTE');

// 5. Atendimento + finalização (baixa estoque, receita, custo)
const r5 = O.atendimentos.add({
  cliente: 'João Silva', inicio: new Date().toISOString(), fim: new Date().toISOString(),
  servicoNome: 'Instalação', servicoId: r1.servico.id, servicoPreco: 800, servicoCusto: 180,
  itensProdutos: [{ produtoId: r2.produto.id, produtoNome: 'Produto A', quantidade: 2, precoUnitario: 100, custoUnitario: 40 }],
  despesas: [{ descricao: 'Gasolina', valor: 50, categoria: 'gasolina' }],
});
check('Atendimento criado', r5.ok);
const r6 = O.atendimentos.finalizar(r5.atendimento.id);
check('Atendimento finalizado (receita)', r6.ok && r6.receita === 100000); // 800 + 2*100 = 1000.00
check('Custo total registrado', r6.ok && r6.custo === 26000); // 180 + 2*40 = 260.00
const prodAtualizado = O.produtos.list().find((p) => p.id === r2.produto.id);
check('Estoque baixado (10+5-2=13)', prodAtualizado.estoqueAtual === 13);
check('Atendimento marcado concluído', O.atendimentos.list().find((a) => a.id === r5.atendimento.id).status === 'concluido');

// 6. Dupla finalização → bloqueada (idempotência)
const r7 = O.atendimentos.finalizar(r5.atendimento.id);
check('Dupla finalização bloqueada', !r7.ok && r7.code === 'JA_CONCLUIDO');

// 7. Estoque baixo detectado
const p2 = O.produtos.add({ nome: 'Produto B', preco: 50, custo: 10, estoqueAtual: 1, estoqueMinimo: 5 });
check('Alerta de estoque baixo', O.produtos.estoqueBaixo().some((p) => p.id === p2.produto.id));

// 8. Métricas
const m = O.metrics;
check('Métrica receita (ano)', m.receitaAtendimentos(new Date(2026, 0, 1)) === 100000);
check('Métrica lucro (800+200-180-80-50 = 690.00)', m.lucroAtendimentos(new Date(2026, 0, 1)) === 69000);

// 9. Persistência
const raw = localStorage.getItem('neitzel_servicos_v1');
check('Persistência (localStorage)', raw && JSON.parse(raw).length === 1);

console.log('\n' + (falhas === 0 ? 'TODOS OS TESTES PASSARAM ✔' : falhas + ' TESTE(S) FALHARAM ✘'));
process.exit(falhas === 0 ? 0 : 1);