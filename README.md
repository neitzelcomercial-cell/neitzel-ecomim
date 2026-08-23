# NEITZEL — Sistema Digital + Portal Público do Cliente

Sistema de gestão (CRM, Planner, Financeiro, Estoque…) com **Portal Público de Agendamento** integrado ao backend — uma única fonte de verdade para a agenda.

```
SISTEMA NEITZEL ── BACKEND/API ── BANCO (data/neitzel-db.json)
                        │
              ┌─────────┴─────────┐
           PLANNER          PORTAL PÚBLICO
                              │
                       CLIENTE (celular)
```

## Desenvolvimento

```bash
node server.js
# Sistema:  http://localhost:8080/
# Portal:   http://localhost:8080/agendamento
# Testes:   npm test
```

- O token admin é gerado em `data/admin-token.txt` (use no painel **Portal do Cliente**).
- Na mesma rede Wi-Fi, o log inicial mostra o link `http://SEU-IP:8080/agendamento` para o celular.

## Produção

Variáveis de ambiente:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `PORT` | não | Porta HTTP (padrão 8080; plataformas definem sozinhas) |
| `NODE_ENV` | sim (`production`) | Ativa modo produção |
| `NEITZEL_ADMIN_TOKEN` | **sim em produção** | Token do painel admin. Sem ela, o servidor NÃO inicia |
| `FRONTEND_URL` | se frontend separado | Origem autorizada a chamar a API (CORS) |

### Deploy do backend (Render/Railway/Fly — Node grátis)

1. Suba este repositório no GitHub.
2. Crie um **Web Service** apontando para ele.
3. Comandos: build vazio · start `npm start`.
4. Configure as variáveis acima.
5. A API fica em `https://SEU-BACKEND.onrender.com`.

### Frontend público hospedado separado (opcional, ex.: GitHub Pages)

No HTML servido publicamente (`agendamento.html`, sistema), defina:

```html
<meta name="neitzel-api-url" content="https://SEU-BACKEND.onrender.com">
```

O frontend descobre a API automaticamente — nenhum `localhost` no código de produção.

### Testes de aceitação (Critério de Conclusão)

`npm test` cobre: configuração→portal, agendamento E2E, concorrência (2 clientes, mesmo horário → só 1 ganha), cancelamento→horário volta, bloqueios/exceções refletidos na hora, idempotência e persistência. SSE propaga mudanças ao vivo entre Sistema ⇄ Portal.

## Segurança

- Preço/duração/disponibilidade são **sempre** recalculados no backend.
- APIs públicas: validação + rate-limit. Admin: `Bearer NEITZEL_ADMIN_TOKEN`.
- `data/` (banco + token) **nunca** vai ao GitHub (`.gitignore`).
- Em produção o token só existe como variável de ambiente do serviço.
