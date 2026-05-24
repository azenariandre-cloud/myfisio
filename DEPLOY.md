# 🚀 Guia de Deploy — myFisio

## Estrutura esperada no repositório

```
myfisio/                     ← raiz do repo
├── render.yaml              ← ⬅ novo (configuração do Render)
├── .gitignore               ← ⬅ atualizado
├── backend/
│   ├── server.js            ← ⬅ novo
│   ├── package.json         ← ⬅ novo
│   ├── .env.example         ← ⬅ novo
│   ├── config/
│   │   └── database.js      ← ⬅ novo
│   ├── routes/
│   │   ├── auth.js          ← ⬅ novo
│   │   ├── professionals.js ← ⬅ novo
│   │   ├── appointments.js  ← ⬅ novo
│   │   ├── earnings.js      ← ⬅ novo
│   │   └── patients.js      ← ⬅ novo
│   ├── middleware/
│   │   └── auth.js          ← ⬅ novo
│   └── database/
│       ├── schema.sql       ← ⬅ novo
│       └── init.js          ← ⬅ novo
└── frontend/
    ├── index.html           ← myfisio_completo.html renomeado
    └── shared/
        └── api.js           ← ⬅ novo (conecta frontend ↔ backend)
```

---

## PASSO 1 — Adicione os arquivos ao repositório

```bash
# Clone o repositório (se ainda não tiver localmente)
git clone https://github.com/azenariandre-cloud/myfisio.git
cd myfisio

# Copie os arquivos fornecidos para as pastas corretas (conforme estrutura acima)

# Adicione tudo
git add .
git commit -m "feat: adiciona backend completo e configuração Render"
git push origin main
```

---

## PASSO 2 — Criar conta no Render

1. Acesse **render.com** → "Get Started for Free"
2. Faça login com sua conta do **GitHub** (autorize o acesso ao repositório `myfisio`)

---

## PASSO 3 — Deploy via render.yaml (automático)

1. No dashboard do Render, clique em **"New" → "Blueprint"**
2. Selecione o repositório **azenariandre-cloud/myfisio**
3. O Render vai detectar o `render.yaml` e criar automaticamente:
   - ✅ Web Service `myfisio-api` (Node.js)
   - ✅ Static Site `myfisio-frontend`
   - ✅ Banco de dados PostgreSQL `myfisio-db`
4. Clique em **"Apply"** e aguarde ~5 minutos

---

## PASSO 4 — Inicializar o banco de dados

Após o primeiro deploy da API:

1. No Render, acesse o serviço `myfisio-api`
2. Clique em **"Shell"** (terminal do servidor)
3. Execute:

```bash
node database/init.js
```

Isso cria todas as tabelas automaticamente usando o `schema.sql`.

---

## PASSO 5 — Atualizar a URL da API no frontend

Abra o arquivo `frontend/shared/api.js` e atualize a linha:

```javascript
// Antes:
const API_URL = 'https://myfisio-api.onrender.com';

// Depois (cole a URL real do seu serviço no Render):
const API_URL = 'https://SEU-SERVICO.onrender.com';
```

Também atualize no `render.yaml`:
```yaml
- key: FRONTEND_URL
  value: https://SEU-USUARIO.github.io  # ou a URL do Static Site no Render
```

Faça commit e push — o Render vai redeploy automaticamente.

---

## PASSO 6 — Verificar que tudo funciona

| Teste | URL | Esperado |
|-------|-----|----------|
| Health check da API | `https://sua-api.onrender.com/health` | `{"status":"ok"}` |
| Raiz da API | `https://sua-api.onrender.com/` | Mensagem de boas-vindas |
| Frontend | `https://seu-site.onrender.com` | Tela de login do myFisio |

---

## Variáveis de ambiente (referência)

| Variável | Descrição | Obrigatória |
|----------|-----------|-------------|
| `NODE_ENV` | `production` | ✅ |
| `PORT` | Porta do servidor (3000) | ✅ |
| `JWT_SECRET` | Chave secreta JWT (gerada pelo Render) | ✅ |
| `DATABASE_URL` | URL do PostgreSQL (gerada pelo Render) | ✅ |
| `FRONTEND_URL` | URL do frontend (para CORS) | ✅ |
| `APP_FEE_PERCENT` | Taxa do app em % (padrão: 5) | ✅ |

---

## Endpoints da API

```
POST   /api/auth/register          Criar conta (paciente ou fisio)
POST   /api/auth/login             Login
GET    /api/auth/me                Dados do usuário logado
PUT    /api/auth/password          Alterar senha

GET    /api/professionals          Listar fisios (com filtro geolocalização)
GET    /api/professionals/:id      Detalhe + avaliações
PUT    /api/professionals/profile  Atualizar perfil (PRO)
PATCH  /api/professionals/online   Toggle online/offline (PRO)

POST   /api/appointments           Criar agendamento (paciente)
GET    /api/appointments           Listar meus agendamentos
PATCH  /api/appointments/:id/status Confirmar / concluir / cancelar
POST   /api/appointments/:id/review Avaliar sessão (paciente)

GET    /api/earnings               Resumo de ganhos do mês (PRO)
GET    /api/earnings/sessions      Histórico com taxa 5% (PRO)

GET    /api/patients/profile       Perfil do paciente
PUT    /api/patients/profile       Atualizar perfil
GET    /api/patients/stats         Estatísticas (sessões, gasto total)
```

---

## Taxa de 5% — como funciona no código

Ao criar um agendamento (`POST /api/appointments`), o backend calcula automaticamente:

```
gross_price = preço do profissional
app_fee     = gross_price × 0.05   (5%)
net_price   = gross_price - app_fee (95% → repassado ao fisio)
```

Quando a sessão é marcada como `completed`, um registro é criado na tabela `earnings`
com `status = 'pending'`. O repasse via Pix é feito manualmente (ou integrado a um
gateway de pagamento) atualizando o status para `'transferred'`.
