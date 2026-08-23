Analise o estado atual do Portal do Cliente.

A tela atual informa:

"Backend do Portal não está acessível"

e orienta executar:

`node server.js`

e abrir:

`http://localhost:8080/`

Isso mostra que o portal atualmente depende de um servidor local.

Esse comportamento NÃO atende ao objetivo final do Sistema Neitzel.

## OBJETIVO

Quero que o Portal do Cliente seja uma aplicação real e acessível por um link público.

O cliente deverá conseguir abrir o portal pelo celular, Instagram, WhatsApp ou qualquer navegador sem precisar:

- instalar Node;
- executar comandos;
- acessar localhost;
- abrir arquivos HTML manualmente;
- iniciar servidor no computador do cliente.

O servidor/backend precisa estar hospedado em ambiente acessível pela internet.

---

# PRIMEIRO: AUDITAR A IMPLEMENTAÇÃO ATUAL

Antes de alterar qualquer coisa, analise:

- server.js
- frontend
- APIs
- banco de dados
- persistência
- autenticação
- configuração
- Planner
- agendamentos
- disponibilidade
- reservas temporárias
- integração entre frontend e backend.

Descubra exatamente por que o frontend está dependendo de localhost.

Não simplesmente esconda a mensagem de erro.

Corrija a arquitetura.

---

# ARQUITETURA DESEJADA

A arquitetura final deve ser:

```text
                 SISTEMA NEITZEL
                       |
                       |
                 BACKEND / API
                       |
                  BANCO DE DADOS
                       |
          +------------+------------+
          |                         |
       PLANNER                 PORTAL PÚBLICO
                                     |
                              CLIENTE NO CELULAR
```

O Portal Público deve consumir a API real do Sistema Neitzel.

---

# NÃO USAR FILE://

O portal não pode depender da abertura direta de:

`file://`

Ele deve funcionar através de servidor HTTP/HTTPS.

---

# NÃO DEPENDER DE LOCALHOST EM PRODUÇÃO

`localhost` pode continuar sendo utilizado apenas no ambiente de desenvolvimento.

Criar separação clara entre:

## Desenvolvimento

```text
localhost
```

## Produção

```text
HTTPS + domínio/URL público
```

O frontend deve descobrir automaticamente a URL correta da API através de configuração de ambiente.

Não deixar:

```text
http://localhost:8080
```

hardcoded no código de produção.

---

# CONFIGURAÇÃO DE AMBIENTE

Criar configuração por ambiente.

Exemplo conceitual:

```text
Development
API_URL=http://localhost:8080
```

Produção:

```text
API_URL=https://api.seudominio.com
```

Utilizar o mecanismo adequado ao framework utilizado no projeto.

Não colocar secrets no frontend.

---

# BACKEND

O backend precisa:

- iniciar corretamente;
- expor API;
- conectar ao banco;
- persistir dados;
- calcular disponibilidade;
- controlar reservas;
- impedir duplicidade;
- atualizar Planner;
- responder ao Portal.

---

# DISPONIBILIDADE

O Portal nunca deve calcular sozinho a disponibilidade definitiva.

Fluxo:

```text
Portal
↓
API
↓
Backend verifica banco
↓
Regras de agenda
↓
Bloqueios
↓
Reservas
↓
Conflitos
↓
Disponibilidade real
↓
Portal
```

---

# RESERVA

Quando o cliente clicar em confirmar:

```text
POST /appointments
```

ou endpoint equivalente.

O backend deve:

1. validar os dados;
2. verificar disponibilidade novamente;
3. verificar conflito;
4. verificar bloqueio;
5. verificar duração;
6. verificar profissional;
7. criar reserva temporária ou confirmação;
8. executar transação;
9. impedir duplicidade;
10. salvar;
11. atualizar Planner;
12. retornar resultado.

---

# CONCORRÊNCIA

Obrigatório testar dois clientes tentando o mesmo horário simultaneamente.

Exemplo:

```text
Cliente A → 14:00
Cliente B → 14:00
```

Somente um pode conseguir confirmar.

O outro deve receber:

```text
Este horário acabou de ser reservado.
Escolha outro horário.
```

Isso deve ser protegido no backend/banco.

Não confiar somente no frontend.

---

# RESERVA TEMPORÁRIA

Manter o mecanismo de hold temporário caso já exista.

Se não existir, implementar.

Exemplo:

```text
14:00
↓
Cliente selecionou
↓
TEMPORARIAMENTE RESERVADO
↓
5 minutos
↓
confirmou → CONFIRMADO
```

Se abandonar:

```text
EXPIRADO
↓
14:00 volta para disponível
```

---

# ATUALIZAÇÃO AUTOMÁTICA

Quando um cliente reservar um horário:

outros clientes devem deixar de visualizar aquele horário como disponível.

Implementar:

- WebSocket;
- SSE;
- ou polling inteligente;

de acordo com a arquitetura do projeto.

Além disso, a confirmação final sempre deve consultar o backend novamente.

---

# PLANNER

A reserva confirmada pelo Portal deve aparecer no Planner.

Não criar uma agenda paralela.

Exemplo:

```text
Cliente agenda
↓
Agendamento salvo
↓
Planner atualizado
```

Se o horário for cancelado:

```text
Cancelamento
↓
Planner atualizado
↓
Disponibilidade recalculada
↓
Portal atualizado
```

---

# CONFIGURAÇÕES

Quando o administrador alterar:

- horário de funcionamento;
- dia fechado;
- bloqueio;
- serviço;
- duração;
- profissional;
- intervalo;
- feriado;
- horário especial;

o Portal deve refletir automaticamente.

Não exigir alteração manual do HTML.

Não exigir novo build para cada alteração de agenda.

As configurações devem vir do backend/banco.

---

# PUBLICAÇÃO

Analise a estrutura atual e prepare o projeto para produção.

O resultado precisa permitir:

```text
Cliente
↓
URL pública
↓
Portal
↓
API pública segura
↓
Banco
↓
Sistema Neitzel
```

O frontend pode ser hospedado separadamente do backend, se isso for melhor para a arquitetura.

O backend deve possuir uma URL pública HTTPS.

Não assumir que GitHub Pages consegue executar `server.js`.

Se o frontend for hospedado no GitHub Pages, ele deverá consumir uma API/backend hospedado separadamente.

---

# GITHUB

Preparar o projeto para GitHub.

Criar:

- README;
- instruções de desenvolvimento;
- instruções de produção;
- variáveis de ambiente;
- build;
- deploy;
- estrutura clara.

NUNCA enviar para GitHub:

- senha;
- token;
- API key;
- credenciais;
- banco local com dados sensíveis;
- admin-token.txt;
- secrets.

Adicionar arquivos sensíveis ao `.gitignore`.

---

# ADMIN-TOKEN

A mensagem atual informa:

"token fica em data/admin-token.txt"

Isso precisa ser analisado.

Não quero token administrativo exposto ou distribuído incorretamente.

Determinar:

- por que esse token existe;
- como autenticação está funcionando;
- se ele é necessário;
- como deve funcionar em produção.

Se houver risco de segurança, corrigir.

Nunca expor token administrativo em frontend público.

---

# ERRO ATUAL

Não remover simplesmente:

"Backend do Portal não está acessível"

A mensagem deve continuar existindo quando realmente houver indisponibilidade.

Porém deve explicar corretamente:

### Desenvolvimento

"Servidor local não iniciado."

### Produção

"Não foi possível conectar ao servidor. Tente novamente."

Não mostrar instruções de desenvolvimento para clientes finais.

---

# TESTE LOCAL

Depois das alterações, executar:

```text
npm install
```

quando necessário.

Depois:

```text
node server.js
```

ou o comando correto do projeto.

Verificar:

```text
http://localhost:8080/
```

ou a porta configurada.

Testar:

- Portal;
- login administrativo;
- Planner;
- criação de serviço;
- configuração de horário;
- bloqueio;
- agendamento;
- cancelamento;
- disponibilidade.

---

# TESTE DE PRODUÇÃO

Preparar o projeto para receber:

```text
FRONTEND_URL
API_URL
DATABASE_URL
```

e demais variáveis necessárias.

Nunca hardcodar valores de produção.

---

# CRITÉRIO DE CONCLUSÃO

Não considere resolvido simplesmente porque:

```text
localhost:8080
```

abriu.

O problema só estará resolvido quando:

### TESTE 1

Eu abrir o Sistema Neitzel.

### TESTE 2

Configurar horário.

### TESTE 3

Abrir Portal.

### TESTE 4

Ver os horários configurados.

### TESTE 5

Fazer um agendamento.

### TESTE 6

Ver o agendamento no Planner.

### TESTE 7

Abrir o Portal em outro dispositivo.

### TESTE 8

Confirmar que o horário reservado aparece indisponível.

### TESTE 9

Alterar a agenda no Sistema Neitzel.

### TESTE 10

Confirmar que o Portal acompanha a alteração.

### TESTE 11

Cancelar o agendamento.

### TESTE 12

Confirmar que a disponibilidade foi recalculada.

### TESTE 13

Publicar o Portal.

### TESTE 14

Abrir o link público em um celular sem o servidor local rodando.

Esse último teste é obrigatório.

Se o Portal só funciona quando meu computador está executando:

```text
node server.js
```

então a implementação ainda NÃO está pronta para produção.

---

# IMPORTANTE

Não quero outro portal demonstrativo.

Quero um sistema real.

Não quero apenas corrigir a mensagem da tela.

Quero corrigir a arquitetura que causou essa mensagem.

O objetivo final é:

```text
LINK PÚBLICO
      ↓
PORTAL DO CLIENTE
      ↓
API REAL
      ↓
BANCO DE DADOS
      ↓
SISTEMA NEITZEL
      ↓
PLANNER
      ↓
CLIENTES
      ↓
FINANCEIRO / CRM / MARKETING
```

Tudo deve utilizar dados reais e persistentes.

Primeiro faça a auditoria do código atual e me mostre exatamente o que precisa ser alterado.

Depois implemente a correção.

Não apague funcionalidades existentes sem analisar o impacto.