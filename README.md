# myFisio - Plataforma de Agendamento de Fisioterapeutas

**myFisio** é uma plataforma que conecta pacientes a fisioterapeutas, permitindo agendamentos, acompanhamento de sessões e gerenciamento profissional.

## 🎯 Funcionalidades

### Para Pacientes
- ✅ Buscar fisioterapeutas próximos (geolocalização)
- ✅ Filtrar por especialidade
- ✅ Agendar sessões
- ✅ Histórico de agendamentos
- ✅ Avaliações e ratings
- ✅ Cancelamento de sessões

### Para Fisioterapeutas (Pro)
- ✅ Cadastro profissional com CREFITO
- ✅ Gerenciar disponibilidade
- ✅ Receber demandas de pacientes
- ✅ Aceitar/recusar pedidos
- ✅ Acompanhar ganhos
- ✅ Taxa de 5% por sessão realizada

## 📁 Estrutura do Projeto

```
myFisio/
├── frontend/
│   ├── patient/                    # App para pacientes
│   │   ├── index.html
│   │   ├── css/
│   │   └── js/
│   ├── professional/               # App para fisioterapeutas
│   │   ├── index.html
│   │   ├── css/
│   │   └── js/
│   ├── auth/                       # Login/Cadastro
│   │   ├── index.html
│   │   ├── css/
│   │   └── js/
│   └── shared/
│       ├── css/
│       └── js/
├── backend/
│   ├── server.js                   # Servidor principal
│   ├── package.json
│   ├── config/
│   │   ├── database.js
│   │   └── constants.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── professionals.js
│   │   ├── patients.js
│   │   ├── appointments.js
│   │   └── earnings.js
│   ├── models/
│   │   ├── User.js
│   │   ├── Professional.js
│   │   ├── Appointment.js
│   │   └── Review.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── validation.js
│   └── controllers/
│       ├── authController.js
│       ├── professionalController.js
│       ├── appointmentController.js
│       └── earningsController.js
├── database/
│   ├── schema.sql
│   └── init.sql
├── docs/
│   ├── API.md
│   ├── DATABASE.md
│   └── INSTALLATION.md
└── .env.example
```

## 🚀 Começar Rápido

### Requisitos
- Node.js 16+
- PostgreSQL ou MongoDB
- Git

### Instalação

```bash
# Clone o repositório
git clone https://github.com/azenariandre-cloud/myfisio.git
cd myfisio

# Backend
cd backend
npm install
cp .env.example .env
npm start

# Frontend (em outro terminal)
cd frontend/patient
# Serve com um servidor local (ex: Live Server)
```

## 📡 API REST Endpoints

### Autenticação
- `POST /api/auth/register` - Registrar novo usuário
- `POST /api/auth/login` - Fazer login
- `POST /api/auth/logout` - Logout

### Fisioterapeutas
- `GET /api/professionals` - Listar todos os fisioterapeutas
- `GET /api/professionals/:id` - Detalhes do fisioterapeuta
- `PUT /api/professionals/:id` - Atualizar perfil
- `GET /api/professionals/search?specialty=` - Buscar por especialidade

### Agendamentos
- `POST /api/appointments` - Criar novo agendamento
- `GET /api/appointments` - Listar agendamentos do usuário
- `PUT /api/appointments/:id` - Atualizar status
- `DELETE /api/appointments/:id` - Cancelar agendamento

### Ganhos (Fisioterapeutas)
- `GET /api/earnings` - Ganhos do mês
- `GET /api/earnings/history` - Histórico de ganhos
- `GET /api/earnings/sessions` - Detalhes por sessão

## 💰 Modelo de Cobrança

- **Taxa myFisio**: 5% por sessão confirmada e realizada
- **Cancelamentos**: Sem taxa
- **Repasse**: Via Pix em até 2 dias úteis
- **Mínimo**: R$ 50,00 para repasse

## 🔐 Segurança

- Autenticação JWT
- Senhas com hash bcrypt
- Validação de CREFITO
- Verificação de dados pessoais
- CORS habilitado

## 📝 Documentação

Ver em `/docs` para:
- [API Reference](./docs/API.md)
- [Database Schema](./docs/DATABASE.md)
- [Guia de Instalação](./docs/INSTALLATION.md)

## 📄 Licença

MIT License - veja LICENSE.md

## 👨‍💻 Desenvolvedor

André Zenari - [@azenariandre-cloud](https://github.com/azenariandre-cloud)
