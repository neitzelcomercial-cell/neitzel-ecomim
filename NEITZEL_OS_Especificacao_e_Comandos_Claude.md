# NEITZEL OS — Especificação Técnica Executável
## Volume 01 — Blueprint de Implementação + Comandos para o Claude
Versão 1.0 · Documento operacional (não é um resumo: é um plano de execução)

---

## COMO USAR ESTE ARQUIVO

Este documento tem duas camadas:

1. **Especificação** (arquitetura, banco, APIs, módulos, segurança, testes).
2. **Comandos** (`CMD-XX`) — blocos prontos para colar no Claude, em ordem. Cada comando é autossuficiente, tem escopo fechado e critérios de aceite verificáveis.

Regras de uso:
- Execute os comandos **em ordem**. Não pule fases.
- Antes de cada `CMD`, cole também o bloco **CONTEXTO PERMANENTE** (Seção 0). É o "system prompt" do projeto.
- Ao final de cada `CMD`, exija do Claude: lista de arquivos criados/alterados, migrações SQL, testes e como validar.
- Se o Claude propuser algo fora do escopo do comando, rejeite e reexecute.

---

# SEÇÃO 0 — CONTEXTO PERMANENTE (colar sempre)

```text
CONTEXTO PERMANENTE — NEITZEL OS

Você está implementando o NEITZEL OS: um sistema operacional empresarial de IA,
modular, seguro e escalável. NÃO é um chatbot. É um núcleo (Core) que coordena
módulos especializados compartilhando autenticação, permissões, memória,
auditoria, notificações e integrações.

PRINCÍPIOS NÃO-NEGOCIÁVEIS
1. Modularidade: adicionar um módulo NUNCA exige alterar o Core. Módulos se
   registram via Module Registry (contrato declarativo).
2. Segurança por padrão: autenticação obrigatória, RBAC + RLS multi-tenant,
   criptografia de segredos, auditoria de toda ação sensível.
3. Fonte confiável: respostas de IA só afirmam o que está na base interna ou em
   integração autorizada. Sem base -> declarar incerteza e citar ausência de fonte.
4. Automação responsável: ações de alto impacto exigem aprovação humana
   (Human-in-the-Loop) antes da execução.
5. Observabilidade desde o dia 1: logs estruturados (JSON), métricas, tracing
   por request_id/correlation_id.
6. Multi-provider de IA: nunca acoplar a um único fornecedor. Camada de
   abstração LLM com fallback.
7. Multi-tenant: todo dado pertence a uma organização (org_id). Isolamento é
   requisito de segurança, não de produto.

STACK (fixa)
- Frontend/Fullstack: TanStack Start v1 (React 19, Vite 7), TypeScript estrito,
  Tailwind v4, shadcn/ui, TanStack Query.
- Backend: server functions (createServerFn) para lógica interna; server routes
  em src/routes/api/public/* apenas para callers externos (webhooks/cron).
- Dados: PostgreSQL (Supabase/Lovable Cloud) com RLS, pgvector para embeddings.
- Auth: Supabase Auth (email/senha + Google). Papéis em tabela separada.
- IA: gateway multi-provider com streaming, embeddings e tool-calling.
- Validação: Zod em toda fronteira (input de server fn, rota pública, webhook).

REGRAS DE CÓDIGO
- Nenhum segredo no cliente. process.env só dentro de handlers.
- Toda tabela pública: CREATE TABLE -> GRANT -> ENABLE RLS -> POLICIES.
- Papéis NUNCA na tabela de perfis. Sempre em user_roles + função
  security definer has_role().
- Erros tratados e tipados; nada de throw genérico sem contexto.
- Tokens semânticos de design; proibido hardcode de cor em componentes.
- Cada módulo entrega: rotas, server functions, schema, testes, README.

FORMATO DE RESPOSTA ESPERADO
Para cada tarefa: (a) plano curto, (b) migrações SQL, (c) código completo,
(d) testes, (e) checklist de aceite marcado, (f) riscos/pendências.
```

---

# SEÇÃO 1 — ARQUITETURA

## 1.1 Visão em camadas

```text
┌──────────────────────────────────────────────────────────────┐
│ APRESENTAÇÃO  (TanStack Start · React 19 · shadcn/ui)        │
│  AppShell · Sidebar dinâmica · Command Palette · Notificações│
├──────────────────────────────────────────────────────────────┤
│ MÓDULOS  (plugáveis, isolados, registrados no Core)          │
│  Dashboard│CRM│Leads│Marketing│Atendimento│KB│Analytics│      │
│  Automações│APIs│Segurança│Admin│Financeiro                  │
├──────────────────────────────────────────────────────────────┤
│ CORE / KERNEL                                                │
│  Auth · RBAC · Module Registry · Event Bus · Memory ·        │
│  Audit · Notifications · Settings · Integrations · Jobs      │
├──────────────────────────────────────────────────────────────┤
│ CAMADA DE IA                                                 │
│  LLM Router (multi-provider + fallback) · Tool Registry ·    │
│  RAG Pipeline · Guardrails · Cost/Token Ledger               │
├──────────────────────────────────────────────────────────────┤
│ DADOS                                                        │
│  Postgres + RLS · pgvector · Storage · Cache · Filas         │
├──────────────────────────────────────────────────────────────┤
│ OBSERVABILIDADE                                              │
│  Logs JSON · Métricas · Tracing · Alertas · Audit Trail      │
└──────────────────────────────────────────────────────────────┘
```

## 1.2 Contrato de módulo (o coração da modularidade)

```ts
export interface ModuleManifest {
  id: string;                     // "crm"
  name: string;                   // "CRM"
  version: string;                // semver
  icon: string;                   // lucide icon name
  routes: ModuleRoute[];          // rotas registradas na sidebar
  permissions: string[];          // "crm.read", "crm.write", "crm.delete"
  tables: string[];               // tabelas próprias (prefixadas)
  aiTools?: AiToolDefinition[];   // ferramentas expostas ao agente
  events?: {                      // integração via Event Bus
    emits: string[];              // "crm.contact.created"
    listens: string[];            // "leads.lead.qualified"
  };
  settingsSchema?: ZodSchema;     // configuração por organização
  healthCheck?: () => Promise<HealthStatus>;
}
```

Regra: o Core lê os manifests, monta navegação, permissões, ferramentas de IA e assinaturas de eventos **sem conhecer o módulo**.

## 1.3 Event Bus

- Tabela `core_events` (outbox) + processador assíncrono.
- Publicação: `emitEvent({ type, payload, org_id, actor_id })`.
- Consumo: handlers idempotentes, com `dedup_key` e retry exponencial.
- Nenhum módulo importa código de outro módulo — comunicação só por eventos ou por API interna versionada.

## 1.4 Decisões técnicas justificadas (ADRs resumidos)

| ADR | Decisão | Justificativa | Alternativa descartada |
|-----|---------|---------------|------------------------|
| 001 | Monólito modular, não microsserviços | Time pequeno, latência menor, deploy simples; modularidade garantida por contrato | Microsserviços (overhead operacional) |
| 002 | Postgres + RLS para multi-tenant | Isolamento no banco, não só na app; menos superfície de erro | Filtro só em código (frágil) |
| 003 | pgvector no mesmo banco | Joins com metadados, menos infra | Vector DB externo |
| 004 | Server functions p/ interno, rotas p/ externo | Tipagem ponta a ponta + HTTP cru só onde necessário | Tudo REST (perde tipos) |
| 005 | LLM Router com fallback | Princípio 7: não depender de fornecedor único | SDK único acoplado |
| 006 | Outbox + eventos | Desacoplamento e rastreabilidade | Chamadas diretas entre módulos |
| 007 | Aprovações em tabela dedicada | Human-in-the-loop auditável | Flags espalhadas |

---

# SEÇÃO 2 — MODELO DE DADOS

Convenções: `snake_case`; PK `uuid default gen_random_uuid()`; toda tabela de negócio tem `org_id uuid not null`, `created_at`, `updated_at`, `created_by`. Soft delete via `deleted_at` onde houver histórico.

## 2.1 Core

```text
organizations(id, name, slug UNIQUE, plan, settings jsonb, created_at)
profiles(id -> auth.users, full_name, avatar_url, locale, created_at)
org_members(id, org_id, user_id, status, invited_by, joined_at) UNIQUE(org_id,user_id)
app_role ENUM: owner | admin | manager | agent | viewer
user_roles(id, user_id, org_id, role app_role) UNIQUE(user_id, org_id, role)
permissions(id, key UNIQUE, description)          -- "crm.write"
role_permissions(role app_role, permission_key)   -- matriz RBAC
modules_registry(id, org_id, module_id, enabled, config jsonb, version)
core_settings(id, org_id, key, value jsonb) UNIQUE(org_id,key)
audit_log(id, org_id, actor_id, action, entity_type, entity_id,
          before jsonb, after jsonb, ip, user_agent, created_at)
core_events(id, org_id, type, payload jsonb, actor_id, status,
            attempts, dedup_key UNIQUE, available_at, created_at)
notifications(id, org_id, user_id, type, title, body, link, read_at, created_at)
integrations(id, org_id, provider, status, config jsonb,
             credentials_encrypted bytea, last_sync_at)
api_keys(id, org_id, name, key_hash, prefix, scopes text[], last_used_at, revoked_at)
jobs(id, org_id, type, payload jsonb, status, run_at, attempts, last_error)
approvals(id, org_id, requested_by, action_type, payload jsonb, risk_level,
          status, decided_by, decided_at, reason)
memory_entries(id, org_id, scope, subject_id, kind, content,
               embedding vector(1536), importance, expires_at, created_at)
ai_usage(id, org_id, user_id, provider, model, input_tokens, output_tokens,
         cost_usd, latency_ms, feature, created_at)
```

## 2.2 Módulos

```text
-- CRM
crm_accounts(id, org_id, name, domain, industry, size, owner_id, tags text[])
crm_contacts(id, org_id, account_id, name, email, phone, role, tags text[], owner_id)
crm_deals(id, org_id, account_id, contact_id, title, value_cents, currency,
          stage, probability, expected_close_at, owner_id, lost_reason)
crm_activities(id, org_id, entity_type, entity_id, type, content, due_at, done_at, owner_id)

-- Leads
leads(id, org_id, source, name, email, phone, payload jsonb, score,
      status, assigned_to, converted_contact_id, created_at)
lead_scoring_rules(id, org_id, name, condition jsonb, points, active)

-- Marketing
mkt_campaigns(id, org_id, name, channel, status, starts_at, ends_at, budget_cents)
mkt_contents(id, org_id, campaign_id, type, title, body, status, scheduled_at, published_at)
mkt_metrics(id, org_id, campaign_id, date, impressions, clicks, conversions, spend_cents)

-- Atendimento
sup_conversations(id, org_id, channel, contact_id, status, priority,
                  assigned_to, sla_due_at, closed_at, satisfaction)
sup_messages(id, org_id, conversation_id, sender_type, sender_id, body,
             attachments jsonb, ai_generated, created_at)
sup_macros(id, org_id, name, body, tags text[])

-- Base de Conhecimento
kb_documents(id, org_id, title, source_type, source_url, mime, status,
             visibility, tags text[], created_by)
kb_chunks(id, org_id, document_id, ord, content, tokens, embedding vector(1536))
kb_queries(id, org_id, user_id, question, answer, citations jsonb,
           confidence, feedback, created_at)

-- Analytics
analytics_snapshots(id, org_id, metric_key, dimensions jsonb, value numeric, period, captured_at)
saved_reports(id, org_id, name, definition jsonb, schedule, owner_id)

-- Automações
automations(id, org_id, name, trigger jsonb, conditions jsonb, actions jsonb,
            enabled, requires_approval, risk_level, created_by)
automation_runs(id, org_id, automation_id, status, trigger_payload jsonb,
                steps jsonb, error, started_at, finished_at)
```

## 2.3 Padrão obrigatório de migração

```sql
CREATE TABLE public.crm_contacts (...);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_contacts TO authenticated;
GRANT ALL ON public.crm_contacts TO service_role;

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read own org" ON public.crm_contacts
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "writers write own org" ON public.crm_contacts
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), org_id, 'crm.write'))
  WITH CHECK (public.has_permission(auth.uid(), org_id, 'crm.write'));
```

Funções `security definer` obrigatórias: `has_role(uid, org, role)`, `is_org_member(uid, org)`, `has_permission(uid, org, key)`.

---

# SEÇÃO 3 — ESPECIFICAÇÃO DE APIs

## 3.1 Interno (server functions, tipado)

Padrão de nomes: `<modulo>.<recurso>.<ação>` → arquivo `src/lib/<modulo>.functions.ts`.

```ts
export const listContacts = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator(ListContactsSchema.parse)
  .handler(async ({ data, context }) => { /* RLS aplica como o usuário */ });
```

Resposta padronizada:
```ts
type Ok<T>  = { ok: true; data: T; meta?: { page: number; total: number } };
type Err    = { ok: false; error: { code: string; message: string; details?: unknown } };
```

Códigos de erro: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `RATE_LIMITED`, `CONFLICT`, `PROVIDER_UNAVAILABLE`, `INTERNAL`.

## 3.2 Externo (v1, sob `src/routes/api/public/v1/*`)

| Método | Rota | Descrição | Auth |
|---|---|---|---|
| POST | `/api/public/v1/leads` | Ingestão de leads | API key |
| POST | `/api/public/v1/webhooks/:provider` | Webhooks | Assinatura HMAC |
| POST | `/api/public/v1/kb/ingest` | Envio de documento | API key + escopo `kb.write` |
| GET | `/api/public/v1/health` | Healthcheck | pública |
| POST | `/api/public/v1/cron/:job` | Disparo agendado | header `x-cron-secret` |

Regras: versionamento no path; validação Zod; verificação de assinatura **antes** de processar; rate limit por api_key; nunca retornar PII; toda chamada gera registro em `audit_log`.

---

# SEÇÃO 4 — CAMADA DE IA

## 4.1 LLM Router
```ts
interface LlmProvider {
  id: 'primary' | 'secondary' | 'local';
  chat(req: ChatRequest): AsyncIterable<ChatChunk>;
  embed(texts: string[]): Promise<number[][]>;
  capabilities: { tools: boolean; vision: boolean; maxContext: number };
}
```
- Seleção por tarefa (`fast`, `reasoning`, `embedding`, `vision`).
- Fallback automático em erro/timeout, com log do motivo.
- Toda chamada registra em `ai_usage` (tokens, custo, latência, feature).

## 4.2 RAG (obrigatório para respostas factuais)
1. Ingestão → normalização → chunking (800–1200 tokens, overlap 15%).
2. Embeddings → `kb_chunks.embedding`.
3. Busca híbrida: vetorial + full-text (`tsvector`) + rerank.
4. Montagem de contexto com **citações obrigatórias** (`document_id`, trecho).
5. Guardrail: se `confidence < limiar` ou zero fontes → responder
   "não há base confiável para afirmar isso" e sugerir próximos passos.
6. Registrar em `kb_queries` com citações e feedback.

## 4.3 Tool-calling
- Ferramentas declaradas por módulo no manifest.
- Cada tool tem: schema Zod, permissão exigida, `risk_level`.
- `risk_level >= high` → cria registro em `approvals` e **não executa** até aprovação.

## 4.4 Memória
- `session`: contexto da conversa atual.
- `user`: preferências e estilo.
- `org`: fatos institucionais.
- Escrita de memória é explícita (tool `memory.write`) e auditada; recuperação por similaridade + recência + importância.

---

# SEÇÃO 5 — REQUISITOS NÃO FUNCIONAIS

**Desempenho**
- TTFB SSR p95 < 500 ms; navegação client p95 < 200 ms.
- Query de lista p95 < 300 ms (com índices e paginação keyset).
- Primeiro token de IA p95 < 2 s; streaming sempre ativo.
- Paginação obrigatória acima de 50 registros.

**Disponibilidade e resiliência**
- Timeout padrão 15 s; retry com backoff em integrações; circuit breaker por provedor.
- Jobs idempotentes com `dedup_key`.

**Segurança**
- MFA opcional; senhas verificadas contra vazamentos (HIBP).
- Segredos criptografados em repouso; nunca logados.
- Rate limit: 100 req/min por usuário, 1000/min por org, configurável por API key.
- Auditoria de: login, mudança de papel, exportação, exclusão, execução de automação, chamada de tool de risco.
- LGPD: exportação e exclusão de dados por titular; retenção configurável.

**Observabilidade**
- Log JSON: `{ ts, level, request_id, org_id, user_id, module, action, duration_ms, status, error }`.
- Métricas: latência por rota, erros por módulo, tokens/custo por org, filas.

**Acessibilidade e i18n**
- WCAG 2.1 AA; navegação por teclado; PT-BR padrão com estrutura pronta para EN.

---

# SEÇÃO 6 — WIREFRAMES DESCRITOS

**AppShell**: sidebar esquerda colapsável (gerada pelo Module Registry) · topbar com seletor de organização, busca global (⌘K), notificações, avatar · área de conteúdo com breadcrumbs · painel direito deslizante para o Assistente de IA (contextual à página atual).

**Dashboard**: linha de KPIs (4 cards) · gráfico principal (série temporal) · coluna direita com "Aprovações pendentes" e "Atividade recente" · faixa inferior com atalhos por módulo.

**CRM**: lista mestre-detalhe. Esquerda: tabela filtrável (colunas configuráveis, seleção múltipla, ações em lote). Direita: painel do registro com abas Visão geral / Atividades / Negócios / Documentos / IA (resumo e próximos passos com citações).

**Leads**: kanban por status + score visível no card; ações rápidas: qualificar, atribuir, converter em contato.

**Atendimento**: três colunas — fila (filtros SLA/prioridade), conversa (mensagens, macros, sugestão da IA com botão "usar/editar"), contexto do cliente.

**Base de Conhecimento**: grid de documentos com status de indexação · uploader drag-and-drop · busca com resposta gerada + citações clicáveis que abrem o trecho de origem.

**Automações**: construtor linear Gatilho → Condições → Ações, com painel de teste (dry-run) e alternância "exigir aprovação".

**Admin/Segurança**: usuários e convites, matriz de papéis × permissões, chaves de API, integrações, trilha de auditoria com filtros e exportação.

---

# SEÇÃO 7 — TESTES E CRITÉRIOS DE ACEITAÇÃO

Pirâmide: unitários (regras, scoring, guardrails) → integração (server functions + RLS com usuários de orgs distintas) → e2e (fluxos críticos) → segurança (tentativas de acesso cruzado).

Cenários obrigatórios (Given/When/Then):
- Isolamento: usuário da Org A **nunca** lê dados da Org B em nenhuma rota.
- RBAC: `viewer` recebe `FORBIDDEN` em escrita.
- Guardrail: pergunta sem fonte → resposta declara ausência de base, sem inventar.
- Aprovação: automação de risco alto fica `pending` e não executa sem decisão.
- Auditoria: toda ação sensível gera linha em `audit_log` com antes/depois.
- Fallback de IA: provedor primário fora → resposta entregue pelo secundário, com log.
- Idempotência: webhook duplicado não gera efeito duplo.

**Definition of Done por módulo**: rotas + server functions + Zod + migrações com GRANT/RLS + testes verdes + logs estruturados + entrada no Module Registry + README + telas responsivas e acessíveis.

---

# SEÇÃO 8 — COMANDOS PARA O CLAUDE

> Cole o **CONTEXTO PERMANENTE** antes de cada comando.

## FASE 1 — NÚCLEO

### CMD-01 · Fundação e Design System
```text
Implemente a fundação do NEITZEL OS.
1. Configure o design system em tokens semânticos (tema claro/escuro):
   superfícies, texto, borda, primária, sucesso, alerta, perigo, foco.
   Estética: enterprise sóbrio, densidade média-alta, tipografia legível.
   PROIBIDO: hardcode de cor em componentes; gradiente roxo genérico.
2. Crie o AppShell: sidebar colapsável, topbar (org switcher, busca ⌘K,
   notificações, avatar), breadcrumbs, painel lateral do Assistente de IA.
3. Crie primitivos reutilizáveis: DataTable (server-side, keyset pagination,
   filtros, colunas configuráveis, ações em lote), EmptyState, PageHeader,
   StatCard, ConfirmDialog, FormField com erros do Zod.
4. Configure toasts (sonner) e ErrorBoundary por rota.
5. Rota "/" = landing pública com CTA de login; app autenticado em /app/*.
ACEITE: shell navegável, tema alternável, DataTable funcionando com dados mock,
zero cor hardcoded, responsivo em 360px e 1440px.
```

### CMD-02 · Backend, Auth e Multi-tenant
```text
Ative o backend e implemente identidade e isolamento.
1. Migração inicial: organizations, profiles, org_members, app_role,
   user_roles, permissions, role_permissions, core_settings, audit_log.
   Papéis NUNCA na tabela profiles.
2. Funções security definer: has_role, is_org_member, has_permission.
3. Toda tabela: CREATE -> GRANT -> ENABLE RLS -> POLICIES (padrão do documento).
4. Trigger de signup: cria profile, cria organização pessoal e atribui 'owner'.
5. Auth: email/senha + Google; página /auth (login/cadastro), /reset-password.
   Estado de sessão com onAuthStateChange; header reflete sessão; logout limpa cache.
6. Rotas protegidas sob _authenticated; redirecionar para /auth.
7. Org switcher persistente; toda query filtra por org ativa.
ACEITE: usuário da Org A não acessa dados da Org B nem via chamada direta;
viewer recebe FORBIDDEN em escrita; logout não deixa cache protegido.
```

### CMD-03 · Kernel: Registry, Eventos, Auditoria, Notificações
```text
Implemente o Core que torna o sistema modular.
1. ModuleManifest (interface do documento) + módulo Registry que descobre,
   valida e registra manifests. Sidebar, permissões e ferramentas de IA são
   derivadas dos manifests. Nenhum caminho de módulo hardcoded no Core.
2. Event Bus com outbox: core_events, emitEvent(), processador com retry
   exponencial, dedup_key e dead-letter.
3. Auditoria: helper audit() gravando before/after, ator, IP, user agent.
   Aplicar em toda escrita sensível.
4. Notificações: tabela, hook em tempo real, centro de notificações na topbar.
5. Aprovações: tabela approvals + serviço requestApproval() + tela
   "Aprovações pendentes" com aprovar/rejeitar e justificativa.
6. Jobs: tabela jobs + runner idempotente + rota /api/public/v1/cron/:job
   protegida por x-cron-secret.
7. Logger estruturado JSON com request_id propagado.
ACEITE: criar um módulo de exemplo apenas adicionando um manifest faz a rota e
o item de menu aparecerem sem tocar no Core; evento duplicado não reprocessa.
```

### CMD-04 · Camada de IA
```text
Implemente a camada de IA multi-provider.
1. LlmProvider + LlmRouter com seleção por tarefa (fast/reasoning/embedding/vision),
   timeout, retry, circuit breaker e fallback entre provedores. Streaming sempre.
2. Registro de ferramentas: cada tool tem schema Zod, permissão e risk_level.
   risk_level alto -> requestApproval() e execução só após aprovação.
3. Guardrails: sem fonte confiável, o assistente declara incerteza e não afirma.
   Sempre retornar citações quando usar a base de conhecimento.
4. Memória: memory_entries com escopos session/user/org, escrita explícita e
   auditada, recuperação por similaridade + recência + importância.
5. Ledger: gravar em ai_usage tokens, custo, latência, feature; painel de custo no Admin.
6. UI: painel lateral do assistente com streaming, histórico, citações clicáveis,
   seletor de contexto (página atual / módulo / organização).
ACEITE: derrubando o provedor primário a resposta continua via secundário e o
fallback é logado; pergunta sem base retorna declaração de incerteza; tool de
risco alto fica pendente de aprovação.
```

### CMD-05 · Dashboard
```text
Implemente o módulo Dashboard como primeiro módulo real, usando o Registry.
KPIs por organização, série temporal, aprovações pendentes, atividade recente
(a partir de audit_log), atalhos por módulo. Dados via server functions com
agregações no banco. Estados de loading com skeleton, erro e vazio.
ACEITE: nenhuma alteração no Core; carrega em menos de 1s com dados de teste;
todos os números respeitam RLS da organização ativa.
```

## FASE 2 — OPERAÇÃO

### CMD-06 · CRM
```text
Implemente o módulo CRM (accounts, contacts, deals, activities) conforme o
modelo de dados do documento. Inclua: lista mestre-detalhe, pipeline kanban de
deals com drag-and-drop, timeline de atividades, importação CSV com preview e
deduplicação, exportação, tags. Ferramentas de IA: resumir conta, sugerir
próximos passos (com citações), redigir follow-up (rascunho, nunca envio
automático). Eventos: crm.contact.created, crm.deal.stage_changed.
ACEITE: DoD completo do documento + teste de acesso cruzado entre orgs.
```

### CMD-07 · Base de Conhecimento (RAG)
```text
Implemente a KB com pipeline RAG completo: upload (PDF, DOCX, MD, TXT, URL),
extração, chunking 800-1200 tokens com 15% overlap, embeddings em pgvector,
busca híbrida (vetorial + full-text) com rerank, resposta com citações
obrigatórias clicáveis, feedback do usuário, reindexação e status de ingestão.
Visibilidade por documento (org/equipe/privado) refletida na busca e no RAG.
ACEITE: resposta sempre cita fonte ou declara ausência de base; documento
privado nunca aparece em resposta para quem não tem acesso.
```

### CMD-08 · Atendimento
```text
Implemente Atendimento: filas, conversas, mensagens, atribuição, prioridades,
SLA com contador e alerta, macros, notas internas, encerramento com CSAT.
IA: sugestão de resposta baseada na KB (com citações) que o agente pode usar,
editar ou descartar; classificação de intenção e sentimento; resumo da conversa
no encerramento. Nada é enviado ao cliente sem ação humana.
ACEITE: sugestão nunca é enviada automaticamente; violação de SLA gera
notificação; histórico completo auditado.
```

### CMD-09 · Leads
```text
Implemente Leads: ingestão via /api/public/v1/leads (API key + Zod + rate limit
+ idempotência), kanban por status, motor de scoring configurável
(lead_scoring_rules), atribuição automática por regras, conversão em contato/deal
do CRM via evento. Deduplicação por email/telefone.
ACEITE: payload inválido retorna 422 com detalhes; envio duplicado não cria
lead duplo; conversão não perde histórico.
```

## FASE 3 — INTELIGÊNCIA

### CMD-10 · Marketing
```text
Implemente Marketing: campanhas, calendário de conteúdo, editor com IA
(geração de rascunhos a partir da KB, tom de voz configurável por organização),
aprovação editorial antes de publicar, métricas por campanha.
ACEITE: nenhum conteúdo publica sem aprovação; métricas agregadas por período.
```

### CMD-11 · Analytics
```text
Implemente Analytics: snapshots de métricas, construtor de relatórios salvos
(dimensões, filtros, período), gráficos, exportação CSV/PDF, agendamento de
envio. IA gera interpretação textual dos números citando os dados exibidos —
proibido extrapolar além do dataset.
ACEITE: relatório salvo reproduz os mesmos números; interpretação da IA não
cita métrica ausente do relatório.
```

### CMD-12 · Automações
```text
Implemente Automações: construtor Gatilho (evento/agenda/webhook) → Condições →
Ações (criar registro, notificar, chamar integração, executar tool de IA).
Execução via fila com passos registrados em automation_runs, dry-run, logs por
passo, retry, kill switch por automação e global. Ações de risco alto exigem
aprovação humana.
ACEITE: dry-run não grava efeitos; falha em um passo não corrompe o estado;
automação de risco alto aguarda aprovação; runs totalmente auditáveis.
```

## FASE 4 — PLATAFORMA

### CMD-13 · Integrações e API pública
```text
Implemente o hub de integrações: catálogo de provedores, conexão com
credenciais criptografadas, teste de conexão, status e última sincronização,
webhooks de entrada com verificação HMAC, webhooks de saída com assinatura e
retry. Implemente API pública v1 com chaves por escopo, rate limit,
documentação OpenAPI gerada e página de referência dentro do Admin.
ACEITE: assinatura inválida é rejeitada antes de qualquer processamento;
credenciais nunca aparecem em logs nem no cliente; chave revogada falha na hora.
```

### CMD-14 · Segurança, Admin e Conformidade
```text
Implemente Admin/Segurança: gestão de usuários e convites, matriz papéis ×
permissões editável, chaves de API, sessões ativas, trilha de auditoria com
filtros e exportação, políticas de retenção, exportação e exclusão de dados do
titular (LGPD), verificação de senha vazada (HIBP), rate limits configuráveis e
painel de custos de IA por organização.
ACEITE: escalonamento de privilégio impossível pelo cliente; toda mudança de
papel é auditada; exportação LGPD entrega todos os dados do titular.
```

### CMD-15 · Observabilidade, Performance e Hardening
```text
Feche a plataforma para produção.
1. Logs JSON com request_id em todo o caminho; métricas de latência, erro,
   fila e custo; página de status interna com healthchecks por módulo.
2. Índices para todas as consultas de lista; paginação keyset; revisar N+1.
3. Cache de leituras quentes com invalidação por evento.
4. Testes: unitários, integração com RLS multi-org, e2e dos fluxos críticos e
   suíte de segurança de acesso cruzado.
5. Hardening: cabeçalhos de segurança, CSP, validação em toda fronteira,
   varredura de dependências.
6. README de arquitetura + guia "como criar um novo módulo em 30 minutos".
ACEITE: suíte verde; p95 dentro das metas da Seção 5; criar módulo novo não
exige alterar o Core.
```

---

# SEÇÃO 9 — CHECKLIST DE ENTREGA

- [ ] Core não referencia nenhum módulo diretamente
- [ ] Toda tabela pública tem GRANT + RLS + políticas testadas
- [ ] Papéis fora da tabela de perfis, via `has_role`
- [ ] Nenhum segredo no bundle do cliente
- [ ] IA cita fontes ou declara incerteza
- [ ] Ações de risco alto passam por aprovação humana
- [ ] Auditoria cobre login, papéis, exclusão, exportação, automações
- [ ] Fallback entre provedores de IA testado
- [ ] Logs JSON com request_id
- [ ] Testes de acesso cruzado entre organizações
- [ ] Metas de p95 atendidas
- [ ] Documentação e guia de novo módulo publicados
