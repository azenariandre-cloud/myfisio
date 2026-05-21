# myFisio API Documentation

## Autenticação

### POST /api/auth/register
Registrar novo usuário (paciente ou fisioterapeuta)

```json
{
  "email": "usuario@email.com",
  "password": "senha_segura",
  "full_name": "Nome Completo",
  "cpf": "000.000.000-00",
  "phone": "(11) 99999-9999",
  "user_type": "patient" // ou "professional"
}
```

**Response (201)**
```json
{
  "id": 1,
  "email": "usuario@email.com",
  "token": "eyJhbGc...",
  "user_type": "patient"
}
```

### POST /api/auth/login
Fazer login

```json
{
  "email": "usuario@email.com",
  "password": "senha_segura"
}
```

**Response (200)**
```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": 1,
    "email": "usuario@email.com",
    "user_type": "patient"
  }
}
```

## Fisioterapeutas

### GET /api/professionals
Listar todos os fisioterapeutas com verificação

**Query params**
- `specialty` (opcional): Filtrar por especialidade
- `lat` (opcional): Latitude para geolocalização
- `lng` (opcional): Longitude para geolocalização
- `radius` (opcional): Raio em km (padrão: 5)

**Response (200)**
```json
[
  {
    "id": 1,
    "full_name": "Dra. Ana Nascimento",
    "crefito": "12345-F",
    "specialties": ["Ortopédica", "Esportiva"],
    "avg_rating": 4.9,
    "price_per_session": 120.00,
    "distance_km": 0.8,
    "is_online": true
  }
]
```

### GET /api/professionals/:id
Detalhes do fisioterapeuta

**Response (200)**
```json
{
  "id": 1,
  "full_name": "Dra. Ana Nascimento",
  "bio": "Fisioterapeuta com 8 anos de experiência...",
  "crefito": "12345-F",
  "specialties": [...],
  "services": [...],
  "availability": [...],
  "reviews": [...],
  "avg_rating": 4.9
}
```

### PUT /api/professionals/:id
Atualizar perfil (requer autenticação)

```json
{
  "bio": "Nova bio",
  "specialties": ["Ortopédica", "Esportiva"],
  "price_per_session": 120.00
}
```

## Agendamentos

### POST /api/appointments
Criar novo agendamento

```json
{
  "professional_id": 1,
  "service_id": 1,
  "scheduled_date": "2026-05-25T14:00:00Z",
  "notes": "Tenho dor na lombar"
}
```

**Response (201)**
```json
{
  "id": 1,
  "professional_id": 1,
  "patient_id": 2,
  "scheduled_date": "2026-05-25T14:00:00Z",
  "status": "scheduled",
  "price": 120.00,
  "created_at": "2026-05-21T10:30:00Z"
}
```

### GET /api/appointments
Listar agendamentos do usuário autenticado

**Query params**
- `status` (opcional): Filtrar por status
- `from` (opcional): Data inicial (ISO)
- `to` (opcional): Data final (ISO)

**Response (200)**
```json
[
  {
    "id": 1,
    "professional": { "id": 1, "name": "Dra. Ana" },
    "scheduled_date": "2026-05-25T14:00:00Z",
    "status": "scheduled",
    "price": 120.00
  }
]
```

### PUT /api/appointments/:id
Atualizar agendamento (cancelar, confirmar, etc)

```json
{
  "status": "cancelled",
  "cancellation_reason": "Não posso mais comparecer"
}
```

### DELETE /api/appointments/:id
Cancelar agendamento

## Ganhos

### GET /api/earnings/month/:month
Ganhos do mês (formato: YYYY-MM)

**Response (200)**
```json
{
  "month": "2026-05",
  "gross_total": 4320.00,
  "fee_total": 216.00,
  "net_total": 4104.00,
  "sessions_count": 36,
  "sessions": [...]
}
```

### GET /api/earnings/history
Histórico completo de ganhos

**Response (200)**
```json
[
  {
    "month": "2026-05",
    "gross_total": 4320.00,
    "net_total": 4104.00,
    "sessions_count": 36
  }
]
```

### GET /api/earnings/sessions
Detalhes por sessão

**Response (200)**
```json
[
  {
    "appointment_id": 1,
    "patient_name": "João Silva",
    "service": "Fisioterapia Ortopédica",
    "scheduled_date": "2026-05-25T14:00:00Z",
    "gross_amount": 120.00,
    "fee_amount": 6.00,
    "net_amount": 114.00,
    "status": "completed"
  }
]
```

## Status Codes

- `200` - OK
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `500` - Internal Server Error
