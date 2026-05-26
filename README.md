# Dashboard de Treinos — Renato Campos

Dashboard pessoal para acompanhamento de treinos semanais, progresso de corrida e metas.

## Stack

- Node.js + Express
- PostgreSQL (Railway)
- HTML/CSS puro — sem frameworks frontend

## Como fazer o deploy no Railway

### 1. Criar o projeto no Railway

1. Acesse [railway.app](https://railway.app) e faça login
2. Clique em **New Project → Deploy from GitHub repo**
3. Selecione ou crie o repositório com estes arquivos
4. Railway vai detectar o Node.js automaticamente

### 2. Adicionar o banco de dados

1. No projeto, clique em **+ New** → **Database** → **PostgreSQL**
2. O Railway vai criar o banco e disponibilizar a variável `DATABASE_URL`

### 3. Configurar variáveis de ambiente

No painel do Railway, vá em **Variables** e adicione:

```
DATABASE_URL = (já preenchida automaticamente pelo Railway)
NODE_ENV = production
```

### 4. Deploy

O Railway faz deploy automático a cada push no GitHub. O banco é inicializado automaticamente na primeira execução.

---

## Estrutura do projeto

```
treino-dashboard/
├── index.js          ← servidor principal + HTML inline
├── package.json
└── .env.example      ← modelo de variáveis de ambiente
```

---

## Rotas

| Rota | Método | Descrição |
|------|--------|-----------|
| `/` | GET | Dashboard principal |
| `/treino` | POST | Registrar treino com nota |
| `/treino/toggle` | POST | Marcar/desmarcar treino rápido |
| `/api/stats` | GET | JSON com estatísticas |

---

## Funcionalidades

- **Streak** — dias ativos nos últimos 30 dias
- **Semana atual** — grade seg→dom com status de cada treino
- **Progresso da corrida** — gráfico de km por semana + fase do plano de 8 semanas
- **Calendário do mês** — visual com dias feitos (verde) e pendentes (amarelo)
- **Próximo treino** — calculado automaticamente pela rotina configurada
- **Dica do dia** — rotativa, baseada em 20 dicas personalizadas
- **Registro com nota** — salva duração, distância e observações sobre o joelho/disposição

---

## Rotina configurada

| Dia | Treino | Horário |
|-----|--------|---------|
| Segunda | Corrida leve | 17h |
| Terça | Academia — superior A | 11h |
| Quarta | Beach tennis | 20h |
| Quinta | Academia — superior B | 11h |
| Sexta | Corrida leve | 10h (Itacoatiara) |
| Sábado | Academia — inferior | 9h |
| Domingo | Descanso | — |
