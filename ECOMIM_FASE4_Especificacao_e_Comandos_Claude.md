# ECOMIM — FASE 4 · SISTEMA DE COMUNICAÇÃO
## Especificação Técnica Executável + Comandos para o Claude

> **Como usar este documento**
> 1. Copie o **BLOCO DE CONTEXTO PERMANENTE** (§0) no início de **toda** sessão com o Claude.
> 2. Execute os comandos `CMD-00` … `CMD-22` **em ordem**, um por mensagem.
> 3. Ao final de cada comando, exija o **Relatório de Etapa** (§14.2) antes de avançar.
> 4. Nada é "concluído" porque a interface apareceu. Só é concluído com teste passando.

---

# 0. BLOCO DE CONTEXTO PERMANENTE

```
Você é o arquiteto e desenvolvedor principal da FASE 4 do ECOMIM — ECOMIM COMUNICAÇÃO.

CONTEXTO DO ECOSSISTEMA
- FASE 1 — ECOMIM LEADS: captura, organização, qualificação e gestão de leads.
- FASE 2 — ECOMIM IA: agentes, memória, ferramentas, orquestração, human-in-the-loop.
- FASE 3 — ECOMIM COMERCIAL: clientes, produtos, estoque, oportunidades, propostas,
  pedidos, pagamentos, pós-venda, recompra.
- FASE 4 — ECOMIM COMUNICAÇÃO (esta fase): central unificada de comunicação
  multicanal (WhatsApp, e-mail, Instagram, Messenger, SMS, telefonia, interno).

REGRAS INEGOCIÁVEIS
1. NADA DE FACHADA. Proibido: conversas falsas, mensagens simuladas apresentadas
   como reais, botões sem ação, "integração concluída" sem provedor real.
2. Toda funcionalidade é REAL ou está explicitamente marcada como
   `PENDING_EXTERNAL_INTEGRATION` na UI e na documentação, com a dependência nomeada.
3. Somente APIs OFICIAIS e métodos autorizados. Proibido qualquer mecanismo para
   contornar autenticação, limites, bloqueios ou termos de uso das plataformas.
4. Proibido inventar endpoints, campos ou comportamentos de APIs externas.
   Se não souber, declare "não verificado" e pare.
5. Módulo INDEPENDENTE: comunicação com LEADS/IA/COMERCIAL apenas por
   contratos de dados, serviços, eventos e webhooks. Sem acoplamento direto a
   tabelas de outros módulos além das FKs de identidade definidas em §3.
6. Multi-tenant obrigatório: toda tabela tem `org_id`; RLS habilitada; GRANTs
   explícitos; nenhuma query sem escopo de organização.
7. Segredos (tokens, api keys, app secrets) NUNCA no frontend, nunca em tabela
   sem criptografia, nunca em log. Só em cofre de segredos do runtime servidor.
8. Idempotência obrigatória em tudo que vem de fora (webhooks, callbacks de status,
   envios com retry).
9. Dinheiro em inteiros (centavos). Timestamps em `timestamptz` UTC.
10. Não reescrever o que já existe nas fases 1–3. Reutilizar. Não duplicar código.
11. Nenhuma etapa é concluída sem: código verificado, testes passando, banco
    verificado, permissões verificadas, documentação atualizada.

FORMATO DE RESPOSTA A CADA COMANDO
A. O que foi implementado (arquivos criados/alterados)
B. Migrations aplicadas (SQL resumido)
C. Testes criados e resultado da execução
D. Dependências externas necessárias e status
E. Pendências / o que NÃO foi feito e por quê
F. Próximo comando sugerido
```

---

# 1. ARQUITETURA

## 1.1 Visão em camadas

```
┌───────────────────────────────────────────────────────────────┐
│  UI  — Inbox, Conversa, Contatos, Campanhas, Sequências,      │
│        Templates, Canais, Relatórios, Configurações           │
└───────────────▲───────────────────────────────────────────────┘
                │ server functions (RPC tipado) / REST v1
┌───────────────┴───────────────────────────────────────────────┐
│  APPLICATION LAYER                                            │
│  ConversationService · MessageService · ContactIdentityService │
│  TemplateService · CampaignService · SequenceEngine            │
│  ConsentService · SLAService · AICopilotService                │
└───────────────▲───────────────────────────────────────────────┘
                │
┌───────────────┴───────────────────────────────────────────────┐
│  CHANNEL ABSTRACTION LAYER  (o coração da expansibilidade)     │
│  ChannelDriver interface  ──►  registry de drivers             │
│   ├─ EmailDriver        (real)                                 │
│   ├─ WhatsAppCloudDriver(oficial Meta Cloud API)               │
│   ├─ MessengerDriver    (oficial Meta)                         │
│   ├─ InstagramDriver    (oficial Meta)                         │
│   ├─ SmsDriver          (provedor configurável)                │
│   ├─ VoiceDriver        (provedor configurável)                │
│   └─ InternalDriver     (notificações internas, sempre real)   │
└───────────────▲──────────────────────────▲────────────────────┘
                │                          │
┌───────────────┴────────────┐  ┌──────────┴────────────────────┐
│ OUTBOUND QUEUE             │  │ INBOUND WEBHOOK GATEWAY       │
│ validação→fila→envio→status│  │ verificação assinatura →      │
│ retry/backoff/rate limit   │  │ dedupe → normalização → evento│
└───────────────▲────────────┘  └──────────▲────────────────────┘
                │                          │
┌───────────────┴──────────────────────────┴────────────────────┐
│  EVENT BUS (outbox transacional)                              │
│  comm.message.received / .sent / .status_changed              │
│  comm.conversation.created / .assigned / .closed              │
│  → consumido por: IA (F2), LEADS (F1), COMERCIAL (F3),         │
│    AUTOMAÇÕES (futuro), SLA, Sequências, Analytics             │
└───────────────────────────────────────────────────────────────┘
```

## 1.2 Princípio central: `ChannelDriver`

Todo canal implementa **o mesmo contrato**. Adicionar um canal = escrever um driver + registrar. Nenhuma alteração no núcleo.

```ts
// src/modules/comm/channels/driver.ts
export type Capability =
  | 'send_text' | 'send_media' | 'send_template' | 'send_location'
  | 'receive'   | 'status_delivered' | 'status_read'
  | 'typing_indicator' | 'reactions' | 'threads'
  | 'session_window'   // ex.: janela de 24h do WhatsApp
  | 'attachments_inbound';

export interface ChannelDriver {
  readonly channelType: ChannelType;         // 'whatsapp' | 'email' | ...
  readonly capabilities: ReadonlySet<Capability>;

  /** Valida credenciais reais contra o provedor. Nunca retorna true "otimista". */
  verifyCredentials(acc: ChannelAccount): Promise<VerifyResult>;

  /** Envio real. Deve ser idempotente via clientMessageId. */
  send(input: OutboundMessage, acc: ChannelAccount): Promise<SendResult>;

  /** Verifica assinatura do webhook. Falha ⇒ 401, sem processar. */
  verifyWebhook(req: RawRequest, acc: ChannelAccount): Promise<boolean>;

  /** Converte payload do provedor em eventos canônicos do ECOMIM. */
  parseWebhook(req: RawRequest, acc: ChannelAccount): Promise<InboundEvent[]>;

  /** Regras do provedor: janelas, template obrigatório, limites. */
  preflight(input: OutboundMessage, ctx: PreflightCtx): Promise<PreflightVerdict>;
}
```

`PreflightVerdict` é o mecanismo que impede fachada:
`{ ok: true } | { ok: false, code: 'OUTSIDE_SESSION_WINDOW' | 'TEMPLATE_REQUIRED' | 'CONSENT_MISSING' | 'RATE_LIMITED' | 'CHANNEL_NOT_CONFIGURED' | 'CAPABILITY_UNSUPPORTED', message: string }`

## 1.3 Status de integração por canal (fonte da verdade da UI)

Cada `channel_accounts` tem `integration_status`:

| status | significado | UI |
|---|---|---|
| `not_configured` | sem credencial | canal aparece cinza, botão "Configurar" |
| `configured_unverified` | credencial salva, não validada | badge amarelo, envio **bloqueado** |
| `verified` | `verifyCredentials()` retornou OK contra o provedor | canal ativo |
| `error` | credencial inválida/expirada/revogada | badge vermelho + último erro |
| `disabled` | desligado pelo admin | oculto do compositor |

**Regra:** o compositor de mensagem só habilita um canal com `verified`. Nada de botão que não envia.

---

# 2. MODELO DE DADOS (PostgreSQL)

> Todas as tabelas em `public`, com `org_id uuid not null`, `created_at/updated_at timestamptz default now()`, RLS ligada e GRANTs explícitos. Padrão obrigatório após cada `CREATE TABLE`:
> ```sql
> GRANT SELECT, INSERT, UPDATE, DELETE ON public.<t> TO authenticated;
> GRANT ALL ON public.<t> TO service_role;
> ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;
> CREATE POLICY "<t>_org" ON public.<t> FOR ALL TO authenticated
>   USING (org_id = public.current_org_id()) WITH CHECK (org_id = public.current_org_id());
> ```

## 2.1 Enums

```sql
CREATE TYPE channel_type AS ENUM
  ('whatsapp','email','instagram','messenger','sms','voice','internal','webchat');

CREATE TYPE integration_status AS ENUM
  ('not_configured','configured_unverified','verified','error','disabled');

CREATE TYPE conversation_status AS ENUM
  ('open','pending','waiting_customer','snoozed','resolved','closed','archived');

CREATE TYPE priority_level AS ENUM ('low','normal','high','urgent');

CREATE TYPE message_direction AS ENUM ('inbound','outbound','internal');

CREATE TYPE message_kind AS ENUM
  ('text','image','video','audio','document','location','template',
   'system_event','internal_note','call');

CREATE TYPE message_status AS ENUM
  ('pending','queued','sending','sent','delivered','read','failed','canceled');

CREATE TYPE consent_state AS ENUM ('opt_in','opt_out','unknown');

CREATE TYPE campaign_status AS ENUM
  ('draft','scheduled','running','paused','completed','canceled','failed');

CREATE TYPE sequence_run_status AS ENUM
  ('active','paused','completed','stopped_replied','stopped_manual',
   'stopped_condition','failed');

CREATE TYPE ai_autonomy_level AS ENUM ('L1_suggest','L2_approve','L3_auto_allowed','L4_bounded');
```

## 2.2 Canais e contas

```sql
CREATE TABLE public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  type channel_type NOT NULL,
  name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  capabilities jsonb NOT NULL DEFAULT '[]',      -- espelho do driver, cache
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, type, name)
);

CREATE TABLE public.channel_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  provider text NOT NULL,                 -- 'meta_cloud_api' | 'smtp_imap' | ...
  external_account_id text,               -- phone_number_id, page_id, mailbox...
  display_identity text,                  -- +55..., contato@empresa.com, @perfil
  -- NUNCA credenciais em claro:
  secret_ref text,                        -- ponteiro para o cofre de segredos
  config jsonb NOT NULL DEFAULT '{}',     -- só dados NÃO sensíveis
  integration_status integration_status NOT NULL DEFAULT 'not_configured',
  last_verified_at timestamptz,
  last_error jsonb,
  webhook_secret_ref text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, channel_id, external_account_id)
);
```

> **Segredos:** `secret_ref` aponta para o cofre do runtime (env/secret manager). Se for absolutamente necessário guardar em banco, usar `pgcrypto` com chave fora do banco e coluna `bytea`. Nunca `text` legível. Nunca retornado por API.

## 2.3 Identidade unificada de contato

```sql
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  display_name text,
  -- vínculos frouxos com outros módulos (nullable, sem FK cruzada rígida):
  lead_id uuid,                 -- F1
  customer_id uuid,             -- F3
  preferred_channel channel_type,
  timezone text,
  locale text,
  notes text,
  merged_into_contact_id uuid REFERENCES public.contacts(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.contact_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel_type channel_type NOT NULL,
  identity_value text NOT NULL,          -- E.164, e-mail normalizado, IGSID, PSID
  identity_hash text NOT NULL,           -- normalizado + hash p/ busca segura
  verified boolean NOT NULL DEFAULT false,
  confidence numeric(3,2) NOT NULL DEFAULT 1.00,
  source text NOT NULL,                  -- 'inbound_message'|'manual'|'import'|'crm'
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  UNIQUE (org_id, channel_type, identity_value)
);
```

**Regra anti-fusão indevida (§15 do briefing):**
- Vínculo **automático** só com identificador forte e exato: `E.164` do WhatsApp/SMS, e-mail normalizado, `PSID`/`IGSID` do mesmo app.
- Nome, empresa ou similaridade **nunca** fundem automaticamente → geram `merge_suggestions` para revisão humana.
- Merge é operação auditada e **reversível por 30 dias** (`contact_merge_log` guarda o snapshot).

```sql
CREATE TABLE public.contact_merge_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  contact_a uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  contact_b uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  score numeric(3,2) NOT NULL,
  reasons jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending',  -- pending|accepted|rejected
  decided_by uuid, decided_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

## 2.4 Conversas e mensagens

```sql
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  protocol text NOT NULL,                       -- ex.: CV-2026-000123 (sequencial/org)
  channel_id uuid NOT NULL REFERENCES public.channels(id),
  channel_account_id uuid NOT NULL REFERENCES public.channel_accounts(id),
  contact_id uuid REFERENCES public.contacts(id),
  external_thread_id text,                      -- wa_id, thread-id, Message-ID root
  subject text,                                 -- e-mail
  status conversation_status NOT NULL DEFAULT 'open',
  priority priority_level NOT NULL DEFAULT 'normal',
  assigned_user_id uuid,
  assigned_team_id uuid,
  assigned_agent_id uuid,                       -- agente da F2
  is_read boolean NOT NULL DEFAULT false,
  unread_count int NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  snooze_until timestamptz,
  session_expires_at timestamptz,               -- janela 24h WhatsApp
  -- vínculos comerciais (F3), todos opcionais:
  opportunity_id uuid, proposal_id uuid, order_id uuid,
  meta jsonb NOT NULL DEFAULT '{}',
  search_tsv tsvector,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, protocol),
  UNIQUE (org_id, channel_account_id, external_thread_id)
);

CREATE INDEX ON public.conversations (org_id, status, last_message_at DESC);
CREATE INDEX ON public.conversations (org_id, assigned_user_id, status);
CREATE INDEX ON public.conversations USING gin (search_tsv);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  channel_type channel_type NOT NULL,
  direction message_direction NOT NULL,
  kind message_kind NOT NULL DEFAULT 'text',
  body text,
  body_html text,                                -- e-mail
  template_id uuid REFERENCES public.message_templates(id),
  template_vars jsonb,
  sender_user_id uuid,
  sender_agent_id uuid,
  sender_contact_id uuid,
  recipient_identity text,
  status message_status NOT NULL DEFAULT 'pending',
  -- idempotência:
  client_message_id text,                        -- gerado por nós (outbound)
  external_message_id text,                      -- id do provedor
  in_reply_to_message_id uuid REFERENCES public.messages(id),
  error jsonb,
  provider_raw jsonb,                            -- payload bruto p/ auditoria
  is_ai_generated boolean NOT NULL DEFAULT false,
  ai_approved_by uuid,
  sent_at timestamptz, delivered_at timestamptz, read_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (org_id, channel_type, external_message_id),
  UNIQUE (org_id, client_message_id)
);

CREATE INDEX ON public.messages (conversation_id, created_at DESC);
CREATE INDEX ON public.messages (org_id, status) WHERE status IN ('pending','queued','sending');

CREATE TABLE public.message_status_events (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  status message_status NOT NULL,
  occurred_at timestamptz NOT NULL,
  provider_code text, provider_detail jsonb,
  UNIQUE (message_id, status, occurred_at)
);

CREATE TABLE public.message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  file_name text NOT NULL, mime_type text NOT NULL, size_bytes bigint,
  storage_path text NOT NULL,          -- bucket privado
  external_media_id text,
  checksum_sha256 text,
  scan_status text NOT NULL DEFAULT 'pending',   -- pending|clean|rejected
  created_at timestamptz DEFAULT now()
);
```

**Máquina de estados da mensagem** (transições válidas, forçadas por trigger):
```
pending → queued → sending → sent → delivered → read
   ↓         ↓        ↓        ↓
canceled  canceled  failed   failed
```
Retrocesso é ignorado (webhook fora de ordem nunca rebaixa `read` para `delivered`).
Canal sem suporte a `delivered`/`read` simplesmente não emite esses eventos — a UI mostra "não suportado por este canal", nunca um ícone falso.

## 2.5 Templates, respostas rápidas, tags, notas

```sql
CREATE TABLE public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,     -- message|email|quick|campaign|followup|postsale|
                              -- billing|confirmation|proposal|reactivation
  channel_type channel_type,
  subject text,
  body text NOT NULL,         -- com {{variaveis}}
  body_html text,
  variables jsonb NOT NULL DEFAULT '[]',   -- [{key,label,required,type,sample}]
  -- WhatsApp: template precisa de aprovação da Meta
  requires_provider_approval boolean NOT NULL DEFAULT false,
  provider_template_name text,
  provider_approval_status text,           -- null|pending|approved|rejected
  provider_rejection_reason text,
  language text DEFAULT 'pt_BR',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, code)
);

CREATE TABLE public.quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL, category text, shortcut text, title text NOT NULL,
  body text NOT NULL, is_favorite boolean DEFAULT false, owner_user_id uuid,
  is_shared boolean DEFAULT true, usage_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL, name text NOT NULL, color text, kind text,
  UNIQUE (org_id, name)
);
CREATE TABLE public.conversation_tags (
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_id uuid REFERENCES public.tags(id) ON DELETE CASCADE,
  org_id uuid NOT NULL, added_by uuid, added_at timestamptz DEFAULT now(),
  PRIMARY KEY (conversation_id, tag_id)
);

CREATE TABLE public.internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL, body text NOT NULL,
  mentions uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
```

> **Nota interna nunca vira mensagem enviável.** Ela vive em `internal_notes` e, se aparecer na timeline, é renderizada com `direction='internal'` e sem qualquer caminho para o driver de canal. Teste obrigatório: `internal note never reaches ChannelDriver.send`.

## 2.6 Consentimento e preferências

```sql
CREATE TABLE public.communication_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel_type channel_type NOT NULL,
  purpose text NOT NULL,             -- 'transactional'|'marketing'|'support'|'billing'
  state consent_state NOT NULL DEFAULT 'unknown',
  quiet_hours_start time, quiet_hours_end time, timezone text,
  max_per_week int,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, contact_id, channel_type, purpose)
);

CREATE TABLE public.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel_type channel_type NOT NULL,
  purpose text NOT NULL,
  state consent_state NOT NULL,
  source text NOT NULL,          -- 'form'|'inbound_message'|'import'|'manual'|'stop_keyword'
  evidence jsonb,                -- IP, texto do opt-in, id da mensagem STOP
  legal_basis text,              -- LGPD art. 7º inciso
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid
);
```

**Regra de bloqueio (executada no `preflight`, não na UI):**
1. `purpose='marketing'` exige `state='opt_in'` explícito. `unknown` ⇒ **bloqueia**.
2. `opt_out` em qualquer canal/finalidade ⇒ bloqueia aquela combinação, sempre.
3. Palavras‑chave de descadastro inbound (`SAIR`, `PARAR`, `STOP`, `DESCADASTRAR`, `CANCELAR`) gravam `opt_out` automaticamente + param todas as sequências ativas do contato.
4. Mensagem `transactional` (confirmação de pedido, cobrança) não exige opt‑in de marketing, mas respeita `opt_out` global explícito.
5. `quiet_hours` adiam o envio (não cancelam), exceto `urgent` transacional.

## 2.7 Campanhas e sequências

```sql
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL, name text NOT NULL,
  channel_type channel_type NOT NULL,
  channel_account_id uuid REFERENCES public.channel_accounts(id),
  template_id uuid REFERENCES public.message_templates(id),
  audience_query jsonb NOT NULL,      -- segmentação declarativa, validada server-side
  purpose text NOT NULL DEFAULT 'marketing',
  scheduled_at timestamptz, starts_at timestamptz, ends_at timestamptz,
  throttle_per_minute int DEFAULT 30,
  status campaign_status NOT NULL DEFAULT 'draft',
  owner_user_id uuid,
  stats jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  identity_value text NOT NULL,
  state text NOT NULL DEFAULT 'pending',  -- pending|skipped|queued|sent|delivered|read|replied|failed
  skip_reason text,                       -- 'no_consent'|'opt_out'|'rate_limit'|'invalid_identity'
  message_id uuid REFERENCES public.messages(id),
  processed_at timestamptz,
  UNIQUE (campaign_id, contact_id)
);

CREATE TABLE public.sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL, name text NOT NULL, description text,
  trigger_event text,                 -- 'proposal.sent' | 'order.delivered' | manual
  purpose text NOT NULL DEFAULT 'followup',
  is_active boolean DEFAULT true,
  stop_on_reply boolean NOT NULL DEFAULT true,
  max_messages int DEFAULT 10,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.sequence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  sequence_id uuid NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  delay_minutes int NOT NULL,         -- desde o passo anterior (dia 0/2/5/10 = 0/2880/...)
  channel_type channel_type NOT NULL,
  fallback_channel_type channel_type,
  template_id uuid REFERENCES public.message_templates(id),
  condition jsonb,                    -- avaliada antes de enviar
  requires_approval boolean NOT NULL DEFAULT false,
  UNIQUE (sequence_id, step_order)
);

CREATE TABLE public.sequence_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  sequence_id uuid NOT NULL REFERENCES public.sequences(id),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  conversation_id uuid REFERENCES public.conversations(id),
  current_step int NOT NULL DEFAULT 0,
  next_run_at timestamptz,
  status sequence_run_status NOT NULL DEFAULT 'active',
  stop_reason text, stopped_at timestamptz,
  context jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE (org_id, sequence_id, contact_id) WHERE status = 'active'
);
```

## 2.8 Fila, webhooks, rate limit, auditoria

```sql
CREATE TABLE public.outbound_queue (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  channel_account_id uuid NOT NULL REFERENCES public.channel_accounts(id),
  priority int NOT NULL DEFAULT 5,        -- 1 = urgente
  run_after timestamptz NOT NULL DEFAULT now(),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  locked_at timestamptz, locked_by text,
  last_error jsonb,
  state text NOT NULL DEFAULT 'queued',   -- queued|processing|done|failed|canceled
  created_at timestamptz DEFAULT now()
);
CREATE INDEX ON public.outbound_queue (state, run_after, priority)
  WHERE state IN ('queued','processing');

CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  channel_account_id uuid REFERENCES public.channel_accounts(id),
  provider text NOT NULL,
  event_type text,
  dedupe_key text NOT NULL,               -- provider + external_event_id (ou hash payload)
  signature_valid boolean NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  process_status text NOT NULL DEFAULT 'received', -- received|processed|duplicate|invalid|error
  error jsonb,
  received_at timestamptz DEFAULT now(),
  UNIQUE (provider, dedupe_key)
);

CREATE TABLE public.rate_limit_buckets (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL,
  scope text NOT NULL,        -- 'channel_account:<id>' | 'contact:<id>' | 'campaign:<id>'
  window_start timestamptz NOT NULL,
  window_seconds int NOT NULL,
  count int NOT NULL DEFAULT 0,
  limit_value int NOT NULL,
  UNIQUE (org_id, scope, window_start, window_seconds)
);

CREATE TABLE public.communication_logs (
  id bigserial PRIMARY KEY, org_id uuid NOT NULL,
  level text NOT NULL, area text NOT NULL, code text,
  message text NOT NULL, context jsonb, correlation_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id bigserial PRIMARY KEY, org_id uuid NOT NULL,
  actor_type text NOT NULL,          -- 'user'|'agent'|'system'|'integration'
  actor_id uuid, action text NOT NULL,
  entity_type text NOT NULL, entity_id uuid,
  before_state jsonb, after_state jsonb,
  ip inet, user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  from_user_id uuid, to_user_id uuid, to_team_id uuid, to_agent_id uuid,
  reason text, assigned_by uuid, created_at timestamptz DEFAULT now()
);

CREATE TABLE public.sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,
  name text NOT NULL, channel_type channel_type, team_id uuid, priority priority_level,
  first_response_minutes int, resolution_minutes int,
  business_hours jsonb, is_active boolean DEFAULT true
);

CREATE TABLE public.sla_trackers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  policy_id uuid REFERENCES public.sla_policies(id),
  first_response_due_at timestamptz, first_response_at timestamptz,
  resolution_due_at timestamptz, resolved_at timestamptz,
  breached_first_response boolean DEFAULT false,
  breached_resolution boolean DEFAULT false,
  paused_seconds int DEFAULT 0
);
```

---

# 3. CONTRATOS ENTRE MÓDULOS (anti-acoplamento)

O módulo Comunicação **não faz SELECT** em tabelas de LEADS/COMERCIAL. Ele consome portas:

```ts
// src/modules/comm/ports/leads.port.ts
export interface LeadsPort {
  findByIdentity(i: {channel: ChannelType; value: string}): Promise<LeadRef | null>;
  createLead(i: CreateLeadFromConversation): Promise<LeadRef>;   // só se autorizado
  attachConversation(leadId: string, conversationId: string): Promise<void>;
}

// src/modules/comm/ports/commercial.port.ts
export interface CommercialPort {
  findCustomerByIdentity(i): Promise<CustomerRef | null>;
  getCustomerSnapshot(customerId: string, scope: Scope): Promise<CustomerSnapshot>;
  listOpenOrders(customerId: string): Promise<OrderRef[]>;
  getOrderStatus(orderId: string): Promise<OrderStatus>;
}

// src/modules/comm/ports/ai.port.ts
export interface AiPort {
  suggestReply(ctx: ConversationContext): Promise<AiSuggestion>;
  summarize(ctx: ConversationContext): Promise<AiSummary>;
  classify(ctx: ConversationContext): Promise<AiClassification>;
  runAgent(agentId: string, ctx: ConversationContext): Promise<AgentResult>;
}
```

Implementações vivem em `src/modules/comm/adapters/*`. Trocar F1/F3 por outro sistema = trocar adapter.

**Eventos publicados** (outbox → bus):
`comm.conversation.created` · `comm.conversation.assigned` · `comm.conversation.closed` · `comm.message.received` · `comm.message.sent` · `comm.message.status_changed` · `comm.message.failed` · `comm.contact.identity_linked` · `comm.consent.changed` · `comm.sla.breached` · `comm.campaign.finished`

**Eventos consumidos:** `leads.lead.created` · `commercial.proposal.sent` · `commercial.order.delivered` · `commercial.customer.inactive` · `ai.agent.action_approved`

## 3.1 Fluxo de identificação de inbound desconhecido (§40)

```
MENSAGEM INBOUND
   ↓
normalizar identidade (E.164 / e-mail lower+trim / PSID)
   ↓
contact_identities → existe?  ── SIM ─► contact_id
   │ NÃO
   ↓
LeadsPort.findByIdentity  ── ACHOU ─► criar contact + identity, vincular lead_id
   │ NÃO
   ↓
CommercialPort.findCustomerByIdentity ── ACHOU ─► contact + customer_id
   │ NÃO
   ↓
policy `auto_create_lead_from_inbound`?
   ├─ true  → LeadsPort.createLead(source='comm:<canal>') + contact
   └─ false → contact "órfão" (unassigned_contact), sinalizado na UI
   ↓
sempre: conversation vinculada + audit_log + evento comm.contact.identity_linked
```
Criação é **idempotente por `identity_hash`** com `INSERT … ON CONFLICT DO NOTHING` + re-leitura. Zero duplicados sob concorrência.

---

# 4. CANAIS — O QUE É REAL, O QUE DEPENDE DE TERCEIRO

| Canal | Provedor | Real sem terceiro? | Dependências |
|---|---|---|---|
| **Interno** | — | ✅ 100% | nenhuma |
| **E-mail** | SMTP/IMAP ou API do provedor | ✅ com credencial do usuário | conta SMTP/IMAP ou API key; domínio verificado (SPF/DKIM/DMARC) |
| **WhatsApp** | WhatsApp Cloud API (Meta) | ⚠️ | WABA aprovada, número verificado, app Meta, `phone_number_id`, token permanente, templates aprovados |
| **Messenger** | Meta Graph API | ⚠️ | Página FB, app Meta, `pages_messaging`, App Review |
| **Instagram** | Meta Graph API (IG Messaging) | ⚠️ | Conta Business vinculada à Página, `instagram_manage_messages`, App Review |
| **SMS** | provedor configurável | ⚠️ | conta no provedor, sender ID/número, crédito |
| **Telefonia** | provedor configurável | ⚠️ | conta, número, webhook de eventos |

**Obrigatório na UI e nos docs:** canais sem credencial verificada exibem o card
`Integração pendente — requer: <lista exata de dependências>` com link para a configuração. **Nunca** um botão "Enviar" habilitado.

## 4.1 Regras de canal que o `preflight` deve implementar de verdade

- **WhatsApp:** fora da janela de atendimento (24h desde a última inbound) só é permitido **template aprovado**. `session_expires_at` na conversa controla isso. Texto livre fora da janela ⇒ `OUTSIDE_SESSION_WINDOW`, e a UI oferece trocar para template.
- **Instagram/Messenger:** janelas e políticas de mensagem definidas pela plataforma; o driver declara `session_window` e o preflight bloqueia o que a política não permite. Sem tags/uso fora de política.
- **E-mail:** exige domínio remetente configurado; threading via `Message-ID`/`In-Reply-To`/`References`; anexos limitados por tamanho do provedor; bounce e complaint alimentam `consents` (`hard bounce` ⇒ identidade `verified=false` + bloqueio).
- **SMS:** limite de segmentos/encoding calculado antes do envio, custo estimado registrado; palavras de opt-out processadas.
- **Voz:** sem provedor ⇒ apenas **registro manual** de chamada (`kind='call'`, duração, resultado, responsável) — isso é real e útil. Discagem, gravação e transcrição só existem com provedor conectado.

---

# 5. FILA DE ENVIO (fluxo real)

```
compose → validateTemplateVars → consent/preferences → preflight(driver)
   ↓ (falhou)  → message.status=failed + motivo legível na UI
   ↓ (ok)
message(pending) + outbound_queue(queued, run_after)
   ↓  worker: SELECT ... FOR UPDATE SKIP LOCKED  (lote pequeno)
rate limit check (bucket por conta/contato/campanha)
   ↓
driver.send({clientMessageId})  → status=sending → sent + external_message_id
   ↓ erro
classificar: retriable (429/5xx/timeout) → backoff exp. (30s,2m,10m,1h,6h) + jitter
             fatal (400/401/403/invalid recipient) → failed, sem retry, alerta admin
   ↓
webhook de status → message_status_events → messages.status (só avança)
```
Idempotência de envio: `client_message_id` é chave única; se o worker reiniciar após enviar mas antes de gravar, a reconciliação por `client_message_id` no provedor (quando suportado) evita duplicata; quando não suportado, o `UNIQUE` impede reenfileiramento do mesmo registro.

# 6. WEBHOOKS (entrada)

Rota única por provedor sob `/api/public/comm/webhooks/:provider/:accountId`:

```
1. Ler body CRU (sem parse) → verificar assinatura HMAC (timing-safe) com o secret da conta
   ↳ inválido: gravar webhook_events(signature_valid=false, invalid) + 401. NUNCA processar.
2. dedupe_key = provider + external_event_id (ou sha256 do body)
   INSERT ... ON CONFLICT DO NOTHING → se 0 linhas: 200 "duplicate", fim.
3. Responder 200 rápido (< 2s). Processamento pesado vai para fila interna.
4. driver.parseWebhook → InboundEvent[] canônicos
5. Para cada evento: transação
   - inbound message → identificar contato (§3.1) → conversa → message → attachments
   - status event    → message_status_events → avanço de status
   - erro            → messages.error + log
6. Publicar eventos no bus (outbox, mesma transação)
```
GET de verificação (`hub.challenge` da Meta) tratado na mesma rota, sem expor nada.

---

# 7. IA DE COMUNICAÇÃO (integra F2, não reimplementa)

## 7.1 Copiloto na conversa
Painel lateral com blocos, cada um **rastreável**: resumo, objetivo do cliente, objeção provável, produto relacionado, próxima ação, resposta sugerida.
Cada bloco traz `sources` (ids das mensagens/registros usados). Sem fonte ⇒ marcar "inferência".
Ações: **Aceitar / Editar / Rejeitar / Regenerar** — todas gravadas em `ai_suggestions` com o desfecho (dado de treino e auditoria).

```sql
CREATE TABLE public.ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  kind text NOT NULL,        -- reply|summary|intent|sentiment|next_action|classification
  content jsonb NOT NULL, sources jsonb, model text, tokens_in int, tokens_out int,
  cost_micros bigint,
  outcome text,              -- accepted|edited|rejected|regenerated|expired
  final_message_id uuid REFERENCES public.messages(id),
  created_by uuid, created_at timestamptz DEFAULT now(), decided_at timestamptz
);
```

## 7.2 Escopo de contexto da IA (nunca acesso irrestrito)
A `AiPort` recebe um `Scope` explícito e o adapter monta o contexto **apenas** com o permitido:
```ts
type Scope = {
  conversationHistory: number;        // últimas N mensagens
  contactProfile: boolean;
  commercial: ('orders'|'proposals'|'opportunities')[];
  catalog: boolean;
  redactPII: boolean;                 // mascara CPF/cartão antes de enviar ao modelo
};
```
Padrão: histórico 30 msgs + perfil + `orders` resumidos. Nunca dados de outra org. Nunca segredos. Redação de PII sensível ligada por padrão em provedores externos.

## 7.3 Human-in-the-loop (§22)
| Nível | Comportamento | Envio externo |
|---|---|---|
| L1 | IA só sugere | nunca |
| L2 | IA prepara mensagem completa | só após aprovação humana explícita |
| L3 | IA envia categorias pré-autorizadas | sim, dentro da allowlist |
| L4 | Autonomia limitada por política | sim, com limites de volume/horário/valor |

Política por org × canal × categoria:
```sql
CREATE TABLE public.ai_send_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,
  channel_type channel_type, category text NOT NULL,
  level ai_autonomy_level NOT NULL DEFAULT 'L1_suggest',
  max_per_day int, allowed_hours jsonb, requires_role text,
  is_active boolean DEFAULT true,
  UNIQUE (org_id, channel_type, category)
);
```
**Default seguro:** categoria sem política = `L1_suggest`. Nada sai automático por omissão.
Toda mensagem gerada por IA carrega `is_ai_generated=true` e, se aprovada, `ai_approved_by`.

---

# 8. SEGURANÇA E PRIVACIDADE

- **Segredos:** só no cofre do runtime; `channel_accounts.secret_ref` guarda ponteiro. API nunca retorna credencial (nem mascarada além de últimos 4). Log com scrubbing de `token|secret|authorization|password|api_key`.
- **RLS:** todas as tabelas por `org_id`. Papéis em tabela separada (`user_roles` + `has_role()` security definer). **Nunca** papel em `profiles`.
- **Permissões granulares:** `comm.inbox.read_all` vs `read_assigned`, `comm.message.send`, `comm.campaign.run`, `comm.channel.configure`, `comm.contact.merge`, `comm.export`, `comm.ai.approve`. Verificação **no servidor**, nunca só na UI.
- **Anexos:** bucket privado, URLs assinadas de curta duração, verificação de MIME real (magic bytes, não extensão), limite de tamanho, `scan_status`.
- **Rate limiting:** por org, por conta de canal, por contato, por campanha, por usuário; webhook por IP/conta.
- **LGPD:** `consents` com base legal e evidência; retenção configurável por tipo de dado; rotinas de **exportação** (portabilidade), **exclusão** e **anonimização** (`contacts.display_name → 'Contato anonimizado'`, identidades hashadas, mensagens com conteúdo purgado mas metadados preservados para auditoria contábil).
- **Auditoria:** toda ação de §56 grava em `audit_logs` com actor, antes/depois, IP.

---

# 9. UI

Menu: **Dashboard · Inbox · Conversas · Contatos · Campanhas · Sequências · Templates · Respostas rápidas · Canais · Equipes · IA · Automações · Relatórios · Configurações**

Layout da conversa (3 colunas, responsivo → tabs no mobile):
```
┌──────────────┬────────────────────────────┬──────────────────┐
│ LISTA        │ TIMELINE DA CONVERSA       │ PAINEL DO CLIENTE│
│ filtros:     │ mensagens + eventos +      │ dados, tags,     │
│ todas/ñlidas │ notas internas (destacadas)│ oportunidades,   │
│ minhas/equipe│                            │ pedidos, tarefas │
│ aguardando   ├────────────────────────────┤ notas, copiloto  │
│ respondidas  │ COMPOSITOR                 │ IA               │
│ prioritárias │ canal · template · anexo   │                  │
│ arquivadas   │ nota interna · IA          │                  │
│ encerradas   │ [preflight bloqueia aqui]  │                  │
└──────────────┴────────────────────────────┴──────────────────┘
```
Ações rápidas (§53): responder, anexar, criar tarefa, criar oportunidade, abrir cliente, abrir pedido, iniciar proposta, sugestão da IA, transferir, prioridade, encerrar. **Cada uma chama um serviço real** ou não existe.

Busca global: conversas, mensagens (FTS `portuguese`), contatos, protocolo, telefone, e-mail, pedidos/oportunidades via portas.

Estados de UI obrigatórios em toda lista: `loading` · `empty` · `error` · `unauthorized` · `integration_pending`.

---

# 10. MÉTRICAS, DASHBOARD E RELATÓRIOS

Métricas: enviadas, recebidas, entregues, lidas, respostas, taxa de resposta, tempo médio de primeira resposta, tempo de resolução, volume por canal/hora/dia, conversas não lidas, SLA cumprido/violado, falhas por código de erro, campanhas (envio/entrega/resposta/conversão), custo quando o provedor informa.

> Métrica só aparece quando o canal realmente fornece o dado. Se o canal não reporta `read`, o painel mostra “não suportado”, não zero.

Relatórios filtráveis por canal, período, usuário, equipe, campanha, cliente, produto, conversa, resultado — com exportação CSV/XLSX assíncrona (job → arquivo em bucket privado → link assinado).

---

# 11. TRATAMENTO DE ERROS — TAXONOMIA

| Código | Causa | Ação |
|---|---|---|
| `CHANNEL_NOT_CONFIGURED` | conta inexistente/desabilitada | bloquear envio, orientar configuração |
| `CREDENTIALS_INVALID` | token inválido/expirado/revogado | conta → `error`, alerta admin, pausar fila da conta |
| `WEBHOOK_SIGNATURE_INVALID` | assinatura errada | 401, log, não processar |
| `OUTSIDE_SESSION_WINDOW` | janela do canal fechada | exigir template |
| `TEMPLATE_NOT_APPROVED` | template pendente no provedor | bloquear, mostrar status |
| `TEMPLATE_VARS_MISSING` | variável obrigatória vazia | bloquear no compositor |
| `CONSENT_MISSING` / `CONSENT_OPT_OUT` | sem base para contatar | bloquear, registrar |
| `RATE_LIMITED` | limite interno ou do provedor | reagendar com backoff |
| `RECIPIENT_INVALID` | número/e-mail inválido | fatal, marcar identidade |
| `MEDIA_REJECTED` | tipo/tamanho não aceito | fatal com mensagem clara |
| `PROVIDER_UNAVAILABLE` | 5xx/timeout | retry com backoff |
| `DB_ERROR` | falha transacional | rollback, retry, alerta |

Todo erro grava `communication_logs` com `correlation_id` que atravessa UI → serviço → fila → driver → webhook.

---

# 12. TESTES OBRIGATÓRIOS

**Unitários:** renderização de template + validação de variáveis; normalização de identidades (E.164, e-mail); máquina de estados da mensagem (rejeita retrocesso); cálculo de segmentos SMS; avaliação de condições de sequência; motor de consentimento (matriz canal × finalidade × estado).

**Integração (com provedor simulado no nível HTTP, jamais “dado fake” exibido como real):**
- webhook com assinatura inválida ⇒ 401 e nada persistido;
- webhook duplicado ⇒ uma única mensagem;
- webhooks fora de ordem ⇒ status final correto;
- inbound desconhecido ⇒ 1 contato, 1 lead, sem duplicata sob 20 requisições concorrentes;
- envio com provedor 500 ⇒ retry com backoff, depois `failed`;
- envio com 401 ⇒ sem retry, conta marcada `error`;
- WhatsApp fora da janela ⇒ bloqueado sem template;
- opt-out ⇒ campanha pula o contato com `skip_reason='opt_out'`;
- resposta do cliente ⇒ todas as sequências ativas param (`stopped_replied`);
- nota interna nunca chega ao driver;
- RLS: usuário da org A não lê nada da org B (teste por tabela);
- permissão: `read_assigned` não vê conversa de outro;
- anexo privado não é acessível sem URL assinada válida;
- segredo nunca aparece em resposta de API nem em log.

**E2E:** inbox → abrir conversa → responder → status atualiza; criar template → campanha → recipients corretos com skips; sequência dia 0/2/5/10 com relógio simulado.

---

# 13. ETAPAS → COMANDOS

| Etapa (§59) | Comandos |
|---|---|
| 1 Arquitetura | CMD-00, CMD-01 |
| 2 Banco e backend | CMD-02, CMD-03 |
| 3 Sistema de canais | CMD-04 |
| 4 Contatos/identidade | CMD-05 |
| 5 Inbox | CMD-06 |
| 6 Conversas e mensagens | CMD-07 |
| 7 Anexos e mídia | CMD-08 |
| 8 Templates | CMD-09 |
| 9 E-mail | CMD-10 |
| 10 WhatsApp | CMD-11 |
| 11 Instagram/Facebook | CMD-12 |
| 12 SMS/Telefonia | CMD-13 |
| 13 Campanhas | CMD-14 |
| 14 Sequências | CMD-15 |
| 15 IA de comunicação | CMD-16 |
| 16 Automações | CMD-17 |
| 17 Dashboard/relatórios | CMD-18 |
| 18 Segurança/privacidade | CMD-19 |
| 19 APIs/integrações | CMD-20 |
| 20–22 Testes/Doc/Auditoria | CMD-21, CMD-22 |

---

# 14. COMANDOS DE EXECUÇÃO

> Cole o §0 antes de cada comando. Um comando por mensagem. Exija o Relatório de Etapa (§14.2).

---

## CMD-00 — Diagnóstico e plano (NÃO IMPLEMENTAR)

```
Antes de escrever qualquer código, execute o diagnóstico do projeto atual e me entregue
um relatório. NÃO altere nenhum arquivo neste comando.

1. Stack: framework, versão, roteamento, build, runtime do servidor.
2. Banco: engine, como migrations são aplicadas, se há RLS e multi-tenant, como
   `org_id`/tenant é resolvido hoje.
3. Autenticação e autorização existentes: onde ficam papéis e permissões.
4. O que JÁ EXISTE das fases 1–3: liste tabelas, serviços e rotas de LEADS, IA e COMERCIAL
   com caminho de arquivo. Diga explicitamente o que NÃO existe ainda.
5. Como a Fase 4 vai se integrar a cada fase anterior: aponte os pontos exatos de
   acoplamento e proponha as portas (LeadsPort, CommercialPort, AiPort) sobre o que existe.
6. Storage de arquivos disponível (bucket privado? URLs assinadas?).
7. Existe fila / job scheduler / cron? Se não, proponha a alternativa viável nesta stack.
8. Cofre de segredos disponível no runtime servidor.
9. Dependências externas necessárias por canal, com o que o usuário precisa providenciar.
10. Riscos e conflitos com o que já existe.
11. Proponha a arquitetura final e o plano de execução em etapas.

Saída: relatório em markdown + tabela "existe / falta / decisão".
Termine perguntando o que devo confirmar antes do CMD-01.
```

---

## CMD-01 — Fundação do módulo e contratos

```
Crie o esqueleto do módulo ECOMIM COMUNICAÇÃO, sem UI e sem provedores.

1. Estrutura de pastas:
   src/modules/comm/{channels,services,ports,adapters,queue,webhooks,db,types,utils}
2. Tipos canônicos: ChannelType, Capability, ConversationStatus, MessageKind,
   MessageStatus, InboundEvent, OutboundMessage, SendResult, PreflightVerdict.
3. Interface ChannelDriver exatamente como na especificação, + ChannelRegistry
   (registro e resolução por tipo, com erro claro se driver ausente).
4. Portas LeadsPort, CommercialPort, AiPort como interfaces + adapters "não configurado"
   que lançam erro explícito NOT_WIRED (nunca retornam dado falso).
5. Sistema de erros: classe CommError com os códigos da taxonomia da especificação.
6. Logger com correlation_id e scrubbing de campos sensíveis
   (token, secret, authorization, password, api_key, cookie).
7. Testes: registry resolve/erra corretamente; scrubbing remove segredos; CommError serializa.

Não crie tabelas ainda. Não crie UI.
```

---

## CMD-02 — Banco: núcleo (canais, contatos, conversas, mensagens)

```
Crie as migrations do núcleo, exatamente com o padrão de segurança do bloco de contexto.

Tabelas: channels, channel_accounts, contacts, contact_identities,
contact_merge_suggestions, conversations, messages, message_status_events,
message_attachments, internal_notes, tags, conversation_tags, assignments.
Enums: todos os listados na especificação.

Obrigatório:
- org_id em todas; RLS habilitada; GRANTs explícitos; policy por current_org_id().
- Índices da especificação, inclusive GIN para search_tsv e o índice parcial de mensagens
  pendentes.
- UNIQUEs de idempotência: (org_id, channel_type, external_message_id) e
  (org_id, client_message_id); (org_id, channel_account_id, external_thread_id).
- Trigger de validação da máquina de estados de message_status (proibir retrocesso).
- Trigger updated_at.
- Geração de `protocol` sequencial por org (CV-YYYY-NNNNNN), sem colisão sob concorrência.
- Trigger para manter conversations.last_message_at, unread_count, last_inbound_at,
  last_outbound_at e search_tsv.

Entregue também um script de smoke test SQL provando: RLS bloqueia cross-org;
retrocesso de status é rejeitado; insert duplicado por external_message_id falha.
```

---

## CMD-03 — Serviços de domínio + event bus

```
Implemente a camada de aplicação sobre o núcleo.

1. ConversationService: create/getOrCreateByExternalThread, assign, transfer,
   setPriority, setStatus, snooze, close, reopen, addTag, markRead.
   Toda transferência grava assignments + audit_logs.
2. MessageService: composeOutbound (sem enviar ainda), recordInbound,
   applyStatusEvent (só avança), addInternalNote.
3. Event bus com OUTBOX TRANSACIONAL: tabela outbox_events gravada na MESMA transação
   do dado; publisher separado com retry e marcação de processado.
   Eventos: comm.conversation.created/.assigned/.closed,
   comm.message.received/.sent/.status_changed/.failed, comm.consent.changed.
4. AuditService: registra actor/action/entity/before/after/ip.
5. Testes: outbox nunca publica se a transação der rollback; status fora de ordem
   não rebaixa; nota interna não cria registro enviável.
```

---

## CMD-04 — Sistema de canais + fila de saída + gateway de webhooks

```
Implemente a infraestrutura de canal, sem nenhum provedor externo ainda.

1. InternalDriver 100% funcional (notificações internas) — serve de referência viva
   e permite testar o pipeline inteiro sem terceiros.
2. Fila: outbound_queue + worker com SELECT ... FOR UPDATE SKIP LOCKED, lote configurável,
   backoff exponencial com jitter (30s,2m,10m,1h,6h), max_attempts, classificação
   retriable x fatal, lock com expiração (worker morto libera o item).
3. Rate limiting real com rate_limit_buckets: por conta de canal, por contato,
   por campanha, por org.
4. Gateway de webhooks em /api/public/comm/webhooks/:provider/:accountId:
   corpo cru → assinatura → dedupe (webhook_events UNIQUE) → 200 rápido → processamento
   assíncrono. GET de verificação (challenge) suportado.
5. Painel de saúde: fila (queued/processing/failed), últimos erros por conta,
   status de integração por canal.
6. Testes: 3 workers concorrentes não processam o mesmo item; webhook duplicado processa
   uma vez; assinatura inválida retorna 401 sem persistir mensagem; provedor 500 gera
   retry e 401 não gera.
```

---

## CMD-05 — Contatos e identidade unificada

```
Implemente ContactIdentityService e a UI de Contatos.

1. Normalizadores: telefone → E.164 (com país padrão da org), e-mail → lower+trim
   (+ remoção de subaddressing quando configurado), IDs de plataforma inalterados.
2. resolveContact(channelType, identityValue): idempotente, com
   INSERT ... ON CONFLICT DO NOTHING + re-leitura. Seguro sob concorrência.
3. Vínculo automático SOMENTE com identificador forte e exato. Similaridade de nome
   gera contact_merge_suggestions, NUNCA merge automático.
4. mergeContacts: transacional, move identidades/conversas/preferências,
   grava snapshot para desfazer em 30 dias, audita. Função unmerge.
5. Fluxo completo de inbound desconhecido conforme a especificação, com a política
   auto_create_lead_from_inbound configurável por org.
6. UI: lista de contatos, perfil com canais, última comunicação, canal preferido,
   histórico, conversas, permissões e preferências; tela de sugestões de merge.
7. Testes: 20 inbounds concorrentes da mesma identidade criam 1 contato e 1 lead;
   merge e unmerge preservam integridade; nomes iguais nunca fundem sozinhos.
```

---

## CMD-06 — Inbox

```
Construa a caixa de entrada profissional.

1. Filtros reais no servidor: todas, não lidas, minhas, equipe, aguardando resposta,
   respondidas, prioritárias, arquivadas, encerradas — todos combináveis com canal,
   tag, responsável e período.
2. Busca full-text (configuração 'portuguese') por nome, telefone, e-mail, empresa,
   conteúdo da mensagem, protocolo e ID; ranqueada, com destaque do trecho.
3. Paginação por cursor (keyset), ordenação por last_message_at.
4. Atualização em tempo real da lista quando chegam mensagens (subscription/realtime),
   com contador de não lidas correto por escopo do usuário.
5. Ações em massa: marcar lido, atribuir, taguear, arquivar, encerrar — com permissão
   verificada no servidor.
6. Respeitar permissão read_all vs read_assigned no nível da query, não da UI.
7. Estados: loading, vazio, erro, sem permissão.
8. Testes: cada filtro retorna o conjunto correto; read_assigned não vaza conversas alheias;
   busca encontra por telefone em formatos diferentes.
```

---

## CMD-07 — Conversa, timeline e compositor

```
Implemente a tela de conversa completa.

1. Timeline unificada: mensagens (in/out), eventos de sistema, notas internas,
   transferências, mudanças de status — ordenadas, com agrupamento por dia,
   indicador de status por mensagem e motivo legível quando falhou.
2. Notas internas visualmente distintas e impossíveis de enviar ao cliente.
3. Compositor: seleção de canal (somente contas verified), texto, template,
   resposta rápida, anexo, nota interna. Preflight roda ANTES de habilitar o envio
   e mostra o motivo exato do bloqueio.
4. Painel do cliente: dados, tags, preferências/consentimento, oportunidades, pedidos,
   tarefas, notas — tudo via portas, respeitando permissão.
5. Ações rápidas: responder, anexar, criar tarefa, criar oportunidade, abrir cliente,
   abrir pedido, iniciar proposta, transferir, prioridade, encerrar. Nenhum botão
   decorativo: o que não tiver serviço pronto não é renderizado.
6. Realtime: novas mensagens aparecem sem refresh; scroll preservado.
7. Testes E2E: enviar por canal interno → aparece com status correto; bloqueio de
   preflight impede o clique; nota interna não gera item na fila de saída.
```

---

## CMD-08 — Anexos e mídia

```
Implemente o subsistema de mídia.

1. Bucket PRIVADO. Upload direto com URL assinada, limite de tamanho por canal,
   validação de MIME por magic bytes (não por extensão), checksum sha256.
2. Download apenas via URL assinada de curta duração, com verificação de permissão
   e de org antes de assinar.
3. Download de mídia inbound do provedor para o nosso storage (quando a API permitir),
   com registro de external_media_id e tratamento de expiração do link do provedor.
4. Miniaturas para imagens; player para áudio/vídeo; visualizador de PDF.
5. Limpeza de arquivos órfãos e política de retenção configurável.
6. Testes: arquivo renomeado com extensão falsa é rejeitado; usuário de outra org
   não obtém URL assinada; anexo maior que o limite do canal é bloqueado no preflight.
```

---

## CMD-09 — Templates e respostas rápidas

```
Implemente o sistema de templates.

1. CRUD de message_templates com todas as categorias da especificação e escopo por canal.
2. Motor de variáveis: parser de {{variavel}}, declaração tipada (key, label, required,
   type, sample), validação obrigatória antes de qualquer envio, escaping correto
   (HTML no e-mail, texto puro nos demais), e erro claro quando faltar variável.
3. Pré-visualização com dados reais do contato/pedido selecionado.
4. Suporte a templates que exigem aprovação de provedor: campos de status de aprovação,
   bloqueio de uso enquanto não aprovado, exibição do motivo de rejeição.
5. Quick replies: CRUD, categorias, atalho de teclado, busca, favoritos, contador de uso,
   compartilhado x pessoal.
6. Testes: variável obrigatória ausente bloqueia o envio; HTML malicioso em variável
   é escapado; template não aprovado não pode ser usado.
```

---

## CMD-10 — Canal E-MAIL (primeiro canal externo real)

```
Implemente o EmailDriver completo e funcional.

1. Configuração de conta: envio e recebimento via as credenciais/API que o diagnóstico
   do CMD-00 identificou como disponíveis nesta stack. Credenciais só no cofre.
2. verifyCredentials real: testa autenticação de verdade contra o servidor/API e só
   então marca a conta como verified.
3. Envio: texto + HTML, anexos, assinatura, headers de threading
   (Message-ID, In-Reply-To, References), remetente com domínio verificado.
4. Recebimento: entrada por webhook do provedor ou polling IMAP, conforme disponível.
   Parsing de MIME, extração de anexos, agrupamento em thread pela cadeia de References,
   remoção de citação/histórico repetido na exibição.
5. Bounces e reclamações: hard bounce marca a identidade como inválida e registra
   consentimento negativo; soft bounce entra em retry.
6. Encaminhamento e resposta a partir da conversa.
7. Documentar exatamente o que o usuário precisa configurar (domínio, SPF, DKIM, DMARC)
   e mostrar isso na tela do canal enquanto não estiver pronto.
8. Testes: envio real em ambiente de teste; recebimento cria conversa correta;
   resposta entra na mesma thread; anexo trafega íntegro (checksum).
```

---

## CMD-11 — Canal WHATSAPP (API oficial)

```
Implemente o WhatsAppCloudDriver usando exclusivamente a API oficial do WhatsApp
(Cloud API da Meta). Nada de bibliotecas não oficiais, automação de app, QR code
de terceiros ou qualquer método que contorne a plataforma.

1. Configuração: WABA ID, phone_number_id, token permanente (no cofre),
   verify token de webhook, app secret para validar assinatura.
2. verifyCredentials real contra a API. Sem resposta OK, a conta fica em error e
   o envio permanece bloqueado.
3. Envio: texto, mídia (imagem/vídeo/áudio/documento), localização, template com
   componentes e parâmetros. Upload de mídia pela API oficial.
4. JANELA DE ATENDIMENTO: manter session_expires_at (24h desde a última inbound).
   Fora da janela, o preflight retorna OUTSIDE_SESSION_WINDOW e o compositor só
   permite template aprovado. Isto é regra de negócio obrigatória, não aviso visual.
5. Webhook: verificação GET de challenge, validação de assinatura HMAC do payload cru,
   dedupe, processamento de mensagens recebidas e de statuses
   (sent/delivered/read/failed) com mapeamento fiel para nossos estados.
6. Templates: sincronizar status de aprovação junto à plataforma e refletir na UI.
7. Erros e limites do provedor mapeados para a nossa taxonomia, com mensagem clara.
8. Documentar todos os pré-requisitos (conta business, número verificado, app,
   permissões, revisão) na tela do canal e no docs/.
9. Testes contra servidor simulado no nível HTTP: envio dentro/fora da janela,
   status fora de ordem, assinatura inválida, 429 com retry, template rejeitado.
```

---

## CMD-12 — Canais INSTAGRAM e MESSENGER (API oficial)

```
Implemente MessengerDriver e InstagramDriver com a Graph API oficial da Meta.

1. Configuração por Página/conta business, tokens no cofre, assinatura de webhook.
2. Capacidades declaradas honestamente por driver; o preflight bloqueia o que a
   política da plataforma não permite. Não usar recursos fora da política.
3. Envio e recebimento de texto e mídia suportada; identificação do usuário pelo ID
   da plataforma (PSID/IGSID) alimentando contact_identities.
4. Webhooks unificados da Meta: roteamento por objeto/campo, dedupe compartilhado,
   validação de assinatura.
5. Enquanto o app não tiver as permissões aprovadas, o canal permanece
   PENDING_EXTERNAL_INTEGRATION na UI, com a lista exata do que falta. Nada de simulação.
6. Documentar permissões necessárias e o processo de revisão do app.
7. Testes: parsing de webhook real de exemplo, dedupe, identidade vinculada ao contato certo.
```

---

## CMD-13 — SMS e TELEFONIA

```
Implemente SmsDriver e VoiceDriver de forma configurável por provedor.

1. SMS: interface de provedor plugável (baseUrl, credencial no cofre, mapeamento de
   payload e de status), envio, recebimento quando o provedor suportar, callbacks de
   status, cálculo de segmentos e encoding, custo estimado e custo real quando informado,
   processamento de palavras de opt-out.
2. TELEFONIA sem provedor: implementar REGISTRO MANUAL de chamada como recurso real —
   direção, número, duração, resultado, responsável, notas, vínculo com conversa e cliente.
   Isto funciona hoje e deve ser marcado como funcional.
3. TELEFONIA com provedor: arquitetura para iniciar chamada, receber eventos de chamada,
   gravação e transcrição SOMENTE se o provedor oferecer. Sem provedor conectado, esses
   recursos não aparecem como disponíveis.
4. Análise de chamada por IA apenas sobre transcrição realmente existente.
5. Documentar as dependências de cada provedor.
6. Testes: cálculo de segmentos, opt-out por SMS, idempotência de callback, registro
   manual de chamada compondo a timeline.
```

---

## CMD-14 — Consentimento, anti-spam e campanhas

```
Implemente o motor de consentimento e o sistema de campanhas — nesta ordem.

1. ConsentService: matriz canal × finalidade × estado; registro de eventos em consents
   com base legal e evidência; palavras-chave de descadastro inbound
   (SAIR, PARAR, STOP, DESCADASTRAR, CANCELAR) gravando opt_out e parando sequências.
2. Preflight de consentimento integrado ao envio: marketing exige opt_in explícito;
   unknown bloqueia; opt_out bloqueia sempre; quiet hours adiam.
3. Limites anti-spam: frequência por contato, volume por campanha, intervalo mínimo
   entre mensagens, limites por canal e por usuário, bloqueios. Configuráveis por org.
4. Campanhas: CRUD, segmentação declarativa validada no servidor, materialização de
   campaign_recipients com skip_reason para cada exclusão, agendamento, throttle,
   execução via fila, pausa/retomada/cancelamento, métricas em tempo real.
5. Tela de pré-voo da campanha: quantos serão enviados, quantos pulados e por quê,
   custo estimado. Nada é enviado antes de confirmação explícita.
6. Testes: contato opt_out nunca recebe; limite por contato respeitado sob concorrência;
   pausar campanha interrompe a fila; retomar não duplica destinatários.
```

---

## CMD-15 — Sequências de follow-up

```
Implemente o motor de sequências.

1. CRUD de sequences e sequence_steps (dia 0/2/5/10 como exemplo padrão), com intervalo,
   canal, canal de fallback, template, condição e limite.
2. Motor de execução: scheduler que processa sequence_runs com next_run_at vencido,
   avalia a condição do passo, respeita consentimento, quiet hours, limites e
   requires_approval.
3. REGRAS DE PARADA obrigatórias: cliente respondeu (via evento comm.message.received),
   cliente pediu encerramento, oportunidade encerrada (evento do módulo comercial),
   cancelamento manual, condição configurada atingida, limite de mensagens.
   Registrar stop_reason.
4. Pausa e retomada por contato e por sequência inteira.
5. Disparo por evento: proposal.sent, order.delivered, customer.inactive, lead.created.
6. UI: construtor visual dos passos, lista de execuções ativas com próximo envio,
   histórico com motivo de parada.
7. Testes com relógio simulado: sequência completa dia 0→10; resposta no dia 1 para
   tudo imediatamente; contato não entra duas vezes na mesma sequência ativa;
   passo com approval não envia sozinho.
```

---

## CMD-16 — IA de comunicação e copiloto

```
Integre a FASE 2 ao módulo de comunicação através da AiPort. Não reimplemente IA.

1. Adapter da AiPort ligado aos agentes/ferramentas da Fase 2, com montagem de contexto
   por Scope explícito (histórico N mensagens, perfil, comercial permitido, catálogo),
   redação de PII sensível antes de enviar a provedores externos.
2. Recursos: sugerir resposta, gerar mensagem, resumir conversa, identificar intenção,
   detectar sentimento, identificar oportunidade e objeção, sugerir próximo passo,
   classificar conversa, recomendar canal e horário (apenas com dados suficientes;
   caso contrário, dizer que não há base).
3. Copiloto na conversa: blocos com fontes rastreáveis e ações
   Aceitar / Editar / Rejeitar / Regenerar, tudo gravado em ai_suggestions com desfecho.
4. Human-in-the-loop com ai_send_policies: L1 sugere, L2 aprova, L3 automático permitido,
   L4 autonomia limitada. Default de qualquer categoria sem política = L1.
   Fila de aprovação para L2.
5. Toda mensagem de IA marcada com is_ai_generated e, quando aprovada, ai_approved_by.
   Indicador visível na timeline.
6. Custo e tokens registrados por sugestão; painel de consumo.
7. Testes: categoria sem política nunca envia sozinha; L2 exige aprovação registrada;
   contexto nunca inclui outra org; PII é mascarada; sugestão rejeitada não vira mensagem.
```

---

## CMD-17 — Automações e SLA

```
Implemente as automações orientadas a evento e o subsistema de SLA.

1. Regras de automação (evento → condição → ação) persistidas e configuráveis:
   - nova mensagem → classificar
   - cliente respondeu → parar follow-up
   - proposta enviada → iniciar sequência autorizada
   - pedido entregue → iniciar pós-venda
   - cliente inativo → criar oportunidade de reativação
   - conversa prioritária → alertar equipe
   - inbound sem resposta há X → escalar
2. Roteamento e atribuição automática: round-robin, por carga, por equipe, por canal,
   por tag; com fila de não atribuídos.
3. SLA: sla_policies por equipe/canal/prioridade, com horário comercial;
   sla_trackers calculando primeira resposta, resolução, tempo em espera e violações;
   pausa quando aguardando cliente; alertas antes e depois do vencimento;
   evento comm.sla.breached.
4. Proteção contra laço: uma automação não pode disparar a si mesma; profundidade máxima
   de encadeamento; log de execução de cada regra.
5. Testes: relógio simulado para violação de SLA; regra em laço é interrompida;
   resposta do cliente para a sequência via automação real, não hardcoded.
```

---

## CMD-18 — Dashboard, métricas e relatórios

```
Implemente a camada analítica.

1. Views/materialized views agregadas por org, canal, dia, usuário, equipe e campanha.
   Refresh incremental agendado; nada de agregação pesada em tempo de request.
2. Dashboard: conversas abertas, não lidas, tempo médio de primeira resposta, volume por
   canal, mensagens enviadas/recebidas/entregues/lidas, taxa de resposta, falhas por
   código, SLA cumprido, desempenho por atendente, campanhas ativas.
3. Métrica não suportada pelo canal aparece como "não suportado", nunca como zero.
4. Relatórios filtráveis por canal, período, usuário, equipe, campanha, cliente, produto,
   conversa e resultado; exportação CSV/XLSX assíncrona com link assinado.
5. Custos por canal quando o provedor informa.
6. Testes: números do dashboard batem com contagem direta no banco em cenário semeado;
   exportação respeita RLS e permissão.
```

---

## CMD-19 — Segurança, privacidade e LGPD

```
Faça o endurecimento completo do módulo.

1. Auditoria de RLS: script que percorre TODAS as tabelas do módulo e prova isolamento
   entre orgs. Falhar o teste se qualquer tabela estiver sem RLS ou sem GRANT.
2. Permissões granulares (comm.inbox.read_all, read_assigned, message.send,
   campaign.run, channel.configure, contact.merge, export, ai.approve) verificadas
   no servidor em todas as rotas e server functions.
3. Segredos: confirmar que nenhuma credencial trafega para o cliente, aparece em log,
   ou é retornada por API. Teste automatizado varrendo respostas e logs.
4. Rate limiting em rotas públicas de webhook e em ações sensíveis.
5. LGPD: exportação de dados do titular (portabilidade), exclusão, anonimização
   preservando metadados contábeis, retenção configurável por tipo de dado,
   registro de finalidade e base legal.
6. Anexos: revalidar assinatura de URL, expiração curta, verificação de org.
7. Relatório final de segurança com o que foi verificado e o que ficou pendente.
```

---

## CMD-20 — API pública e integrações

```
Exponha a API do módulo.

1. REST v1 sob /api/v1/comm/*: channels, accounts, contacts, conversations, messages,
   templates, quick-replies, campaigns, sequences, webhooks, notifications, reports.
2. Autenticação por API key com escopos, rate limit por chave, versionamento,
   paginação por cursor, erros padronizados com a taxonomia do módulo.
3. Idempotency-Key obrigatório em POST que cria mensagem ou dispara campanha.
4. Webhooks DE SAÍDA para sistemas externos: assinatura HMAC, retry com backoff,
   painel de entregas e reenvio manual.
5. Importação e exportação de contatos, templates e dados de campanha, com validação,
   pré-visualização e relatório de erros por linha.
6. Documentação OpenAPI gerada e publicada.
7. Testes: idempotência de POST, escopo insuficiente retorna 403, rate limit retorna 429
   com Retry-After.
```

---

## CMD-21 — Suíte de testes completa

```
Implemente e execute toda a suíte de testes da FASE 4 listada na especificação.

Cobrir: canais, mensagens, conversas, webhooks, idempotência, templates, campanhas,
sequências, permissões, IA, automações, filas, anexos, integrações.

Ênfase especial em FALHAS DE COMUNICAÇÃO:
- provedor fora do ar, timeout, 429, 401, 403, 400 de destinatário inválido;
- webhook duplicado, fora de ordem, com assinatura inválida, com payload malformado;
- token expirado no meio de uma campanha;
- banco indisponível durante o envio (a mensagem não pode ficar em estado inconsistente);
- worker morto no meio do processamento (lock expira e outro assume sem duplicar envio).

Entregue: relatório de cobertura, lista de todos os testes com resultado e
lista honesta do que NÃO está coberto.
```

---

## CMD-22 — Documentação e auditoria final da FASE 4

```
Produza a documentação completa e execute a auditoria final.

1. docs/comm/: arquitetura (com diagramas), guia de cada canal e seus pré-requisitos,
   configuração, referência de API, webhooks, esquema do banco, filas, templates,
   campanhas, sequências, IA, automações, segurança, privacidade/LGPD, testes,
   troubleshooting por código de erro, runbook operacional.
2. DEPENDENCIES.md: TODA dependência externa, o que o usuário precisa providenciar,
   custo aproximado e status atual de cada uma.
3. Auditoria final item a item da lista da especificação: canais, contas, contatos,
   conversas, mensagens, anexos, templates, campanhas, sequências, webhooks, filas, IA,
   automações, permissões, privacidade, segurança, logs, métricas, relatórios, APIs,
   integrações, testes, responsividade, performance, documentação.
   Para cada item: OK / PARCIAL / PENDENTE, com evidência (teste, arquivo ou tela).
4. Verificação anti-fachada: liste todo botão, campo e tela e prove que executa ação real
   ou está marcado como PENDING_EXTERNAL_INTEGRATION. Qualquer elemento decorativo
   deve ser removido ou corrigido neste comando.
5. Relatório de prontidão para a próxima fase (ECOMIM AUTOMAÇÕES): eventos disponíveis,
   contratos estáveis, pontos de extensão.
```

---

## 14.2 Relatório de Etapa (exigir ao final de todo comando)

```
ETAPA: <n> — <nome>
1. Código verificado?           [ ] sim  — o quê
2. Testes executados/passando?  [ ] sim  — quantos / quais falharam
3. Banco verificado (RLS/GRANT/índices)? [ ] sim
4. APIs verificadas?            [ ] sim
5. Integrações verificadas?     [ ] sim / N/A — quais
6. Permissões verificadas?      [ ] sim
7. Segurança verificada?        [ ] sim — segredos, rate limit, validação
8. Documentação atualizada?     [ ] sim — arquivos
9. CONCLUÍDO: <lista objetiva>
10. PENDÊNCIAS: <lista honesta, com motivo>
11. DEPENDÊNCIAS EXTERNAS BLOQUEANTES: <lista>
12. Autorizado a avançar? SIM / NÃO — se NÃO, o que falta.
```

---

# 15. CHECKLIST ANTI-FACHADA (aplicar sempre)

- [ ] Nenhuma conversa, contato ou mensagem de exemplo apresentada como real.
- [ ] Todo botão chama um serviço; o que não tem serviço não é renderizado.
- [ ] Canal sem credencial verificada não permite envio.
- [ ] Nenhum ícone de "entregue"/"lido" em canal que não reporta esse estado.
- [ ] Nenhuma API externa inventada; toda chamada tem doc oficial citada.
- [ ] Nenhum método que contorne autenticação, limite ou política de plataforma.
- [ ] Todo webhook valida assinatura e deduplica.
- [ ] Toda tabela tem RLS, GRANT e teste de isolamento.
- [ ] Nenhum segredo no frontend, em log ou em resposta de API.
- [ ] Nenhuma etapa marcada concluída sem teste passando.
- [ ] Toda dependência externa está documentada com o que falta providenciar.

---

**FIM — ECOMIM FASE 4 · SISTEMA DE COMUNICAÇÃO**
