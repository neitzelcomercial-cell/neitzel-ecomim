# 📐 ECOMIM — ESPECIFICAÇÃO MAESTRA UNIFICADA

> **Data:** 2026-08-14 · **Base:** todas as especificações, etapas e código da pasta ECOMIM
> **Missão:** um sistema operacional empresarial local-first, seguro, funcional e com apoio de IA em todos os módulos
> **Princípio-guia:** tudo REAL ou explicitamente `PENDING_EXTERNAL_INTEGRATION` — nada de fachada

---

## 1. O QUE É O ECOMIM (visão unificada)

Sistema Operacional Corporativo (SOC) que integra CRM, Comercial, Marketing, Atendimento, Clientes (CS), Financeiro, Projetos, RH, BI, Agenda, Automações, Integrações e Extensões — com **IA como camada nativa** em todos os módulos, e segurança/privacidade por padrão (dados locais, LGPD, auditoria).

**Valores (das specs):** Integração · Automação · Simplicidade · Segurança · Escalabilidade · Inteligência · Confiabilidade · Transparência.

**Filosofia (Etapa Final Vision):** *"Todos os módulos conversam entre si · Nenhum módulo funciona isoladamente · Tudo gera dados · Tudo gera inteligência · Tudo pode ser automatizado · Tudo pode utilizar IA."*

---

## 2. PRINCÍPIOS INVIOLÁVEIS (herdados das 5 fases)

1. **Nada de fachada** — todo botão tem lógica real, estado real, persistência, tratamento de erro, validação e log. Nada simulado como real.
2. **Honestidade de integração** — integração sem credencial → status explícito `BLOQUEADO_POR_CREDENCIAL` / `PENDING_EXTERNAL_INTEGRATION`, nunca mock silencioso em produção.
3. **Fontes confiáveis** — informação classificada `known` (dado do sistema) / `retrieved` (busca/ferramenta) / `inferred` (IA) / `unknown` (não inventar).
4. **Dinheiro e estoque sagrados** — inteiro de centavos, transação, idempotência, auditoria imutável.
5. **Dados locais por padrão** — persistência local com camada de storage + exportação/importação criptografada (AES-GCM).
6. **IA com escopo e proibições** — IA nunca confirma pedido, nunca aprova desconto/proposta, nunca movimenta estoque, nunca registra pagamento, nunca exclui registro. Human-in-the-loop (níveis 1–4).
7. **Idempotência obrigatória** — em todo efeito externo/financeiro; DELETE nunca em financeiro/estoque; auditoria append-only.
8. **Segurança por padrão** — RBAC com papéis fora da tabela de usuários, permissões `modulo.acao`, MFA opcional, logs com scrubbing de segredos, segredos nunca no frontend.
9. **Máquina de estados explícita** — transição inválida → erro de validação, nunca gravação silenciosa.
10. **Não reescrever o que funciona** — o LeadsCRM funcional é a base real; evoluímos a partir dele.

---

## 3. ARQUITETURA ALVO (local-first, evoluível)

```
┌─────────────────────────────────────────────────────────────┐
│  ECOMIM CORE (navegador / file:// e localhost)              │
│  • Kernel: AppShell, Sidebar, Module Registry, Event Bus,   │
│    Memory, Audit, Notifications, Settings, Integrations     │
│  • Segurança: PIN/Login local, RBAC, auditoria, backup AES  │
├─────────────────────────────────────────────────────────────┤
│  MÓDULOS (plugáveis via manifest, conversam por eventos)     │
│  CRM/Comercial · Agenda · Marketing · Atendimento ·         │
│  Clientes/CS · Financeiro · Projetos · RH · BI ·            │
│  Automações · Integrações · Extensões/Marketplace           │
├─────────────────────────────────────────────────────────────┤
│  CAMADA DE IA (assistente, agentes por módulo, guardrails,  │
│  custo, human-in-the-loop)                                  │
│  → API real (gateway OpenAI-compatível) OU status explícito │
├─────────────────────────────────────────────────────────────┤
│  DADOS: local-first, backup criptografado AES, export/import│
│  CSV/JSON, eventos para integrações futuras                 │
└─────────────────────────────────────────────────────────────┘
```

**Decisões de arquitetura (registradas):**
- **AD-01:** Monólito modular no navegador (compatível com a Fase 1 local) em vez de microsserviços — roda hoje, sem credenciais de servidor.
- **AD-02:** Dados locais com backup criptografado; camada de storage abstrata preparada para `PostgresStorage` futuro.
- **AD-03:** Event Bus interno (outbox local) com eventos canônicos (`lead.*`, `customer.*`, `proposal.*`, `order.*`, `payment.*`, `message.*`, `task.*`) — módulos conversam por eventos.
- **AD-04:** IA via gateway compatível OpenAI com fallback para motor local determinístico; sem chave → painel avisa e tudo funciona sem IA.
- **AD-05:** Integrações externas somente com credencial real (Meta Cloud API, SMTP, PIX etc.) → status `PENDING_EXTERNAL_INTEGRATION` com a dependência nomeada.

---

## 4. MODELO DE DADOS NÚCLEO (local-first)

### 4.1 Domínios e coleções (localStorage `ecomim_*`)

| Domínio | Coleção | Campos-chave |
|---|---|---|
| Identidade | `users`, `roles`, `permissions` | papéis NUNCA em users — tabela separada |
| CRM | `leads`, `contatos`, `empresas`, `fila`, `historico` | dedupe: nome normalizado · telefone · email |
| Comercial | `oportunidades`, `propostas`, `pedidos`, `produtos`, `price_tables` | dinheiro em centavos (`_cents`), snapshots de item |
| Marketing | `campanhas`, `landing_pages`, `formularios`, `segmentos` | consentimento LGPD obrigatório |
| Atendimento | `tickets`, `conversas`, `mensagens`, `filas_atendimento`, `sla` | máquina de estados de ticket |
| Clientes/CS | `clientes`, `contratos`, `onboarding`, `health_scores`, `renovacoes` | score recalculado por regras + IA |
| Financeiro | `contas_receber`, `contas_pagar`, `fluxo_caixa`, `comissoes`, `notas_fiscais` | inteiro centavos, auditoria |
| Projetos | `projetos`, `tarefas`, `checklists`, `sprints`, `horas`, `evidencias` | dependências, aprovações |
| RH | `colaboradores`, `departamentos`, `cargos`, `avaliacoes`, `treinamentos` | LGPD estrito |
| BI | `dashboards`, `indicadores`, `alertas`, `relatorios` | snapshots, consultas IA |
| Agenda | `agenda_eventos`, `lembretes`, `disponibilidade` | conflitos, rota |
| Automações | `automacoes`, `regras`, `execucoes` | idempotência, dry-run |
| Platform | `settings`, `audit_log`, `event_log`, `notificacoes`, `api_keys` | append-only audit |

### 4.2 Regras de dados críticas
- **Dinheiro:** inteiro de centavos + moeda BRL; half-up só na exibição; totais sempre recalculados na lógica central.
- **IDs:** UUID v4 local (v7 quando houver servidor).
- **Timestamps:** ISO-8601 UTC; exibição no fuso local.
- **Auditoria:** append-only; sem UPDATE/DELETE; registra actor, acao, entidade, antes/depois, trace_id.
- **Snapshots:** itens de pedido/proposta guardam nome/SKU/preço no momento — alterar catálogo não reescreve histórico.
- **Consentimento:** toda coleta tem consentimento (LGPD); palavras STOP (`SAIR`, `PARAR`, `STOP`, `DESCADASTRAR`, `CANCELAR`) gravam opt-out e param sequências.

### 4.3 Eventos canônicos (outbox local)
`lead.created` · `lead.qualified` · `customer.created` · `opportunity.stage_changed` · `proposal.sent` · `proposal.accepted` · `order.created` · `order.paid` · `order.delivered` · `payment.received` · `task.created` · `task.overdue` · `message.inbound` · `ticket.created` · `ticket.closed` · `contract.expiring` · `repurchase.due` · `stock.low` · `campaign.finished` · `automation.run_finished`

---

## 5. CAMADA DE IA (com apoio real, sem fachada)

| Capacidade | Implementação | Sem chave de API? |
|---|---|---|
| Assistente por módulo (perguntas, resumos, próximos passos) | `ai.generate` via gateway OpenAI-compatível | Painel avisa; módulos seguem sem IA |
| Sugestões de resposta/follow-up | `ai.generate` + sources | Idem |
| Classificação/sentimento de mensagem e ticket | `ai.classify` | Idem |
| Resumo de conversa/histórico/contrato | `ai.generate` | Idem |
| Health score / risco de churn / predição de receita | Regras determinísticas + IA opcional | Regras sempre ativas |
| Agentes por módulo (Marketing, CS, Financeiro, Projetos, RH…) | `agents` com ferramentas restritas | Listados como indisponíveis |
| **Proibições obrigatórias** | IA nunca executa efeito financeiro/estoque/envio sem aprovação humana; nunca exclui | Sempre ativas |

**Fundamento de honestidade (Fase 2):** origens `known/retrieved/inferred/unknown`; resposta de IA sempre com `sources` e motivo.

---

## 6. SEGURANÇA

1. **Acesso:** PIN/login local (hash + salt), bloqueio por inatividade, MFA TOTP opcional.
2. **RBAC:** papéis nunca na tabela de users; `has_permission(usuario, "modulo.acao")`.
3. **Dados:** persistência local com envelope criptografado (WebCrypto AES-GCM) quando ativado; backup com senha (AES) e importação validada.
4. **Logs:** scrubbing de segredos; auditoria append-only de ações sensíveis (preço, desconto, aprovação, cancelamento, ajuste de estoque, pagamento, estorno, permissão).
5. **Integrações:** webhooks assinados (HMAC timing-safe); credenciais armazenadas criptografadas; zero dado de cartão (só tokens/referências quando houver provedor).
6. **Exportação LGPD:** exportar tudo de um titular; anonimização preservando metadados contábeis.
7. **Código:** sem `eval`; sem injeção de prompt (separação instrução × dado); sanitização de conteúdo recuperado.

---

## 7. MÓDULOS E ORDEM DE CONSTRUÇÃO

| # | Módulo | Base real existente | Entregável |
|---|---|---|---|
| 1 | **Núcleo/Shell** | ECOMIM_OS core.js + CSS | Kernel, navegação, perfil, settings, auditoria, eventos |
| 2 | **CRM/Comercial** | LeadsCRM WIP (funcional) | Leads, fila, funil, clientes, oportunidades, propostas, pedidos |
| 3 | **Comunicação** | extensão + crm_bridge | Central de mensagens, contatos, e-mail real configurável, status por canal |
| 4 | **Financeiro** | core.js financeiro | Contas, fluxo, comissões, cobranças (PIX sem provedor → registro manual + status) |
| 5 | **Agenda** | core.js agenda | Calendário, tarefas, lembretes, conflitos, sugestão de horários |
| 6 | **Automações** | core.js automacoes | Motor evento→condição→ação, dry-run, templates |
| 7 | **BI** | core.js bi | Dashboards, indicadores, alertas, consulta em linguagem natural (IA) |
| 8 | **Atendimento** | core.js atendimento | Caixa unificada, tickets, SLA, filas, respostas prontas |
| 9 | **Clientes/CS** | core.js clientes | Perfil 360°, onboarding, health score, churn, renovações |
| 10 | **Marketing** | core.js marketing | Campanhas, landing pages, formulários, nutrição, scoring |
| 11 | **Projetos** | core.js projetos | Projetos, tarefas, kanban/gantt, horas, custos |
| 12 | **RH** | core.js rh | Colaboradores, cargos, avaliações, treinamentos |
| 13 | **Integrações/Extensões** | extensao/ | Hub, webhooks, coleta de dados externos |
| 14 | **Marketplace/Extensões** | — | Catálogo de módulos/templates/agentes (local + futura loja) |

> Os módulos 1–4 aproveitam código real existente (LeadsCRM). Os demais seguem o padrão das specs (nada de fachada: o que não tem provedor externo mantém `PENDING_EXTERNAL_INTEGRATION`).

---

## 8. DEFINIÇÃO DE PRONTO (checklist por módulo/função)

- [ ] Lógica real (sem botão inerte)
- [ ] Persistência local + restauração
- [ ] Validação de entrada (schema na borda)
- [ ] Tratamento de erros tipado com `trace_id`
- [ ] Auditoria quando ação sensível
- [ ] Permissão verificada na lógica central
- [ ] Teste executável (Node ou teste manual guiado)
- [ ] Documentação + status de integração explícito
- [ ] IA com guardrails e `sources` (ou "sem IA configurada")

---

## 9. PENDÊNCIAS ESTRUTURAIS REGISTRADAS (do diagnóstico CMD-00)

| Dependência | Status | Ação no ECOMIM 2 |
|---|---|---|
| PostgreSQL/RLS | sem credenciais | storage local first; camada pronta para trocar |
| AI_GATEWAY_URL / AI_API_KEY | sem credenciais | IA via configuração opcional; tudo funciona sem |
| SERVICE_ROLE_KEY / ENCRYPTION_KEY | sem credenciais | criptografia local WebCrypto + backup AES (senha do usuário) |
| Webhook LEADS | não existia | construir outbox local + endpoint de eventos |
| PAYMENT_PROVIDER | sem credencial | cobranças com registro manual + status `PENDING_EXTERNAL_INTEGRATION` |
| MAIL_PROVIDER | sem credencial | e-mail via SMTP configurável — senão status explícito |
| WhatsApp/Meta Cloud | sem WABA | canal WhatsApp com status explícito + modo manual |

---

## 10. ESTADO DA ARTE E LACUNAS (da extração de código)

**O que existe e funciona:**
- **core.js (ECOMIM_OS):** motor completo — 13 módulos de negócio, IA com motor local + gateway remoto, automações, auditoria, evento bus, criptografia AES-GCM + fallback, jobs, registry. **Sem UI (app.js ausente).**
- **LeadsCRM WIP:** sistema funcional — prospecção real (OSM/Overpass), fila, CRM, funil DnD, agenda, backup AES, CSV.
- **Extensão Chrome:** caçador de contatos funcional (coleta de abas, extração, ponte) — **mas o listener `leadsExternos` não existe no app (ponte órfã).**

**Lacunas a fechar nesta construção:**
1. Criar `app.js` — a camada de UI completa sobre o core.js (shell, módulos, IA, automações).
2. Migrar dados do LeadsCRM (`leadsCRM_agente_v2`) → core (`ecomim_os_db_v1`), com conversão valor float→centavos.
3. Escutar `leadsExternos` no app para religar a extensão ao sistema (com dedup real).
4. Unificar modelo de dados e nomes (histórico, vendedorId→vendedor, created ISO).
5. Reforçar backup (salt aleatório, mais iterações, chunking para arquivos grandes) e suporte a `file://`.