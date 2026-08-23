# ECOMIM — FASE 2 · ECOMIM IA
## Especificação Executável + Comandos Sequenciais para o Claude
Versão 1.0 · Documento de contexto permanente + plano de execução

> **Como usar:** cole a **Parte A (Contexto Permanente)** no início de cada sessão do Claude.
> Depois execute **um comando por vez** da **Parte D (CMD-00 → CMD-16)**, sempre aplicando o
> **Protocolo de Encerramento de Etapa** antes de avançar.

---

# PARTE A — CONTEXTO PERMANENTE (colar em toda sessão)

Você é o arquiteto e desenvolvedor principal da **FASE 2 do ECOMIM**: o módulo **ECOMIM IA**,
o cérebro inteligente de um ecossistema comercial modular.

## A.1 Regras invioláveis
1. **Nada de fachada.** Toda funcionalidade exibida como funcional precisa de: lógica real, estado real, persistência quando necessária, tratamento de erros, validação, logs, permissões, testes e documentação.
2. **Nunca inventar APIs, endpoints, campos ou respostas.** Se a integração externa depender de credencial ausente, implemente a arquitetura real de integração (interface + adapter + config por ambiente) e registre a dependência em `docs/DEPENDENCIAS_EXTERNAS.md` com status `BLOQUEADO_POR_CREDENCIAL`.
3. **Proibido botão inerte.** Todo controle da UI dispara uma ação real ou não existe.
4. **Proibido substituir implementação funcional por mock.** Mocks só existem em testes.
5. **Nunca marcar etapa como concluída sem verificar** (build + testes + execução real do fluxo).
6. **Preservar o que já funciona.** Não reescrever o projeto; estender.
7. **API keys jamais no frontend.** Toda chamada a provedor de IA acontece no servidor.
8. **A IA nunca tem acesso irrestrito.** Todo acesso passa pelo Tool System com permissão, validação e log.
9. **Distinguir origens de informação:** `known` (dado do sistema), `retrieved` (RAG/ferramenta), `inferred` (inferência do modelo), `unknown`. Nunca preencher lacuna com invenção — retornar `unknown` e pedir dado.
10. **Não perguntar o que pode ser respondido lendo o projeto.**

## A.2 Escopo desta fase
Construir o ECOMIM IA capaz de: analisar e qualificar leads, pesquisar informações, apoiar prospecção,
analisar históricos, gerar estratégias comerciais, criar mensagens personalizadas, sugerir follow-ups,
identificar oportunidades, analisar dados comerciais, executar tarefas autorizadas, usar ferramentas
externas, manter memória e contexto, coordenar múltiplos agentes, registrar todas as ações, permitir
intervenção humana, operar automaticamente quando autorizado e integrar-se depois ao **ECOMIM LEADS**.

**Fora de escopo:** implementar o ECOMIM LEADS. Nesta fase existe apenas a **camada de integração**
(`LeadsGateway`) com um adapter local persistido, trocável por HTTP quando o Leads existir.

## A.3 Arquitetura alvo
```
ECOMIM IA
├── ai-core/          Abstração de provedores, modelos, fallback, custo, retry, streaming
├── agent-engine/     Definição, versionamento, execução e métricas de agentes
├── orchestrator/     Pipelines multi-agente, roteamento, interrupção, decisões
├── memory/           Curto prazo · sessão · longo prazo · por entidade
├── tools/            Registry, schemas, validação, permissão, timeout, logs
├── knowledge/        Documentos, chunking, embeddings, busca semântica (RAG)
├── automation/       Evento → condição → agente → decisão → ação → log
├── tasks/            Fila de tarefas, estados, retry, agendamento
├── decision/         Políticas, níveis de autonomia, gates de aprovação
├── security/         Auth, RBAC, rate limit, criptografia de segredos, isolamento
├── audit/            Trilha imutável de tudo
├── analytics/        Métricas de execução, consumo e custo
├── api/              Superfície pública versionada (/api/v1/ai/*)
└── web/              Dashboard, Central de Agentes, Playground, Aprovações, Logs
```
Regra: cada módulo expõe **interface** + **implementação**. Substituição de componente não pode exigir alteração dos agentes.

## A.4 Stack (confirmar em CMD-00 antes de assumir)
- TypeScript · React 19 · TanStack Start (SSR) · Vite 7 · Tailwind v4 · shadcn/ui
- Backend: `createServerFn` (RPC interno) + rotas de servidor `src/routes/api/*` (HTTP externo/streaming/webhooks)
- Banco: PostgreSQL gerenciado (Lovable Cloud/Supabase) com **RLS obrigatória** e migrations versionadas
- IA: gateway compatível OpenAI via AI SDK (`streamText`/`generateText`, `tool`, `Output`)
- Testes: Vitest (unit/integração) + testes de rota/API
- **Nunca** criar Edge Functions novas neste stack; use `createServerFn` ou rotas `src/routes/api/`.

## A.5 Convenções
- `src/modules/<modulo>/` com `domain/` (tipos e regras puras), `service.server.ts`, `*.functions.ts` (RPC), `__tests__/`.
- Toda entrada validada com Zod na borda (RPC/API) **e** no banco (constraints).
- Todo erro tipado: `AppError { code, httpStatus, retryable, publicMessage, cause }`.
- Todo registro de execução carrega `run_id`, `trace_id`, `actor_id`, `agent_id`.
- Segredos: `process.env` no servidor; nunca `VITE_*` para credenciais.

---

# PARTE B — MODELO DE DADOS (mínimo obrigatório)

Todas as tabelas em `public`, com: PK `uuid default gen_random_uuid()`, `created_at`/`updated_at timestamptz`,
`org_id uuid` para multi-tenant, **GRANTs explícitos**, **RLS habilitada** e políticas por `auth.uid()`/`org_id`.

| Tabela | Campos essenciais | Relacionamentos |
|---|---|---|
| `users` (auth) | id, email | base de tudo |
| `profiles` | user_id, org_id, display_name, role_default | → users |
| `user_roles` | user_id, role (enum `app_role`) | **tabela separada, nunca role no profile** |
| `permissions` | subject_type(user/agent), subject_id, resource, action, allow, constraints jsonb | — |
| `agents` | slug, name, description, goal, instructions, model, provider, temperature, max_tokens, autonomy_level(1..4), status, current_version, metrics jsonb | → agent_versions |
| `agent_versions` | agent_id, version, snapshot jsonb, changelog, created_by | → agents |
| `agent_tools` | agent_id, tool_id, enabled, constraints jsonb | agents ↔ tools |
| `tools` | slug, name, description, params_schema jsonb, timeout_ms, requires_approval, version, status, side_effect(read/write/external) | — |
| `agent_runs` | agent_id, version, orchestration_id, input jsonb, output jsonb, status(queued/running/paused/awaiting_approval/succeeded/failed/cancelled), started_at, finished_at, duration_ms, cost_usd, tokens_in, tokens_out, error jsonb | → agents |
| `run_steps` | run_id, seq, type(model/tool/decision/memory/approval), payload jsonb, result jsonb, duration_ms, error | → agent_runs |
| `orchestrations` | pipeline_slug, entity_type, entity_id, status, context jsonb, current_step | → agent_runs |
| `memories` | scope(short/session/long/entity), entity_type, entity_id, key, content, embedding vector, relevance, confidence, source, expires_at | — |
| `knowledge_documents` | title, source, mime, status, checksum, metadata jsonb | → knowledge_chunks |
| `knowledge_chunks` | document_id, seq, content, embedding vector, tokens | → knowledge_documents |
| `tasks` | type, title, entity_type, entity_id, assignee_user_id, agent_id, due_at, priority, status, payload jsonb | — |
| `automations` | slug, name, trigger jsonb, conditions jsonb, steps jsonb, enabled, autonomy_level | → automation_runs |
| `automation_runs` | automation_id, trigger_payload jsonb, status, steps_result jsonb, error, duration_ms | → automations |
| `approvals` | run_id, step_id, requested_by_agent, action_summary, rationale, proposed_payload jsonb, status(pending/approved/rejected/edited/expired), decided_by, decided_at, edited_payload jsonb | → agent_runs |
| `ai_requests` | provider, model, run_id, prompt_hash, tokens_in, tokens_out, latency_ms, status, error, cost_usd | → agent_runs |
| `ai_usage` | org_id, day, provider, model, requests, tokens_in, tokens_out, cost_usd | agregação diária |
| `audit_logs` | actor_type(user/agent/system), actor_id, action, resource_type, resource_id, before jsonb, after jsonb, ip, trace_id | **append-only** |
| `integrations` | slug, kind, config jsonb (sem segredo), secret_ref, status, last_check_at, last_error | — |
| `leads_mirror` | external_id, source, snapshot jsonb, synced_at, hash | espelho read-model do ECOMIM LEADS |

Regras: sem tabelas duplicadas; índices em `(org_id, created_at)`, `(agent_id, status)`,
`(entity_type, entity_id)`; `audit_logs` sem UPDATE/DELETE por policy.

---

# PARTE C — CONTRATOS DE API (`/api/v1/ai/*`)

Autenticação: Bearer (usuário) ou API key de módulo (integração). Rate limit por chave. Erros no formato
`{ error: { code, message, details?, trace_id } }`.

| Método | Rota | Descrição |
|---|---|---|
| POST | `/agents/:slug/run` | Executa agente. Body: `{ input, context?, tools?, stream?, autonomy_override? }` |
| GET | `/runs/:id` | Estado, passos, custo, resultado |
| POST | `/runs/:id/cancel` | Interrompe execução |
| POST | `/runs/:id/resume` | Retoma execução pausada |
| GET | `/agents` · `/agents/:slug` | Lista/detalha agentes |
| POST/PATCH | `/agents` · `/agents/:slug` | Cria/edita (gera nova `agent_version`) |
| POST | `/agents/:slug/test` | Execução em sandbox, sem efeitos externos |
| GET/POST | `/memory` | Consulta/salva memória por escopo e entidade |
| DELETE | `/memory/:id` | Remove memória |
| POST | `/knowledge/documents` | Ingestão + chunking + embeddings |
| POST | `/knowledge/search` | Busca semântica (retorna trechos + fonte) |
| GET/POST | `/tasks` | Lista/cria tarefas |
| GET | `/approvals` · POST `/approvals/:id/decide` | Human-in-the-loop |
| POST | `/automations/:slug/trigger` | Dispara automação |
| GET | `/automations/runs` | Histórico |
| GET | `/logs` · `/usage` | Auditoria e consumo |
| GET | `/health` | Status do módulo e dos provedores |
| POST | `/integrations/leads/events` (público, assinado) | Webhook do ECOMIM LEADS |

Streaming: `POST /agents/:slug/run?stream=1` responde SSE com eventos `step`, `token`, `tool`, `approval_required`, `done`, `error`.

---

# PARTE D — COMANDOS SEQUENCIAIS PARA O CLAUDE

## Protocolo de Encerramento de Etapa (obrigatório após cada CMD)
```
1. Revisar código existente e remover duplicações introduzidas
2. Rodar build + typecheck + lint
3. Rodar a suíte de testes; corrigir falhas
4. Executar manualmente o fluxo entregue e descrever a evidência observada
5. Atualizar docs/ e docs/DEPENDENCIAS_EXTERNAS.md
6. Escrever em docs/PROGRESSO.md: [CONCLUÍDO] / [PENDENTE] / [BLOQUEADO + motivo]
7. Só então avançar para o próximo comando
```

---

### CMD-00 — Diagnóstico do projeto existente
Antes de escrever qualquer feature: mapeie a stack real, gerenciador de pacotes, scripts, estrutura de rotas,
banco existente e migrations, autenticação atual, e como (ou se) o Sistema de Leads está estruturado.
Entregue `docs/ARQUITETURA_ATUAL.md` com: stack detectada, inventário de módulos, tabelas existentes,
pontos de extensão, **conflitos** e **dependências**. Proponha a arquitetura do ECOMIM IA em `docs/ARQUITETURA_ECOMIM_IA.md`
e o plano em `docs/PLANO_FASE2.md`. **Nenhuma feature nesta etapa.**

### CMD-01 — Estrutura base e fundações transversais
Crie `src/modules/{ai-core,agent-engine,orchestrator,memory,tools,knowledge,automation,tasks,decision,security,audit,analytics}` com
`domain/`, `service.server.ts`, `*.functions.ts`, `__tests__/`. Implemente de verdade:
`AppError` tipado + mapeamento HTTP, logger estruturado com `trace_id`, wrapper de validação Zod nas bordas,
`withAudit()` para escrita auditada, config por ambiente com validação de env na inicialização (falha explícita se faltar variável).
Testes unitários de erro, logger e config.

### CMD-02 — Banco de dados e camada de acesso
Migrations criando **todas** as tabelas da Parte B, na ordem: `CREATE TABLE` → `GRANT` → `ENABLE ROW LEVEL SECURITY` → `CREATE POLICY`.
`user_roles` em tabela separada + função `has_role(_user_id, _role)` `security definer`.
`audit_logs` append-only (sem policy de UPDATE/DELETE). Índices conforme Parte B. Tipos gerados para o cliente.
Repositórios por módulo com testes de integração cobrindo RLS (usuário A não lê dados de B).

### CMD-03 — AI Core
Interface `AIProvider` com `generate`, `stream`, `embed`, `countTokens`, `describeModels`.
Implemente ao menos um provider real via gateway compatível OpenAI + um `LocalEchoProvider` **exclusivo para testes**.
Recursos obrigatórios: registry de modelos, seleção e **fallback em cadeia**, temperatura quando suportada,
limite de tokens, timeout, retry com backoff apenas para 429/5xx, cancelamento via `AbortSignal`,
janela de contexto com truncamento consciente, streaming, cálculo de custo e gravação em `ai_requests`/`ai_usage`.
Chaves lidas **dentro do handler**, nunca em escopo de módulo, nunca expostas ao browser.
Testes: fallback, retry, timeout, contabilização de custo.

### CMD-04 — Tool System
`ToolRegistry` com registro declarativo: `{ slug, description, paramsSchema (Zod), sideEffect, timeoutMs, requiresApproval, permission, execute }`.
Execução passa obrigatoriamente por: checagem de permissão (usuário **e** agente) → validação de parâmetros →
timeout → captura de erro → gravação em `run_steps` e `audit_logs`. Sem acesso direto ao banco pelos agentes.
Ferramentas iniciais reais: `lead.get`, `lead.list`, `lead.create`, `lead.update`, `task.create`, `product.get`,
`history.get`, `knowledge.search`, `report.generate`, `message.send` (via integração autorizada), `automation.run`.
As de escrita e as externas nascem com `requiresApproval = true`. Testes por ferramenta, incluindo negação por permissão.

### CMD-05 — Agent Engine
CRUD completo de agentes com versionamento imutável (`agent_versions` a cada alteração), duplicação,
ativar/desativar, e execução: monta contexto → seleciona modelo → injeta ferramentas permitidas →
loop de tool-calling limitado (mín. 50 passos com `stopWhen`) → persiste `agent_runs` + `run_steps` →
atualiza métricas (execuções, taxa de sucesso, duração média, custo). Modo `test` isolado, sem efeitos externos.
Testes: versionamento, limites, falha de ferramenta, cancelamento.

### CMD-06 — Sistema de Memória
Quatro escopos: curto prazo (in-run), sessão, longo prazo, por entidade (`lead`, `cliente`, `empresa`, `produto`,
`conversa`, `tarefa`, `oportunidade`). Operações: salvar, recuperar, atualizar, corrigir, excluir, consultar.
Controle de relevância: score, `confidence`, `source`, expiração e política de descarte — **não guardar tudo**.
Recuperação híbrida (filtro por entidade + similaridade). Testes: isolamento entre entidades, expiração, correção.

### CMD-07 — Knowledge System / RAG
Ingestão de documentos (texto, markdown, PDF quando disponível), chunking com overlap, embeddings, busca semântica
com filtro de permissão. Toda resposta baseada em conhecimento retorna **trechos + fonte**. Classificação de origem
(`known`/`retrieved`/`inferred`/`unknown`) exposta no resultado do agente. Testes de recuperação e de "não sei".

### CMD-08 — Agentes iniciais
Implemente com instruções, ferramentas e critérios reais:
- **Prospecção** — só fontes autorizadas e informação pública; deduplicação por chave estável; registra origem; envia oportunidade ao `LeadsGateway`. Proibida coleta não autorizada.
- **Qualificação** — scoring **configurável por regras versionadas** (peso por sinal), perfil, potencial, temperatura, sinais de intenção, riscos, **explicação da nota** e próxima ação.
- **Vendas** — abordagem, personalização, argumentos, tratamento de objeções, recomendação de produto a partir do catálogo real; nunca inventar dados de cliente ou produto.
- **Follow-up** — detecta leads sem contato/parados, calcula prioridade, define janela de contato, gera mensagem, cria tarefa, alerta usuário.
- **Analista** — relatórios, padrões, gargalos, conversão, comparação de períodos, perguntas sobre o sistema (via ferramentas, não alucinação).
- **Estrategista** — camada superior: consome saídas dos demais, compara alternativas, prioriza, recomenda estratégia e pode coordenar agentes quando autorizado.
Testes por agente com fixtures determinísticas.

### CMD-09 — Orquestrador
Pipelines declarativos. Pipeline padrão:
`NOVO LEAD → QUALIFICAÇÃO → ANÁLISE → ESTRATÉGIA → ABORDAGEM → FOLLOW-UP → NOVA RESPOSTA → REANÁLISE → PRÓXIMA AÇÃO`.
Responsabilidades: escolher agente, propagar contexto, controlar ferramentas e permissões, acompanhar execução,
tratar erro por passo (retry/skip/abort), interromper, pausar/retomar, registrar decisões e permitir intervenção humana.
Persistência em `orchestrations`. Testes: caminho feliz, falha no meio, pausa e retomada.

### CMD-10 — Decision Engine, permissões e Human-in-the-Loop
Níveis de autonomia: **1 Sugestão · 2 Aprovação · 3 Automação controlada · 4 Autonomia limitada (com limites configuráveis)**.
O nível efetivo é `min(nível do agente, nível da ferramenta, nível do usuário)`. Ações acima do nível geram `approvals`.
Tela e API de aprovação com: aprovar, rejeitar, **editar payload**, interromper, pausar, retomar, revisar, desfazer quando tecnicamente possível.
Cada pedido mostra: **o que** será feito, **por quê**, **quais dados** usou, **qual agente** decidiu, **qual ferramenta** será usada.
Testes: escalonamento de nível, negação, edição antes de executar.

### CMD-11 — Task Engine e Automation Engine
Fila de tarefas com estados, prioridade, agendamento, retry com backoff e idempotência.
Automações no formato `EVENTO → CONDIÇÃO → AGENTE → DECISÃO → AÇÃO → LOG`, com gatilhos reais:
novo lead, lead sem contato, lead quente, mudança de etapa, resposta recebida, tarefa atrasada, oportunidade identificada.
Editor de automações na UI preparado para expansão (passos plugáveis). Execução registrada em `automation_runs`.
Testes: condição falsa não executa, falha de passo não corrompe estado, idempotência sob reentrega.

### CMD-12 — Interface web
Rotas reais, cada uma com `head()` próprio (title/description/og), estados de carregamento, erro e vazio:
- **Dashboard** — status dos agentes, tarefas em execução/concluídas, erros, aprovações pendentes, consumo, custo estimado, automações, atividades recentes, métricas.
- **Central de Agentes** — tabela com nome, função, status, versão, modelo, última execução, taxa de sucesso, execuções; ações: abrir, editar, testar, ativar, desativar, duplicar, ver logs.
- **Playground** — escolher agente e modelo, inserir contexto, selecionar ferramentas, executar com streaming, ver resposta, ferramentas usadas, decisões, consumo e **comparação lado a lado** de dois resultados.
- **Aprovações** — fila human-in-the-loop.
- **Logs & Auditoria** — filtros por usuário, agente, modelo, período, status, ferramenta; busca textual; detalhe do run com passos.
Sem controle sem ação. Design com tokens semânticos, nada de cor fixa em componente.

### CMD-13 — Segurança
Autenticação, autorização por RBAC (`user_roles` + `has_role`), sessões, proteção e criptografia de credenciais,
segredos por variável de ambiente, validação de entrada em toda borda, **rate limiting** por usuário/chave/agente,
logs de segurança, isolamento de execução de ferramentas (sem eval, sem acesso fora do registry),
proteção contra execução não autorizada e contra injeção de prompt (separação instrução × dado, sanitização de conteúdo recuperado).
Entregue `docs/SEGURANCA.md` + testes de autorização negativa.

### CMD-14 — API pública e camada de integração com o ECOMIM LEADS
Implemente `/api/v1/ai/*` conforme a Parte C, versionada e documentada (OpenAPI em `docs/openapi.yaml`).
Crie `LeadsGateway` como **interface**: `getLead`, `listLeads`, `createLead`, `updateClassification`, `addTags`,
`createTask`, `registerRecommendation`, `getHistory`, `triggerAutomation`.
Duas implementações: `LocalLeadsAdapter` (persistido em `leads_mirror`, funcional hoje) e `HttpLeadsAdapter`
(pronto, ativado por env quando o ECOMIM LEADS existir). Webhook assinado para eventos de lead.
**Sem acoplamento direto** entre os módulos. Testes de contrato garantindo que os dois adapters satisfazem a mesma interface.

### CMD-15 — Observabilidade, testes e documentação
Métricas: execuções, sucesso, falhas, tempo, consumo, custo, ferramentas usadas, agentes mais usados, automações executadas —
expostas em `/api/v1/ai/usage` e no Dashboard. Endpoint `/health` com status por provedor e integração.
Suíte de testes cobrindo: unidade, integração, API, permissões, agentes, ferramentas, automações, memória, banco e tratamento de erros;
mais os fluxos principais ponta a ponta. Documentação em `docs/`: arquitetura, instalação, configuração, variáveis de ambiente,
banco, API, agentes, ferramentas, automações, permissões, testes, troubleshooting e integração com outros módulos.

### CMD-16 — Auditoria final da FASE 2
Percorra e verifique **executando**: funcionalidades, banco, APIs, agentes, memória, ferramentas, permissões, automações,
segurança, logs, testes, performance, tratamento de erros, documentação e prontidão para o ECOMIM LEADS.
Produza `docs/AUDITORIA_FASE2.md` com tabela `item · status (OK/FALHA/BLOQUEADO) · evidência · ação`.
Corrija tudo o que for corrigível. O que depender de credencial, serviço externo ou decisão futura entra em
`docs/DEPENDENCIAS_EXTERNAS.md` com o motivo e o que é necessário para destravar.

---

# PARTE E — MATRIZ DE ERROS (comportamento exigido)

| Cenário | Comportamento |
|---|---|
| Provedor de IA indisponível | fallback para próximo modelo; se todos falharem, run `failed` com `code=AI_PROVIDER_UNAVAILABLE` e mensagem clara na UI |
| Timeout de modelo/ferramenta | aborta o passo, grava `run_steps.error`, marca `retryable` |
| 429 / limite de requisições | backoff exponencial (máx. 3 tentativas), depois falha explícita |
| Créditos esgotados (402) | erro de billing visível ao usuário, sem retry |
| Resposta inválida do modelo | tenta reparo estruturado uma vez; senão falha com o texto bruto anexado ao log |
| Ferramenta indisponível | passo marcado `skipped_unavailable`, orquestração decide seguir ou abortar |
| Dados insuficientes | agente retorna `unknown` + lista do que falta; **nunca inventa** |
| Falha de autenticação | 401/403 sem vazar detalhe interno; registrado em log de segurança |
| Erro de banco | transação revertida, run `failed`, alerta em Observabilidade |
| Interrupção humana | run `cancelled`, efeitos já aplicados registrados, nada parcial silencioso |

---

# PARTE F — CRITÉRIOS DE ACEITE DA FASE 2

- [ ] Nenhum botão sem ação; nenhum dado simulado apresentado como real
- [ ] Todas as tabelas da Parte B criadas com GRANT + RLS + políticas
- [ ] AI Core com múltiplos provedores, fallback, custo e streaming comprovados por teste
- [ ] 6 agentes iniciais funcionando com ferramentas reais e execuções persistidas
- [ ] Orquestrador executando o pipeline completo, com pausa, retomada e cancelamento
- [ ] Memória nos 4 escopos, com relevância e expiração
- [ ] RAG retornando trechos com fonte e respondendo "não sei" quando for o caso
- [ ] 4 níveis de autonomia aplicados, com fila de aprovação funcional e edição de payload
- [ ] Automações executando de ponta a ponta e registradas
- [ ] Dashboard, Central de Agentes, Playground, Aprovações e Logs operacionais
- [ ] `/api/v1/ai/*` documentada e testada; `LeadsGateway` com dois adapters intercambiáveis
- [ ] Suíte de testes verde e documentação completa em `docs/`
- [ ] `docs/AUDITORIA_FASE2.md` e `docs/DEPENDENCIAS_EXTERNAS.md` entregues

---

# PARTE G — VARIÁVEIS DE AMBIENTE (servidor)

| Variável | Uso | Obrigatória |
|---|---|---|
| `AI_GATEWAY_URL` | endpoint do gateway de IA | sim |
| `AI_API_KEY` | credencial do gateway | sim |
| `AI_DEFAULT_MODEL` / `AI_FALLBACK_MODELS` | seleção e cadeia de fallback | sim |
| `AI_MAX_TOKENS` / `AI_TIMEOUT_MS` / `AI_MAX_RETRIES` | limites de execução | não (default) |
| `DATABASE_URL` / credenciais do banco | persistência | sim |
| `SERVICE_ROLE_KEY` | operações privilegiadas no servidor | sim |
| `LEADS_API_URL` / `LEADS_API_KEY` | ativa o `HttpLeadsAdapter` | não (Fase 3) |
| `LEADS_WEBHOOK_SECRET` | verificação de assinatura do webhook | quando houver Leads |
| `RATE_LIMIT_*` | limites por usuário/chave | não (default) |
| `ENCRYPTION_KEY` | criptografia de credenciais de integração | sim |

Ausência de variável obrigatória deve **falhar na inicialização** com mensagem explícita — nunca degradar em silêncio.
