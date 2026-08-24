# ECOMIM — FASE 5 · SISTEMA DE AUTOMAÇÕES E ORQUESTRAÇÃO
## Especificação Técnica Executável + Comandos para o Claude

> **Como usar este documento**
> 1. Cole o **BLOCO DE CONTEXTO PERMANENTE** (§0) no início de **toda** sessão com o Claude.
> 2. Execute `CMD-00` … `CMD-23` **em ordem**, um por mensagem.
> 3. Exija o **Relatório de Etapa** (§16.2) ao final de cada comando.
> 4. Interface funcionando não é etapa concluída. Só teste passando conclui.

---

# 0. BLOCO DE CONTEXTO PERMANENTE

```
Você é o arquiteto e desenvolvedor principal da FASE 5 do ECOMIM — ECOMIM AUTOMAÇÕES.

CONTEXTO DO ECOSSISTEMA
- FASE 1 — LEADS: captura, qualificação e gestão de leads.
- FASE 2 — IA: agentes, memória, ferramentas, orquestração, human-in-the-loop.
- FASE 3 — COMERCIAL: clientes, produtos, estoque, oportunidades, propostas,
  pedidos, pagamentos, pós-venda, recompra.
- FASE 4 — COMUNICAÇÃO: canais, inbox, conversas, mensagens, templates,
  campanhas, sequências, consentimento.
- FASE 5 — AUTOMAÇÕES (esta fase): o MOTOR DE PROCESSOS que conecta tudo.
  Eventos → gatilhos → condições → decisões (inclusive por IA) → ações →
  aprovações → agendamentos → workflows, com rastreabilidade total.

REGRAS INEGOCIÁVEIS
1. NADA DE FACHADA. Proibido: automação "ativa" sem executor real, execução
   simulada apresentada como real, botão sem serviço, métrica inventada.
2. Toda automação ativa TEM executor real, ou está marcada
   `PENDING_EXTERNAL_INTEGRATION` com a dependência nomeada, e NÃO pode ser publicada.
3. Toda execução registra: id, status, início, fim, duração, resultado, logs,
   erros, contexto, origem (evento/usuário/agendador/API) e responsável.
4. Módulo INDEPENDENTE: fala com LEADS/IA/COMERCIAL/COMUNICAÇÃO apenas por
   portas (interfaces), eventos e contratos de dados. Sem SELECT direto nas
   tabelas dos outros módulos.
5. Multi-tenant: `org_id` em toda tabela; RLS habilitada; GRANTs explícitos.
6. IDEMPOTÊNCIA obrigatória em toda ação com efeito colateral externo ou
   financeiro. Sem chave de idempotência ⇒ ação não é retentável.
7. NENHUMA ação executa sem permissão verificada no servidor. A automação herda
   um principal explícito, nunca "superusuário".
8. Delays e esperas NUNCA seguram processo/conexão. Estado persistido + scheduler.
9. Toda espera tem timeout e caminho alternativo. Todo loop tem limite e saída.
10. Uma execução em andamento permanece vinculada à VERSÃO da automação que a iniciou.
11. Modo teste/dry-run NUNCA dispara efeito externo real, salvo flag explícita
    e registrada por usuário com permissão.
12. Não reescrever o que funciona nas fases 1–4. Reutilizar. Não duplicar.
13. Nada concluído sem: código verificado, testes passando, banco verificado,
    filas verificadas, permissões verificadas, documentação atualizada.

FORMATO DE RESPOSTA A CADA COMANDO
A. Implementado (arquivos criados/alterados)
B. Migrations aplicadas (SQL resumido)
C. Testes criados e resultado da execução
D. Dependências externas e status
E. Pendências / o que NÃO foi feito e por quê
F. Próximo comando sugerido
```

---

# 1. ARQUITETURA

## 1.1 Visão geral

```
┌──────────────────────────────────────────────────────────────────────┐
│ UI — Dashboard · Automações · Builder · Templates · Execuções ·      │
│      Aprovações · Fila · Eventos · Logs · Métricas · Configurações   │
└───────────────▲──────────────────────────────────────────────────────┘
                │ RPC tipado / REST v1
┌───────────────┴──────────────────────────────────────────────────────┐
│ CONTROL PLANE (síncrono, rápido)                                     │
│ AutomationService · VersionService · ValidationService               │
│ TestRunner (dry-run) · ApprovalService · PermissionService           │
└───────────────▲──────────────────────────────────────────────────────┘
                │
┌───────────────┴──────────────────────────────────────────────────────┐
│ EVENT BUS  (ingestão de eventos internos e externos)                 │
│  ├─ outbox transacional dos módulos 1–4                              │
│  ├─ webhooks externos (assinados, deduplicados)                      │
│  ├─ eventos de tempo (scheduler)                                     │
│  └─ eventos customizados (definições declarativas)                   │
│  → TriggerMatcher (indexado por event_type + org)                    │
└───────────────▲──────────────────────────────────────────────────────┘
                │ cria automation_runs (status=pending)
┌───────────────┴──────────────────────────────────────────────────────┐
│ DATA PLANE — AUTOMATION ENGINE (assíncrono, durável)                 │
│                                                                      │
│  Worker loop:  claim(run) → step() → persist → yield                 │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Máquina de estados por NÓ, não por processo.                 │    │
│  │ O worker executa UM nó, grava o estado e solta o run.        │    │
│  │ Delay/Wait/Approval = run "adormecido" no banco, zero CPU.   │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  NodeExecutors: trigger · condition · branch · action · ai_agent ·   │
│  delay · wait_event · approval · loop · webhook · api_call ·         │
│  notification · subflow · end                                        │
└───────┬──────────────┬─────────────┬───────────────┬─────────────────┘
        │              │             │               │
   LeadsPort     CommercialPort   AiPort        CommPort
   (F1)              (F3)          (F2)           (F4)
        │              │             │               │
┌───────┴──────────────┴─────────────┴───────────────┴─────────────────┐
│ SCHEDULER (cron/tick) · JOB QUEUE (prioridade, retry, backoff)       │
│ ALERTING · METRICS · AUDIT                                           │
└──────────────────────────────────────────────────────────────────────┘
```

## 1.2 Decisão central: **execução por passos, não por processo**

Um workflow com "esperar 3 dias" **não pode** ser uma função rodando 3 dias.

```
claim_run()  →  carrega run + cursor (nó atual) + contexto
             →  executa UM nó
             →  grava automation_run_nodes + novo cursor + próximo estado
             →  se o próximo estado é imediato: reenfileira agora
                se é delay/wait/approval: grava wake_at / wait_condition e SOLTA
             →  commit
```
Consequências:
- Reinício do servidor não perde execução (estado está no banco).
- 3 dias de espera custam 1 linha, não um processo.
- Cada nó é retentável isoladamente com sua própria idempotência.

## 1.3 Portas (anti-acoplamento)

```ts
// src/modules/automation/ports/*.ts
export interface LeadsPort {
  getLead(id: string, scope: Scope): Promise<LeadSnapshot | null>;
  createLead(i: CreateLeadInput, idem: string): Promise<Ref>;
  updateLead(id: string, patch: LeadPatch, idem: string): Promise<void>;
  addTag(id: string, tag: string): Promise<void>;
  assignOwner(id: string, userId: string): Promise<void>;
  setScore(id: string, score: number, reason: string): Promise<void>;
}

export interface CommercialPort {
  getCustomer(id, scope): Promise<CustomerSnapshot | null>;
  createOpportunity(i, idem): Promise<Ref>;
  updateOpportunityStage(id, stage, idem): Promise<void>;
  createProposal(i, idem): Promise<Ref>;
  createOrder(i, idem): Promise<Ref>;
  getOrder(id, scope): Promise<OrderSnapshot | null>;
  reserveStock(i, idem): Promise<StockResult>;
  createTask(i, idem): Promise<Ref>;
}

export interface CommPort {
  sendMessage(i: SendMessageInput, idem: string): Promise<SendResult>;
  sendTemplate(i, idem): Promise<SendResult>;
  startSequence(i, idem): Promise<Ref>;
  startCampaign(i, idem): Promise<Ref>;
  assignConversation(id, target): Promise<void>;
  setConversationPriority(id, p): Promise<void>;
  /** Preflight do canal (janela, consentimento, limites) SEM enviar. */
  preflight(i: SendMessageInput): Promise<PreflightVerdict>;
}

export interface AiPort {
  runAgent(i: RunAgentInput): Promise<AgentResult>;   // com budget/limites
  decide(i: DecideInput): Promise<DecisionResult>;    // escolha de caminho
  analyze(i: AnalyzeInput): Promise<AnalysisResult>;
  generate(i: GenerateInput): Promise<GeneratedContent>;
}
```

**Regra de ouro das portas:** toda porta que causa efeito recebe `idem: string`. O adapter repassa como `Idempotency-Key`/`client_id` ao módulo destino. Sem isso, o retry duplica pedido, mensagem ou cliente.

---

# 2. MODELO DE DADOS

> Padrão obrigatório após cada `CREATE TABLE`:
> ```sql
> GRANT SELECT, INSERT, UPDATE, DELETE ON public.<t> TO authenticated;
> GRANT ALL ON public.<t> TO service_role;
> ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;
> CREATE POLICY "<t>_org" ON public.<t> FOR ALL TO authenticated
>   USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());
> ```

## 2.1 Enums

```sql
CREATE TYPE automation_state AS ENUM
  ('draft','testing','active','paused','disabled','archived');

CREATE TYPE version_state AS ENUM ('draft','published','archived');

CREATE TYPE node_type AS ENUM
  ('trigger','condition','branch','action','ai_agent','ai_decision',
   'delay','wait_event','approval','loop','webhook','api_call',
   'notification','subflow','end');

CREATE TYPE run_status AS ENUM
  ('pending','running','waiting_delay','waiting_event','waiting_approval',
   'succeeded','failed','canceled','paused','timed_out');

CREATE TYPE node_run_status AS ENUM
  ('pending','running','succeeded','failed','skipped','waiting','canceled','timed_out');

CREATE TYPE trigger_kind AS ENUM ('event','schedule','webhook','manual','api');

CREATE TYPE approval_status AS ENUM
  ('pending','approved','rejected','edited_approved','expired','canceled');

CREATE TYPE job_state AS ENUM ('queued','processing','done','failed','canceled','deferred');

CREATE TYPE run_mode AS ENUM ('live','test','dry_run');

CREATE TYPE risk_level AS ENUM ('low','medium','high','critical');
```

## 2.2 Definição (control plane)

```sql
CREATE TABLE public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  category text,
  state automation_state NOT NULL DEFAULT 'draft',
  published_version_id uuid,                 -- FK adicionada depois (circular)
  draft_version_id uuid,
  -- Principal de execução: a automação age COMO este usuário/serviço.
  run_as_user_id uuid,
  run_as_role text NOT NULL DEFAULT 'automation_service',
  -- Controle de concorrência por entidade alvo
  concurrency_key_template text,             -- ex.: 'lead:{{lead.id}}'
  max_concurrent_runs int NOT NULL DEFAULT 100,
  dedupe_window_seconds int NOT NULL DEFAULT 0,  -- 0 = sem dedupe de disparo
  owner_user_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE public.automation_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  state version_state NOT NULL DEFAULT 'draft',
  -- Snapshot IMUTÁVEL do grafo depois de publicado:
  graph jsonb NOT NULL,                      -- {nodes:[...], edges:[...]}
  graph_hash text NOT NULL,
  validation_report jsonb,
  changelog text,
  published_at timestamptz, published_by uuid,
  archived_at timestamptz,
  created_by uuid, created_at timestamptz DEFAULT now(),
  UNIQUE (automation_id, version_number)
);

ALTER TABLE public.automations
  ADD CONSTRAINT fk_pub_version FOREIGN KEY (published_version_id)
  REFERENCES public.automation_versions(id);

-- Nós e arestas normalizados (espelho consultável do graph, para validação/índices)
CREATE TABLE public.automation_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  version_id uuid NOT NULL REFERENCES public.automation_versions(id) ON DELETE CASCADE,
  node_key text NOT NULL,                    -- estável dentro do grafo
  type node_type NOT NULL,
  label text,
  config jsonb NOT NULL DEFAULT '{}',
  position jsonb,                            -- {x,y} do builder
  on_error text NOT NULL DEFAULT 'fail',     -- fail|continue|route
  error_edge_key text,
  timeout_seconds int,
  retry_policy jsonb,                        -- {max, backoff, retriable_codes}
  risk risk_level NOT NULL DEFAULT 'low',
  UNIQUE (version_id, node_key)
);

CREATE TABLE public.automation_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  version_id uuid NOT NULL REFERENCES public.automation_versions(id) ON DELETE CASCADE,
  from_node_key text NOT NULL,
  to_node_key text NOT NULL,
  branch_key text,                           -- 'true'|'false'|'default'|'timeout'|'error'|<case>
  condition jsonb,
  order_index int NOT NULL DEFAULT 0,
  UNIQUE (version_id, from_node_key, to_node_key, branch_key)
);

CREATE TABLE public.automation_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  version_id uuid NOT NULL REFERENCES public.automation_versions(id) ON DELETE CASCADE,
  kind trigger_kind NOT NULL,
  event_type text,                           -- 'lead.created', 'order.paid', ...
  filter jsonb,                              -- pré-filtro barato antes de criar run
  -- schedule:
  cron_expression text,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  starts_at timestamptz, ends_at timestamptz,
  -- webhook:
  webhook_slug text,
  webhook_secret_ref text,
  is_enabled boolean NOT NULL DEFAULT true,
  UNIQUE (org_id, webhook_slug)
);
CREATE INDEX ON public.automation_triggers (org_id, event_type) WHERE is_enabled;
```

**Regra de versão imutável:** ao publicar, `graph` congela. Editar automação publicada cria **nova versão draft**. `automation_runs.version_id` aponta para a versão usada — execuções antigas nunca mudam de comportamento.

## 2.3 Execução (data plane)

```sql
CREATE TABLE public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  automation_id uuid NOT NULL REFERENCES public.automations(id),
  version_id uuid NOT NULL REFERENCES public.automation_versions(id),
  mode run_mode NOT NULL DEFAULT 'live',
  status run_status NOT NULL DEFAULT 'pending',
  -- origem
  trigger_id uuid REFERENCES public.automation_triggers(id),
  trigger_kind trigger_kind NOT NULL,
  source_event_id uuid,
  triggered_by_user_id uuid,
  -- alvo
  entity_type text, entity_id uuid,
  -- estado de execução
  cursor_node_key text,
  context jsonb NOT NULL DEFAULT '{}',       -- variáveis acumuladas
  step_count int NOT NULL DEFAULT 0,
  max_steps int NOT NULL DEFAULT 500,        -- guarda anti-loop global
  ai_cost_micros bigint NOT NULL DEFAULT 0,
  ai_actions_used int NOT NULL DEFAULT 0,
  -- despertar
  wake_at timestamptz,
  wait_event_type text,
  wait_event_filter jsonb,
  wait_timeout_at timestamptz,
  -- controle
  concurrency_key text,
  idempotency_key text,                      -- evita run duplicado do mesmo evento
  locked_at timestamptz, locked_by text, lock_expires_at timestamptz,
  started_at timestamptz, finished_at timestamptz,
  duration_ms int,
  result jsonb, error jsonb,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  parent_run_id uuid REFERENCES public.automation_runs(id),  -- subflow
  created_at timestamptz DEFAULT now(),
  UNIQUE (org_id, automation_id, idempotency_key)
);

CREATE INDEX ON public.automation_runs (status, wake_at)
  WHERE status IN ('pending','waiting_delay');
CREATE INDEX ON public.automation_runs (org_id, wait_event_type)
  WHERE status = 'waiting_event';
CREATE INDEX ON public.automation_runs (org_id, automation_id, created_at DESC);
CREATE INDEX ON public.automation_runs (concurrency_key)
  WHERE status IN ('pending','running','waiting_delay','waiting_event','waiting_approval');

CREATE TABLE public.automation_run_nodes (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL,
  run_id uuid NOT NULL REFERENCES public.automation_runs(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  node_type node_type NOT NULL,
  attempt int NOT NULL DEFAULT 1,
  status node_run_status NOT NULL DEFAULT 'pending',
  input jsonb, output jsonb,
  chosen_branch text,
  started_at timestamptz, finished_at timestamptz, duration_ms int,
  error jsonb,
  -- rastreabilidade de IA
  ai_agent_id uuid, ai_model text, ai_confidence numeric(4,3),
  ai_tokens_in int, ai_tokens_out int, ai_cost_micros bigint,
  -- rastreabilidade de efeito
  effect_idempotency_key text,
  effect_ref jsonb,                          -- {type:'order', id:'...'}
  created_at timestamptz DEFAULT now(),
  UNIQUE (run_id, node_key, attempt)
);
CREATE INDEX ON public.automation_run_nodes (run_id, created_at);
```

## 2.4 Fila, agendador, aprovações, eventos

```sql
CREATE TABLE public.queued_jobs (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL,
  queue text NOT NULL,                 -- 'automation'|'action'|'ai'|'comm'|'webhook'
  job_type text NOT NULL,
  payload jsonb NOT NULL,
  run_id uuid REFERENCES public.automation_runs(id) ON DELETE CASCADE,
  priority int NOT NULL DEFAULT 5,     -- 1 = maior
  run_after timestamptz NOT NULL DEFAULT now(),
  attempts int NOT NULL DEFAULT 0, max_attempts int NOT NULL DEFAULT 5,
  state job_state NOT NULL DEFAULT 'queued',
  locked_at timestamptz, locked_by text, lock_expires_at timestamptz,
  last_error jsonb,
  dedupe_key text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (queue, dedupe_key)
);
CREATE INDEX ON public.queued_jobs (queue, state, run_after, priority)
  WHERE state IN ('queued','deferred');

CREATE TABLE public.scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  trigger_id uuid REFERENCES public.automation_triggers(id) ON DELETE CASCADE,
  cron_expression text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  next_run_at timestamptz NOT NULL,
  last_run_at timestamptz,
  last_status text,
  is_enabled boolean NOT NULL DEFAULT true,
  misfire_policy text NOT NULL DEFAULT 'skip',   -- skip|run_once|run_all
  UNIQUE (trigger_id)
);
CREATE INDEX ON public.scheduled_jobs (next_run_at) WHERE is_enabled;

CREATE TABLE public.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  run_id uuid NOT NULL REFERENCES public.automation_runs(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  title text NOT NULL, description text,
  risk risk_level NOT NULL DEFAULT 'medium',
  -- o que será feito se aprovado (payload da ação, editável):
  proposed_action jsonb NOT NULL,
  edited_action jsonb,
  entity_type text, entity_id uuid,
  approver_user_id uuid, approver_role text, approver_team_id uuid,
  status approval_status NOT NULL DEFAULT 'pending',
  due_at timestamptz,
  on_timeout text NOT NULL DEFAULT 'reject',   -- reject|approve|route
  decided_by uuid, decided_at timestamptz, decision_note text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX ON public.approvals (org_id, status, due_at);

CREATE TABLE public.event_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,                          -- null = evento de sistema
  event_type text NOT NULL,             -- 'lead.created', 'custom.cliente_60d'
  source_module text NOT NULL,          -- 'leads'|'ai'|'commercial'|'comm'|'automation'|'external'
  payload_schema jsonb NOT NULL,        -- JSON Schema — validado na ingestão
  description text,
  is_custom boolean NOT NULL DEFAULT false,
  detector jsonb,                       -- p/ eventos derivados: query + cadência
  is_enabled boolean NOT NULL DEFAULT true,
  UNIQUE (org_id, event_type)
);

CREATE TABLE public.event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  source_module text NOT NULL,
  entity_type text, entity_id uuid,
  dedupe_key text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  ingested_at timestamptz NOT NULL DEFAULT now(),
  matched_automations int NOT NULL DEFAULT 0,
  processing_status text NOT NULL DEFAULT 'pending', -- pending|processed|no_match|invalid|error
  error jsonb,
  correlation_id uuid,
  UNIQUE (org_id, event_type, dedupe_key)
);
CREATE INDEX ON public.event_logs (org_id, event_type, occurred_at DESC);

CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  trigger_id uuid REFERENCES public.automation_triggers(id),
  source text NOT NULL,
  dedupe_key text NOT NULL,
  signature_valid boolean NOT NULL,
  headers jsonb, payload jsonb NOT NULL,
  process_status text NOT NULL DEFAULT 'received',
  error jsonb,
  received_at timestamptz DEFAULT now(),
  UNIQUE (source, dedupe_key)
);

CREATE TABLE public.idempotency_records (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL,
  scope text NOT NULL,                  -- 'action:create_order'
  idempotency_key text NOT NULL,
  state text NOT NULL DEFAULT 'in_progress',  -- in_progress|succeeded|failed
  result jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (org_id, scope, idempotency_key)
);

CREATE TABLE public.automation_variables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  scope text NOT NULL,                  -- 'global'|'automation'
  automation_id uuid REFERENCES public.automations(id) ON DELETE CASCADE,
  key text NOT NULL, value jsonb, is_secret boolean DEFAULT false,
  secret_ref text,
  UNIQUE (org_id, scope, automation_id, key)
);

CREATE TABLE public.automation_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,                          -- null = template do sistema
  code text NOT NULL, name text NOT NULL, description text,
  category text NOT NULL, graph jsonb NOT NULL,
  required_modules text[] NOT NULL DEFAULT '{}',
  required_capabilities text[] NOT NULL DEFAULT '{}',
  preview jsonb,
  UNIQUE (org_id, code)
);

CREATE TABLE public.automation_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  automation_id uuid REFERENCES public.automations(id) ON DELETE CASCADE,
  subject_type text NOT NULL,           -- 'user'|'role'|'team'
  subject_id text NOT NULL,
  can_view boolean DEFAULT true, can_edit boolean DEFAULT false,
  can_publish boolean DEFAULT false, can_activate boolean DEFAULT false,
  can_pause boolean DEFAULT false, can_delete boolean DEFAULT false,
  can_test boolean DEFAULT false, can_approve boolean DEFAULT false,
  UNIQUE (org_id, automation_id, subject_type, subject_id)
);

CREATE TABLE public.automation_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  kind text NOT NULL,      -- run_failed|error_rate|integration_down|queue_backlog|
                           -- automation_paused|approval_pending|limit_reached
  severity text NOT NULL,
  automation_id uuid, run_id uuid,
  message text NOT NULL, details jsonb,
  acknowledged_by uuid, acknowledged_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id bigserial PRIMARY KEY, org_id uuid NOT NULL,
  actor_type text NOT NULL, actor_id uuid,
  action text NOT NULL, entity_type text NOT NULL, entity_id uuid,
  before_state jsonb, after_state jsonb, ip inet, user_agent text,
  correlation_id uuid, created_at timestamptz DEFAULT now()
);
```

---

# 3. MOTOR — SEMÂNTICA DE EXECUÇÃO

## 3.1 Ciclo do worker

```sql
-- claim atômico, seguro sob concorrência
UPDATE automation_runs SET
  status='running', locked_by=$worker, locked_at=now(),
  lock_expires_at = now() + interval '5 minutes'
WHERE id IN (
  SELECT id FROM automation_runs
  WHERE (status='pending')
     OR (status='waiting_delay'  AND wake_at <= now())
     OR (status='waiting_event'  AND wait_timeout_at <= now())
     OR (status IN ('running') AND lock_expires_at < now())   -- worker morto
  ORDER BY priority_hint, created_at
  FOR UPDATE SKIP LOCKED LIMIT $batch
) RETURNING *;
```

Depois: `step(run)` executa **um** nó → grava `automation_run_nodes` → calcula próximo nó → grava novo estado → commit → libera lock.

`step_count` incrementa a cada nó. Ao passar de `max_steps`, o run falha com `MAX_STEPS_EXCEEDED`. É a rede de segurança final contra ciclos.

## 3.2 Contrato de cada NodeExecutor

```ts
export interface NodeExecutor<C = unknown> {
  type: NodeType;
  validate(config: C, ctx: ValidationCtx): ValidationIssue[];   // build time
  /** Efeitos colaterais? Se sim, exige idempotencyKey e é bloqueado em dry-run. */
  readonly hasSideEffects: boolean;
  readonly risk: RiskLevel;
  execute(input: NodeInput<C>): Promise<NodeOutcome>;
}

export type NodeOutcome =
  | { kind: 'next'; branch?: string; output?: Json; contextPatch?: Json }
  | { kind: 'sleep'; wakeAt: Date }                                    // delay
  | { kind: 'await_event'; eventType: string; filter: Json; timeoutAt: Date; timeoutBranch: string }
  | { kind: 'await_approval'; approvalId: string; timeoutAt?: Date }
  | { kind: 'end'; result?: Json }
  | { kind: 'fail'; error: EngineError; retriable: boolean };
```

`hasSideEffects === true` ⇒ em `mode='dry_run'` o executor **não roda**: registra `status='skipped'` com `output.simulated = <descrição da ação>`. É assim que a simulação (§28 do briefing) é honesta.

## 3.3 Tipos de nó — comportamento exigido

| Nó | Comportamento obrigatório |
|---|---|
| **trigger** | Ponto de entrada. Um por grafo (ou vários, todos entrando no mesmo primeiro nó). Popula `context.event`. |
| **condition** | Avalia expressão; saídas `true`/`false`. Sem efeito colateral. |
| **branch** | N saídas por caso + `default` obrigatório. Primeiro match vence. |
| **action** | Chama porta com `idempotencyKey` derivada de `run_id:node_key:attempt_group`. |
| **ai_agent** | Chama `AiPort.runAgent` com budget; registra modelo, tokens, custo, confiança. |
| **ai_decision** | IA escolhe entre saídas **declaradas no grafo**. Saída fora da lista ⇒ `default`. Registra raciocínio e confiança. Abaixo do limiar de confiança ⇒ rota `low_confidence` (ou aprovação). |
| **delay** | `sleep` com `wakeAt`. Suporta duração relativa, data absoluta, horário e "próximo dia útil". Timezone-aware. |
| **wait_event** | `await_event` com filtro e **timeout obrigatório** + aresta `timeout`. |
| **approval** | Cria `approvals`, `await_approval`. Saídas `approved` / `rejected` / `timeout`. Aprovação editada substitui o payload da ação seguinte. |
| **loop** | Itera coleção com `max_iterations` (default 100, teto duro configurável), `break_condition`, contador no contexto. Sem limite ⇒ validação reprova. |
| **webhook** | Envia HTTP com assinatura HMAC, retry e timeout. |
| **api_call** | HTTP genérico com credencial do cofre, allowlist de host, timeout, sem seguir redirect para IP privado (anti-SSRF). |
| **notification** | Notificação interna (real, sem dependência externa). |
| **subflow** | Executa outra automação publicada como filha; `parent_run_id`; profundidade máxima 5. |
| **end** | Encerra com `result`, opcionalmente marcando sucesso/falha lógica. |

## 3.4 Delays com timezone

Toda expressão temporal é resolvida com a timezone efetiva: `node.config.timezone` → `automation.timezone` → `org.timezone` → `America/Sao_Paulo`. "Esperar até 09:00" significa 09:00 **local**, com DST tratado pelo banco (`timestamptz AT TIME ZONE`). "Próximo dia útil" usa calendário de feriados da org quando existir.

## 3.5 Wait for event — casamento

Quando um evento entra no bus, além de casar triggers, o matcher procura runs adormecidos:

```sql
SELECT id FROM automation_runs
WHERE org_id = $1 AND status='waiting_event' AND wait_event_type = $2
  AND public.jsonb_matches(wait_event_filter, $3)   -- filtro declarativo
FOR UPDATE SKIP LOCKED;
```
Casou ⇒ evento entra em `context.awaited_event`, run volta para `pending` e segue pela aresta normal. Não casou até `wait_timeout_at` ⇒ segue pela aresta `timeout`.

## 3.6 Idempotência das ações

```
effect_idempotency_key = sha256(org_id | run_id | node_key | attempt_group | canonical(payload))
```
`attempt_group` **não** muda entre retries do mesmo passo — muda só quando o operador reexecuta o nó deliberadamente. Antes de chamar a porta: `INSERT INTO idempotency_records ... ON CONFLICT DO NOTHING`. Se já existe `succeeded`, devolve o resultado gravado sem chamar de novo. Se existe `in_progress` há menos do que o timeout, o nó espera; acima disso, é reconciliado.

## 3.7 Retry e classificação de erro

| Classe | Exemplos | Retry |
|---|---|---|
| `transient` | 429, 5xx, timeout, deadlock, conexão | sim — backoff exponencial 30s/2m/10m/1h/6h + jitter |
| `permanent` | 400, 401, 403, 404, validação, regra de negócio | não — falha imediata |
| `blocked` | consentimento ausente, fora da janela do canal, limite de IA | não — segue rota `error`/`blocked`, sem alarme falso |
| `conflict` | idempotência em curso | sim — espera curta |

Ação **sem** chave de idempotência é marcada `non_retriable` na validação: o motor se recusa a repetir o que pode duplicar.

## 3.8 Concorrência e deduplicação de disparo

- `concurrency_key_template` renderizado no disparo (ex.: `lead:{{event.lead.id}}`). Se já existe run ativo com a mesma chave, aplica a política: `skip` · `queue` · `cancel_previous`.
- `dedupe_window_seconds > 0` ⇒ o mesmo evento lógico não cria dois runs dentro da janela.
- `idempotency_key` do run = `sha256(automation_id|version|event_id)` — a reentrega do mesmo evento nunca duplica execução.

---

# 4. CONDIÇÕES E EXPRESSÕES

**Formato declarativo (JSON), nunca `eval`.**

```json
{
  "op": "AND",
  "children": [
    { "op": "gt",       "left": "{{lead.score}}",        "right": 80 },
    { "op": "gte",      "left": "{{opportunity.value}}", "right": 500000 },
    { "op": "within",   "left": "{{contact.last_reply_at}}", "right": { "days": 7 } },
    { "op": "NOT", "children": [ { "op": "contains", "left": "{{lead.tags}}", "right": "descartado" } ] }
  ]
}
```

Operadores: `eq` `neq` `gt` `lt` `gte` `lte` `contains` `not_contains` `exists` `not_exists` `between` `within` `in` `not_in` `matches` (regex com timeout). Combinadores: `AND` `OR` `NOT`.

Regras do avaliador:
- Tipagem estrita com coerção explícita; comparação incoerente ⇒ erro de validação **em tempo de build**, não em produção.
- `null`/ausente nunca é "verdadeiro por acidente": só `exists`/`not_exists` tratam ausência.
- Datas sempre em UTC internamente, exibição em timezone da org.
- Regex com limite de tempo e tamanho (anti-ReDoS).

## 4.1 Variáveis e contexto

Resolução `{{caminho}}` a partir de:
`event` · `lead` · `customer` · `contact` · `opportunity` · `proposal` · `order` · `product` · `conversation` · `message` · `user` · `agent` · `run` (id, versão, tentativa) · `nodes.<key>.output` · `vars` (globais/automação) · `now`.

Filtros: `{{order.total | currency}}`, `{{lead.name | upper}}`, `{{now | date:'dd/MM/yyyy'}}`, `{{x | default:'—'}}`.

**Hidratação preguiçosa:** o contexto guarda referências (`lead.id`), e o resolvedor busca o snapshot pela porta **na hora do uso**, com cache por run. Assim um run que dormiu 3 dias usa dados atuais, não congelados — e o contexto não incha.

Variável inexistente referenciada no grafo ⇒ **publicação bloqueada** (§55 do briefing).

---

# 5. IA NA AUTOMAÇÃO

## 5.1 Nó `ai_decision`

O grafo declara as saídas possíveis. A IA **escolhe entre elas** — nunca inventa uma:

```json
{
  "type": "ai_decision",
  "config": {
    "agent_id": "qualificador",
    "question": "Este lead deve ir para vendas diretas ou nutrição?",
    "outcomes": ["vendas", "nutricao", "descartar"],
    "context_scope": { "lead": true, "conversationHistory": 20, "commercial": ["opportunities"] },
    "min_confidence": 0.7,
    "low_confidence_branch": "revisao_humana",
    "budget": { "max_tokens": 4000, "max_cost_micros": 50000, "timeout_seconds": 60 }
  }
}
```
Registrado em `automation_run_nodes`: agente, modelo, prompt hash, contexto usado, saída escolhida, confiança, tokens, custo, latência. Fora da lista ou abaixo do limiar ⇒ rota alternativa. **A IA nunca escapa do grafo.**

## 5.2 Limites de IA (§15 do briefing)

```sql
CREATE TABLE public.ai_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  scope text NOT NULL,               -- 'org'|'automation'|'run'
  automation_id uuid REFERENCES public.automations(id) ON DELETE CASCADE,
  max_actions_per_run int DEFAULT 20,
  max_cost_micros_per_run bigint DEFAULT 200000,
  max_cost_micros_per_day bigint,
  max_seconds_per_call int DEFAULT 120,
  allowed_tools text[] DEFAULT '{}',
  allowed_channels text[] DEFAULT '{}',
  max_messages_per_run int DEFAULT 3,
  requires_approval_above_risk risk_level DEFAULT 'high',
  UNIQUE (org_id, scope, automation_id)
);
```
Limite estourado ⇒ o run **não** morre em silêncio: para com `AI_LIMIT_EXCEEDED`, gera alerta e, se o grafo tiver rota `limit_exceeded`, segue por ela.

## 5.3 Ferramentas isoladas

O agente chamado pela automação recebe **apenas** as ferramentas de `allowed_tools`. Nada de "todas as ferramentas". Toda chamada de ferramenta é logada com entrada/saída no run.

---

# 6. APROVAÇÃO HUMANA

```
[AÇÃO PREPARADA]  →  approvals(pending, proposed_action, due_at, risk)
        │                    │
        │              notificação ao aprovador
        ▼
   run: waiting_approval  (0 CPU, estado no banco)
        │
   ┌────┼──────────────┬───────────────┐
 APROVAR  REJEITAR   EDITAR+APROVAR   TIMEOUT
   │        │             │              │
 branch   branch      branch 'approved'  on_timeout:
'approved' 'rejected' com edited_action  reject|approve|route
```

- Aprovador por usuário, papel ou equipe; exige `can_approve`.
- **Quem preparou não aprova** quando `risk >= high` (segregação de função configurável).
- Aprovação **editada** substitui o payload; o diff fica auditado.
- `due_at` vencido ⇒ política `on_timeout`; default seguro = `reject`.
- Central de aprovações mostra: automação, ação, entidade, responsável, prazo, risco e o contexto que a IA usou.

---

# 7. VALIDAÇÃO DE WORKFLOW (bloqueia publicação)

Erros (impedem publicação):
1. Sem nó `trigger`, ou trigger inalcançável.
2. Nó órfão (sem aresta de entrada, exceto trigger).
3. Caminho sem terminação: nó não-`end` sem saída, ou `branch` sem `default`.
4. `wait_event` sem timeout ou sem aresta `timeout`.
5. `loop` sem `max_iterations` ou sem condição de saída.
6. Variável `{{...}}` inexistente no escopo daquele ponto do grafo.
7. Ação sem permissão para o `run_as` da automação.
8. Ação com efeito colateral sem chave de idempotência definida.
9. Ciclo no grafo sem nó de controle (loop/delay) no caminho.
10. Referência a template/canal/agente inexistente ou não aprovado.
11. Nó `api_call` para host fora da allowlist.
12. Profundidade de `subflow` acima de 5 ou recursão direta/indireta.

Avisos (permitem publicar, exigem ciência):
- ação de risco `high`/`critical` sem `approval` antes;
- automação sem tratamento de erro em nó de integração;
- delay maior que 90 dias;
- automação que pode disparar a si mesma (evento que ela mesma emite) — exige `dedupe_window` ou trava explícita.

Relatório de validação é gravado em `automation_versions.validation_report` e mostrado no builder com o nó destacado.

---

# 8. MODO TESTE E DRY-RUN

| Modo | Leituras | Efeitos internos (lead, tarefa, oportunidade) | Efeitos externos (mensagem, pedido, pagamento, webhook) | IA |
|---|---|---|---|---|
| `dry_run` | reais | **simulados** | **simulados** | simulada ou real conforme flag (custo real avisado) |
| `test` | reais | reais em registros de teste marcados | **bloqueados** salvo allowlist explícita por nó | reais, com budget reduzido |
| `live` | reais | reais | reais | reais |

- `dry_run` produz o roteiro: *"Se executado agora: 1) qualificar lead X; 2) criar tarefa para Y; 3) solicitar aprovação de Z; 4) enviar template T por WhatsApp"* — cada linha com o payload exato que seria usado.
- Runs de teste têm `mode != 'live'`, aparecem separados no histórico e **nunca** entram nas métricas de produção.
- Toda execução de teste com efeito externo habilitado exige permissão elevada e fica em `audit_logs`.

---

# 9. SEGURANÇA

- **Principal de execução:** cada automação roda como `run_as_user_id` ou como serviço com papel explícito. Toda chamada de porta valida a permissão desse principal. Não existe modo "ignora RLS" para automação de usuário; operações privilegiadas passam por função `security definer` estreita e auditada.
- **Escalada de privilégio bloqueada:** um usuário não pode criar automação que faça o que ele mesmo não pode fazer. Validação compara capacidades das ações com as permissões de `run_as` **e** do autor.
- **Anti-SSRF** em `api_call`/`webhook`: allowlist de hosts, bloqueio de IP privado/loopback/link-local, sem seguir redirect para faixa privada, timeout e limite de resposta.
- **Segredos** só via `secret_ref`/cofre; nunca em `graph`, nunca em log, nunca na resposta da API. Scrubbing obrigatório nos logs.
- **Rate limiting**: por org, por automação, por webhook, por ação externa.
- **Auditoria** de criação, edição, publicação, ativação, pausa, execução, erro, aprovação e mudança de permissão.
- **RLS** em todas as tabelas; teste automatizado de isolamento por tabela.

---

# 10. OBSERVABILIDADE

- `correlation_id` único por run, propagado para todos os módulos chamados. Um erro em COMUNICAÇÃO é rastreável até o nó da automação que o causou.
- Painel operacional: automações ativas, execuções hoje, sucesso/falha, duração média e p95, profundidade das filas por queue, aprovações pendentes, alertas abertos, custo de IA do dia, top automações por volume e por erro.
- Alertas: falha de run, taxa de erro acima do limiar em janela móvel, integração indisponível, backlog de fila, automação pausada automaticamente (circuit breaker), aprovação vencendo, limite de IA atingido.
- **Circuit breaker:** automação com N falhas consecutivas (default 10) é pausada automaticamente, com alerta — evita 10 mil execuções erradas de madrugada.

---

# 11. TEMPLATES PRONTOS (§34–37)

Cada template é um `graph` real, validável e executável — não um desenho.

| Código | Fluxo |
|---|---|
| `novo_lead` | `lead.created` → qualificar (IA) → criar tarefa → notificar vendedor |
| `lead_quente` | `lead.score_changed` → cond `score>80` → IA analisa → prioridade alta → notificar |
| `distribuicao_leads` | `lead.created` → branch por região/produto → round-robin → atribuir |
| `deduplicacao_lead` | `lead.created` → buscar similar → branch → aprovação → merge |
| `nutricao` | `lead.created` + `score<70` → sequência autorizada → wait resposta → reavaliar |
| `proposta_sem_resposta` | `proposal.sent` → delay 2d → wait `proposal.viewed`/resposta (timeout 3d) → follow-up |
| `negociacao` | `proposal.viewed` → IA detecta objeção → sugerir resposta → approval → enviar |
| `pedido_pago` | `payment.completed` → atualizar pedido → reservar estoque → notificar equipe |
| `pos_venda` | `order.delivered` → delay 7d → criar tarefa → comunicação autorizada → pedir avaliação |
| `recompra` | `customer.repurchase_due` → IA analisa → criar oportunidade → recomendar produto → approval → ação |
| `cliente_inativo` | `customer.inactive` (60d) → IA analisa → oportunidade de reativação |
| `estoque_baixo` | `inventory.low` → notificar compras → criar tarefa → bloquear venda quando configurado |
| `oportunidade_parada` | `opportunity.stalled` → IA sugere próximo passo → tarefa → follow-up |
| `sla_atendimento` | `conversation.unanswered` → escalar → notificar gestor |
| `classificar_mensagem` | `message.received` → IA classifica → taguear → rotear |
| `meta_comissao` | agendado mensal → calcular → relatório → notificar |

Aplicar template = clonar `graph` em uma automação nova em **draft**, com relatório do que precisa configurar (canal, template de mensagem, agente, aprovador). Nunca publica sozinho.

---

# 12. EVENTOS CANÔNICOS

`lead.created` · `lead.updated` · `lead.score_changed` · `lead.assigned` · `lead.qualified`
`customer.created` · `customer.updated` · `customer.inactive` · `customer.repurchase_due`
`opportunity.created` · `opportunity.stage_changed` · `opportunity.stalled` · `opportunity.won` · `opportunity.lost`
`proposal.created` · `proposal.sent` · `proposal.viewed` · `proposal.accepted` · `proposal.rejected` · `proposal.expired`
`order.created` · `order.confirmed` · `order.shipped` · `order.delivered` · `order.canceled`
`payment.pending` · `payment.completed` · `payment.failed` · `payment.refunded`
`inventory.low` · `inventory.out`
`message.received` · `message.sent` · `message.failed` · `conversation.created` · `conversation.assigned` · `conversation.unanswered` · `conversation.closed`
`task.created` · `task.overdue` · `task.completed`
`ai.agent.completed` · `ai.action.approved`
`automation.run.failed` · `automation.approval.pending`
`custom.*` (definidos pela org)

**Eventos derivados** (`customer.inactive`, `customer.repurchase_due`, `opportunity.stalled`, `task.overdue`) não vêm de outro módulo: um **detector agendado** os produz a partir de uma query declarativa em `event_definitions.detector`, com deduplicação por entidade + janela — para não emitir "cliente inativo" todo dia para o mesmo cliente.

Ingestão valida o payload contra `payload_schema`. Evento inválido é rejeitado e logado, nunca processado "na sorte".

---

# 13. TRATAMENTO DE ERROS — TAXONOMIA

| Código | Causa | Comportamento |
|---|---|---|
| `TRIGGER_FILTER_INVALID` | filtro malformado | trigger desabilitado + alerta |
| `EVENT_SCHEMA_INVALID` | payload fora do schema | evento rejeitado, logado |
| `CONDITION_TYPE_MISMATCH` | comparação incoerente | erro de validação em build |
| `VARIABLE_NOT_FOUND` | `{{x}}` inexistente | publicação bloqueada; em runtime, rota de erro |
| `PERMISSION_DENIED` | `run_as` sem permissão | run falha, alerta, sem retry |
| `ACTION_NOT_IDEMPOTENT` | efeito sem chave | validação bloqueia publicação |
| `IDEMPOTENCY_CONFLICT` | execução em curso | espera curta e reconcilia |
| `AI_LIMIT_EXCEEDED` | budget/ações/tempo | para, alerta, rota `limit_exceeded` |
| `AI_LOW_CONFIDENCE` | abaixo do limiar | rota `low_confidence`/aprovação |
| `APPROVAL_TIMEOUT` | prazo vencido | política `on_timeout` |
| `WAIT_TIMEOUT` | evento não veio | aresta `timeout` |
| `LOOP_LIMIT_EXCEEDED` | iterações estouradas | falha controlada |
| `MAX_STEPS_EXCEEDED` | ciclo global | falha + alerta crítico |
| `INTEGRATION_UNAVAILABLE` | módulo/API fora | retry com backoff; circuit breaker |
| `CHANNEL_BLOCKED` | consentimento/janela | rota `blocked`, sem alarme falso |
| `SSRF_BLOCKED` | host não permitido | falha imediata + alerta de segurança |
| `WORKER_LOST` | lock expirado | retomada automática do último nó |

---

# 14. TESTES OBRIGATÓRIOS

**Unitários:** avaliador de condições (matriz completa de operadores, nulos, tipos); resolvedor de variáveis e filtros; cálculo de `next_run_at` com cron + timezone + DST; classificador de erro; derivação de chave de idempotência (estável entre retries, diferente entre payloads).

**Motor:**
- run atravessa grafo linear e grava um `run_node` por nó;
- `delay` de 3 dias não ocupa worker e acorda no instante certo (relógio simulado);
- `wait_event` casa evento correto, ignora evento errado, e cai em `timeout`;
- `approval` aprovada/rejeitada/editada/expirada segue as 4 rotas;
- `loop` respeita `max_iterations` e `break_condition`;
- ciclo sem controle é bloqueado na publicação e, se forçado, morre em `MAX_STEPS_EXCEEDED`;
- worker morto no meio de um nó: lock expira, outro worker retoma **sem duplicar efeito**;
- 3 workers concorrentes não processam o mesmo run;
- retry de ação com efeito não duplica (idempotência comprovada com contagem no destino);
- versão publicada nova não altera runs em andamento.

**Integração por porta:** cada ação de LEADS/COMERCIAL/COMUNICAÇÃO/IA testada com adapter real contra ambiente de teste, incluindo falha 429/500/401 e comportamento esperado.

**Segurança:** RLS por tabela; usuário sem `can_publish` não publica; automação não faz ação que o `run_as` não pode; `api_call` para `127.0.0.1`/IP privado é bloqueado; segredo nunca aparece em log/API/graph.

**Dry-run:** nenhum efeito externo é emitido — verificado por espião nas portas com asserção de zero chamadas mutantes.

**E2E:** os templates `novo_lead`, `proposta_sem_resposta`, `pedido_pago`, `pos_venda` e `recompra` executados ponta a ponta com relógio simulado e verificação do estado final em cada módulo.

---

# 15. ETAPAS → COMANDOS

| Etapa (§62) | Comandos |
|---|---|
| 1 Arquitetura | CMD-00, CMD-01 |
| 2 Banco | CMD-02 |
| 3 Event Bus | CMD-03 |
| 4 Automation Engine | CMD-04 |
| 5 Triggers | CMD-05 |
| 6 Conditions/Variáveis | CMD-06 |
| 7 Actions | CMD-07 |
| 8 Workflow Builder | CMD-08, CMD-09 (validação) |
| 9 Scheduler | CMD-10 |
| 10 Queues/Workers | CMD-11 |
| 11 Delays e Wait | CMD-12 |
| 12 Approvals | CMD-13 |
| 13–16 Integrações | CMD-14 (Leads), CMD-15 (IA), CMD-16 (Comercial), CMD-17 (Comunicação) |
| 17 Templates + teste/dry-run | CMD-18 |
| 18 Dashboard/métricas | CMD-19 |
| 19 Logs e auditoria | CMD-20 |
| 20 Segurança | CMD-21 |
| 21–23 Testes/Doc/Auditoria | CMD-22, CMD-23 |

---

# 16. COMANDOS DE EXECUÇÃO

> Cole o §0 antes de cada comando. Um comando por mensagem. Exija o Relatório de Etapa (§16.2).

---

## CMD-00 — Diagnóstico e plano (NÃO IMPLEMENTAR)

```
Antes de qualquer código, faça o diagnóstico do projeto e me entregue um relatório.
NÃO altere nenhum arquivo neste comando.

1. Stack, runtime do servidor, roteamento, build.
2. Banco: engine, migrations, RLS, multi-tenant, como org_id é resolvido.
3. Autenticação, papéis e permissões existentes.
4. O que JÁ EXISTE das FASES 1 a 4: para cada módulo, liste tabelas, serviços,
   rotas e EVENTOS já emitidos (com caminho de arquivo). Diga o que NÃO existe.
5. EXISTE outbox transacional / event bus? Existe fila? Existe scheduler/cron?
   Se não existirem, proponha o mecanismo viável NESTA stack, considerando que o
   runtime pode ser serverless (sem processo de longa duração).
6. Contratos de API já disponíveis para: criar lead, criar tarefa, criar
   oportunidade, criar proposta, criar pedido, reservar estoque, enviar mensagem,
   iniciar sequência, executar agente. Diga quais existem e quais faltam.
7. Quais desses contratos já aceitam chave de idempotência? Liste os que não aceitam
   (serão o maior risco desta fase).
8. Como a Fase 4 emite eventos hoje e como a Fase 5 vai consumi-los.
9. Cofre de segredos disponível no servidor.
10. Conflitos e riscos com o que já existe.
11. Proponha a arquitetura final do motor (control plane x data plane, execução por
    passos, scheduler, filas) e o plano de execução por etapas.

Saída: relatório em markdown + tabela "existe / falta / decisão" + tabela de eventos
disponíveis por módulo. Termine perguntando o que preciso confirmar antes do CMD-01.
```

---

## CMD-01 — Fundação do módulo, tipos e portas

```
Crie o esqueleto do módulo ECOMIM AUTOMAÇÕES. Sem UI, sem banco ainda.

1. Estrutura: src/modules/automation/{engine,nodes,triggers,conditions,actions,
   ports,adapters,queue,scheduler,webhooks,validation,types,utils}
2. Tipos canônicos: NodeType, NodeInput, NodeOutcome (next|sleep|await_event|
   await_approval|end|fail), RunStatus, RunMode, RiskLevel, EngineError,
   Scope, Ref, PreflightVerdict.
3. Interface NodeExecutor exatamente como na especificação (validate, hasSideEffects,
   risk, execute) + NodeRegistry com resolução por tipo e erro claro se ausente.
4. Portas LeadsPort, CommercialPort, CommPort, AiPort como interfaces, TODAS com
   parâmetro de idempotência nos métodos que causam efeito.
   Adapters "não conectados" que lançam NOT_WIRED — jamais retornam dado falso.
5. Taxonomia de erros da especificação como classes, com classificação
   transient|permanent|blocked|conflict e helper isRetriable().
6. Logger com correlation_id e scrubbing de segredos.
7. Função deriveIdempotencyKey(run_id, node_key, attempt_group, payload) determinística
   com canonicalização estável do JSON (ordem de chaves).
8. Testes: registry; classificação de erro; chave de idempotência estável entre
   retries e diferente entre payloads; scrubbing.

Não crie tabelas. Não crie UI. Não implemente nós ainda.
```

---

## CMD-02 — Banco completo do módulo

```
Crie as migrations com o padrão de segurança do bloco de contexto.

Enums: automation_state, version_state, node_type, run_status, node_run_status,
trigger_kind, approval_status, job_state, run_mode, risk_level.

Tabelas: automations, automation_versions, automation_nodes, automation_edges,
automation_triggers, automation_runs, automation_run_nodes, queued_jobs,
scheduled_jobs, approvals, event_definitions, event_logs, webhook_events,
idempotency_records, automation_variables, automation_templates,
automation_permissions, automation_alerts, ai_limits, audit_logs.

Obrigatório:
- org_id em todas, RLS, GRANTs, policy por current_org_id().
- Todos os índices da especificação, inclusive os parciais de wake_at,
  waiting_event, concurrency_key e fila.
- UNIQUEs de idempotência: automation_runs (org_id, automation_id, idempotency_key);
  idempotency_records (org_id, scope, idempotency_key);
  event_logs (org_id, event_type, dedupe_key); webhook_events (source, dedupe_key).
- Trigger impedindo alteração de automation_versions.graph quando state='published'
  (versão publicada é imutável).
- Trigger de updated_at; numeração automática de version_number por automação.
- Função current_org_id() e has_role() reutilizadas do que já existe, se existirem.

Entregue smoke tests SQL provando: RLS bloqueia cross-org; graph publicado não pode
ser alterado; run duplicado pelo mesmo idempotency_key falha; índice parcial de
wake_at é usado (EXPLAIN).
```

---

## CMD-03 — Event Bus e ingestão de eventos

```
Implemente o barramento de eventos.

1. event_definitions com JSON Schema por evento; seed com TODOS os eventos canônicos
   da especificação, marcando quais já são realmente emitidos pelas fases 1–4 e quais
   estão PENDENTES de emissão (documentar, não inventar).
2. Ingestão: publishEvent(org, type, payload, source, dedupeKey?) que valida contra o
   schema, grava event_logs com deduplicação e retorna o id. Payload inválido é
   rejeitado com erro claro, nunca processado parcialmente.
3. Consumo do outbox transacional dos módulos existentes (ou criação do outbox onde
   faltar, junto com os módulos, sem reescrever a lógica deles).
4. TriggerMatcher: dado um evento, encontra triggers habilitados por org+event_type,
   aplica o pré-filtro barato e cria automation_runs (status=pending) com
   idempotency_key = hash(automation, version, event_id). Consulta indexada;
   nada de varrer todas as automações.
5. Casamento de runs adormecidos em waiting_event (filtro declarativo jsonb_matches).
6. Detectores agendados para eventos derivados: customer.inactive,
   customer.repurchase_due, opportunity.stalled, task.overdue — com query declarativa
   e deduplicação por entidade + janela, para não reemitir todo dia.
7. Eventos customizados por org: CRUD de definição + detector.
8. Testes: schema inválido rejeita; mesmo evento entregue 2x cria 1 run;
   evento casa o run adormecido certo e ignora o errado; detector não duplica.
```

---

## CMD-04 — Automation Engine (núcleo)

```
Implemente o motor de execução por passos. Este é o comando mais importante da fase.

1. Worker loop com claim atômico (UPDATE ... FOR UPDATE SKIP LOCKED) cobrindo:
   pending, waiting_delay vencido, waiting_event com timeout vencido e
   running com lock_expires_at vencido (worker morto).
2. step(run): carrega versão + grafo (cache por version_id, grafo é imutável),
   resolve o nó do cursor, executa UM nó, grava automation_run_nodes,
   calcula próximo nó pela aresta/branch, grava novo estado e solta o lock.
   Tudo em transação. Reenfileira imediatamente se o próximo passo é imediato.
3. Tratamento de NodeOutcome: next, sleep, await_event, await_approval, end, fail.
4. Retry por nó com política do nó (max, backoff exponencial com jitter,
   códigos recuperáveis) e classificação transient|permanent|blocked|conflict.
5. Guardas: step_count vs max_steps; profundidade de subflow (máx 5, sem recursão);
   timeout por nó; lock com expiração.
6. Concorrência: concurrency_key com políticas skip|queue|cancel_previous;
   dedupe_window_seconds no disparo.
7. Idempotência de efeito: idempotency_records com estados in_progress/succeeded/
   failed, reconciliação e reuso do resultado gravado.
8. Circuit breaker: N falhas consecutivas pausa a automação e gera alerta.
9. Implemente apenas os nós sem dependência externa: trigger, condition, branch,
   delay, end, notification (interna). Os demais entram nos comandos seguintes.
10. Testes: grafo linear; 3 workers concorrentes não pegam o mesmo run; worker morto
    é retomado sem duplicar; max_steps corta ciclo; retry respeita backoff;
    delay não ocupa worker (relógio simulado).
```

---

## CMD-05 — Triggers

```
Implemente todos os tipos de gatilho.

1. Trigger de evento: vinculado a event_type + filtro declarativo, com pré-filtro
   avaliado ANTES de criar run (barato, indexado).
2. Trigger de tempo: cron com timezone, data específica, recorrência, janela
   starts_at/ends_at, política de misfire (skip|run_once|run_all).
3. Trigger de webhook: slug único por org, segredo no cofre, validação HMAC do corpo
   cru, dedupe, resposta 200 rápida com processamento assíncrono.
4. Trigger manual: executar automação sobre uma entidade selecionada, com permissão.
5. Trigger por API: endpoint autenticado com Idempotency-Key obrigatório.
6. Trigger condicional (mudança de score, valor, etapa, status, comportamento):
   comparar estado anterior x novo a partir do payload do evento; se o módulo de
   origem não envia o estado anterior, documentar a limitação e implementar
   snapshot no próprio módulo de automações, sem inventar dado.
7. UI de configuração do gatilho com pré-visualização de quantos registros
   corresponderiam ao filtro hoje.
8. Testes: filtro reduz corretamente; cron respeita timezone e DST; webhook com
   assinatura inválida retorna 401 sem criar run; webhook duplicado cria 1 run;
   trigger manual exige permissão.
```

---

## CMD-06 — Condições, variáveis e contexto

```
Implemente o avaliador declarativo e o sistema de variáveis.

1. Avaliador JSON puro (SEM eval/Function). Operadores: eq, neq, gt, lt, gte, lte,
   contains, not_contains, exists, not_exists, between, within, in, not_in, matches.
   Combinadores AND, OR, NOT, aninhados.
2. Tipagem estrita: comparação incoerente é erro de VALIDAÇÃO em build.
   Null/ausente nunca vira verdadeiro por acidente. Regex com timeout e limite.
3. Datas: tudo UTC internamente; comparações relativas (within/between) com timezone
   da org; suporte a "últimos N dias", "próximos N dias", "entre datas".
4. Resolvedor de variáveis {{...}} com os escopos da especificação
   (event, lead, customer, contact, opportunity, proposal, order, product,
   conversation, message, user, agent, run, nodes.<key>.output, vars, now).
5. HIDRATAÇÃO PREGUIÇOSA: o contexto guarda referências; o snapshot é buscado pela
   porta no momento do uso, com cache por run. Um run que dormiu 3 dias usa dado atual.
6. Filtros: currency, upper, lower, date, default, number, truncate.
7. Introspecção: dado um ponto do grafo, retornar as variáveis disponíveis (para o
   autocomplete do builder e para a validação de variável inexistente).
8. Testes: matriz completa de operadores incluindo nulos e tipos errados;
   variável inexistente detectada; hidratação preguiçosa traz dado atualizado;
   ReDoS não derruba o avaliador.
```

---

## CMD-07 — Action Engine (ações internas)

```
Implemente o motor de ações e as ações internas do módulo.

1. ActionRegistry: cada ação declara schema de entrada (Zod), permissão exigida,
   nível de risco, se tem efeito colateral e como deriva a chave de idempotência.
2. Envelope de execução comum: validar entrada → verificar permissão do run_as →
   checar idempotency_records → executar via porta → gravar resultado e effect_ref →
   classificar erro → decidir retry.
3. Ações internas do próprio módulo (sem depender de outros): criar notificação,
   registrar evento, definir variável de contexto, criar alerta, agendar novo run,
   cancelar run, chamar subflow.
4. Nós webhook (saída, com HMAC, retry, timeout) e api_call (allowlist de host,
   bloqueio de IP privado/loopback, sem redirect para faixa privada, timeout,
   limite de tamanho de resposta, credencial do cofre).
5. Registro completo em automation_run_nodes: entrada, saída, duração, tentativa,
   erro, chave de idempotência e referência do efeito.
6. Ações de outros módulos entram nos CMD-14 a CMD-17 — aqui apenas o registry e
   os adapters NOT_WIRED, que devem falhar de forma explícita.
7. Testes: ação sem permissão falha sem executar; retry não duplica efeito;
   api_call para IP privado é bloqueado; webhook de saída reenvia com backoff.
```

---

## CMD-08 — Workflow Builder (editor visual)

```
Construa o editor visual de workflows.

1. Canvas com drag and drop, zoom, pan, minimapa, seleção múltipla, alinhamento,
   atalhos de teclado, desfazer/refazer.
2. Paleta de nós com todos os tipos; conexão por arrastar entre portas de saída;
   arestas rotuladas por branch (true/false/default/timeout/error/approved/rejected).
3. Painel de configuração por nó, gerado a partir do schema Zod da ação/nó, com
   autocomplete de variáveis disponíveis NAQUELE ponto do grafo (usa a introspecção
   do CMD-06).
4. Operações: adicionar, remover, conectar, desconectar, editar, duplicar, mover,
   colar, agrupar visualmente.
5. Persistência: autosave em versão DRAFT; nunca altera versão publicada.
   Diff visual entre versões; restaurar versão anterior criando nova draft.
6. Validação em tempo real no canvas: nós com problema destacados, lista lateral de
   erros e avisos com clique para focar o nó.
7. Responsivo o suficiente para uso em telas menores (leitura e ajustes simples);
   edição completa em desktop.
8. Testes E2E: criar grafo do zero, conectar, salvar, recarregar idêntico;
   desfazer/refazer; editar automação publicada cria nova draft e não afeta runs ativos.
```

---

## CMD-09 — Validação e ciclo de vida (draft → publicado)

```
Implemente a validação de workflow e o versionamento.

1. ValidationService com TODOS os erros bloqueantes da especificação:
   sem trigger, nó órfão, caminho sem terminação, branch sem default,
   wait_event sem timeout/aresta, loop sem limite ou sem saída, variável inexistente,
   ação sem permissão do run_as, ação com efeito sem chave de idempotência,
   ciclo sem nó de controle, referência inexistente, api_call fora da allowlist,
   subflow recursivo ou acima da profundidade máxima.
2. Avisos: risco alto sem approval, nó de integração sem tratamento de erro,
   delay maior que 90 dias, automação que pode disparar a si mesma sem dedupe.
3. Publicação: valida → congela graph → cria automation_versions publicada →
   aponta published_version_id → registra changelog e auditoria.
   Publicação com erro é REJEITADA. Sem exceções.
4. Estados: draft, testing, active, paused, disabled, archived, com transições
   permitidas explícitas e permissão exigida para cada uma.
5. Comparar versões (diff de nós, arestas e configs) e restaurar.
6. Pausar/retomar/cancelar EXECUÇÕES individualmente, preservando estado; pausar a
   automação inteira não mata runs em andamento (política configurável).
7. Testes: cada regra bloqueante tem um teste que prova a rejeição; publicar não
   altera runs em andamento; restaurar versão cria draft e não republica sozinha.
```

---

## CMD-10 — Scheduler

```
Implemente o agendador.

1. Parser de cron com timezone (IANA), cálculo correto de next_run_at atravessando
   horário de verão e mudanças de fuso.
2. scheduled_jobs com tick idempotente: um tick só dispara uma vez por ocorrência,
   mesmo com múltiplos workers ou tick duplicado (chave de idempotência por
   trigger_id + occurrence timestamp).
3. Políticas de misfire (servidor parado): skip, run_once, run_all com limite.
4. Suporte a: execução única, diária, semanal, mensal, recorrente, calendário,
   horários específicos, "próximo dia útil" com calendário de feriados da org.
5. Se o runtime for serverless sem cron nativo, implemente o tick pelo mecanismo
   disponível identificado no CMD-00 (job agendado do banco chamando o endpoint
   interno, ou o agendador da plataforma) — documente a escolha e o failover.
6. Painel: próximos disparos, últimos disparos, atrasos.
7. Testes com relógio simulado: DST entrada e saída; tick duplicado dispara uma vez;
   misfire com cada política; recorrência mensal em dia 31.
```

---

## CMD-11 — Filas e workers

```
Implemente o sistema de filas.

1. Filas separadas: automation, action, ai, comm, webhook — com concorrência,
   prioridade e limites configuráveis por fila.
2. Claim com FOR UPDATE SKIP LOCKED, lock com expiração, heartbeat do worker,
   recuperação automática de jobs órfãos.
3. Retry com backoff exponencial e jitter, max_attempts, dead-letter com motivo,
   reprocessamento manual a partir da UI.
4. Deduplicação por dedupe_key. Rate limit por org e por fila.
5. Backpressure: quando a fila passa do limiar, gerar alerta e degradar
   graciosamente (adiar automações de baixa prioridade, nunca perder job).
6. Painel de filas: profundidade, taxa de processamento, idade do job mais antigo,
   falhas, dead-letter, ações de retentar/cancelar em massa.
7. Testes: 5 workers concorrentes sem processamento duplo; job órfão recuperado;
   dead-letter após max_attempts; dedupe funciona; ordenação por prioridade.
```

---

## CMD-12 — Delays e Wait for Event

```
Implemente os nós temporais.

1. Nó delay: duração relativa (minutos/horas/dias), data absoluta, horário do dia,
   "próximo dia útil", com timezone efetiva (nó > automação > org > padrão).
   Implementado como sleep no banco: ZERO consumo enquanto espera.
2. Nó wait_event: tipo de evento + filtro declarativo sobre o payload e sobre o
   contexto do run (ex.: mensagem DO MESMO contato), timeout OBRIGATÓRIO e
   aresta de timeout obrigatória.
3. Casamento eficiente: índice por (org_id, wait_event_type) com status
   waiting_event; casar e acordar em transação, sem corrida entre dois eventos
   simultâneos.
4. Cancelamento de espera quando o run é cancelado ou a entidade alvo é excluída.
5. UI: mostrar no histórico "aguardando até <data>" e "aguardando evento X até <data>",
   com contagem regressiva.
6. Testes com relógio simulado: delay de 3 dias acorda no minuto certo; DST não
   desloca o horário local; dois eventos simultâneos acordam o run uma única vez;
   timeout segue a aresta correta; run cancelado não acorda depois.
```

---

## CMD-13 — Aprovações

```
Implemente o nó de aprovação e a central de aprovações.

1. Nó approval: cria approvals com título, descrição, risco, proposed_action
   (payload exato da ação seguinte), entidade, aprovador (usuário, papel ou equipe),
   prazo e política de timeout (reject|approve|route). Run entra em waiting_approval.
2. Decisões: aprovar, rejeitar, aprovar com edição (edited_action substitui o payload
   e o diff fica auditado). Cada decisão exige can_approve e é registrada com autor,
   horário e nota.
3. Segregação de função: para risco high/critical, quem disparou não pode aprovar
   (configurável por org).
4. Timeout: política aplicada automaticamente pelo worker; default seguro = reject.
5. Central de aprovações: fila por prazo e risco, filtros, visão do contexto usado
   (inclusive o que a IA considerou), ações em lote quando o risco for baixo.
6. Notificações ao aprovador na criação, lembrete antes do prazo e aviso no timeout.
7. Testes: as 4 rotas (aprovado, rejeitado, editado, timeout); edição altera o payload
   realmente executado; usuário sem permissão não decide; aprovação dupla concorrente
   é resolvida uma única vez.
```

---

## CMD-14 — Integração com ECOMIM LEADS

```
Implemente o LeadsAdapter e as ações de leads.

1. Adapter real sobre os serviços existentes da Fase 1. Não reescrever a Fase 1.
   Se um serviço necessário não existir, criar no módulo de leads seguindo o padrão
   dele, com idempotência.
2. Ações: criar lead, atualizar lead, definir score com motivo, adicionar/remover tag,
   atribuir responsável, mover etapa, qualificar, marcar como duplicado, mesclar
   (com aprovação obrigatória).
3. Eventos consumidos: lead.created, lead.updated, lead.score_changed, lead.assigned,
   lead.qualified. Se a Fase 1 ainda não emite algum, implementar a emissão via outbox
   transacional no ponto correto do fluxo.
4. Templates prontos: novo_lead, lead_quente, distribuicao_leads, nutricao,
   deduplicacao_lead — todos executáveis e validados.
5. Distribuição: round-robin, por carga, por região/produto, com fila de não atribuídos.
6. Testes: cada ação com idempotência comprovada; distribuição não atribui o mesmo
   lead duas vezes sob concorrência; template novo_lead roda ponta a ponta.
```

---

## CMD-15 — Integração com ECOMIM IA

```
Conecte o motor aos agentes da Fase 2 pela AiPort. Não reimplemente IA.

1. Nó ai_agent: executa agente com escopo de contexto explícito, ferramentas
   restritas a allowed_tools, budget (tokens, custo, tempo) e timeout.
   Registra agente, modelo, hash do prompt, contexto usado, tokens, custo,
   latência e resultado.
2. Nó ai_decision: a IA escolhe entre saídas DECLARADAS no grafo. Saída fora da lista
   cai em default. Confiança abaixo do min_confidence segue low_confidence_branch
   ou vira aprovação. A IA nunca escapa do grafo.
3. ai_limits por org/automação/run: máximo de ações, custo, tempo, ferramentas,
   canais, mensagens, e risco a partir do qual exige aprovação.
   Limite estourado para com AI_LIMIT_EXCEEDED, alerta e rota alternativa.
4. Ações de IA: analisar lead, qualificar, analisar oportunidade, gerar mensagem,
   resumir conversa, prever recompra, recomendar produto, classificar cliente,
   gerar relatório — cada uma com schema de saída validado (structured output),
   nunca texto livre interpretado na sorte.
5. Acúmulo de custo em automation_runs.ai_cost_micros e painel de consumo por
   automação e por dia.
6. Testes: budget estourado interrompe; saída inválida cai em default e é logada;
   ferramentas fora da allowlist são recusadas; contexto nunca inclui outra org;
   decisão registrada com confiança e caminho escolhido.
```

---

## CMD-16 — Integração com ECOMIM COMERCIAL

```
Implemente o CommercialAdapter e as ações comerciais.

1. Ações: criar/atualizar cliente, criar oportunidade, mover etapa, criar proposta,
   criar pedido, reservar estoque, criar tarefa, registrar pós-venda,
   marcar recompra prevista. TODAS com idempotência de ponta a ponta —
   um retry NÃO pode gerar segundo pedido, segunda reserva ou segunda proposta.
2. Eventos consumidos: opportunity.*, proposal.*, order.*, payment.*, inventory.low,
   customer.inactive, customer.repurchase_due. Implementar emissão via outbox onde faltar.
3. Detectores derivados: cliente inativo (N dias sem compra), recompra prevista
   (ciclo médio do cliente), oportunidade parada (N dias na mesma etapa) —
   com deduplicação por entidade e janela.
4. Templates: pedido_pago, pos_venda, recompra, cliente_inativo, estoque_baixo,
   oportunidade_parada, proposta_sem_resposta, negociacao, meta_comissao.
5. Ações financeiras e de estoque exigem aprovação por padrão quando o valor
   ultrapassar o limite configurado pela org.
6. Testes: retry de criar pedido gera 1 pedido (contagem no banco comercial);
   reserva de estoque concorrente não estoura o saldo; template pedido_pago
   ponta a ponta; detector de recompra não reemite diariamente.
```

---

## CMD-17 — Integração com ECOMIM COMUNICAÇÃO

```
Implemente o CommAdapter e as ações de comunicação.

1. Ações: enviar mensagem, enviar template, enviar e-mail, iniciar sequência,
   iniciar campanha autorizada, responder conversa, atribuir conversa,
   marcar prioridade, adicionar nota interna.
2. PREFLIGHT OBRIGATÓRIO antes de qualquer envio: chamar CommPort.preflight e
   respeitar consentimento, opt-out, janela do canal, limites anti-spam e
   horário permitido. Bloqueio NÃO é falha da automação: segue rota 'blocked'
   e é registrado com o motivo, sem alerta falso de erro.
3. Toda mensagem enviada por automação é marcada com a origem (automação, versão,
   run, nó) na Fase 4, para rastreabilidade na conversa.
4. Nível de autonomia: respeitar as políticas de envio por IA da Fase 4
   (L1 sugere, L2 aprova, L3 automático permitido, L4 limitado).
   Categoria sem política = exige aprovação.
5. Eventos consumidos: message.received, message.sent, message.failed,
   conversation.unanswered, conversation.closed. Resposta do cliente deve
   acordar runs em wait_event e parar sequências conforme configurado.
6. Templates: follow-up, classificar_mensagem, sla_atendimento, resposta assistida.
7. Testes: contato com opt-out nunca recebe (rota blocked, zero envio);
   fora da janela do WhatsApp exige template; retry não envia duas mensagens;
   resposta do cliente acorda o run e para a sequência.
```

---

## CMD-18 — Templates, modo teste e dry-run

```
Implemente a biblioteca de templates e os modos de execução não produtivos.

1. Cadastrar TODOS os templates da especificação como grafos reais, validados,
   com required_modules e required_capabilities declarados.
   Aplicar template cria automação em DRAFT com relatório do que falta configurar
   (canal, template de mensagem, agente, aprovador, limites). Nunca publica sozinho.
2. Modo DRY-RUN: executa o grafo com leituras reais; todo nó com hasSideEffects é
   marcado 'skipped' com a descrição exata do que seria feito e o payload que seria
   enviado. Saída: roteiro numerado "Se executado agora, esta automação faria: ...".
3. Modo TEST: efeitos internos em registros marcados como teste; efeitos externos
   BLOQUEADOS salvo allowlist explícita por nó, exigindo permissão elevada e
   registro em auditoria.
4. Simulador de evento: escolher uma entidade real, montar o payload do evento e
   executar; visualizar o caminho percorrido destacado no grafo, decisões,
   condições avaliadas (com os valores reais comparados) e ações previstas.
5. Runs de teste ficam separados no histórico e NUNCA entram nas métricas de produção.
6. Testes: espião nas portas prova ZERO chamadas mutantes em dry-run;
   modo test não envia mensagem real; caminho destacado corresponde ao executado.
```

---

## CMD-19 — Dashboard, monitoramento e métricas

```
Implemente a camada de observabilidade.

1. Dashboard: automações ativas, execuções hoje/7d/30d, taxa de sucesso e falha,
   duração média e p95, aprovações pendentes, profundidade das filas, alertas abertos,
   custo de IA do dia e do mês, top automações por volume e por erro.
2. Histórico de execuções com filtros (automação, versão, status, período, entidade,
   usuário, agente, modo) e busca por correlation_id.
3. Detalhe da execução: linha do tempo dos nós com entrada, saída, duração, tentativa,
   erro e branch escolhido; grafo com o caminho percorrido destacado;
   ações executadas com link para a entidade criada/alterada.
4. Alertas da especificação, com limiares configuráveis, agrupamento para não
   inundar, reconhecimento e histórico. Circuit breaker integrado.
5. Métricas agregadas por views/materialized views com refresh incremental —
   nada de agregação pesada em tempo de request.
6. Exportação de execuções e métricas (CSV/XLSX) assíncrona com link assinado.
7. Testes: números do dashboard batem com contagem direta em cenário semeado;
   runs de teste não entram nas métricas; alerta dispara no limiar e não repete
   em tempestade.
```

---

## CMD-20 — Logs, auditoria e API

```
Implemente rastreabilidade completa e a API do módulo.

1. Auditoria de: criação, edição, publicação, ativação, pausa, desativação,
   arquivamento, execução manual, cancelamento, aprovação, alteração de permissão,
   alteração de limites de IA e alteração de segredo (sem o valor).
2. correlation_id propagado da UI ao motor, às portas e aos módulos destino;
   busca unificada por correlation_id atravessando os módulos.
3. Retenção configurável: logs de nó detalhados com prazo curto; resumo de execução
   com prazo longo; job de expurgo com registro do que foi removido.
4. REST v1 em /api/v1/automation/*: automations, versions, triggers, actions
   (catálogo), runs, run-nodes, approvals, queues, events, templates, metrics.
5. Autenticação por API key com escopos, rate limit por chave, paginação por cursor,
   erros padronizados com a taxonomia do módulo, Idempotency-Key OBRIGATÓRIO em
   POST que dispara execução.
6. Webhooks de saída para sistemas externos (run concluído, run falhou, aprovação
   pendente) com assinatura HMAC, retry e painel de entregas.
7. Documentação OpenAPI gerada.
8. Testes: POST duplicado com mesma Idempotency-Key não cria segundo run;
   escopo insuficiente retorna 403; rate limit retorna 429 com Retry-After;
   expurgo não remove o que está dentro da retenção.
```

---

## CMD-21 — Segurança e permissões

```
Endureça o módulo inteiro.

1. Permissões granulares: criar, editar, publicar, ativar, pausar, excluir, testar,
   visualizar, aprovar — por automação e por papel/equipe, verificadas NO SERVIDOR
   em toda rota e server function.
2. Principal de execução: toda ação valida a permissão do run_as. Automação nunca
   executa como superusuário. Operações privilegiadas passam por função
   security definer estreita e auditada.
3. ANTI-ESCALADA: um usuário não pode criar/publicar automação que execute ação que
   ele próprio não tem permissão para fazer. Validar na publicação e na execução.
4. Anti-SSRF completo em api_call e webhook de saída: allowlist de host, bloqueio de
   IP privado/loopback/link-local/metadata, sem redirect para faixa privada,
   timeout e limite de resposta.
5. Segredos: apenas via cofre; jamais no graph, em log, em export ou em resposta de API.
   Teste automatizado varrendo respostas, logs e exportações.
6. Auditoria de RLS: script que percorre TODAS as tabelas do módulo e falha se alguma
   estiver sem RLS, sem GRANT ou com policy permissiva demais.
7. Rate limiting em webhooks de entrada, execução manual e API.
8. Relatório de segurança com o que foi verificado e o que ficou pendente.
```

---

## CMD-22 — Suíte de testes completa

```
Implemente e execute toda a suíte de testes da FASE 5.

Cobrir: triggers, condições, variáveis, ações, IA, filas, scheduler, delays, waits,
webhooks, idempotência, retry, permissões, aprovações, loops, versionamento,
publicação e execução.

Cenários críticos obrigatórios:
- worker morto no meio de um nó com efeito externo: retomada sem duplicar;
- retry de criar pedido/enviar mensagem: contagem no destino permanece 1;
- run adormecido 3 dias acorda no instante certo, inclusive atravessando DST;
- dois eventos simultâneos acordam um run em wait_event uma única vez;
- publicação de nova versão não altera runs em andamento;
- automação que dispara evento que a dispara de novo é contida (dedupe/max_steps);
- integração fora do ar: retry, circuit breaker, alerta, sem perda de estado;
- banco indisponível no meio de um passo: sem estado inconsistente;
- 5 workers concorrentes: nenhum run ou job processado duas vezes;
- dry-run com espião nas portas: zero chamadas mutantes;
- usuário sem permissão não publica, não aprova e não executa manualmente.

E2E dos templates: novo_lead, proposta_sem_resposta, pedido_pago, pos_venda, recompra —
com relógio simulado e verificação do estado final em cada módulo envolvido.

Entregue: relatório de cobertura, lista de todos os testes com resultado e
lista honesta do que NÃO está coberto.
```

---

## CMD-23 — Documentação e auditoria final da FASE 5

```
Produza a documentação completa e execute a auditoria final.

1. docs/automation/: arquitetura (com diagramas), catálogo de eventos, catálogo de
   gatilhos, catálogo de ações (com permissão, risco e idempotência de cada uma),
   referência de nós, API, banco, filas, scheduler, permissões, segurança, limites
   de IA, testes, troubleshooting por código de erro e runbook operacional
   (o que fazer quando a fila acumula, quando uma integração cai, quando uma
   automação entra em laço).
2. GUIA DO USUÁRIO: como criar, testar, publicar e monitorar uma automação,
   escrito para quem não é programador.
3. DEPENDENCIES.md: toda dependência externa, o que precisa ser providenciado e o
   status atual.
4. Auditoria final item a item da lista da especificação: triggers, eventos,
   condições, ações, IA, workflows, scheduler, filas, workers, delays, waits,
   approvals, retries, idempotência, versionamento, permissões, segurança, logs,
   métricas, APIs, integrações, testes, performance, escalabilidade, documentação.
   Para cada item: OK / PARCIAL / PENDENTE com evidência (teste, arquivo ou tela).
5. VERIFICAÇÃO ANTI-FACHADA: liste toda automação de template, todo nó, todo botão e
   toda métrica, e prove que executa/mede algo real ou está marcado como
   PENDING_EXTERNAL_INTEGRATION. Remova ou corrija qualquer elemento decorativo.
6. Teste de carga básico: X eventos/minuto por N minutos, com relatório de
   throughput, latência p95, profundidade de fila e ponto de saturação.
7. Relatório de prontidão para as próximas fases (ANALYTICS, INTEGRAÇÕES, CENTRAL):
   eventos disponíveis, contratos estáveis, pontos de extensão.
```

---

## 16.2 Relatório de Etapa (exigir ao final de todo comando)

```
ETAPA: <n> — <nome>
1. Código analisado/verificado?      [ ] sim — o quê
2. Testes executados/passando?       [ ] sim — quantos / quais falharam
3. Banco verificado (RLS/GRANT/índices/constraints)? [ ] sim
4. Filas verificadas?                [ ] sim — concorrência, retry, dead-letter
5. Eventos verificados?              [ ] sim — emitidos e consumidos
6. Permissões verificadas?           [ ] sim
7. Integrações verificadas?          [ ] sim / N/A — quais
8. Segurança verificada?             [ ] sim — segredos, SSRF, escalada, rate limit
9. Documentação atualizada?          [ ] sim — arquivos
10. CONCLUÍDO: <lista objetiva>
11. PENDÊNCIAS: <lista honesta com motivo>
12. DEPENDÊNCIAS EXTERNAS BLOQUEANTES: <lista>
13. Autorizado a avançar? SIM / NÃO — se NÃO, o que falta.
```

---

# 17. CHECKLIST ANTI-FACHADA (aplicar sempre)

- [ ] Nenhuma automação "ativa" sem executor real e testado.
- [ ] Nenhuma execução simulada apresentada como real; dry-run é rotulado como dry-run.
- [ ] Todo nó do builder tem executor registrado; nó sem executor não pode ser publicado.
- [ ] Toda ação com efeito tem chave de idempotência comprovada por teste de retry.
- [ ] Todo delay é sleep no banco; nenhum processo esperando.
- [ ] Toda espera tem timeout e caminho alternativo.
- [ ] Todo loop tem limite, condição de saída e contador.
- [ ] Nenhuma automação executa ação sem permissão do principal.
- [ ] IA nunca escolhe caminho fora do grafo nem estoura budget silenciosamente.
- [ ] Versão publicada é imutável; run antigo mantém o comportamento antigo.
- [ ] Nenhum segredo em graph, log, export ou resposta de API.
- [ ] Toda tabela com RLS, GRANT e teste de isolamento.
- [ ] Nenhuma etapa marcada concluída sem teste passando.
- [ ] Toda dependência externa documentada com o que falta providenciar.

---

**FIM — ECOMIM FASE 5 · SISTEMA DE AUTOMAÇÕES E ORQUESTRAÇÃO**
