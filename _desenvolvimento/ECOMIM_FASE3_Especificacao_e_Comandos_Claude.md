# ECOMIM — FASE 3 · SISTEMA COMERCIAL
## Especificação Técnica Executável + Comandos Sequenciais para o Claude

> **Como usar este arquivo:** cole a SEÇÃO 0 (Contexto Permanente) uma única vez no início da sessão do Claude.
> Depois execute **um comando por vez** (CMD-00 → CMD-20), sempre exigindo o *Relatório de Etapa* (Seção 12) antes de avançar.
> Nunca peça dois comandos na mesma mensagem. Nunca aceite "concluído" sem o relatório e os testes.

---

# SEÇÃO 0 — CONTEXTO PERMANENTE (colar 1x no início)

```
Você é o arquiteto e desenvolvedor principal da FASE 3 do projeto ECOMIM: o ECOMIM COMERCIAL.

CONTEXTO DO ECOSSISTEMA
- FASE 1 — ECOMIM LEADS: captura, organização, qualificação e gestão de leads.
- FASE 2 — ECOMIM IA: agentes, memória, ferramentas (tools), automações e orquestração.
- FASE 3 — ECOMIM COMERCIAL (esta fase): transforma leads e oportunidades em clientes,
  propostas, pedidos, vendas, pagamentos, pós-venda e recompra.
- Fases futuras: COMUNICAÇÃO, AUTOMAÇÕES, ANALYTICS, INTEGRAÇÕES, CENTRAL.

REGRAS INVIOLÁVEIS
1. Nada de protótipo visual. Toda tela deve estar ligada a lógica real, banco real e API real.
2. Nenhum botão sem função. Nenhum dado fictício apresentado como real.
   Dados de demonstração, quando existirem, são criados por SEED explícito e rotulados como seed.
3. Integrações externas: criar arquitetura real, configuração por ambiente, tratamento de erros
   e documentação da dependência. NUNCA inventar endpoints, NUNCA simular sucesso de integração.
   Se a credencial não existe, o módulo deve falhar de forma explícita e documentada.
4. Módulo independente: o Comercial funciona sozinho. Integra com LEADS e IA apenas por
   API, serviços, eventos, webhooks, filas e contratos de dados versionados.
5. Dinheiro e estoque são sagrados: toda operação financeira ou de estoque roda dentro de
   transação de banco, é idempotente e gera registro de auditoria imutável.
6. Nenhum dado sensível de cartão é armazenado. Somente tokens/identificadores do gateway.
7. Multi-tenant desde o primeiro dia: toda tabela de negócio carrega tenant_id (ou org_id) e
   todo acesso é filtrado por ele no nível do banco (RLS) e no nível da aplicação.
8. Não reescrever o que já funciona. Não duplicar código. Não marcar tarefa como concluída sem teste.

VALORES MONETÁRIOS
- Armazenar em inteiro (centavos) + código de moeda ISO-4217. Nunca float.
- Quantidades: NUMERIC(18,4). Percentuais: NUMERIC(7,4).
- Arredondamento: half-up, aplicado somente na apresentação e no fechamento de totais.

IDENTIDADE E TEMPO
- IDs: UUID v7 (ordenável). Números de documento (proposta/pedido) por sequência por tenant e ano.
- Datas: TIMESTAMPTZ em UTC. Fuso de exibição é preferência do usuário/tenant.

MÁQUINA DE ESTADOS
- Todo status é uma máquina de estados explícita, com transições permitidas declaradas em código.
- Transição inválida => erro de domínio 422, nunca gravação silenciosa.

PROTOCOLO DE TRABALHO
- Antes de programar: leia o projeto existente e responda o que já existe. Não pergunte o que
  pode ser descoberto lendo o código.
- Trabalhe uma ETAPA por vez. Ao final de cada etapa entregue o Relatório de Etapa
  (formato na Seção 12 do documento de comandos): o que foi feito, arquivos alterados,
  migrations, endpoints, testes executados com saída, pendências, riscos.
- Nunca avance de etapa com teste vermelho.
```

---

# SEÇÃO 1 — ARQUITETURA ALVO

## 1.1 Camadas

```
┌──────────────────────────────────────────────────────────┐
│ UI (web responsiva)  — telas, listas, formulários, kanban │
├──────────────────────────────────────────────────────────┤
│ API / RPC            — contratos versionados /v1          │
├──────────────────────────────────────────────────────────┤
│ APPLICATION          — casos de uso, transações, permissão│
├──────────────────────────────────────────────────────────┤
│ DOMAIN               — entidades, máquinas de estado,     │
│                        regras de preço/desconto/estoque   │
├──────────────────────────────────────────────────────────┤
│ INFRA                — banco, filas, gateways, e-mail,    │
│                        storage, provedores externos       │
└──────────────────────────────────────────────────────────┘
        ▲                    ▲                    ▲
   ECOMIM LEADS        ECOMIM IA            Integrações
   (eventos/API)   (tools com escopo)   (gateway, ERP, fiscal)
```

## 1.2 Módulos (bounded contexts)

| Módulo | Responsabilidade | Publica eventos |
|---|---|---|
| `identity` | usuários, equipes, papéis, permissões | `user.*`, `team.*` |
| `crm` | clientes, empresas, contatos, timeline | `customer.*` |
| `catalog` | produtos, categorias, tabelas de preço, descontos | `product.*`, `price.*` |
| `inventory` | saldos, movimentações, reservas, inventário | `inventory.*` |
| `pipeline` | pipelines, etapas, oportunidades, scoring | `opportunity.*` |
| `quoting` | propostas, itens, aprovação, envio | `proposal.*` |
| `ordering` | pedidos, itens, conversão, fulfillment | `order.*` |
| `billing` | pagamentos, parcelas, transações, estornos | `payment.*` |
| `incentives` | comissões, metas, campanhas | `commission.*`, `target.*` |
| `aftersales` | pós-venda, pesquisas, recompra, cross/up-sell | `aftersales.*` |
| `insights` | dashboard, funil, relatórios, exportações | — |
| `ai-bridge` | camada de leitura/ação exposta à ECOMIM IA | `ai.action.*` |
| `platform` | eventos, filas, notificações, auditoria, logs, settings | `*` |

## 1.3 Barramento de eventos

- Tabela `outbox` (transactional outbox) gravada na mesma transação do caso de uso.
- Worker publica para a fila (`events`), com retry exponencial e DLQ.
- Consumidores idempotentes por `event_id`.
- Envelope:

```json
{
  "event_id": "uuid",
  "tenant_id": "uuid",
  "type": "order.paid",
  "version": 1,
  "occurred_at": "2026-08-10T03:00:00Z",
  "actor": {"type":"user|system|ai","id":"uuid"},
  "subject": {"entity":"order","id":"uuid"},
  "data": {},
  "correlation_id": "uuid",
  "causation_id": "uuid"
}
```

Eventos mínimos da fase: `customer.created`, `opportunity.created`, `opportunity.stage_changed`,
`opportunity.stalled`, `proposal.sent`, `proposal.accepted`, `proposal.expiring`, `proposal.expired`,
`order.created`, `order.confirmed`, `order.paid`, `order.shipped`, `order.delivered`, `order.canceled`,
`payment.received`, `payment.failed`, `payment.refunded`, `inventory.low_stock`,
`commission.accrued`, `target.reached`, `aftersales.opened`, `repurchase.predicted`.

---

# SEÇÃO 2 — MODELO DE DADOS

> Convenções comuns a todas as tabelas de negócio:
> `id UUID PK`, `tenant_id UUID NOT NULL`, `created_at`, `updated_at`, `created_by`, `updated_by`,
> `deleted_at` (soft delete onde fizer sentido), `version INT` (optimistic locking).
> Índice obrigatório: `(tenant_id, ...)` como prefixo em todo índice de busca.

## 2.1 Identidade e acesso
| Tabela | Campos-chave |
|---|---|
| `users` | email (uniq por tenant), name, phone, status, last_login_at |
| `teams` | name, parent_team_id, manager_user_id |
| `team_members` | team_id, user_id, role_in_team |
| `roles` | code, name, is_system |
| `permissions` | code (`module.action`), description |
| `role_permissions` | role_id, permission_id |
| `user_roles` | user_id, role_id, scope (`tenant`/`team`/`own`) |
| `user_limits` | user_id, max_discount_pct, max_order_value_cents, can_approve_proposal |

> Papéis nunca ficam na tabela de usuários — sempre em `user_roles` (evita escalonamento de privilégio).

## 2.2 CRM
| Tabela | Campos-chave |
|---|---|
| `companies` | legal_name, trade_name, tax_id (CNPJ, uniq/tenant), segment, size, website, status, owner_user_id |
| `customers` | type (`person`/`company`), name, tax_id (CPF/CNPJ), company_id, email, phone, whatsapp, origin, status, owner_user_id, tags[], notes, first_purchase_at, last_purchase_at, lifetime_value_cents, avg_ticket_cents, purchase_count, avg_interval_days, lead_ref (id externo do ECOMIM LEADS) |
| `contacts` | customer_id/company_id, name, role, email, phone, whatsapp, is_primary |
| `addresses` | owner_type, owner_id, kind (`billing`/`shipping`), street, number, complement, district, city, state, country, zip, is_default |
| `customer_events` | customer_id, type, title, payload jsonb, actor, occurred_at (alimenta a timeline) |

## 2.3 Catálogo e preços
| Tabela | Campos-chave |
|---|---|
| `categories` | name, slug, parent_id, position, is_active |
| `products` | sku (uniq/tenant), code, name, description, category_id, unit, status, cost_cents, base_price_cents, weight_g, length_mm, width_mm, height_mm, supplier_id, track_inventory bool, min_stock |
| `product_variants` | product_id, sku, attributes jsonb, price_delta_cents |
| `product_relations` | product_id, related_product_id, kind (`cross_sell`/`up_sell`/`accessory`) |
| `product_bundles` / `bundle_items` | kit/combo, product_id, quantity |
| `suppliers` | name, tax_id, contact |
| `price_tables` | name, kind (`retail`/`wholesale`/`reseller`/`special`/`promo`), currency, valid_from, valid_to, is_active, priority |
| `prices` | price_table_id, product_id/variant_id, min_quantity, price_cents |
| `discount_rules` | scope (`product`/`order`/`quantity`/`customer`/`price_table`/`promo`), type (`percent`/`amount`), value, conditions jsonb, max_uses, valid_from/to, is_active, priority, stackable bool |

**Resolução de preço (ordem determinística):**
1. tabela de preço do cliente (se houver) → 2. tabela por segmento/campanha ativa → 3. tabela padrão → 4. `products.base_price_cents`.
Dentro da tabela, escolhe a faixa `min_quantity` mais alta ≤ quantidade. Empate resolve por `priority` desc, depois `valid_from` desc.
**Descontos:** aplicados após o preço-base, respeitando `stackable`; o total de desconto não pode exceder o limite do usuário (`user_limits.max_discount_pct`) sem aprovação.

## 2.4 Estoque
| Tabela | Campos-chave |
|---|---|
| `warehouses` | name, code, is_default |
| `inventory` | product_id, variant_id, warehouse_id, on_hand, reserved, available (gerada: on_hand − reserved), min_stock — UNIQUE(tenant, product, variant, warehouse) |
| `inventory_movements` | product_id, warehouse_id, type (`in`/`out`/`adjust`/`reserve`/`release`/`transfer`/`count`), quantity, unit_cost_cents, reason, reference_type, reference_id, user_id, occurred_at, idempotency_key (uniq) |
| `inventory_counts` / `inventory_count_items` | inventário cíclico com expected/counted/diff |

Regras: saldo alterado **somente** por movimento; `on_hand`/`reserved` atualizados com `SELECT ... FOR UPDATE`
na linha de `inventory`; `available < 0` proibido salvo `allow_negative` no `settings`; toda movimentação exige `idempotency_key`.

## 2.5 Pipeline e oportunidades
| Tabela | Campos-chave |
|---|---|
| `pipelines` | name, kind, is_default, is_active |
| `pipeline_stages` | pipeline_id, name, position, probability_pct, is_won, is_lost, sla_days, entry_rules jsonb |
| `opportunities` | code, customer_id, company_id, pipeline_id, stage_id, title, amount_cents, currency, probability_pct, score, owner_user_id, source, expected_close_date, closed_at, outcome (`won`/`lost`/null), lost_reason, next_action_at, last_interaction_at, notes |
| `opportunity_items` | opportunity_id, product_id, quantity, unit_price_cents |
| `opportunity_stage_history` | opportunity_id, from_stage, to_stage, user_id, duration_seconds, changed_at |
| `scoring_models` / `scoring_factors` | model ativo por pipeline; fator (code, weight, expression), faixa de saída |

**Score (0–100), configurável:** soma ponderada normalizada dos fatores
`interest`, `interaction_recency`, `amount`, `profile_fit`, `purchase_history`, `urgency`, `frequency`, `behavior`.
Faixas: 0–30 baixo · 31–60 médio · 61–80 alto · 81–100 muito alto.
O modelo é dado (tabela), não código: alterar pesos não exige deploy. Recalculado por evento e por job diário.

## 2.6 Propostas
| Tabela | Campos-chave |
|---|---|
| `proposals` | number (seq/tenant/ano), customer_id, opportunity_id, owner_user_id, status, currency, price_table_id, subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents, valid_until, terms, notes, sent_at, viewed_at, decided_at, approval_status, approved_by, public_token |
| `proposal_items` | proposal_id, product_id, variant_id, description, quantity, unit_price_cents, discount_pct, discount_cents, tax_cents, total_cents, position |
| `proposal_revisions` | proposal_id, revision_no, snapshot jsonb, author, reason |

Status: `draft → review → approved → sent → viewed → negotiation → accepted | rejected | expired | canceled`.
`expired` é aplicado por job quando `valid_until < now()` e status ∈ {sent, viewed, negotiation}.
Toda alteração em proposta enviada cria nova revisão (snapshot imutável).

## 2.7 Pedidos
| Tabela | Campos-chave |
|---|---|
| `orders` | number, customer_id, proposal_id, opportunity_id, owner_user_id, status, payment_status, fulfillment_status, currency, billing_address jsonb, shipping_address jsonb, subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents, paid_cents, balance_cents (gerada), source, notes, confirmed_at, canceled_at, cancel_reason |
| `order_items` | order_id, product_id, variant_id, sku_snapshot, name_snapshot, quantity, unit_price_cents, discount_cents, tax_cents, total_cents, reserved bool, fulfilled_quantity |
| `order_events` | order_id, type, from_status, to_status, actor, payload, occurred_at |
| `shipments` / `shipment_items` | carrier, tracking_code, status, shipped_at, delivered_at |

Status: `draft → confirmed → payment_pending → paid → processing → shipped → delivered → completed`, com `canceled` a partir de qualquer estado anterior a `shipped` (após, exige fluxo de devolução).
Itens guardam **snapshot** de nome/SKU/preço: alterar o catálogo depois nunca reescreve histórico.

## 2.8 Pagamentos
| Tabela | Campos-chave |
|---|---|
| `payments` | order_id, customer_id, amount_cents, method (`pix`/`boleto`/`card`/`transfer`/`cash`/`other`), status, due_date, installment_no, installments_total, external_id, provider, paid_at, metadata jsonb |
| `payment_transactions` | payment_id, provider, provider_event_id (uniq), type (`authorize`/`capture`/`refund`/`chargeback`), status, amount_cents, raw_payload jsonb, occurred_at |
| `payment_webhook_events` | provider, signature_ok, provider_event_id (uniq), processed_at, error |

Status de pagamento: `pending → processing → paid | failed | canceled | refunded`, com `partially_paid` derivado no pedido (`paid_cents < total_cents AND paid_cents > 0`).
Nunca armazenar PAN, CVV ou dados de portador — só `provider`, `external_id`, `brand`, `last4`, `metadata` não sensível.
Webhooks: verificação de assinatura HMAC com comparação *timing-safe* antes de qualquer escrita; deduplicação por `provider_event_id`.

## 2.9 Incentivos
| Tabela | Campos-chave |
|---|---|
| `commission_rules` | scope (`product`/`category`/`user`/`team`/`campaign`/`target`), type (`percent`/`amount`), value, base (`total`/`margin`), conditions jsonb, priority, valid_from/to |
| `commissions` | order_id, order_item_id, user_id, rule_id, base_cents, amount_cents, status (`accrued`/`approved`/`paid`/`canceled`), accrued_at, paid_at — UNIQUE(order_item_id, user_id, rule_id) |
| `targets` | scope (`user`/`team`), metric (`revenue`/`orders`/`margin`/`new_customers`/`units`/`won_opportunities`), period (`weekly`/`monthly`/`quarterly`/`yearly`), period_start, period_end, goal_value, current_value, status |
| `campaigns` | name, audience_filter jsonb, product_ids[], offer jsonb, channel, start_at, end_at, budget_cents, owner_user_id, status, result jsonb |
| `campaign_members` | campaign_id, customer_id/lead_ref, state, converted_order_id |

Comissão é *provisionada* em `order.paid` e *cancelável* em estorno/cancelamento (registro de reversão, nunca DELETE).

## 2.10 Pós-venda, tarefas, plataforma
| Tabela | Campos-chave |
|---|---|
| `aftersales_cases` | order_id, customer_id, type (`followup`/`survey`/`issue`/`return`), status, owner_user_id, opened_at, closed_at, satisfaction_score, notes |
| `surveys` / `survey_responses` | NPS/CSAT, question set, respostas |
| `repurchase_predictions` | customer_id, product_id, predicted_at, confidence, avg_interval_days, last_purchase_at, status |
| `tasks` | title, description, due_at, status, priority, owner_user_id, entity_type, entity_id, created_by, source (`user`/`automation`/`ai`) |
| `notifications` | user_id, type, title, body, entity_type, entity_id, read_at, channel |
| `audit_logs` | actor_type, actor_id, action, entity_type, entity_id, before jsonb, after jsonb, ip, user_agent, origin, occurred_at (append-only) |
| `activity_logs` | nível de sistema: erros, integrações, jobs, IA |
| `outbox` | event envelope + status de publicação |
| `integrations` | provider, kind, config jsonb (sem segredos), credentials_ref, status, last_ok_at, last_error |
| `automation_rules` | trigger_event, conditions jsonb, actions jsonb, is_active, run_count |
| `reports` | saved reports: definition jsonb, owner, visibility |
| `settings` | key, value jsonb, scope (`tenant`/`team`/`user`) |
| `sales_events` | fato agregável para analytics (order_id, customer_id, user_id, product_id, qty, revenue_cents, margin_cents, occurred_at) |
| `idempotency_keys` | key, endpoint, request_hash, response jsonb, expires_at |

## 2.11 Regras de consistência (constraints obrigatórias)
- `orders.customer_id` NOT NULL · `order_items.product_id` NOT NULL · `payments.order_id` NOT NULL.
- CHECK: quantidades > 0; `discount_cents <= subtotal_cents`; `paid_cents <= total_cents + tolerância de 0`.
- Recalcular totais **no servidor** sempre; nunca confiar em total vindo do cliente.
- Comissão duplicada bloqueada por UNIQUE; pagamento duplicado bloqueado por `provider_event_id` UNIQUE.
- Toda mutação multi-tabela dentro de transação; leitura de estoque para escrita sempre com lock de linha.

---

# SEÇÃO 3 — CONTRATOS DE API (v1)

Padrões: `Authorization: Bearer <token>`; `X-Tenant-Id`; `Idempotency-Key` obrigatório em POST que cria dinheiro/estoque;
paginação por cursor (`?limit=50&cursor=`); filtros `?q=&status=&owner=&from=&to=`; ordenação `?sort=-created_at`.

**Erro padrão:**
```json
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "Estoque insuficiente para SKU-123",
  "details": { "sku": "SKU-123", "requested": 10, "available": 4 },
  "request_id": "uuid" } }
```

| Recurso | Endpoints |
|---|---|
| Clientes | `GET/POST /v1/customers`, `GET/PATCH/DELETE /v1/customers/{id}`, `GET /v1/customers/{id}/timeline`, `GET /v1/customers/{id}/metrics` |
| Empresas/Contatos | `/v1/companies`, `/v1/contacts` (CRUD) |
| Produtos | `/v1/products`, `/v1/products/{id}/variants`, `/v1/products/{id}/relations`, `/v1/categories` |
| Preços | `/v1/price-tables`, `/v1/price-tables/{id}/prices`, `POST /v1/pricing/quote` (resolve preço+desconto para um carrinho) |
| Descontos | `/v1/discount-rules` (CRUD), `POST /v1/discount-rules/validate` |
| Estoque | `GET /v1/inventory`, `POST /v1/inventory/movements`, `POST /v1/inventory/reserve`, `POST /v1/inventory/release`, `POST /v1/inventory/transfer`, `/v1/inventory/counts` |
| Pipeline | `/v1/pipelines`, `/v1/pipelines/{id}/stages`, `PATCH /v1/pipelines/{id}/stages/reorder` |
| Oportunidades | `/v1/opportunities`, `POST /v1/opportunities/{id}/move`, `POST /v1/opportunities/{id}/win`, `POST /v1/opportunities/{id}/lose`, `POST /v1/opportunities/{id}/rescore` |
| Propostas | `/v1/proposals`, `POST /{id}/submit-review`, `POST /{id}/approve`, `POST /{id}/send`, `POST /{id}/accept`, `POST /{id}/reject`, `GET /public/proposals/{token}` |
| Pedidos | `/v1/orders`, `POST /v1/proposals/{id}/convert-to-order`, `POST /v1/orders/{id}/confirm`, `POST /v1/orders/{id}/cancel`, `POST /v1/orders/{id}/ship`, `POST /v1/orders/{id}/deliver` |
| Pagamentos | `/v1/orders/{id}/payments`, `POST /v1/payments/{id}/capture`, `POST /v1/payments/{id}/refund`, `POST /api/public/webhooks/payments/{provider}` |
| Comissões | `/v1/commissions`, `POST /v1/commissions/{id}/approve`, `POST /v1/commissions/pay-batch` |
| Metas | `/v1/targets`, `GET /v1/targets/progress` |
| Campanhas | `/v1/campaigns`, `POST /{id}/audience/preview`, `POST /{id}/start`, `POST /{id}/stop` |
| Pós-venda | `/v1/aftersales/cases`, `/v1/surveys`, `GET /v1/repurchase/predictions` |
| Relatórios | `GET /v1/reports/{key}`, `POST /v1/reports/{key}/export` |
| Busca | `GET /v1/search?q=` (clientes, empresas, produtos, pedidos, oportunidades, propostas) |
| Import/Export | `POST /v1/imports/{entity}/validate`, `POST /v1/imports/{entity}/commit`, `GET /v1/exports/{job_id}` |
| Integração LEADS | `POST /api/public/integrations/leads/qualified` (assinado), `GET /v1/leads/{ref}` |
| Integração IA | `POST /v1/ai/query`, `POST /v1/ai/actions/{action}` (Seção 5) |

---

# SEÇÃO 4 — REGRAS DE NEGÓCIO CRÍTICAS

## 4.1 Conversão Proposta → Pedido
```
PROPOSTA(accepted)
  → validar: proposta não expirada, não convertida (uniq order.proposal_id), itens ativos
  → recalcular preços com snapshot da proposta (preço da proposta prevalece)
  → validar estoque disponível de cada item
  → BEGIN TX
      criar order + order_items (snapshots)
      reservar estoque (movement type=reserve, idempotency_key = order_id:item_id)
      gerar plano de pagamento (à vista/parcelado)
      marcar proposta como convertida
      gravar order_event + audit_log + outbox(order.created)
    COMMIT
  → nunca duplicar: Idempotency-Key + UNIQUE(proposal_id) em orders
```

## 4.2 Ciclo do estoque
`confirmed` → reserva · `canceled` → libera · `shipped` → baixa efetiva (`out`, consome reserva) · devolução → `in`.
Nenhum caminho altera saldo sem `inventory_movements`.

## 4.3 Descontos e alçadas
```
desconto_solicitado ≤ user_limits.max_discount_pct   → aplica direto
desconto_solicitado ≤ limite do gerente              → status "review", notifica aprovador
acima disso                                          → somente administrador
```
Padrão inicial: vendedor 5%, gerente 15%, administrador configurável (`settings.discount.limits`).

## 4.4 Recompra
`avg_interval_days` = média dos intervalos entre pedidos entregues do cliente (mínimo 2 compras).
Previsão = `last_purchase_at + avg_interval_days`. Alerta disparado em `previsão − 7 dias`.
Confiança = f(nº de compras, desvio-padrão do intervalo). Sem histórico suficiente → não prever (nunca inventar).

## 4.5 Cross-sell / Up-sell
Cross-sell: co-ocorrência em pedidos entregues (lift ≥ limiar configurável, mínimo de suporte),
complementada por `product_relations` manuais. Up-sell: produtos da mesma categoria com `base_price` superior
dentro de faixa configurável, filtrando os já comprados. Recomendação sempre traz **o motivo**.

## 4.6 Funil e conversão
Métricas por etapa: quantidade, valor, taxa de conversão para a próxima, taxa de perda, tempo médio (de `opportunity_stage_history`).

---

# SEÇÃO 5 — CAMADA DE IA (integração com a FASE 2)

O Comercial **não** embute o motor de IA. Ele expõe um contrato de *tools* consumido pelos agentes da FASE 2.

**Tools de leitura (read-only, sempre com filtro de tenant e escopo do usuário chamador):**
`commercial.customers.search`, `customers.profile`, `products.search`, `inventory.status`,
`opportunities.list`, `opportunities.prioritize`, `pipeline.health`, `proposals.expiring`,
`orders.list`, `payments.overdue`, `metrics.summary`, `repurchase.candidates`, `recommendations.for_customer`.

**Tools de escrita (exigem permissão explícita + confirmação + auditoria `actor.type=ai`):**
`tasks.create`, `opportunities.create`, `opportunities.update_next_action`, `notifications.send`,
`proposals.draft` (somente rascunho — IA nunca envia proposta nem aprova desconto), `campaigns.draft`.

**Proibições:** IA nunca confirma pedido, nunca aprova desconto/proposta, nunca movimenta estoque,
nunca registra pagamento, nunca exclui registro.

**Contrato de resposta do assistente comercial** (ex.: "Quais oportunidades devo trabalhar hoje?"):
```json
{ "answer": "Priorizei 12 oportunidades.",
  "items": [{ "opportunity_id":"uuid", "customer":"...", "amount_cents":0, "score":0,
              "reason":"Score 84, proposta enviada há 6 dias sem retorno",
              "last_interaction_at":"...", "risk":"medium", "next_action":"Ligar hoje 14h" }],
  "sources": [{"entity":"opportunity","id":"uuid"}] }
```
Toda afirmação da IA cita a fonte (`sources`). Sem dado, responde "não há informação suficiente" — nunca estima em silêncio.

---

# SEÇÃO 6 — INTEGRAÇÃO COM ECOMIM LEADS

- Consumo por webhook assinado em `POST /api/public/integrations/leads/qualified` **ou** por evento `lead.qualified` na fila.
- Payload mínimo: `lead_ref`, dados de contato, origem, tags, classificação, histórico resumido, `owner_hint`.
- Ação: cria/atualiza `customer` por chave natural (tax_id → email → telefone), guarda `lead_ref` (sem copiar todo o histórico),
  cria `opportunity` na etapa inicial do pipeline padrão e emite `opportunity.created`.
- Deduplicação obrigatória; conflito de dados gera `merge_candidates` para decisão humana, nunca sobrescrita cega.
- Consulta de detalhes do lead é **por referência** (`GET /v1/leads/{ref}` → proxy para o LEADS), não por cópia.

---

# SEÇÃO 7 — SEGURANÇA

- Autenticação com sessão/JWT curto + refresh; expiração e revogação; rate limiting por IP e por usuário.
- Autorização em duas camadas: middleware de permissão (`module.action`) + RLS no banco por `tenant_id` e escopo (`own`/`team`/`tenant`).
- Papéis em tabela separada (`user_roles`) com função `has_permission(user, code)` *security definer*.
- Validação de entrada com schema (limites de tamanho, formato, faixa) em **toda** rota; saída com projeção explícita de colunas.
- Segredos apenas em variáveis de ambiente/cofre; `integrations.config` nunca guarda credencial.
- Webhooks: assinatura HMAC + comparação timing-safe + janela de tempo + dedup.
- PCI: zero dado de cartão. Somente token do gateway.
- Auditoria append-only; logs sem PII sensível; `request_id` correlacionando API → job → evento.
- LGPD: exportação e anonimização de dados do cliente sob solicitação; retenção configurável.

---

# SEÇÃO 8 — INTERFACE

Menu: Dashboard · Clientes · Empresas · Produtos · Estoque · Oportunidades · Pipeline · Propostas · Pedidos · Pagamentos · Comissões · Metas · Campanhas · Pós-venda · Relatórios · IA Comercial · Configurações.

Padrões de tela:
- **Lista:** busca, filtros salvos, colunas configuráveis, seleção múltipla, ações em massa, paginação por cursor, exportação, estados vazio/carregando/erro.
- **Detalhe:** cabeçalho com KPIs, abas (dados, itens, histórico, tarefas, anexos), timeline lateral, barra de ações contextual.
- **Pipeline:** kanban com arrastar-e-soltar, WIP e valor por coluna, atualização otimista com rollback em erro.
- **Editor de proposta/pedido:** linha de item com busca de produto, preço resolvido pela API (`/pricing/quote`), recálculo servidor-side, aviso de alçada de desconto.
- **Mobile:** menu colapsável, tabela vira card, ações rápidas, formulários em etapa única por seção.
- Feedback: toasts, skeletons, mensagens de erro acionáveis (o que houve + o que fazer), confirmação para ações destrutivas.
- Acessibilidade: navegação por teclado, foco visível, contraste AA, labels em todos os campos.

---

# SEÇÃO 9 — DESEMPENHO

| Alvo | Limite |
|---|---|
| API de leitura (p95) | ≤ 300 ms |
| API de escrita (p95) | ≤ 600 ms |
| Dashboard completo | ≤ 1,5 s com 100k pedidos |
| Busca global | ≤ 400 ms |
| Importação | 10k linhas sem travar a UI (job assíncrono com progresso) |

Táticas: índices `(tenant_id, ...)`, paginação por cursor, agregados materializados (`sales_events` + refresh incremental),
cache de leitura curta em dashboards, jobs em fila para relatório/exportação/recálculo de score.

---

# SEÇÃO 10 — TESTES (mínimo aceitável)

- **Unitários:** motor de preço, motor de desconto, alçadas, scoring, cálculo de comissão, previsão de recompra, máquinas de estado.
- **Integração:** conversão proposta→pedido, ciclo completo de estoque, pagamento parcial até quitação, estorno revertendo comissão.
- **API:** contrato de cada endpoint, paginação, filtros, erros, idempotência (mesma chave → mesma resposta, sem efeito duplicado).
- **Permissões:** matriz papel × ação × escopo, incluindo tentativa de acesso cross-tenant (deve retornar 404/403, nunca dado).
- **Concorrência:** duas reservas simultâneas do último item — apenas uma sucede.
- **Webhook:** assinatura inválida rejeitada; evento duplicado processado uma única vez.
- **E2E:** LEAD → oportunidade → proposta → aprovação → pedido → pagamento → entrega → pós-venda → recompra.
- Cobertura mínima 80% em `domain` e `application`; 100% nos módulos financeiro e de estoque.

---

# SEÇÃO 11 — MATRIZ DE ERROS

| Código | HTTP | Quando | Ação do sistema |
|---|---|---|---|
| `VALIDATION_ERROR` | 422 | payload inválido | lista campo a campo |
| `PERMISSION_DENIED` | 403 | falta permissão | log de tentativa |
| `TENANT_MISMATCH` | 404 | recurso de outro tenant | não revelar existência |
| `INVALID_TRANSITION` | 422 | status não permitido | informa transições válidas |
| `INSUFFICIENT_STOCK` | 409 | reserva > disponível | retorna disponível por SKU |
| `DISCOUNT_LIMIT_EXCEEDED` | 422 | acima da alçada | oferece enviar para aprovação |
| `PROPOSAL_EXPIRED` | 409 | aceite após validade | oferece revisão |
| `ALREADY_CONVERTED` | 409 | proposta já virou pedido | devolve order_id existente |
| `DUPLICATE_REQUEST` | 200 | Idempotency-Key repetida | devolve resposta original |
| `PAYMENT_DECLINED` | 402 | recusa do gateway | registra transação e motivo |
| `PROVIDER_UNAVAILABLE` | 503 | gateway fora | retry com backoff, marca `processing` |
| `WEBHOOK_SIGNATURE_INVALID` | 401 | HMAC falhou | descarta e alerta |
| `IMPORT_INVALID_ROWS` | 422 | validação de importação | relatório de linhas, zero gravação |
| `CONFLICT_VERSION` | 409 | edição concorrente | mostra diff, exige recarregar |
| `RATE_LIMITED` | 429 | excesso de chamadas | `Retry-After` |

Regra: nenhum erro é engolido. Todo erro tem `request_id` e entra em `activity_logs`.

---

# SEÇÃO 12 — RELATÓRIO DE ETAPA (formato obrigatório)

```
## RELATÓRIO — ETAPA <n>: <nome>
1. ESCOPO ENTREGUE
2. ARQUIVOS CRIADOS/ALTERADOS (caminho + o que mudou)
3. MIGRATIONS (nome + resumo do schema)
4. ENDPOINTS (método, rota, permissão exigida)
5. REGRAS DE NEGÓCIO IMPLEMENTADAS
6. TESTES (comando + saída resumida + cobertura)
7. VERIFICAÇÕES: banco OK? APIs OK? permissões OK? responsivo OK?
8. PENDÊNCIAS E DÍVIDAS TÉCNICAS
9. RISCOS E DECISÕES TOMADAS (com justificativa)
10. DEPENDÊNCIAS EXTERNAS NÃO RESOLVIDAS (credenciais/serviços faltando)
11. PRONTO PARA A PRÓXIMA ETAPA? (sim/não + por quê)
```

---

# SEÇÃO 13 — VARIÁVEIS DE AMBIENTE

```
APP_ENV=development|staging|production
APP_URL=
DATABASE_URL=
QUEUE_URL=
JWT_SECRET=
SESSION_TTL_MINUTES=60
DEFAULT_CURRENCY=BRL
DEFAULT_TIMEZONE=America/Sao_Paulo
ALLOW_NEGATIVE_STOCK=false
DISCOUNT_LIMIT_SELLER_PCT=5
DISCOUNT_LIMIT_MANAGER_PCT=15
PROPOSAL_DEFAULT_VALIDITY_DAYS=15
REPURCHASE_ALERT_DAYS_BEFORE=7
RATE_LIMIT_PER_MINUTE=120

# Integração ECOMIM LEADS
LEADS_API_URL=
LEADS_API_KEY=
LEADS_WEBHOOK_SECRET=

# Integração ECOMIM IA
AI_API_URL=
AI_API_KEY=
AI_ALLOWED_TOOLS=read_only   # read_only | read_write

# Gateway de pagamento (preencher só quando a credencial real existir)
PAYMENT_PROVIDER=
PAYMENT_API_KEY=
PAYMENT_WEBHOOK_SECRET=

STORAGE_BUCKET=
MAIL_PROVIDER=
MAIL_API_KEY=
```
Regra: variável ausente → falha explícita na inicialização do módulo dependente, com mensagem clara. Jamais fallback silencioso para mock.

---

# SEÇÃO 14 — COMANDOS SEQUENCIAIS PARA O CLAUDE

> Execute **um por mensagem**. Exija o Relatório de Etapa entre cada um.

### CMD-00 — Diagnóstico e plano
```
Antes de escrever qualquer código:
1. Percorra o repositório e relate: stack, versões, banco, ORM/migrations, autenticação,
   estrutura de pastas, padrões de teste, CI, ferramentas de UI existentes.
2. Identifique o que já existe do ECOMIM LEADS e do ECOMIM IA neste repositório e quais
   pontos de integração já estão disponíveis (tabelas, endpoints, eventos).
3. Liste conflitos com a arquitetura alvo da FASE 3 e dependências faltantes.
4. Proponha a arquitetura final de pastas/módulos do ECOMIM COMERCIAL.
5. Apresente o plano de execução das 20 etapas mapeado para o código real deste projeto.
NÃO implemente nada ainda. Não pergunte o que pode ser lido no código.
Entregue o Relatório de Etapa 0.
```

### CMD-01 — Fundação e arquitetura
```
ETAPA 1. Crie o esqueleto do módulo comercial:
- estrutura de pastas por bounded context (identity, crm, catalog, inventory, pipeline,
  quoting, ordering, billing, incentives, aftersales, insights, ai-bridge, platform);
- camada de domínio com Money (inteiro em centavos), Quantity, tipos de erro de domínio;
- middleware de tenant, autenticação, autorização por permissão e rate limiting;
- helper de transação, optimistic locking e idempotência (tabela idempotency_keys);
- barramento de eventos com transactional outbox + worker + retry/DLQ;
- logger estruturado com request_id/correlation_id;
- config por ambiente que FALHA se variável obrigatória faltar (sem fallback mock);
- setup de testes rodando em CI.
Entregue o Relatório de Etapa.
```

### CMD-02 — Banco de dados
```
ETAPA 2. Implemente todas as migrations da Seção 2 do documento (identidade, CRM, catálogo,
preços, descontos, estoque, pipeline, propostas, pedidos, pagamentos, incentivos, pós-venda,
plataforma), com: tenant_id em toda tabela de negócio, chaves estrangeiras, CHECKs de
consistência (Seção 2.11), índices com prefixo (tenant_id, ...), colunas geradas, RLS por tenant
e escopo, sequências de numeração por tenant/ano, e migration reversível.
Inclua seed mínimo: tenant demo, papéis, permissões, pipeline padrão, tabela de preço padrão,
armazém padrão — tudo marcado como seed.
Escreva testes de schema (constraints e RLS) e execute-os.
Entregue o Relatório de Etapa.
```

### CMD-03 — Identidade, equipes e permissões
```
ETAPA 3. Implemente usuários, equipes, papéis, permissões e limites por usuário:
- catálogo de permissões module.action (view, create, edit, delete, approve, cancel, export,
  change_price, grant_discount) para todos os módulos;
- escopos own/team/tenant aplicados no banco (RLS) e na aplicação;
- limites de desconto e de valor por usuário;
- CRUD + telas de administração;
- testes da matriz papel × ação × escopo, incluindo tentativa cross-tenant.
Entregue o Relatório de Etapa.
```

### CMD-04 — Clientes, empresas, contatos e timeline
```
ETAPA 4. Implemente CRM completo: companies, customers (PF/PJ), contacts, addresses,
customer_events. Inclua deduplicação por CPF/CNPJ, e-mail e telefone; merge de duplicados com
revisão humana; métricas do cliente (total comprado, ticket médio, frequência, última compra,
intervalo médio); página de perfil com abas e timeline cronológica; busca e filtros; API completa.
Testes: dedupe, cálculo de métricas, timeline, permissões por escopo.
Entregue o Relatório de Etapa.
```

### CMD-05 — Produtos, categorias, tabelas de preço e descontos
```
ETAPA 5. Implemente catálogo: categorias em árvore (criar/editar/excluir/ativar/reordenar/buscar),
produtos com todos os campos da Seção 2.3, variações, relações (cross/up-sell), kits e combos,
fornecedores; múltiplas tabelas de preço com faixas por quantidade e vigência; motor de resolução
de preço determinístico; motor de descontos com todos os escopos e alçadas por usuário;
endpoint POST /v1/pricing/quote que devolve preço, descontos aplicados e motivo de cada um.
Testes exaustivos do motor de preço e desconto (incluindo empates, vigências e limites de alçada).
Entregue o Relatório de Etapa.
```

### CMD-06 — Estoque
```
ETAPA 6. Implemente estoque real: warehouses, inventory, inventory_movements, reservas,
liberação, transferência, ajuste, inventário cíclico, estoque mínimo e alerta de estoque baixo.
Requisitos: saldo só muda por movimento; SELECT ... FOR UPDATE na linha de inventory;
idempotency_key única por movimento; bloqueio de saldo negativo salvo configuração explícita;
histórico completo com motivo, referência e usuário; evento inventory.low_stock.
Teste de concorrência obrigatório: duas reservas simultâneas do último item — só uma pode passar.
Entregue o Relatório de Etapa.
```

### CMD-07 — Pipeline, oportunidades e scoring
```
ETAPA 7. Implemente pipelines configuráveis (múltiplos), etapas com posição, probabilidade e SLA;
oportunidades com itens, responsável, previsão de fechamento, próxima ação e histórico de etapas
com tempo em cada uma; kanban com drag-and-drop e atualização otimista; ganho/perda com motivo;
motor de scoring configurável por tabela (fatores e pesos, faixas 0-30/31-60/61-80/81-100),
recálculo por evento e job diário; detecção de oportunidade parada (sem interação > X dias).
Testes: scoring, transições de etapa, cálculo de tempo médio por etapa.
Entregue o Relatório de Etapa.
```

### CMD-08 — Propostas e aprovação
```
ETAPA 8. Implemente propostas: numeração sequencial por tenant/ano, itens com preço resolvido
pelo motor da Etapa 5, descontos com alçada, frete, impostos quando aplicável, validade,
condições; máquina de estados draft→review→approved→sent→viewed→negotiation→
accepted|rejected|expired|canceled; revisões imutáveis a cada alteração pós-envio;
fluxo de aprovação com permissão dedicada; link público com token para visualização e aceite
(registrando viewed_at e decided_at); job de expiração; evento proposal.expiring (D-3) e
proposal.expired. Testes de máquina de estados, revisões, alçadas e expiração.
Entregue o Relatório de Etapa.
```

### CMD-09 — Pedidos e conversão
```
ETAPA 9. Implemente pedidos com snapshots de item, endereços, totais recalculados no servidor,
máquina de estados draft→confirmed→payment_pending→paid→processing→shipped→delivered→
completed (+canceled), order_events, shipments e rastreio.
Implemente POST /v1/proposals/{id}/convert-to-order seguindo exatamente o algoritmo da Seção 4.1:
validação, recálculo, checagem e reserva de estoque, criação do plano de pagamento, marcação da
proposta, eventos e auditoria — tudo em uma transação, idempotente e sem duplicação (UNIQUE em
orders.proposal_id). Cancelamento libera reserva; envio baixa estoque.
Testes de integração cobrindo conversão, duplicidade, estoque insuficiente e cancelamento.
Entregue o Relatório de Etapa.
```

### CMD-10 — Pagamentos
```
ETAPA 10. Implemente pagamentos: registro por pedido, métodos, parcelas e entrada, saldo restante,
vencimentos, status pending→processing→paid|failed|canceled|refunded, e partially_paid derivado
no pedido; payment_transactions com provider_event_id único; estorno com reversão de comissão.
Crie a arquitetura de gateway como interface (PaymentProvider) com implementação real do provedor
escolhido e webhook em /api/public/webhooks/payments/{provider} com verificação HMAC timing-safe,
dedup e reprocessamento seguro. Sem credencial configurada, o provedor deve falhar de forma
explícita e documentada — nunca simular aprovação. Nenhum dado de cartão é persistido.
Testes: pagamento parcial até quitação, assinatura inválida, evento duplicado, estorno.
Entregue o Relatório de Etapa.
```

### CMD-11 — Comissões e metas
```
ETAPA 11. Implemente regras de comissão por produto/categoria/vendedor/equipe/campanha/meta,
base sobre total ou margem, prioridade e vigência; provisionamento em order.paid; aprovação e
pagamento em lote; reversão em estorno/cancelamento (registro de reversão, nunca DELETE);
UNIQUE impedindo comissão duplicada. Implemente metas por usuário e equipe, por métrica e período,
com progresso atualizado por evento e evento target.reached.
Testes: cálculo, não-duplicação, reversão, progresso de meta.
Entregue o Relatório de Etapa.
```

### CMD-12 — Pós-venda, recompra, cross-sell e up-sell
```
ETAPA 12. Implemente pós-venda: abertura automática em order.delivered, casos, tarefas,
lembretes, pesquisa de satisfação (NPS/CSAT) e histórico.
Implemente previsão de recompra conforme Seção 4.4 (mínimo de 2 compras, confiança calculada,
sem previsão quando não houver base) com alerta D-7 e criação opcional de oportunidade.
Implemente cross-sell por co-ocorrência com suporte/lift mínimos e up-sell por faixa de preço na
mesma categoria; toda recomendação retorna o motivo e os dados que a sustentam.
Testes com histórico sintético cobrindo caso sem dados suficientes.
Entregue o Relatório de Etapa.
```

### CMD-13 — Campanhas
```
ETAPA 13. Implemente campanhas comerciais: público por segmentação (clientes, leads, inativos,
compradores, compradores de determinado produto, clientes de determinado período), oferta,
período, canal, responsável, orçamento e resultado; preview de audiência antes de iniciar;
vínculo campanha → oportunidade/pedido para medir conversão e ROI; estados draft/running/paused/
finished. Testes de segmentação e atribuição de resultado.
Entregue o Relatório de Etapa.
```

### CMD-14 — Dashboard, funil e relatórios
```
ETAPA 14. Implemente o dashboard comercial (faturamento, vendas, pedidos, oportunidades,
conversão, ticket médio, margem, novos clientes, recompra, pipeline, metas, desempenho da equipe)
com filtros hoje/semana/mês/trimestre/ano/personalizado e comparação com período anterior.
Implemente o funil LEADS→QUALIFICADOS→OPORTUNIDADES→PROPOSTAS→NEGOCIAÇÕES→VENDAS com
quantidade, valor, conversão, perda e tempo médio.
Implemente relatórios (vendas, faturamento, clientes, produtos, estoque, vendedores, comissões,
oportunidades, propostas, conversão, recompra, margem) com filtros, agrupamento, ordenação e
exportação assíncrona (CSV/XLSX) via job com progresso.
Use sales_events/agregados para atender os alvos de performance da Seção 9; comprove com medição.
Entregue o Relatório de Etapa.
```

### CMD-15 — IA Comercial
```
ETAPA 15. Implemente a camada ai-bridge da Seção 5: tools de leitura e de escrita, com escopo de
permissão do usuário chamador, filtro de tenant, limite de volume e auditoria com actor.type=ai.
Implemente o assistente comercial respondendo, com o contrato JSON definido: quem contatar,
clientes parados, propostas vencendo, oportunidades em risco, qual produto oferecer, como abordar.
Toda resposta cita sources; sem dados suficientes, responde explicitamente que não há informação.
A IA não pode confirmar pedido, aprovar desconto/proposta, movimentar estoque, registrar pagamento
ou excluir registros — garanta isso por permissão e por teste.
Entregue o Relatório de Etapa.
```

### CMD-16 — Automações e notificações
```
ETAPA 16. Implemente motor de automation_rules (trigger de evento + condições + ações) cobrindo:
novo cliente → tarefa; proposta expirando → alerta; oportunidade parada → análise da IA;
pedido pago → iniciar processamento; pedido entregue → abrir pós-venda; cliente próximo da
recompra → criar oportunidade. Execução idempotente por event_id, com log de cada execução,
limite de disparos e proteção contra loop.
Implemente notificações (in-app + preparação para e-mail) para todos os tipos da Seção 36 do
briefing, com preferências por usuário e marcação de leitura.
Testes de disparo, idempotência e prevenção de loop.
Entregue o Relatório de Etapa.
```

### CMD-17 — Integrações: LEADS, importação/exportação e busca global
```
ETAPA 17.
a) Integração com ECOMIM LEADS conforme Seção 6: webhook assinado + consumo de evento,
   deduplicação, criação de cliente e oportunidade, referência por lead_ref sem cópia do histórico,
   candidatos a merge em caso de conflito.
b) Importação de clientes e produtos em duas fases (validate → commit) com relatório de linhas
   inválidas e ZERO gravação parcial; exportação de relatórios.
c) Busca global unificada (clientes, empresas, produtos, pedidos, oportunidades, propostas) com
   ranking e atalho de teclado, arquitetura preparada para índice dedicado.
d) Tabela integrations com status, último sucesso e último erro; painel de integrações.
Testes de assinatura inválida, dedupe, importação inválida e busca.
Entregue o Relatório de Etapa.
```

### CMD-18 — Segurança, auditoria e logs
```
ETAPA 18. Auditoria completa da Seção 7: revise autenticação, sessão, rate limiting, validação de
entrada em todas as rotas, projeção de colunas, RLS, permissões, proteção de webhooks, tratamento
de segredos e ausência de dados de cartão.
Implemente audit_logs append-only registrando usuário, ação, entidade, valor anterior, valor novo,
data, IP e origem — cobrindo no mínimo: alteração de preço, desconto concedido, aprovação de
proposta, cancelamento de pedido, ajuste de estoque, alteração de permissão, pagamento e estorno.
Implemente activity_logs e o painel de consulta de logs e auditoria com filtros.
Escreva testes de segurança, incluindo tentativa de acesso cross-tenant e escalonamento de papel.
Entregue o Relatório de Etapa com a lista de vulnerabilidades encontradas e corrigidas.
```

### CMD-19 — Testes, performance e responsividade
```
ETAPA 19. Complete a suíte da Seção 10 até atingir 80% de cobertura em domain/application e 100%
nos módulos financeiro e de estoque, incluindo o E2E LEAD→...→RECOMPRA.
Meça os alvos da Seção 9 com dataset sintético (mínimo 50k pedidos, 20k clientes, 5k produtos) e
corrija os gargalos encontrados (índices, N+1, agregados).
Revise todas as telas em 360px, 768px, 1024px e 1440px, corrigindo tabelas, menus e formulários.
Entregue o Relatório de Etapa com números antes/depois e evidência dos testes.
```

### CMD-20 — Documentação e auditoria final
```
ETAPA 20.
a) Documentação completa: arquitetura, modelo de dados (com diagrama textual), APIs endpoint a
   endpoint, instalação, configuração, variáveis de ambiente, permissões, integrações, módulos,
   testes e troubleshooting.
b) Auditoria final: percorra a lista da Seção 56 do briefing (clientes, produtos, estoque,
   oportunidades, pipeline, propostas, pedidos, pagamentos, comissões, metas, pós-venda, recompra,
   campanhas, relatórios, IA, automações, APIs, segurança, permissões, logs, testes,
   responsividade, performance, documentação) e, para cada item, declare: OK / PARCIAL / PENDENTE,
   com evidência (teste, rota, tela).
c) Liste as dependências externas não resolvidas e o que exatamente falta para resolvê-las.
Não declare a FASE 3 concluída enquanto houver item PARCIAL ou PENDENTE sem justificativa aceita.
Entregue o Relatório Final.
```

---

# SEÇÃO 15 — CRITÉRIOS DE ACEITE DA FASE 3

| # | Critério | Como comprovar |
|---|---|---|
| 1 | Fluxo completo LEAD→RECOMPRA funciona ponta a ponta | teste E2E verde |
| 2 | Nenhuma tela com botão sem lógica real | auditoria tela a tela |
| 3 | Estoque nunca fica inconsistente sob concorrência | teste de corrida |
| 4 | Dinheiro sempre bate: soma de pagamentos = paid_cents = total quando quitado | teste de integração |
| 5 | Proposta não gera pedido duplicado | UNIQUE + teste de idempotência |
| 6 | Comissão nunca duplica e reverte em estorno | teste |
| 7 | Cross-tenant impossível | teste de segurança |
| 8 | Alçada de desconto respeitada e auditada | teste + audit_log |
| 9 | Webhook falso rejeitado, duplicado ignorado | teste |
| 10 | IA não executa ação proibida | teste de permissão |
| 11 | Metas de performance atingidas com dataset realista | medição documentada |
| 12 | Todas as telas usáveis em 360px | evidência visual |
| 13 | Nenhuma integração simulada | inspeção de código + doc de dependências |
| 14 | Documentação completa e atualizada | revisão |

---

# SEÇÃO 16 — RISCOS E ANTIPADRÕES A EVITAR

- Total calculado no cliente e confiado pelo servidor → fraude de preço.
- Estoque atualizado com `UPDATE ... SET on_hand = on_hand - x` sem lock → saldo negativo em concorrência.
- Valores em float → centavos perdidos em relatórios financeiros.
- Papel do usuário na tabela de usuários → escalonamento de privilégio.
- Webhook processado sem verificar assinatura → injeção de pagamento falso.
- IA com acesso direto ao banco → vazamento cross-tenant e ação não auditada.
- Catálogo alterado reescrevendo histórico de pedidos → auditoria destruída (use snapshots).
- Importação que grava parcialmente → base corrompida (valide tudo antes do commit).
- Job de expiração/score sem idempotência → efeitos duplicados a cada retry.
- "Concluído porque a tela apareceu" → a única definição de pronto é: lógica + API + banco + teste + doc.
