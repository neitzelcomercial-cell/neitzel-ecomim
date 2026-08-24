# ECOMIM — FASE 3 · SISTEMA COMERCIAL
## Relatório de Etapa 0 (CMD-00) — Diagnóstico e Plano

**Data:** 2026-08-11
**Responsável:** Claude Code (agente de execução FASE 3)
**Origem do comando:** `SIST COMERCIAL 3/ECOMIM_FASE3_Especificacao_e_Comandos_Claude.md`
**Método:** inspeção do ecossistema ECOMIM (arquivos, código, docs da FASE 2); nenhum código implementado nesta etapa.

---

## 1. ESCOPO ENTREGUE

1. Percorrido o ecossistema ECOMIM e mapeada a stack real (FASE 1, 2, 3, 4, 5).
2. Identificado o que já existe do ECOMIM LEADS (FASE 1) e do ECOMIM IA (FASE 2) e os pontos de integração disponíveis.
3. Listados os conflitos com a arquitetura alvo da FASE 3 e as dependências faltantes.
4. Proposto o mapa final de pastas/módulos do ECOMIM COMERCIAL.
5. Apresentado o plano de execução das 20 etapas mapeado para o código real do projeto.

**Nada foi implementado** (conforme CMD-00).

---

## 2. ARQUIVOS CRIADOS/ALTERADOS

| Arquivo | Ação |
|---|---|
| `SIST COMERCIAL 3/RELATORIO_CMD00_DIAGNOSTICO_PLANO.md` | **criado** — este relatório (Etapa 0) |
| Nenhum código-alvo da FASE 3 | **não implementado** nesta etapa (conforme CMD-00) |

---

## 3. MIGRATIONS

Nenhuma (Etapa 0 não cria schema).

---

## 4. ENDPOINTS

Nenhum (Etapa 0 não cria API).

---

## 5. DIAGNÓSTICO — O QUE JÁ EXISTE NO ECOSSISTEMA

### 5.1 FASE 1 — ECOMIM LEADS (FASE 1/LEADS 1)

**O que é:** aplicação **single-file** `LeadsCRM claude - WIP.html` (HTML + CSS + JS, ~1.484 linhas), que roda **100% no navegador** (aberta com duplo clique ou Live Server). Dados em **localStorage** (`chave leadsCRM_agente_v2`). Persistência/backup por exportação AES manual. **Não há servidor, API, banco ou webhook.**

| Item | Realidade encontrada |
|---|---|
| Stack | HTML/JS puro, sem build, sem dependências |
| Dados | `DB` em localStorage: `config`, `funil`, `leads[]`, `fila[]`, `tarefas[]`, `vendedores[]`, `agente`, `historico[]` |
| Lead | `{ id, nome, tipo, empresa, etapa, telefone, whats, email, site, insta, face, linkedin, cidade, uf, segmento, valor, origem, desc, consentimento, created, hist[], ... }` |
| Tipos | `prospect · cliente · empresa · fornecedor · parceiro · representante · vendedor` |
| Origens | `manual · agente · google · maps · instagram · facebook · linkedin · diretorios · importacao` |
| Etapas do funil | `Novo → Contato feito → Qualificado → Proposta enviada → Negociação → Ganho → Perdido` |
| Deduplicação | chaves: nome normalizado · telefone · e-mail (`analisarLead`) |
| Coleta real | OpenStreetMap/Overpass + Nominatim (fonte pública), e extensão Chrome MV3 (`extensao/`) que injeta `crm_bridge.js` na página do app e dispara o evento `leadsExternos` |
| Autenticação | inexistente (local) |

**Consequência para a FASE 3:** o LEADS **não expõe API**. A integração da Seção 6 (webhook `lead.qualified` / `POST /api/public/integrations/leads/qualified`) não tem par hoje. Portanto:

- A FASE 3 implementará **os dois lados reais**: o endpoint assinado do Comercial (pronto e testado) e um **adapter de ingestão local** que lê os dados do LEADS (localStorage/backup/export) usando a **mesma chave natural de deduplicação** que o LEADS já usa (nome · telefone · e-mail) → cria `customer` + `opportunity`.
- `GET /v1/leads/{ref}` ficará em modo `BLOQUEADO_POR_CREDENCIAL`/`BLOQUEADO_POR_CAPACIDADE` documentado, **sem simular sucesso**.

### 5.2 FASE 2 — ECOMIM IA (IAS E AGENTES 2 → código em C:\Users\neitz\DASHBOARD)

**O que é:** projeto **TypeScript · React 19 · TanStack Start (SSR) · Vite 7 · Tailwind v4 · shadcn/ui · AI SDK (gateway OpenAI) · Vitest**. Código em `C:\Users\neitz\DASHBOARD` (fora do OneDrive, decisão registrada). Git inicializado e limpio; `.env` **não** existe (só `.env.example`). Dependências instaladas (`node_modules` presente). Banco PostgreSQL **ausente** (sem credenciais); **storage abstrato** com `InMemoryStorage` (testes) é o plano.

| Item | Realidade encontrada |
|---|---|
| Scaffold | TanStack Start + Vite 7 + Tailwind v4 + Vitest **configurados** (`vite.config.ts`, `vitest.config.ts`) |
| Código de módulos | **ainda não criado** — `src/modules/` não existe; só rotas básicas (`src/routes`) |
| Estado FASE 2 | CMD-00 concluído (docs `ARQUITETURA_ATUAL.md`, `ARQUITETURA_ECOMIM_IA.md`, `PLANO_FASE2.md`, `PROGRESSO.md`); **CMD-01 em diante pendentes** |
| Credenciais | `AI_GATEWAY_URL`/`AI_API_KEY`, `DATABASE_URL`, `SERVICE_ROLE_KEY`, `ENCRYPTION_KEY` **ausentes** → status `BLOQUEADO_POR_CREDENCIAL` (arquitetura pronta, chave falta) |
| Integração LEADS | prevista por `LeadsGateway` (interface + `LocalLeadsAdapter` + `HttpLeadsAdapter`) — implementação pendente junto com a FASE 2 |

**Consequência para a FASE 3:** a camada `ai-bridge` (Seção 5) será implementada como **contrato de tools real + HTTP** (os dois lados), mas dependerá de credencial para invocar modelo — sem credencial, responde com erro explícito e documentado (regra 3), **nunca silêncio/mock de produção**.

### 5.3 FASE 4 e 5

Documentos de spec apenas (`SIST COMUNICAÇÃO 4`, `AUTOM E ORQUEST 5`) — **sem código**. Fases futuras, fora do escopo da FASE 3.

---

## 6. PONTOS DE EXTENSÃO DISPONÍVEIS

- `src/modules/*` com `domain/` (tipos puros) + `service.server.ts` + `*.functions.ts` (RPC) + `__tests__/` (convenção herdada da FASE 2).
- `src/routes/api/*` para rotas HTTP externas/streaming/webhooks (sem Edge Functions novas).
- Storage abstrato: `PostgresStorage` (pronto, RLS) + `InMemoryStorage` (testes) enquanto não houver banco.
- `LeadsGateway` da FASE 2 (pontos de integração LEADS, quando implementado).
- Barramento de eventos com **transactional outbox** + retry/DLQ (a FASE 3 possui spec própria; a FASE 2 também previu eventos).

---

## 7. CONFLITOS E DEPENDÊNCIAS (Seção 2 da Seção 1 / inventário)

| Item | Tipo | Detalhe |
|---|---|---|
| PostgreSQL | **dependência** | sem credenciais → migrations versionadas + storage abstrato; RLS exercitada quando `DATABASE_URL` existir |
| IA (ai-bridge) | **dependência** | sem `AI_GATEWAY_URL`/`AI_API_KEY` → tools HTTP reais, mas resposta final com erro explícito documentado quando credencial faltar |
| Integração LEADS (Seção 6) | **integração futura** | LEADS é single-file/localStorage sem API → adapter de ingestão com dedupe por chave natural (nome/telefone/e-mail) + endpoint assinado pronto; `GET /v1/leads/{ref}` em `BLOQUEADO_POR_CREDENCIAL/CAPACIDADE` documentado |
| Gateway de pagamento (Seção 2.8/CMD-10) | **dependência** | `PAYMENT_PROVIDER`/`PAYMENT_API_KEY` ausentes → interface `PaymentProvider` real (authorize/capture/refund), sem provider configurado **falha explícita**, nunca simula aprovação |
| E-mail/notificações | **dependência** | `MAIL_PROVIDER` ausente → notificações in-app reais; envio externo com falha documentada |
| OneDrive | **risco operacional** | código do Comercial fora do OneDrive (em `C:\Users\neitz\DASHBOARD\comercial`), mantendo o padrão da FASE 2; specs da FASE 3 permanecem em `SIST COMERCIAL 3` |
| Dinheiro/estoque sem banco | **condicionante** | transações e locks (`SELECT ... FOR UPDATE`, idempotência, `outbox`) implementados por abstração de repositório; comportamento transacional testado em memória enquanto não há Postgres |

**Nenhum conflito de código encontrado**: não há código comercial existente (greenfield para a FASE 3).

---

## 8. ARQUITETURA FINAL PROPOSTA — ECOMIM COMERCIAL

### 8.1 Localização

```
C:\Users\neitz\DASHBOARD\comercial\     ← código do FASE 3 (fora do OneDrive)
```

Reaproveita a stack/linguagem da FASE 2 (mesmo monorepo de ferramentas, React/TanStack/Vitest) e integra por API/eventos. Alternativa de reposicionamento registrada: pasta própria do projeto, guardando as mesmas regras. **Decisão tomada:** submódulo dentro de `DASHBOARD` (mesma raiz de código da FASE 2) para reaproveitar tooling e testes.

> **Nota de reversibilidade:** se o usuário preferir um projeto separado, a FASE 3 os moverá com baixo custo (módulos autocontidos, sem acoplamento).

### 8.2 Camadas e módulos (bounded contexts da Seção 1.2)

```
comercial/src/modules/
├── platform/        outbox, filas, retry/DLQ, idempotency_keys, settings, activity_logs, audit base
├── identity/        users, teams, roles, permissions, user_roles, user_limits (RBAC + escopos)
├── crm/             companies, customers (PF/PJ), contacts, addresses, customer_events (timeline)
├── catalog/         categories, products, variants, relations, bundles, suppliers
├── pricing/         price_tables, prices, discount_rules, motor de resolução (Seção 2.3 + CMD-05)
├── inventory/       warehouses, inventory, inventory_movements, counts (locks + idempotência)
├── pipeline/        pipelines, stages, opportunities, opportunity_items, stage_history, scoring
├── quoting/         proposals, proposal_items, revisions, aprovação, link público, expiração
├── ordering/        orders, order_items, order_events, shipments
├── billing/         payments, payment_transactions, webhook_events, gateway (authorize/capture/refund)
├── incentives/      commission_rules, commissions, targets, campaigns, campaign_members
├── aftersales/      cases, surveys, repurchase_predictions, recomendações (cross/up-sell)
├── insights/        dashboard, funil, reports, sales_events (agregados materializados)
├── ai-bridge/       tools de leitura/escrita (Seção 5), assistente comercial, sources
├── imports/         validação/commit em 2 fases, exports assíncronos, search global
└── web/             telas (Seção 8: Dashboard · Clientes · ... · Configurações)
```

### 8.3 Semânticas críticas vindas da spec (aplicadas em todo o código)

- Dinheiro: **inteiro em centavos** + moeda ISO-4217; quantidade `NUMERIC`, percentual `NUMERIC`; half-up só na apresentação.
- IDs UUID v7 ordenáveis; números de documento por **sequência por tenant/ano**.
- Datas `TIMESTAMPTZ` UTC; fuso de exibição por preferência.
- **Máquina de estados explícita** por entidade (transições declaradas; inválida → 422, nunca gravação silenciosa).
- Totais sempre recalculados **no servidor**.
- Toda escrita multi-tabela em **transação**; estoque com lock de linha; `idempotency_key` obrigatória para dinheiro/estoque; `outbox` transactional.
- Snapshots de item (nome/SKU/preço) para nunca reescrever histórico.
- Multi-tenant por `tenant_id` + RLS (nível banco + aplicação).
- Erros: `AppError { code, httpStatus, retryable, publicMessage, cause }`, sem nada engolido.

### 8.4 Padrão de integração com LEADS e IA (sem acoplamento direto)

- Comercial ↔ LEADS: webhook assinado + adapter de ingestão por chave natural; nunca cópia do histórico (referência por `lead_ref`).
- Comercial ↔ IA: tools com filtro de tenant/escopo e auditoria `actor.type=ai`; IA nunca confirma pedido, aprova desconto/proposta, move estoque, registra pagamento ou exclui.

---

## 9. PLANO DE EXECUÇÃO DAS 20 ETAPAS (mapeado para o código real)

Cada etapa respeita o **Protocolo de Encerramento** (build + typecheck + lint → testes → evidência → docs → `docs/PROGRESSO.md`) antes de avançar. Banco ausente → storage abstrato com `InMemoryStorage` (testes) + migrations versionadas; credenciais → status `BLOQUEADO_POR_CREDENCIAL`.

| # | Etapa | Entrega principal (arq. comercial) | Depende de |
|---|---|---|---|
| CMD-00 | Diagnóstico e plano | **Este relatório** — stack, inventário, conflitos, arquitetura, plano 20 etapas | — |
| CMD-01 | Fundação e arquitetura | esqueleto `src/modules/*` (16 contexts), `Money`/`Quantity`/erros de domínio, middleware de tenant/auth/perm/rate limit, helper de transação + optimistic lock + idempotência, outbox+worker+retry/DLQ, logger, config que falha, setup de testes | — |
| CMD-02 | Banco de dados | todas as migrations da Seção 2 (identity/crm/catálogo/preços/estoque/pipeline/propostas/pedidos/pagamentos/incentivos/pós-venda/plataforma) com RLS+políticas, sequências por tenant/ano, seed (tenant demo, papéis, permissões, pipeline padrão, preço padrão, armazém padrão), testes de schema | CMD-01 |
| CMD-03 | Identidade/equipes/permissões | catálogo `module.action`, escopos own/team/tenant (RLS+app), limites (desconto/valor), CRUD + telas admin, matriz papel×ação×escopo + cross-tenant negativo | CMD-02 |
| CMD-04 | CRM | companies/customers/contacts/addresses/events, dedupe por CPF/CNPJ/e-mail/telefone, merge com revisão humana, métricas (LTV, ticket, frequência, intervalo), perfil com abas+timeline, busca, API | CMD-03 |
| CMD-05 | Catálogo e preços | categorias em árvore, produtos/variações/relações/kits/fornecedores, price_tables com faixas e vigência, **motor de preço determinístico**, **motor de descontos + alçadas**, `POST /v1/pricing/quote` (preço+desconto+motivo), testes exaustivos | CMD-04 |
| CMD-06 | Estoque | warehouses, inventory, movements, reserva/liberação/transferência/ajuste, inventário cíclico, alerta low_stock, lock de linha, idempotência, **teste de corrida** (duas reservas do último item) | CMD-05 |
| CMD-07 | Pipeline/scoring | pipelines/etapas (posição, probabilidade, SLA), oportunidades/itens, kanban drag-and-drop otimista, ganho/perda, **scoring configurável por tabela** (pesos, faixas), recálculo por evento+job, paradas, tempos por etapa | CMD-06 |
| CMD-08 | Propostas/aprovação | numeração tenant/ano, itens com preço do motor, descontos/alçada, frete/imposto, validade, máquina de estados, revisões imutáveis pós-envio, fluxo de aprovação, link público com token (+viewed/decided), job de expiração, eventos D-3 e expired | CMD-07 |
| CMD-09 | Pedidos/conversão | snapshots, totais servidor, máquina de estados, order_events, shipments; **`convert-to-order` conforme Seção 4.1** (transação única, estoque, pagamento, marcação, eventos, UNIQUE anti-duplicidade), cancelamento libera, envio baixa | CMD-08 |
| CMD-10 | Pagamentos | métodos/parcelas/saldo, estado do pedido `partially_paid`, `payment_transactions` UNIQUE provider_event_id, **interface PaymentProvider** real (authorize/capture/refund) com falha explícita sem credencial, webhook HMAC timing-safe+dedup, estorno reverte comissão | CMD-09 |
| CMD-11 | Comissões/metas | commission_rules (escopo/tipo/base/prioridade/vigência), provisionar em `order.paid`, aprovar/lote, reversão (registro, nunca DELETE), UNIQUE; targets por usuário/equipe/métrica/período, progresso por evento, `target.reached` | CMD-10 |
| CMD-12 | Pós-venda/recompra/cross/up-sell | cases em `order.delivered`, tarefas/lembretes, NPS/CSAT, **previsão de recompra** (≥2 compras, confiança, D-7, sem base → sem previsão), **cross-sell por co-ocorrência + lift**, **up-sell por faixa na mesma categoria**, recomendação com motivo+fonte | CMD-11 |
| CMD-13 | Campanhas | público por segmentação (clientes/leads/inativos/compradores/produto/período), oferta/período/canal/responsável/orçamento/resultado, preview de audiência, campanha→oportunidade/pedido (ROI), estados draft/running/paused/finished | CMD-12 |
| CMD-14 | Dashboard/funil/relatórios | KPIs (faturamento/vendas/conversão/ticket/margem/novos/recompra/pipeline/metas/equipe), períodos + comparação, funil LEADS→RECOMPRA (qtd/valor/conversão/perda/tempo), relatórios com filtros/agrupamento/exportação CSV-XLSX assíncrona, `sales_events` materializados, alvos da Seção 9 medidos | CMD-13 |
| CMD-15 | IA Comercial (ai-bridge) | tools de leitura/escrita da Seção 5 com tenant/escopo/volume/auditoria, assistente com contrato JSON + `sources`, "não há informação suficiente" quando for o caso, **teste de proibição** (IA não confirma/aprova/move/paga/exclui) | CMD-14 |
| CMD-16 | Automações/notificações | `automation_rules` (evento→condição→ação) cobrindo novo cliente→tarefa, proposta expirando→alerta, oportunidade parada→análise IA, pago→processar, entregue→pós-venda, recompra próxima→oportunidade; idempotente por `event_id`, log, limite de disparo, proteção de loop; notificações com preferências | CMD-15 |
| CMD-17 | Integrações LEADS/import/export/busca | webhook assinado + consumo, dedupe, cliente+oportunidade, `lead_ref` sem cópia, merge_candidates; import 2 fases (validate→commit, zero gravação parcial); busca global com ranking/atalho; painel de integrações | CMD-16 |
| CMD-18 | Segurança/auditoria/logs | auditoria completa da Seção 7, `audit_logs` append-only, painel de logs/auditoria com filtros, testes de segurança (cross-tenant, escalonamento), lista de vulnerabilidades encontradas/corrigidas | CMD-17 |
| CMD-19 | Testes/perf/responsividade | cobertura ≥80% domain/application e 100% financeiro+estoque, E2E LEAD→…→RECOMPRA, dataset sintético (50k pedidos/20k clientes/5k produtos) medindo Seção 9, revisão em 360/768/1024/1440 | CMD-18 |
| CMD-20 | Documentação/auditoria final | docs completas (arquitetura, dados, API, instalação, configuração, permissões, integrações, módulos, testes, troubleshooting), auditoria da Seção 56 (item · OK/PARCIAL/PENDENTE · evidência), dependências externas não resolvidas | CMD-19 |

---

## 10. RISCOS E DECISÕES TOMADAS

| Decisão/Risco | Detalhe | Justificativa |
|---|---|---|
| Código em `C:\Users\neitz\DASHBOARD\comercial` | fora do OneDrive, mesmo tooling da FASE 2 | sync do OneDrive pode corromper builds; reaproveita stack/testes |
| Postgres adiado por credencial | migrations versionadas + storage abstrato; RLS exercitada quando houver banco | cumpre regra 3/5 sem bloquear etapas |
| IA sem credencial | tools HTTP reais + erro explícito documentado quando credencial faltar | cumpre "jamais simular sucesso de integração" |
| LEADS sem API | adapter de ingestão por chave natural + endpoint assinado pronto; referência `lead_ref` | permite CMD-17/homologar sem servidor do LEADS |
| Gateway de pagamento | interface real + falha explícita sem credencial | cumpre regra 3 e 6 (zero cartão, só token) |
| E-mail | notificações in-app reais; envio externo documentado como dependência | não bloqueia as etapas de notificação |

---

## 11. DEPENDÊNCIAS EXTERNAS NÃO RESOLVIDAS

| Dependência | O que falta | Status |
|---|---|---|
| PostgreSQL `DATABASE_URL` | credencial de banco gerenciado (Supabase/Lovable) ou Postgres local | `BLOQUEADO_POR_CREDENCIAL` |
| IA `AI_GATEWAY_URL`/`AI_API_KEY` | chave do gateway (para assistente comercial responder) | `BLOQUEADO_POR_CREDENCIAL` |
| `SERVICE_ROLE_KEY`/`ENCRYPTION_KEY` | segredos de segurança (auth/RBAC + criptografia) | `BLOQUEADO_POR_CREDENCIAL` |
| ECOMIM LEADS com API | FASE 1 continua single-file/localStorage; webhook `lead.qualified` inexistente hoje | `BLOQUEADO_POR_CAPACIDADE` |
| Gateway de pagamento `PAYMENT_PROVIDER` | credencial do provedor escolhido | `BLOQUEADO_POR_CREDENCIAL` |
| `MAIL_PROVIDER` | credencial de e-mail | `BLOQUEADO_POR_CREDENCIAL` |

---

## 12. PRONTO PARA A PRÓXIMA ETAPA?

**SIM** — a Etapa 0 está concluída e o plano está mapeado para o código real. A próxima etapa é o **CMD-01 (Fundação e arquitetura)**, ou, se preferir, executar primeiro o **scaffold (S0)** do módulo Comercial para garantir build verde antes do CMD-01.
