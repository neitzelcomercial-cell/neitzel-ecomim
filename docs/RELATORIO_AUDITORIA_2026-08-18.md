# NEITZEL — RELATÓRIO FINAL DE AUDITORIA

**Data:** 2026-08-18
**Sistema auditado:** `C:\Users\neitz\OneDrive\ECOMIM\ECOMIM_2` (NEITZEL — Sistema Empresarial Digital 2.0)
**Método:** inspeção integral de todos os arquivos `src/` + execução dos testes existentes + rastreamento de referências cruzadas (core ↔ módulos ↔ UI)

---

## 1. ESTADO GERAL

| Módulo/Arquivo | Funcional | Parcial | Problemas | Fachada |
|---|---|---|---|---|
| core.js (Leads, Agenda, Tarefas, Financeiro, Atendimento, Projetos, Clientes/CS, Marketing, RH, BI, IA local, Automações, Notificações) | ✅ ~90% | — | ver abaixo | — |
| core-extra.js (Segurança/PIN/MFA/recuperação, Canais, Migrador, Ponte extensão, LGPD, help global) | ✅ ~85% | — | SMTP/WebSocket fachada; `crypto.subtle` sem fallback em file:// | e-mail "verificado" impossível; Google é fachada assumida |
| hunter.js + hunter-ui.js (Caçador de Leads) | ⚠️ 55% | ✅ motor | **dados 100% sintéticos apresentados como reais**; dedup intra-pesquisa; telefones 9 dígitos; cancelamento quebrado; "todos" quebrado; consentimento fabricado | **sim, grave** |
| operacional-core.js (Serviços, Produtos, Estoque, Atendimento ops, métricas) | ⚠️ 65% | ✅ | **receita/custo/despesa 100× maiores no Financeiro**; estoque inicial sem movimentação; `reabrir` perigoso; ajuste nunca subtrai | integração parcial |
| operacional-ui.js (Planner, Serviços, Produtos, Estoque, Atendimento) | ⚠️ 75% | ✅ | **clientes nunca aparecem no Planner** (referência `clientes.list()` inexistente); status `confirmado`/`nao_compareceu` sem botões; auto-preenche sobrescreve preço customizado | — |
| acessor.js (Acessor WhatsApp) | ⚠️ 55% | ✅ | **nome do lead gravado com prefixo "lead: "**; `clientes.list()` quebrado → "0 clientes" sempre; matriz de permissões nunca aplicada; migração de estado pode crashar | permissões decorativas |
| inteligencia.js (Centro de Inteligência / Agente Supervisor) | ⚠️ 60% | ✅ | **falso positivo em massa de "leads sem contato"** (campo `criadoEm` inexistente); lucro do chat **100× maior**; `x.hora` inexistente em atendimentos; botão "Ver módulo" sempre abre leads | diagnóstico estatisticamente errado |
| app.js (shell, views, ⌘K, painel IA) | ✅ 90% | ✅ | menor | — |

**% aproximado de módulos: 70% funcionando · 22% parcialmente · 8% com problemas · 0% não implementado** (nenhum módulo é 100% fachada; mas há fachadas ATRÁS de telas que parecem reais — o pior caso).

---

## 2. PROBLEMAS CRÍTICOS (listar primeiro)

| # | Onde | Problema | Impacto |
|---|---|---|---|
| C1 | `operacional-core.js:330-376` + `core.js:812` | `finalizar` passa valores **em centavos** para `financeiro.addConta` que **re-converte com `toCents` (×100)** | **Receita/custo/despesa de TODO atendimento concluído são lançados 100× maiores no Financeiro.** Ex.: R$ 100,00 vira R$ 10.000,00 a receber. O lucro do Financeiro fica totalmente errado |
| C2 | `inteligencia.js:152` | `E.fmtMoney(Math.round((r - c - ds) * 100))` — `r/c/ds` já estão em centavos; `*100` infla 100× | Lucro do ano exibido no chat 100× maior (R$ 100 → R$ 10.000) |
| C3 | `hunter.js:160-257 (coletarDaFonte, gerarTelefonePublico)` + `hunter.js:605` | **Dados 100% sintéticos** gerados por fórmulas (nomes de arrays fixos, telefones compostos de 9 dígitos, e-mails/sites/Instagram falsos) **apresentados como "dados 100% públicos"** na UI, com `consentimento: true` fabricado, e **encaminhados para a fila real do CRM** | Contaminação da base real com dados falsos; risco LGPD (consentimento de dados fabricados); dedup/score/BI baseados em mentira; WhatsApp abre para número inexistente |
| C4 | `inteligencia.js:187-191` | Diagnóstico usa `l.criadoEm` — **campo inexistente** (o correto é `l.created`); leads sem `hist` caem em `new Date(0)` (1970) | **Falso positivo em massa:** todo lead sem histórico conta como "sem contato há 48h+". O diagnóstico principal do sistema está estatisticamente errado |

---

## 3. PROBLEMAS IMPORTANTES (em seguida)

| # | Onde | Problema |
|---|---|---|
| A1 | `operacional-ui.js:245` | Referência `E.modules.clientes.list()` **não existe** → dropdown de clientes do Planner sempre vazio (mostra só leads); agendamento não vincula `clienteId` (só texto) → **histórico financeiro por cliente inexistente** (exigido pelo prompt 2) |
| A2 | `acessor.js:106-109` | Parsing "Criar lead: Maria, Pizzaria X" deixa o **sufixo "lead: "** no nome → cria lead "lead: Maria"; empresa nunca preenchida |
| A3 | `acessor.js:44-48` | `state.load()` retorna `JSON.parse` **sem mesclar defaults** → estado antigo sem `permissoes`/`historico` **crasha** em `st.permissoes.forEach` e `st.historico.unshift` |
| A4 | `acessor.js:54-69 + 105` | Matriz de 4 níveis de permissão é **decorativa**: nunca consultada no runtime; tools nível 3–4 (`enviar_mensagem`, `excluir_registro`, `acao_financeira`) **não têm implementação** |
| A5 | `acessor.js:117` | `clientes.list()` não existe → resposta "0 cliente(s)" sempre |
| A6 | `operacional-core.js:135-138` | Cadastro de produto com estoque inicial: `estoque.registrar` roda **antes** do produto entrar na lista → retorna `PRODUTO_NOT_FOUND` silencioso → **nenhuma movimentação de "Estoque inicial" é registrada** |
| A7 | `operacional-core.js:386-395` | `reabrir` reabre **sem reverter** estoque/receita/custos → finalizar de novo **dobra** receita e baixa estoque 2× |
| A8 | `operacional-core.js:199-200` | Ajuste de inventário **sempre soma** (`Math.abs`) → impossível dar **baixa** por ajuste |
| A9 | `core-extra.js:401-405` | "SMTP" é fachada: `_smtpConnect` cria WebSocket e **resolve com erro imediatamente**; `_smtpNext` (l.397) **não existe** (referência quebrada latente). Canal e-mail **nunca** fica verificado, nunca envia — apesar da UI sugerir que sim |
| A10 | `core-extra.js:33-37, 41-43, 150-152` | `_hashPin` (SHA-256) sem fallback quando `crypto.subtle` indisponível (file://) → **onboarding obrigatório/setup de PIN quebra** ao abrir por duplo clique |
| A11 | `inteligencia.js:158` | `x.hora` **não existe** em atendimentos (é `inicio`) → "Próximos: Maria ()..." com parêntese malformado |
| A12 | `inteligencia.js:95` | `precisaWeb` invertido: pergunta contendo "lead/cliente/..." nunca busca web, mesmo pedindo info externa |
| A13 | `inteligencia.js:298` | Botão "Ver módulo" dos problemas **sempre abre `leads`**, ignorando financeiro/estoque/atendimento |
| A14 | `hunter.js:559-565` + `516-529/544` | **Cancelar pesquisa** ainda persiste leads parciais e marca como `concluida`/`concluido`; estado "cancelado" nunca registrado |
| A15 | `hunter.js:429-433 + 124-126` | Opção tipo **"todos"** → `fontesAplicaveis` retorna `[]` → pesquisa **0 resultados** |
| A16 | `hunter.js:203-207 + 252-257` | **Dedup intra-pesquisa inexistente**: maps+diretorios geram telefones/nomes idênticos → duplicatas completas entram na base na primeira pesquisa |
| A17 | `hunter-ui.js:60-67` | `onChange` re-renderiza o Caçador **sem checar a view ativa** → pesquisa em andamento **sequestra** a tela atual (Leads/Financeiro/etc.) |
| A18 | `hunter-ui.js:388-391` | "Score médio do histórico" é heurística fabricada `70 + (validos/encontrados)*30`, não média real |
| A19 | `operacional-ui.js:617-618` | Status `confirmado` e `nao_compareceu` existem no enum mas **sem botões** na UI — inalcançáveis |
| A20 | `core-extra.js:631` | `helpers.healthReport` acessa `channels.list` sem `ensureLoaded()`; função **nunca chamada** (código morto) |

---

## 4. RISCOS TRANSVERSAIS

- **Fuso horário** (`operacional-core.js:413, 422, 434-449`): compara ISO-UTC com datas locais → atendimentos noturnos somem de "hoje" na madrugada do dia seguinte.
- **`pagamentos` sem normalização** (`operacional-core.js:268`): forma de pagamento do prompt 2 não integrada (campo morto).
- **`reabrir` exposto na API** embora sem botão na UI — qualquer código futuro pode usá-lo e dobrar lançamentos.
- **Ponte da extensão Chrome** (`core-extra.js:546`): evento `leadsExternos` nunca disparado por nada no repo — função inerte sem a extensão instalada (comportamento documentado, não bug).

## 5. PLANO DE CORREÇÃO (ordem definida — começar pelos críticos)

**FASE 1 — CRÍTICOS**
1. C1: corrigir conversão de centavos em `finalizar` (passar reais, ou criar contas com flag de já-em-centavos).
2. C2: remover `*100` do lucro no chat de inteligência.
3. C3: **rotular dados sintéticos do Caçador** na UI e **bloquear** `consentimento:true` fabricado; impedir fluxo "sintético → CRM" sem aviso explícito; gerar telefones BR reais (10/11 dígitos) ou marcá-los como incompletos.
4. C4: usar `l.created` (ou `l.updated`) no diagnóstico de leads sem contato.

**FASE 2 — IMPORTANTES**
5. A1/A5: adicionar `clientes.list()` real no core (ou corrigir referências) → Planner passa a mostrar clientes; resposta do Acessor/IA correta.
6. A2/A3: corrigir parsing do Acessor; mesclar defaults no `state.load`.
7. A6: registrar movimentação de estoque inicial **depois** de adicionar o produto.
8. A7: `reabrir` reverte estoque + remove contas vinculadas (por referência no `observacoes`), ou remove a função da API.
9. A8: ajuste negativo faz baixa.
10. A9: canal e-mail honesto — remover WebSocket falso; status `erro` claro "requer servidor SMTP" (sem fingir verificação).
11. A10: fallback de hash quando `crypto.subtle` indisponível.
12. A11/A12/A13: correções no inteligencia.js.
13. A14/A15/A16/A17/A18: correções no hunter (cancelamento, "todos", dedup intra, view-seqüestro, média real).
14. A19: botões de status `confirmado`/`nao_compareceu` no detalhe do atendimento.

**FASE 3 — VALIDAÇÃO**
15. Atualizar/estender os testes (`test-core.js`, `test-operacional.js`) para cobrir as correções C1/C2/C4/A6/A8 e rodar os 4 testes até verde.
16. Revisão final de regressão (nada quebrado fora do escopo).

**DEPOIS — EVOLUÇÃO** (prompts 2, 3 e 1): só iniciar Expansão Operacional completa, IA Assistente e Acessor depois de estabilizar.