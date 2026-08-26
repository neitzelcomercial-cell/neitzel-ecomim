# ESPECIFICAÇÃO DE REESTRUTURAÇÃO DO MÓDULO DE ANÁLISE DE CENÁRIO, MERCADO E PREVISÃO

> **DOCUMENTO DE REQUISITOS TÉCNICOS E ORIENTAÇÕES DE IMPLEMENTAÇÃO**  
> **PÚBLICO-ALVO:** OPENCODE / AGENTE DE DESENVOLVIMENTO  
> **OBJETIVO:** REESTRUTURAR O MÓDULO PARA SER REALMENTE FUNCIONAL, CONFIÁVEL E PRECISO.

---

## ⚠️ DIRETRIZES FUNDAMENTAIS (REGRAS INVIOLÁVEIS)

1. **IDENTIDADE VISUAL:** NÃO altere a identidade visual geral do sistema (manter layout, cores e estilo de componentes existentes).
2. **FUNCIONALIDADES:** NÃO remova funcionalidades existentes.
3. **INTEGRIDADE DE CÓDIGO:** NÃO quebre rotas, banco de dados, autenticação, CRM, leads, financeiro ou qualquer outro módulo. A alteração deve ser estritamente na lógica, na integração de pesquisa externa e na confiabilidade do módulo de análise.
4. **TRANSPARÊNCIA E REALISMO:**
   - NÃO esconda limitações.
   - NÃO invente dados para preencher gráficos ou tabelas.
   - NÃO apresente uma previsão como se fosse certeza.
   - NÃO simule ou crie dados "mock" fictícios no código para fingir que fez pesquisa.

---

## 🔍 PASSO 0: ANÁLISE E AUDITORIA PRÉVIA (OBRIGATÓRIO)

Antes de realizar qualquer modificação no código:
1. Analise toda a implementação atual desse módulo.
2. Descubra de onde atualmente vêm os dados (rotas do backend, banco de dados, Edge Functions).
3. Identifique o que é dado real, dado interno, cálculo, mock, demonstração ou valor fixo.
4. Identifique se a pesquisa externa realmente está funcionando ou se está quebrada/desativada.
5. Identifique por que atualmente aparece `"Investigação externa indisponível agora"`.

---

## 🎯 OBJETIVO DO MÓDULO

O módulo deve funcionar como um **ASSISTENTE DE INTELIGÊNCIA DE MERCADO E PREVISÃO PARA O ESTABELECIMENTO**.

Ele deve analisar e integrar:
- **A) PASSADO:** Histórico interno real das últimas 8+ semanas.
- **B) PRESENTE:** Diagnóstico da performance e tendência atual.
- **C) AMBIENTE EXTERNO:** Pesquisa em tempo real de eventos, mercado e dados locais.
- **D) POSSÍVEIS IMPACTOS FUTUROS:** Análise lógica de como o ambiente externo afeta o estabelecimento.
- **E) PROJEÇÃO DAS PRÓXIMAS SEMANAS:** Previsão em faixas com grau de confiança.

---

## ⚙️ REQUISITOS DETALHADOS POR SEÇÃO

### 1. DADOS INTERNOS DO ESTABELECIMENTO
Utilize os dados reais existentes no sistema. Sempre que disponíveis, analisar pelo menos:
- Atendimentos, clientes novos, clientes recorrentes.
- Agendamentos, cancelamentos, faltas / no-show.
- Faturamento, ticket médio, serviços realizados.
- Horários e dias mais movimentados, ocupação da agenda.
- Leads, conversões, origem dos clientes.
- Campanhas, promoções, vendas, despesas relevantes.
- Histórico semanal (mínimo de **8 semanas**).

> **Aviso de Dados Insuficientes:** NUNCA preencha ausência de dados com números inventados. Se houver poucos dados históricos, informe na interface:
> *"Dados históricos insuficientes para uma previsão confiável."*

---

### 2. PESQUISA EXTERNA REAL
A pesquisa externa precisa realmente consultar fontes públicas da internet em tempo real.
- NÃO usar textos previamente escritos no código.
- NÃO usar valores fictícios.
- NÃO simular uma pesquisa fictícia.

A pesquisa deve ser realizada dinamicamente com base em:
- **PAÍS** (ex: Brasil)
- **ESTADO** (ex: SC)
- **CIDADE** (ex: Joinville)
- **SEGMENTO** (ex: Barbearia, Salão, Estética, etc.)
- **PERÍODO DA ANÁLISE**

**Exemplo de Consultas Geradas Dinamicamente:**
- `"eventos {Cidade} {Estado} próximos dias"`
- `"eventos {Cidade} {Estado} próxima semana"`
- `"shows {Cidade} {Estado}"`, `"feiras {Cidade} {Estado}"`, `"eventos esportivos {Cidade} {Estado}"`
- `"feriados {Cidade} {Estado}"`, `"feriados Brasil {Ano}"`
- `"economia {Cidade} {Estado}"`, `"comércio {Cidade} {Estado}"`
- Consultas específicas do segmento (ex: `"barbearia {Cidade} {Estado}"`, `"movimento comércio {Cidade}"`).

---

### 3. FONTES PRIORITÁRIAS E RASTREABILIDADE
A pesquisa deve priorizar fontes oficiais e confiáveis:
- **Prioridade 1:** Prefeitura, Governo Estadual/Federal, IBGE, órgãos oficiais, secretarias de turismo, entidades empresariais, organizadores oficiais de eventos.
- **Prioridade 2:** Jornais locais, portais de notícias confiáveis, veículos especializados, associações comerciais.
- **Prioridade 3:** Outras fontes públicas relevantes.

**Dados Obrigatórios por Fonte Encontrada:**
Para cada fonte/notícia utilizada, o backend deve estruturar e salvar:
- Título, URL, Nome da Fonte, Data de Publicação, Data do Evento (se aplicável), Data de Consulta, Resumo, Relevância, Impacto Estimado e Nível de Confiança.

---

### 4. MAPEAMENTO DE EVENTOS LOCAIS
Pesquisar ativamente: shows, festivais, feiras, congressos, eventos esportivos/culturais/turísticos, feriados, pontos facultativos, datas comemorativas, férias escolares e grandes obras ou intervenções na região.

Estrutura de dados para cada evento:
- **Evento**, **Data**, **Local**, **Cidade**, **Distância/Proximidade**, **Público Esperado**, **Duração**, **Fonte**, **Impacto Potencial**, **Direção do Impacto** e **Confiança**.

---

### 5. SEPARAÇÃO RÍGIDA: EVENTO VS. IMPACTO
O sistema NUNCA deve presumir causalidade direta e simplista (ex: *"Existe um evento, logo o faturamento vai aumentar"*).

**Lógica de Raciocínio Exigida:**
> *"Existe um evento próximo ao estabelecimento, com potencial de aumentar a circulação de pessoas. Entretanto, não existem dados suficientes para afirmar que isso aumentará diretamente os atendimentos."*

**Classificação Obrigatória do Impacto:**
- `MUITO POSITIVO` | `POSITIVO` | `NEUTRO` | `NEGATIVO` | `MUITO NEGATIVO` | `INDETERMINADO` (com a devida justificativa).

---

### 6. OUTROS FATORES EXTERNOS E ANÁLISE DE SEGMENTO
- Analisar clima (temperatura/chuva), sazonalidade de pagamento (início/fim de mês), indicadores econômicos locais e concorrência pública.
- **Para Barbearias (quando selecionado):** Considerar busca por cortes pré-eventos, formaturas, casamentos, datas comemorativas, volta às aulas e vésperas de feriados.

---

### 7. ANÁLISE HISTÓRICA DO PASSADO E DIAGNÓSTICO DO PRESENTE
- **Passado (8 Semanas):** Mostrar tabela e métricas das últimas 8 semanas com média, variação percentual, tendência, melhor e pior semana. Dar peso maior às semanas recentes.
- **Presente:** Comparativo entre o momento atual e a média das 8 semanas, indicando sinais positivos e negativos reais.

---

### 8. MODELO DE PREVISÃO, INTERVALOS E CENÁRIOS
A previsão deve ser formulada por:
$$	ext{Base Histórica} + 	ext{Tendência Recente} + 	ext{Sazonalidade} + 	ext{Eventos Externos} + 	ext{Fatores Locais}$$

- Projeção para as próximas **1 a 8 semanas**.
- **INTERVALO DE CONFIANÇA OBRIGATÓRIO:** Nunca mostrar valor único (ex: R$ 5.000). Mostrar **Faixa Provável** (ex: R$ 4.500 – R$ 5.300) e taxa de confiança (ex: 68%).
- **CENÁRIOS:** Apresentar 3 cenários calculados estatisticamente:
  1. `CONSERVADOR`
  2. `BASE`
  3. `OTIMISTA`

---

### 9. CÁLCULO DE CONFIANÇA E EXPLICAÇÃO ("POR QUE O SISTEMA ESTÁ PREVENDO ISSO?")
- **Confiança Alta:** Histórico consistente (>8 semanas) + Fontes externas confirmadas + Baixa variação.
- **Confiança Média:** Dados razoáveis, mas com incertezas externas.
- **Confiança Baixa:** Poucos dados históricos ou alta volatilidade.
- **Seção Explicativa:** Texto explicativo claro detalhando exatamente quais fatores históricos e externos justificam a projeção.

---

### 10. RECOMENDAÇÕES E FONTES CONSULTADAS
- **Recomendações Práticas:** Ações sugeridas derivadas diretamente dos dados (ex: ajustar escala de atendimento, criar promoção específica para dia de baixa, antecipar insumos).
- **Fontes Consultadas:** Seção com tabela interativa contendo Link clicável, Título, Fonte, Data de Publicação e Data de Acesso.

---

### 11. TRATAMENTO DE FALHA NA PESQUISA EXTERNA (FALLBACK OBRIGATÓRIO)
Se a pesquisa externa falhar, der timeout ou estiver sem API key válida:
1. NÃO fingir que funcionou ou usar dados fictícios.
2. Exibir mensagem clara: **"Pesquisa externa indisponível neste momento."**
3. Notificar: **"Esta previsão foi calculada somente com os dados internos disponíveis."**
4. Exibir o botão: **"Tentar pesquisa novamente"**.

---

### 12. ARQUITETURA TÉCNICA E CACHE (BACKEND / EDGE FUNCTION)
- **Segurança de API Keys:** NUNCA colocar chaves de pesquisa no Frontend.
- **Provedor Abstrato:** Criar uma camada de serviço de busca configurável (`SearchProvider` -> Google, SerpAPI, Tavily, etc.) permitindo troca sem refatorar o módulo.
- **Cache de Pesquisa:**
  - Armazenar pesquisas por `[País_Estado_Cidade_Segmento_Período]`.
  - Exibir: `"Última atualização da pesquisa: DD/MM/YYYY HH:MM"`.
  - Disponibilizar botão: **"ATUALIZAR PESQUISA"**.

---

### 13. COMPONENTES VISUAIS E REQUISITOS DE UI
- **Distinção Visual Claro:**
  - `[ DADO REAL ]` (Verde / Indicador sólido)
  - `[ DADO EXTERNO ]` (Azul / Indicador de fonte)
  - `[ INFERÊNCIA ]` (Amarelo / Raciocínio)
  - `[ PREVISÃO ]` (Roxo / Tracejado)
- **Gráfico:**
  - Linha contínua = Histórico real.
  - Marcador destacado = Ponto HOJE.
  - Linha tracejada = Previsão.
  - Sombra/Banda = Intervalo de confiança.
- **Filtros Funcionais:** Alterar País, Estado, Cidade, Segmento ou Período deve RE-EXECUTAR as consultas reais e recalcular a análise.

---

## 🧪 BATERIA DE TESTES OBRIGATÓRIOS

Após a implementação, execute a seguinte lista de verificação:
1. Testar com local real: `Brasil / SC / Joinville / Barbearia`.
2. Alterar cidade e segmento e validar se as requisições mudam.
3. Simular cenário **Sem dados históricos** e **Poucos dados históricos**.
4. Validar **Pesquisa externa funcionando** vs **Pesquisa externa indisponível** (fallback).
5. Testar timeouts, respostas vazias de API externa e dados duplicados.
6. Validar o botão "Atualizar pesquisa" e recarregamento da página.
