# IMPLEMENTAÇÃO — NOVO PORTAL DO CLIENTE (Prompt Mestre XX)
Data: 2026-08-23 · Fases 3 a 13

## O que foi implementado

### Backend (fonte única de verdade) — FASES 3, 5, 6
| Arquivo | Papel |
|---|---|
| `server.js` | HTTP: estático + `/api/*` + SSE; token admin (env `NEITZEL_ADMIN_TOKEN` ou gerado em `data/admin-token.txt`); proteção de `/data/`; limpeza automática de holds expirados (30s). |
| `backend/store.js` | Banco JSON transacional (`data/neitzel-db.json`, escrita atômica tmp+rename) + **fila serializada** — toda mutação é uma transação. |
| `backend/time.js` | Wall-clock por timezone IANA (sem bugs UTC); conversão para ISO real. |
| `backend/engine.js` | Disponibilidade: regra semanal → exceção → bloqueios → antecedência → conflito/capacidade. |
| `backend/api.js` | Regras de negócio: holds com TTL, confirmação com **revalidação total dentro da transação**, idempotência, cancelamento com prova (4 dígitos) e prazo, sync de catálogo, status admin com transições válidas, rate-limit, validação de entrada. Preço/duração SEMPRE do banco. |

### APIs
Público: `GET /api/public/config` · `GET /api/public/availability?serviceId&date` · `POST /api/public/holds` · `DELETE /api/public/holds/:id` · `POST /api/public/appointments` · `POST /api/public/appointments/:id/cancel` · `GET /api/events` (SSE).
Admin (Bearer): `GET/PUT /api/admin/config` · `PUT /api/admin/schedule` · `POST|DELETE /api/admin/{blockedDates,blockedTimes,specialHours}` · `GET /api/admin/appointments?from&to` · `PATCH /api/admin/appointments/:id/status` · `POST /api/admin/sync-catalog` · `GET /api/admin/audit`.

### Painel administrativo (dentro do sistema) — FASE 4
`src/portal-admin.js` → view "Portal do Cliente": ativar/desativar portal, link público, horários semanais (múltiplos períodos/dia), bloqueios de datas/horários, regras (grade, antecedência, janela, TTL do hold, capacidade, política de cancelamento), catálogo visível no portal, lista de agendamentos com ações. Persistência 100% no backend.

### Portal público — FASE 7
`agendamento.html` (`/agendamento`): fluxo em 7 passos (serviço → dia → horário → produtos → observação → dados → revisão/confirmação), slots só do backend, hold temporário ao escolher horário, idempotência no confirmar, atualização ao vivo via SSE, tela de sucesso com código, cancelamento pelo cliente. Responsivo, tema Neitzel.

### Integrações — FASES 8, 9, 10, 11
`src/ponte-portal.js`: agendamentos confirmados entram no Planner (`neitzel_atendimentos_v1`, origem `PORTAL_CLIENTE`) e clientes novos no CRM (`ecomim_clientes`) automaticamente, reagindo a eventos SSE + polling de segurança. Eventos estruturados no auditLog do backend para CRM/marketing. Financeiro preparado: valor associado ao agendamento; pagamento NÃO é inferido.

## Testes (FASE 12) — `node test-novo-portal.js` → 35/35 ✔
Cenários do prompt: concorrência 1/2 (só um vence; perdedor recebe HORARIO_INDISPONIVEL), cenário 3 (bloqueio x reserva serializados), cenário 5 (cancelamento libera horário), idempotência (duplo clique), hold/expiração, exceções, feriados, duração/grade, cliente existente vs novo, preço manipulado ignorado, banco inacessível, admin 401, persistência em disco.

## Como usar
1. `node server.js`
2. Sistema: http://localhost:8080/ → view **Portal do Cliente** → cole o token de `data/admin-token.txt` → configure agenda → publique o catálogo.
3. Envie aos clientes: http://localhost:8080/agendamento

## Pendências honestas
- Profissionais: estrutura pronta (`professionals`), UI não implementada (não existe módulo no sistema ainda).
- Remarcação pelo cliente: config pronta, fluxo pendente.
- QR Code: exigia lib externa; link copiável entregue.
- Deploy: aponta para localhost; para produção use env `PORT` + `NEITZEL_ADMIN_TOKEN` atrás de HTTPS.
