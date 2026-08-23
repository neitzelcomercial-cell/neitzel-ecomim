# SISTEMA NEITZEL — CONSTRUÇÃO DO NOVO PORTAL DO CLIENTE E AGENDAMENTO

## OBJETIVO

Você é o agente responsável por desenvolver um novo sistema de Portal do Cliente e Agendamento para o Sistema Neitzel.

O portal atual NÃO deve ser simplesmente corrigido ou remendado.

Quero uma implementação nova, profissional, funcional e integrada ao Sistema Neitzel.

O objetivo é criar um sistema em que:

**Sistema Neitzel → configura a agenda → Portal utiliza essas configurações → Cliente agenda → Backend valida e grava → Planner é atualizado → Cliente é atualizado → demais módulos recebem os dados.**

O sistema deve funcionar de verdade.

NÃO quero telas demonstrativas, dados falsos, botões sem função, configurações que não persistem ou interfaces que simulam operações.

---

# REGRA ABSOLUTA

Antes de escrever código:

1. Analise completamente o projeto atual.
2. Identifique frontend.
3. Identifique backend.
4. Identifique banco de dados.
5. Identifique ORM, se existir.
6. Identifique autenticação.
7. Identifique APIs.
8. Identifique o Planner.
9. Identifique módulo de clientes.
10. Identifique financeiro.
11. Identifique marketing/CRM.
12. Identifique configurações existentes.
13. Identifique o portal antigo.
14. Identifique componentes reutilizáveis.
15. Identifique funcionalidades reais.
16. Identifique funcionalidades simuladas.
17. Identifique código quebrado.
18. Identifique duplicações.
19. Identifique dependências.
20. Identifique como os dados são persistidos.

NÃO comece criando o portal antes dessa auditoria.

Primeiro produza uma análise técnica do projeto e explique:

- arquitetura atual;
- banco;
- entidades existentes;
- APIs existentes;
- como o Planner funciona;
- como clientes são armazenados;
- como configurações são armazenadas;
- o que pode ser reutilizado;
- o que precisa ser criado;
- o que deve ser descartado;
- riscos técnicos;
- possíveis conflitos;
- plano de implementação.

Depois disso, implemente.

---

# PRINCÍPIO CENTRAL DA ARQUITETURA

O Portal do Cliente NÃO deve possuir uma agenda independente.

Não quero:

Sistema Neitzel → uma agenda

Portal → outra agenda

Isso criaria inconsistência.

Quero:

## UMA ÚNICA FONTE DE VERDADE

O backend/banco do Sistema Neitzel deve ser a fonte oficial da disponibilidade.

O Planner e o Portal devem utilizar os mesmos dados.

O Portal apenas apresenta ao cliente os horários que realmente podem ser reservados.

---

# FUNCIONAMENTO GERAL

Fluxo esperado:

Administrador configura:

- dias de funcionamento;
- horários;
- intervalos;
- serviços;
- duração dos serviços;
- profissionais;
- bloqueios;
- feriados;
- horários especiais;
- produtos;
- regras de agendamento.

Essas informações são persistidas no banco.

O Portal consulta essas informações.

O cliente acessa o link público.

Seleciona:

1. serviço;
2. profissional, quando aplicável;
3. data;
4. horário;
5. produtos;
6. observação;
7. dados pessoais;
8. confirmação.

Ao confirmar:

1. backend verifica novamente disponibilidade;
2. verifica conflitos;
3. verifica bloqueios;
4. verifica horário de funcionamento;
5. verifica duração;
6. verifica profissional;
7. verifica capacidade;
8. verifica reservas existentes;
9. executa transação;
10. grava o agendamento;
11. associa o cliente;
12. associa serviços;
13. associa produtos;
14. grava observação;
15. atualiza o Planner;
16. dispara os eventos necessários;
17. retorna confirmação ao Portal.

---

# REGRA CRÍTICA — NUNCA PERMITIR DUPLICIDADE

Essa é uma das partes mais importantes do sistema.

Dois clientes nunca podem conseguir confirmar o mesmo horário quando a capacidade daquele horário for 1.

NÃO confie no frontend.

NÃO confie em atualização da página.

NÃO confie apenas em JavaScript.

NÃO faça apenas:

"verificar disponibilidade → salvar".

Isso é vulnerável a concorrência.

A proteção deve existir no backend e no banco através de operações atômicas/transações/locks/constraints adequados à tecnologia utilizada.

Exemplo:

Cliente A e Cliente B escolhem simultaneamente:

23/08 às 14:00.

Ambos podem visualizar 14:00 inicialmente.

Cliente A confirma.

O backend grava a reserva.

Cliente B tenta confirmar.

O backend deve detectar que 14:00 já foi ocupado e rejeitar a operação.

Resultado:

Cliente A:
CONFIRMADO

Cliente B:
HORÁRIO NÃO ESTÁ MAIS DISPONÍVEL

O sistema deve então atualizar a disponibilidade apresentada ao cliente B.

---

# RESERVA TEMPORÁRIA

Implementar mecanismo de reserva temporária.

Quando o cliente selecionar um horário, o sistema pode criar uma reserva temporária com expiração.

Exemplo:

Cliente escolhe 14:00.

Status:

TEMPORARIAMENTE RESERVADO

Tempo configurável:

5 minutos inicialmente.

Enquanto a reserva temporária existir:

outros clientes não podem confirmar aquele horário.

Se o cliente finalizar:

TEMPORÁRIA → CONFIRMADA

Se abandonar ou expirar:

TEMPORÁRIA → EXPIRADA

O horário volta para:

DISPONÍVEL

O tempo de expiração deve ser configurável.

Não criar reservas temporárias infinitas.

Criar mecanismo automático para limpeza/expiração.

---

# STATUS DO AGENDAMENTO

Criar estados claros.

Exemplo:

- available
- temporary_hold
- pending
- confirmed
- completed
- cancelled
- expired
- no_show
- blocked

Utilizar os nomes adequados ao padrão do projeto.

Não permitir transições inválidas.

---

# CONFIGURAÇÃO DE FUNCIONAMENTO

Criar dentro do Sistema Neitzel uma área:

## CONFIGURAÇÃO DO PORTAL

Deve permitir configurar:

### Dias da semana

- domingo;
- segunda;
- terça;
- quarta;
- quinta;
- sexta;
- sábado.

Cada dia pode possuir:

- aberto;
- fechado;
- múltiplos períodos.

Exemplo:

Segunda:

08:00–12:00

13:30–18:00

Terça:

08:00–12:00

13:30–18:00

Quarta:

FECHADO

---

# BLOQUEIO DE DATAS

Permitir bloquear dias específicos.

Exemplo:

25/12/2026

Status:

FECHADO

Motivo:

Feriado

Também permitir:

- férias;
- evento;
- manutenção;
- folga;
- indisponibilidade;
- qualquer motivo personalizado.

---

# BLOQUEIO DE HORÁRIOS

Permitir bloquear horários específicos.

Exemplo:

23/08

14:00–15:00

Motivo:

Reunião

O Portal deve automaticamente deixar esse horário indisponível.

---

# HORÁRIOS ESPECIAIS

Permitir configurar exceções.

Exemplo:

Normalmente sábado:

08:00–12:00

Mas no dia 29/08:

10:00–16:00

O horário especial deve substituir a regra normal somente naquela data.

---

# SERVIÇOS

Criar gerenciamento de serviços.

Cada serviço deve permitir:

- nome;
- descrição;
- preço;
- duração;
- imagem, se aplicável;
- ativo/inativo;
- ordem;
- categoria;
- profissionais habilitados;
- disponibilidade no portal;
- regras específicas.

Exemplo:

Corte

Duração: 30 minutos

Preço: R$ XX

---

# DURAÇÃO DO SERVIÇO

A duração deve ser utilizada pelo mecanismo de disponibilidade.

Exemplo:

Serviço A:

30 minutos

Cliente agenda:

14:00

O sistema precisa ocupar:

14:00–14:30

Se o próximo horário disponível for 14:30, ele pode aparecer.

Se houver conflito entre 14:00 e 14:30, o horário não deve aparecer.

Para serviço de 60 minutos:

14:00 ocupa:

14:00–15:00

---

# INTERVALO ENTRE SERVIÇOS

Permitir configuração opcional de intervalo.

Exemplo:

Serviço:

30 minutos

Intervalo:

10 minutos

Reserva:

14:00–14:30

Bloqueio operacional:

14:30–14:40

Próximo horário:

14:40

Implementar de maneira consistente com o Planner.

---

# PROFISSIONAIS

Caso o sistema possua profissionais/atendentes:

Cada profissional pode ter:

- agenda;
- horários;
- serviços;
- indisponibilidade;
- bloqueios;
- férias;
- capacidade.

O mecanismo deve verificar o profissional antes de confirmar.

Se não existir módulo de profissionais, estruturar a arquitetura para suportá-lo futuramente sem precisar refazer o sistema.

---

# PRODUTOS

No processo de agendamento o cliente pode selecionar produtos.

Exemplo:

Serviço:

Corte

Produtos:

Pomada

Shampoo

Outros.

Cada produto deve ser associado ao agendamento.

Não criar produto fictício.

Utilizar o catálogo real do sistema quando ele existir.

Se o módulo de produtos ainda não existir, criar uma estrutura compatível com futura integração.

---

# OBSERVAÇÃO

Permitir que o cliente escreva observação.

Exemplo:

"Gostaria de atendimento específico."

Essa informação deve:

- ser salva no banco;
- aparecer no agendamento;
- aparecer no Planner;
- ficar disponível no histórico do cliente.

---

# CLIENTES

Se o cliente já existir:

identificar cliente existente.

Não criar duplicação desnecessária.

Se não existir:

criar cliente.

Utilizar mecanismos de identificação apropriados.

Nunca criar dezenas de clientes duplicados apenas porque fizeram vários agendamentos.

---

# PORTAL PÚBLICO

Criar um Portal do Cliente moderno, responsivo e profissional.

Deve funcionar em:

- celular;
- tablet;
- desktop.

O cliente não deve precisar conhecer o painel administrativo.

---

# FLUXO DO PORTAL

Tela inicial:

- identidade visual;
- informações do negócio;
- serviços;
- botão de agendamento.

Fluxo:

## 1. Serviço

Selecionar serviço.

## 2. Profissional

Mostrar somente se necessário.

## 3. Data

Mostrar calendário.

Dias indisponíveis devem estar bloqueados.

## 4. Horário

Mostrar somente horários realmente disponíveis.

Não mostrar horários bloqueados.

Não mostrar horários ocupados.

Não mostrar horários incompatíveis com duração do serviço.

## 5. Produtos

Permitir seleção.

## 6. Observação

Campo de observação.

## 7. Dados do cliente

Nome.

Telefone.

E-mail, quando aplicável.

## 8. Revisão

Mostrar:

- serviço;
- profissional;
- data;
- horário;
- produtos;
- preço;
- duração;
- observação.

## 9. Confirmação

Confirmar.

## 10. Resultado

Mostrar confirmação real.

Gerar identificador do agendamento.

---

# ATUALIZAÇÃO DA DISPONIBILIDADE

A disponibilidade precisa ser dinâmica.

O Portal deve atualizar os horários quando necessário.

Implementar preferencialmente:

- WebSocket;
- SSE;
- ou mecanismo equivalente.

Se isso não for adequado à arquitetura atual:

usar polling inteligente.

Nunca deixar a disponibilidade ficar congelada por longos períodos.

---

# REGRA MAIS IMPORTANTE SOBRE ATUALIZAÇÃO

Quando qualquer administrador fizer:

- bloquear horário;
- desbloquear horário;
- fechar dia;
- abrir dia;
- alterar horário;
- alterar serviço;
- alterar duração;
- alterar profissional;
- cancelar agendamento;
- confirmar agendamento;
- alterar configuração;

o Portal deve refletir a mudança.

Não quero que seja necessário editar HTML.

Não quero reconstruir o portal.

Não quero alterar manualmente arquivos.

Não quero publicar novamente para cada mudança de agenda.

As configurações devem vir do backend.

---

# PLANNER

O Planner deve ser integrado diretamente.

Quando um agendamento for confirmado:

criar/atualizar o evento correspondente no Planner.

O evento deve possuir:

- cliente;
- serviço;
- profissional;
- data;
- horário;
- duração;
- produtos;
- observação;
- status;
- origem do agendamento.

Origem:

PORTAL_CLIENTE

---

# SINCRONIZAÇÃO

Se um agendamento for alterado no Planner:

o Portal deve receber a nova situação.

Se for cancelado:

o horário deve voltar a ficar disponível quando aplicável.

Se for bloqueado:

o Portal deve retirar o horário.

Se o administrador alterar a duração:

recalcular disponibilidade.

---

# CANCELAMENTO

Criar mecanismo de cancelamento.

Permitir configurar:

- prazo mínimo;
- se cliente pode cancelar;
- se cliente pode remarcar;
- regras específicas.

Quando cancelar:

1. atualizar status;
2. liberar disponibilidade;
3. atualizar Planner;
4. atualizar histórico;
5. disparar eventos;
6. atualizar Portal.

---

# REMARCAÇÃO

Permitir remarcar quando habilitado.

O sistema deve:

1. verificar nova disponibilidade;
2. reservar novo horário;
3. liberar antigo;
4. atualizar o mesmo agendamento ou criar histórico adequado;
5. atualizar Planner;
6. atualizar Portal.

Não gerar registros duplicados sem necessidade.

---

# FINANCEIRO

O sistema deve deixar preparada a integração com financeiro.

Quando houver preço:

o valor deve estar associado ao agendamento.

Se houver pagamento:

registrar a informação corretamente.

Não marcar pagamento como realizado simplesmente porque o cliente confirmou o agendamento.

Separar:

- agendamento;
- cobrança;
- pagamento.

---

# CRM / MARKETING

O agendamento deve gerar eventos que possam ser utilizados pelo CRM/marketing.

Exemplo:

CLIENTE_AGENDOU

CLIENTE_CANCELou

CLIENTE_REAGENDOU

CLIENTE_COMPARECEU

CLIENTE_NAO_COMPARECEU

Esses eventos devem ser estruturados para futuras automações.

---

# NOTIFICAÇÕES

Preparar arquitetura para:

- confirmação;
- lembrete;
- cancelamento;
- alteração;
- remarcação.

Não implementar integrações externas falsas.

Se uma integração ainda não existir, criar interface/service apropriado e deixar explicitamente identificado.

---

# LINK PÚBLICO

Criar um link público do Portal.

Exemplo conceitual:

/agendamento

ou

/portal/cliente

O link deve poder ser enviado por:

- Instagram;
- WhatsApp;
- Facebook;
- site;
- QR Code;
- outros canais.

O portal deve funcionar sem que o cliente tenha acesso ao painel administrativo.

---

# GITHUB / DEPLOY

O projeto deve ser estruturado corretamente para versionamento no GitHub.

Não colocar:

- senhas;
- tokens;
- chaves;
- secrets;
- credenciais;

no código.

Criar arquivo de configuração apropriado para variáveis de ambiente.

Preparar o projeto para deploy.

O frontend público deve conseguir acessar o backend de produção de maneira segura.

---

# SEGURANÇA

Implementar:

- validação no backend;
- autenticação administrativa;
- autorização;
- proteção das APIs;
- rate limiting quando apropriado;
- validação de entrada;
- proteção contra manipulação de IDs;
- proteção contra reservas fraudulentas;
- logs;
- tratamento de erros;
- secrets via environment variables.

Nunca confiar em informações enviadas pelo frontend.

Exemplo:

O frontend diz:

"preço = R$ 20"

O backend deve buscar o preço real.

O cliente não pode manipular:

- preço;
- duração;
- serviço;
- disponibilidade;
- profissional;
- status.

---

# BANCO DE DADOS

Criar ou adaptar as entidades necessárias.

A arquitetura deve contemplar pelo menos conceitos equivalentes a:

Business/Empresa

Customer/Cliente

Service/Serviço

Product/Produto

Professional/Profissional

Schedule/Agenda

ScheduleRule/RegraDeAgenda

Availability/Disponibilidade

BlockedDate/DataBloqueada

BlockedTime/HorarioBloqueado

Appointment/Agendamento

AppointmentItem/ItensDoAgendamento

TemporaryHold/ReservaTemporaria

Notification/Notificação

AuditLog/LogAuditoria

Utilize a nomenclatura e padrões já existentes no projeto quando apropriado.

Não duplicar tabelas que já existem sem necessidade.

---

# AUDITORIA E LOGS

Toda operação importante deve poder ser rastreada.

Registrar:

- quem criou;
- quando;
- quem alterou;
- quando;
- origem;
- alterações importantes;
- cancelamentos;
- bloqueios;
- reservas.

Especialmente alterações administrativas.

---

# CONCORRÊNCIA

Esse requisito é obrigatório.

Testar:

### Cenário 1

Cliente A e Cliente B tentam reservar exatamente o mesmo horário.

Resultado:

somente um consegue.

### Cenário 2

Dois dispositivos tentam reservar simultaneamente.

Somente um consegue.

### Cenário 3

Um administrador bloqueia um horário enquanto um cliente tenta reservar.

O backend deve decidir corretamente conforme a ordem/transação.

### Cenário 4

Reserva temporária expira.

Horário volta para disponibilidade.

### Cenário 5

Cliente cancela.

Horário volta a ficar disponível.

---

# NÃO DUPLICAR AGENDAMENTOS

Se o cliente clicar duas vezes no botão "Confirmar":

não criar dois agendamentos.

Utilizar mecanismo de idempotência.

A mesma requisição não pode gerar múltiplas reservas.

---

# TIMEZONE

Utilizar timezone configurável corretamente.

Não permitir que o horário apresentado ao cliente seja diferente do horário armazenado.

Evitar bugs de UTC/local time.

A agenda deve respeitar o timezone configurado para a empresa.

---

# RECUPERAÇÃO DE ERROS

Se a confirmação falhar:

não deixar o usuário achando que foi confirmado.

Mostrar claramente:

"Não foi possível confirmar este horário. Ele pode ter acabado de ser reservado por outra pessoa."

Atualizar disponibilidade.

Permitir escolher outro horário.

---

# EXPERIÊNCIA DO USUÁRIO

O portal deve ser simples.

Não criar dezenas de telas desnecessárias.

O cliente deve conseguir agendar rapidamente.

Mostrar carregamento durante operações.

Desabilitar botão durante confirmação.

Mostrar erro amigável.

Nunca esconder erro técnico atrás de uma mensagem falsa de sucesso.

---

# PAINEL ADMINISTRATIVO

Criar uma área administrativa para:

## Agenda

- visualizar;
- criar;
- editar;
- cancelar;
- bloquear;
- desbloquear.

## Serviços

- criar;
- editar;
- ativar;
- desativar;
- configurar duração;
- configurar preço.

## Produtos

- gerenciar produtos.

## Horários

- configurar dias;
- configurar períodos;
- configurar exceções.

## Bloqueios

- dias;
- horários.

## Portal

- ativar/desativar;
- configurar informações;
- configurar regras;
- configurar identidade visual quando aplicável.

---

# REGRA DE PERSISTÊNCIA

Toda configuração alterada no painel deve ser persistida.

Depois de:

1. salvar;
2. atualizar página;
3. sair;
4. entrar novamente;

a configuração deve continuar existente.

Não usar apenas estado local.

Não usar somente localStorage para dados importantes.

Não criar configuração fake.

---

# REGRA DE FONTE DE DADOS

Não duplicar dados entre frontend e backend.

Não criar arrays fixos de serviços.

Não criar horários hardcoded.

Não criar datas hardcoded.

Não criar clientes fake.

Não criar reservas fake.

O sistema deve buscar dados reais.

---

# TESTES

Criar testes para:

- disponibilidade;
- conflito;
- reserva;
- cancelamento;
- remarcação;
- bloqueio;
- desbloqueio;
- duração;
- intervalo;
- múltiplos períodos;
- feriados;
- exceções;
- reserva temporária;
- expiração;
- concorrência;
- idempotência;
- cliente existente;
- cliente novo;
- serviços;
- produtos;
- Planner;
- permissões.

---

# TESTE DE PONTA A PONTA

Criar um cenário completo:

1. Administrador configura segunda-feira 08:00–18:00.
2. Cria serviço de 30 minutos.
3. Define preço.
4. Abre Portal.
5. Cliente escolhe serviço.
6. Cliente escolhe horário.
7. Cliente informa dados.
8. Confirma.
9. Backend salva.
10. Planner recebe.
11. Cliente recebe confirmação.
12. Outro dispositivo acessa.
13. O horário reservado aparece indisponível.
14. Administrador visualiza no Planner.
15. Administrador cancela.
16. Portal atualiza.
17. Horário volta a ficar disponível.
18. Outro cliente consegue reservar.

Esse fluxo deve funcionar de verdade.

---

# INTERFACE

A interface deve parecer parte do Sistema Neitzel.

Não criar uma interface genérica desconectada.

Utilizar:

- identidade visual existente;
- componentes existentes quando forem bons;
- padrões existentes;
- responsividade;
- acessibilidade;
- feedback visual.

Mas não reutilizar código antigo quebrado apenas por reutilizar.

---

# CÓDIGO

Prioridades:

1. funcionamento;
2. arquitetura;
3. integridade dos dados;
4. segurança;
5. manutenção;
6. experiência do usuário;
7. aparência.

Não sacrificar arquitetura por aparência.

Não criar código gigante e impossível de manter.

Separar responsabilidades.

Criar services/repositories/controllers/hooks/components conforme a arquitetura utilizada.

---

# NÃO FAZER

NÃO:

- apagar funcionalidades existentes sem autorização;
- substituir banco sem analisar;
- criar backend paralelo desnecessário;
- criar banco separado para o portal sem justificativa;
- criar agenda paralela;
- usar dados mockados em produção;
- usar localStorage como banco;
- hardcodar horários;
- hardcodar serviços;
- criar reservas fictícias;
- fingir integração com Planner;
- fingir integração com financeiro;
- fingir integração com CRM;
- considerar uma mensagem "sucesso" como prova de persistência;
- considerar o frontend como autoridade;
- permitir dupla reserva;
- ignorar concorrência.

---

# ESTRATÉGIA DE IMPLEMENTAÇÃO

Execute em fases.

## FASE 1 — AUDITORIA

Analise o projeto inteiro.

Não altere código ainda.

Produza relatório.

## FASE 2 — ARQUITETURA

Defina:

- entidades;
- relacionamentos;
- APIs;
- regras;
- fluxo;
- disponibilidade;
- concorrência.

## FASE 3 — BANCO E BACKEND

Implementar persistência e regras.

## FASE 4 — CONFIGURAÇÕES

Implementar painel de configuração.

## FASE 5 — DISPONIBILIDADE

Implementar mecanismo real de cálculo de horários.

## FASE 6 — RESERVA

Implementar reserva temporária, confirmação e concorrência.

## FASE 7 — PORTAL

Construir frontend público.

## FASE 8 — PLANNER

Integrar com Planner.

## FASE 9 — CLIENTES

Integrar com módulo de clientes.

## FASE 10 — FINANCEIRO / CRM / MARKETING

Integrar somente utilizando estruturas reais existentes.

## FASE 11 — TEMPO REAL

Implementar atualização da disponibilidade.

## FASE 12 — TESTES

Executar testes unitários, integração e ponta a ponta.

## FASE 13 — DEPLOY

Preparar GitHub e ambiente de produção.

---

# REGRA PARA O AGENTE

Sempre que encontrar uma parte do projeto que não esteja clara:

NÃO invente.

Investigue o código.

Procure modelos.

Procure endpoints.

Procure tabelas.

Procure serviços.

Procure chamadas.

Procure componentes.

Procure documentação.

Se ainda assim não existir, explique antes de criar uma nova estrutura que possa gerar duplicação.

---

# CRITÉRIO DE CONCLUSÃO

O projeto NÃO deve ser considerado concluído porque:

- a tela ficou bonita;
- o botão funciona visualmente;
- o formulário abre;
- apareceu mensagem de sucesso.

Só considerar concluído quando:

### CONFIGURAÇÃO

Administrador altera horário.

↓

Banco salva.

↓

Portal muda.

### AGENDAMENTO

Cliente escolhe horário.

↓

Backend valida.

↓

Banco salva.

↓

Planner atualiza.

↓

Cliente aparece no sistema.

### CONCORRÊNCIA

Dois clientes tentam o mesmo horário.

↓

Somente um consegue.

### CANCELAMENTO

Agendamento cancelado.

↓

Planner atualiza.

↓

Horário é liberado.

↓

Portal mostra novamente como disponível.

### ATUALIZAÇÃO

Administrador altera configuração.

↓

Portal reflete a alteração sem edição manual do frontend.

---

# DOCUMENTAÇÃO

Ao terminar cada fase, documentar:

- o que foi implementado;
- arquivos alterados;
- banco alterado;
- APIs criadas;
- integrações;
- testes realizados;
- problemas encontrados;
- pendências;
- próximos passos.

Não esconder problemas.

Se algo não puder ser integrado porque o sistema atual não possui determinada estrutura, informar claramente.

---

# OBJETIVO FINAL

Quero que o Sistema Neitzel possua um Portal de Agendamento realmente operacional.

O cliente recebe um link.

Abre no celular.

Escolhe o serviço.

Escolhe data.

Escolhe horário.

Escolhe produtos, quando disponíveis.

Escreve observação.

Confirma.

O sistema registra tudo.

O horário fica ocupado.

Outro cliente não consegue pegar o mesmo horário.

O Planner recebe automaticamente.

O cliente fica registrado.

As informações ficam disponíveis para as outras áreas do sistema.

Se o administrador alterar a agenda, o Portal acompanha automaticamente.

Se cancelar, o horário é liberado.

Se remarcar, tudo é atualizado.

O Portal deve ser apenas uma extensão pública do Sistema Neitzel, e não um sistema separado.

## REGRA FINAL

Antes de começar a implementar, faça a auditoria completa do projeto atual e apresente o plano técnico.

Depois implemente fase por fase.

Não pule diretamente para a criação da interface.

A prioridade é:

**DADOS → BACKEND → REGRAS → INTEGRAÇÕES → SEGURANÇA → TESTES → INTERFACE.**

O sistema precisa funcionar de verdade.