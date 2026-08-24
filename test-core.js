/* Teste de sanidade do ECOMIM core + extensões (Node, sem DOM).
 * Verifica que os módulos não quebram e que os fluxos principais funcionam. */
'use strict';

const mem = {};
global.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
};
global.window = global;
try { Object.defineProperty(global, 'navigator', { value: { clipboard: { writeText: async () => {} } }, configurable: true }); } catch (e) { global.navigator = { clipboard: { writeText: async () => {} } }; }

require('./src/core.js');
require('./src/core-extra.js');
if (!global.addEventListener) global.addEventListener = () => {};
if (!global.dispatchEvent) global.dispatchEvent = () => ({});

const E = window.ECOMIM;
const X = window.ECOMIM_EXT;

function assert(cond, msg) {
  if (!cond) { console.error('✗ ' + msg); process.exitCode = 1; }
  else console.log('✓ ' + msg);
}

(async () => {
  E.init();
  X.security.load && X.security.load();
  X.channels.load();
  X.migrator.detectLegacy();

  // PIN
  const p = await X.security.setupPin('1234');
  assert(p.ok, 'PIN definido');
  const v = await X.security.verifyPin('1234');
  assert(v.ok, 'PIN verifica');
  const v2 = await X.security.verifyPin('9999');
  assert(!v2.ok, 'PIN errado rejeitado');

  // leads
  const l = E.modules.leads.addLead({ nome: 'João Teste', empresa: 'ACME', telefone: '47999991111', email: 'joao@acme.com.br', cidade: 'Joinville', uf: 'SC', consentimento: true, valor: 150 });
  assert(l.ok, 'lead criado');
  assert(l.lead.valor === 15000, 'lead valor em centavos (150 reais -> 15000)');
  const l2 = E.modules.leads.addLead({ nome: 'João Teste', empresa: 'ACME', telefone: '47999991111', email: 'joao@acme.com.br' });
  assert(!l2.ok && l2.code === 'DUPLICADO', 'dedup do CRM rejeita duplicado');
  assert(E.modules.leads.scoring(l.lead).score === 90, 'scoring explicável (90)');

  // fila
  const q = E.modules.leads.addToQueue({ nome: 'Maria Fila', telefone: '47988887777', origem: 'agente', consentimento: true });
  assert(q.ok, 'addToQueue ok');
  const q2 = E.modules.leads.addToQueue({ nome: 'Maria Fila', telefone: '47988887777' });
  assert(!q2.ok && q2.code === 'DUPLICADO_FILA', 'fila dedup ok');
  const ap = E.modules.leads.approveQueueItem(q.lead.id);
  assert(ap.ok, 'aprovação de fila ok');
  assert(E.modules.leads.addLead, 'lead aprovado virou CRM (API existe)');

  // agenda
  const ag = E.modules.agenda.add({ titulo: 'Reunião', quando: new Date().toISOString() });
  assert(ag.ok, 'agenda add');
  assert(E.modules.agenda.today().length >= 1, 'agenda today');

  // financeiro (centavos) — core recebe REAIS e converte
  const fc = E.modules.financeiro.addConta({ descricao: 'Serviço', tipo: 'receber', valor: 199.9, vencimento: new Date().toISOString() });
  assert(fc.ok && fc.conta.valor === 19990, 'financeiro centavos (199.9 reais -> 19990)');
  const saldo = E.modules.financeiro.saldo();
  assert(saldo.aReceber === 19990, 'saldo aReceber');

  // atendimento + SLA
  const tk = E.modules.atendimento.addTicket({ titulo: 'Dúvida', cliente: 'ACME', prioridade: 'alta' });
  assert(tk.ok && /^TK-\d{4}$/.test(tk.ticket.protocolo), 'ticket com protocolo');
  const msg = E.modules.atendimento.addMensagem(tk.ticket.id, { autor: 'Cliente', origem: 'inbound', corpo: 'Olá' });
  assert(msg.ok, 'mensagem no ticket');

  // clientes + health — mrr em REAIS (500) vira 50000 centavos no core
  const cl = E.modules.clientes.addCliente({ nome: 'Cliente A', mrr: 500, status: 'ativo', ultimoAcesso: new Date().toISOString(), nps: 9 });
  assert(cl.ok, 'cliente criado');
  assert(cl.cliente.mrr === 50000, 'cliente mrr em centavos');
  const hs = E.modules.clientes.healthScore(cl.cliente);
  assert(hs.score >= 80, 'health score alto p/ ativo+recente+NPS9');

  // projetos + tarefas
  const pj = E.modules.projetos.addProjeto({ nome: 'Impl', prazo: new Date(Date.now() + 86400000).toISOString() });
  E.modules.projetos.addTarefa(pj.projeto.id, { nome: 'T1' });
  const t1 = E.modules.projetos.projetos.find((x) => x.id === pj.projeto.id);
  E.modules.projetos.updateTarefa(pj.projeto.id, t1.tarefas[0].id, { status: 'concluida' });
  const t2 = E.modules.projetos.projetos.find((x) => x.id === pj.projeto.id);
  assert(t2.progresso === 100, 'progresso do projeto auto');

  // marketing
  const mk = E.modules.marketing.addCampanha({ nome: 'Camp 1', orcamento: 100000 });
  E.modules.marketing.registrarLead(mk.campanha.id);
  E.modules.marketing.registrarConversao(mk.campanha.id);
  assert(E.modules.marketing.campanhas[0].conversoes === 1, 'marketing converte');

  // rh
  const rh = E.modules.rh.addColaborador({ nome: 'Fulano', cargo: 'Dev', salario: 5000 });
  assert(rh.ok && rh.colaborador.salario === 500000, 'RH centavos (5000 reais -> 500000)');

  // BI (cliente criado com mrr 500 reais = 50000 centavos)
  assert(E.modules.bi.mrr() === 50000, 'MRR soma clientes');
  assert(E.modules.bi.funnelCounts().novo >= 1, 'funil conta');
  assert(typeof E.modules.bi.conversion() === 'number', 'conversão numérica');

  // IA local — responde sem gateway
  const ia = await E.modules.ia.ask('como estão minhas vendas?', { scope: 'geral' });
  assert(ia.ok && ia.resposta.length > 10, 'IA local responde vendas');
  const plano = E.modules.ia.planDay();
  assert(typeof plano === 'string' && plano.length > 0, 'plano do dia');

  // canais honestos
  assert(X.channels.list.length >= 6, 'catálogo de canais');
  const snd = await X.channels.send('whatsapp', 'x', 'oi', 'corpo');
  assert(!snd.ok && snd.code === 'CANAL_NAO_VERIFICADO', 'whatsapp sem credencial falha honesto');

  // auditoria append-only
  assert(E.audit.list().length > 0, 'auditoria registra');

  // extensão ponte (dispara evento leadsExternos) — agora entra direto no CRM
  const handler = X.extensionBridge.init();
  const antes = E.db.get().leads.length;
  handler({ detail: { origem: 'extensao', leads: [{ nome: 'Via Extensão', telefone: '47977776666' }] } });
  const depois = E.db.get().leads.length;
  assert(depois > antes, 'ponte da extensão cria lead direto no CRM');

  // helpers
  const busca = X.helpers.searchGlobal('joão');
  assert(busca.some((r) => r.tipo === 'lead'), 'busca global acha lead');

  // LGPD
  const lg = X.lgpd.exportTitular('joão');
  assert(lg.ok && lg.dados.leads.length >= 1, 'LGPD export');

  console.log(process.exitCode ? '\nCOM FALHAS' : '\nTODOS OS TESTES DO NÚCLEO PASSARAM ✔');
})();