# FASE 1 — AUDITORIA TÉCNICA + FASE 2 — ARQUITETURA
## Novo Portal do Cliente e Agendamento (Prompt Mestre XX)
Data: 2026-08-23

---

## 1. AUDITORIA DO PROJETO ATUAL

### 1.1 Arquitetura geral
- Frontend: SPA vanilla JS sem framework/build (`SISTEMA NEITZEL.html` + ~20 módulos em `src/`).
- Backend: `server.js` — servidor Node http APENAS ESTÁTICO (porta 8080), sem rotas de API, sem dependências externas.
- Banco de dados: NÃO EXISTE. Persistência 100% no localStorage do navegador:
  - `core.js`: objeto `db` único (`ecomim_*`) com leads, funil, tarefas, clientes (`ecomim_clientes`), financeiro, projetos + `eventBus` + `audit`.
  - `operacional-core.js` (`NEITZEL_OPS`): `neitzel_servicos_v1`, `neitzel_produtos_v1`, `neitzel_estoque_mov_v1`, `neitzel_atendimentos_v1`.
- ORM: inexistente. Autenticação: apenas client-side. APIs: inexistentes.

### 1.2 Entidades existentes (reais)
Atendimento (= evento do Planner) — `neitzel_atendimentos_v1`:
{ id, cliente, clienteId?, telefone, inicio ISO, fim ISO, servicoNome, servicoId?, servicoPreco(centavos), servicoCusto, responsavel, endereco, observacoes, status[agendado|confirmado|em_andamento|concluido|cancelado|nao_compareceu], itensProdutos[], despesas[], pagamentos[], criadoEm }

Serviço — `neitzel_servicos_v1`:
{ id, nome, descricao, categoria, preco(centavos), custo, duracaoMin, status[ativo|inativo], criadoEm }

Produto — `neitzel_produtos_v1`: catálogo com estoque transacional.
Cliente — `ecomim_clientes`: { id, nome, empresa, cnpj, email, telefone, whats, status, historico[] }.

### 1.3 Como o Planner funciona
View `planner` → `NEITZEL_OPS_UI.renderPlanner` → lê/escreve `neitzel_atendimentos_v1`. Não há engine de conflitos — horários manuais são livres. Eventos: `atendimento.created/updated/deleted`; sync entre abas via evento storage.

### 1.4 Portal antigo (REMOVIDO nesta sessão)
Era um sistema paralelo em localStorage com agenda própria — exatamente o que o Prompt Mestre proíbe. Excluído integralmente: `portal.html`, `portal_barba_negra.html`, `portal-core.js`, `portal-ui.js`, `portal-cliente.js`, `sync-portal.js`, `_portal_pdf_text.txt`, rota `/portal` do server, menu/view/case no app.js, KPIs e limpeza de auditoria na memoria.js, hooks de anomalia no diagnostico.js. Sintaxe validada com node --check.

### 1.5 O que pode ser reutilizado
- Catálogos reais de Serviços/Produtos e cadastro de Clientes (sincronizados ao backend).
- Padrão visual da SPA e schema de Atendimento (compatibilidade com o Planner).
- eventBus/audit para eventos de CRM/marketing.

### 1.6 O que precisa ser criado
Backend real persistente; engine de disponibilidade; reserva atômica; holds temporários; idempotência; SSE tempo real; painel admin da agenda; portal público novo.

### 1.7 Riscos e conflitos
1. Catálogo vive no navegador (localStorage): backend não lê localStorage → sincronização explícita admin→backend.
2. Planner atual grava direto no localStorage: agendamentos do portal chegam via bridge (pull do backend) para não reescrever o Planner inteiro.
3. Timezone: datas guardadas como data wall-clock (YYYY-MM-DD + minutos do dia) + IANA TZ na config; nenhuma conversão UTC implícita.
4. Sem git ativo na pasta (histórico perdido na migração ECOMIM_2→ECOMIM); backup .bak legados existem.

---

## 2. ARQUITETURA DO NOVO PORTAL (FASE 2)

### 2.1 Princípio
UMA ÚNICA FONTE DE VERDADE: o backend Node (`server.js`) passa a ser a autoridade da agenda do portal. Nada de agenda paralela no navegador.

### 2.2 Persistência (banco)
`data/neitzel-db.json` — arquivo único, escrito atomicamente (tmp + rename). Coleções:
- config (empresa, timezone, slotMin, antecedência mínima, política de cancelamento, hold TTL, portal ativo, identidade visual)
- schedule (regra semanal: 7 dias × múltiplos períodos {start,end} em minutos)
- specialHours (exceções por data), blockedDates, blockedTimes
- services, products, professionals (estrutura futura-ready), customers
- appointments, holds, idempotency, auditLog

### 2.3 Concorrência (REGRA CRÍTICA)
Todas as mutações passam por uma fila transacional (async mutex) no processo do servidor + revalidação completa dentro da transação:
1. valida serviço/profissional/duração/intervalo
2. valida dia/horário de funcionamento (regra semanal → exceção → bloqueios)
3. valida conflito contra appointments ativos e holds vivos (overlap de intervalo)
4. grava; se qualquer passo falha, nada é gravado.
Servidor single-process ⇒ mutex serializa 100% das escritas ⇒ impossível dupla reserva. IdempotencyKey impede duplo clique.

### 2.4 Status
appointment: confirmed | cancelled | completed | no_show (+ origem PORTAL_CLIENTE|SISTEMA)
hold: active | expired | converted | released
Transições válidas validadas no backend.

### 2.5 APIs
Público:
- GET  /api/public/config
- GET  /api/public/availability?serviceId&date
- POST /api/public/holds            {serviceId,date,time}
- DELETE /api/public/holds/:id
- POST /api/public/appointments     {holdId?, customer, productIds[], notes, idempotencyKey}
- GET  /api/public/appointments/:id
- POST /api/public/appointments/:id/cancel
Admin (Bearer token via env NEITZEL_ADMIN_TOKEN):
- GET/PUT /api/admin/config ; CRUD bloqueios/exceções ; GET appointments ; PATCH status ; POST sync-catalog ; GET audit
Tempo real:
- GET /api/events (SSE) — portal e painel reagem a mudanças na hora.
Segurança: token admin em env, rate-limit simples por IP nos endpoints públicos, validação/normalização de toda entrada, preço/duração SEMPRE do banco (nunca do frontend), CORS restrito ao mesmo origin.

### 2.6 Integrações
- Planner: bridge `src/ponte-portal.js` — SSE/poll puxa agendamentos confirmados e injeta em `neitzel_atendimentos_v1` com origem PORTAL_CLIENTE; cancelamentos refletem.
- Clientes: backend identifica cliente por telefone; novos clientes são criados no backend e a bridge replica para `ecomim_clientes`.
- Financeiro/CRM: eventos estruturados (CLIENTE_AGENDOU/CANCELOU/REAGENDOU) já emitidos pelo backend e registrados no auditLog; valor associado ao agendamento. Pagamento NÃO é marcado por agendamento.

### 2.7 Fases seguintes
FASE 3 backend+banco → FASE 4 painel admin (view Portal do Cliente) → FASE 5 disponibilidade → FASE 6 reserva/concorrência → FASE 7 portal público (`/agendamento`) → FASE 8/9 integrações → FASE 12 testes automatizados (incl. cenários de concorrência do prompt).

