# Database Schema - myFisio

## Visão Geral

O banco de dados foi projetado para suportar uma plataforma de agendamento de fisioterapeutas com:
- Autenticação de usuários
- Perfis de fisioterapeutas com validação de CREFITO
- Sistema de agendamentos
- Avaliações e ratings
- Rastreamento de ganhos

## Tabelas

### users
Armazena informações básicas de todos os usuários (pacientes e fisioterapeutas)

**Campos:**
- `id` (PK): Identificador único
- `email` (UNIQUE): Email do usuário
- `password_hash`: Senha criptografada com bcrypt
- `full_name`: Nome completo
- `cpf` (UNIQUE): CPF do usuário
- `phone`: Telefone
- `user_type`: 'patient' ou 'professional'
- `is_active`: Usuário ativo
- `is_verified`: Email verificado
- `created_at`, `updated_at`: Timestamps

### professionals
Dados específicos de fisioterapeutas

**Campos:**
- `id` (PK): Identificador único
- `user_id` (FK): Referência para usuario
- `crefito` (UNIQUE): Número de registro no CREFITO
- `crefito_uf`: UF do CREFITO
- `bio`: Biografia profissional
- `specialties`: Array de especialidades
- `avg_rating`: Classificação média (0-5)
- `total_reviews`: Número total de avaliações
- `years_experience`: Anos de experiência
- `is_online`: Status online para receber pedidos
- `is_verified_crefito`: CREFITO verificado

### professional_services
Serviços oferecidos por cada fisioterapeuta

**Campos:**
- `service_name`: Nome do serviço
- `price_per_session`: Preço por sessão
- `duration_minutes`: Duração da sessão
- `description`: Descrição do serviço

### professional_availability
Horários disponíveis para agendamento

**Campos:**
- `day_of_week`: 0-6 (seg-dom)
- `start_time`: Hora de início
- `end_time`: Hora de término

### professional_locations
Localizações de atendimento (clínica, domiciliar, etc)

**Campos:**
- `address`: Endereço
- `city`: Cidade
- `state`: Estado (UF)
- `latitude`, `longitude`: Coordenadas para geolocalização
- `service_type`: 'clinic', 'home' ou 'both'
- `max_distance_km`: Distância máxima para atendimento

### appointments
Agendamentos de sessões

**Campos:**
- `patient_id` (FK): Paciente
- `professional_id` (FK): Fisioterapeuta
- `scheduled_date`: Data/hora agendada
- `status`: 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'
- `price`: Valor da sessão
- `payment_method`: Forma de pagamento
- `notes`: Observações
- `cancellation_reason`: Motivo do cancelamento

### reviews
Avaliações das sessões

**Campos:**
- `appointment_id` (FK, UNIQUE): Referência à sessão
- `professional_id` (FK): Fisioterapeuta avaliado
- `patient_id` (FK): Paciente que fez a avaliação
- `rating`: Nota 1-5
- `comment`: Comentário da avaliação

### earnings
Histórico de ganhos dos fisioterapeutas

**Campos:**
- `professional_id` (FK): Fisioterapeuta
- `appointment_id` (FK): Sessão realizada
- `gross_amount`: Valor bruto cobrado
- `fee_percentage`: Percentual da taxa (5%)
- `fee_amount`: Valor da taxa
- `net_amount`: Valor líquido (bruto - taxa)
- `transfer_status`: 'pending', 'transferred', 'failed'
- `transfer_date`: Data da transferência
- `pix_key`: Chave Pix do beneficiário

## Índices

```sql
idx_users_email
idx_professionals_user_id
idx_appointments_patient_id
idx_appointments_professional_id
idx_appointments_status
idx_appointments_scheduled_date
idx_reviews_professional_id
idx_earnings_professional_id
idx_professional_locations (latitude, longitude)
```

## Relacionamentos

```
users (1) ──→ (1) professionals
users (1) ──→ (N) appointments
professionals (1) ──→ (N) appointments
professionals (1) ──→ (N) professional_services
professionals (1) ──→ (N) professional_availability
professionals (1) ──→ (N) professional_locations
professionals (1) ──→ (N) reviews
professionals (1) ──→ (N) earnings
appointments (1) ──→ (1) reviews
appointments (1) ──→ (1) earnings
```

## Queries Úteis

### Listar fisioterapeutas próximos
```sql
SELECT p.*, u.full_name, u.email
FROM professionals p
JOIN users u ON p.user_id = u.id
JOIN professional_locations pl ON p.id = pl.professional_id
WHERE
  p.is_verified_crefito = true
  AND p.is_online = true
  AND ST_Distance(ST_GeomFromText('POINT(latitude longitude)'), ST_GeomFromText('POINT(' || pl.latitude || ' ' || pl.longitude || ')')) / 1000 <= 5
ORDER BY p.avg_rating DESC;
```

### Ganhos do mês
```sql
SELECT
  DATE_TRUNC('month', e.created_at) as month,
  SUM(e.gross_amount) as gross_total,
  SUM(e.fee_amount) as fee_total,
  SUM(e.net_amount) as net_total,
  COUNT(*) as sessions_count
FROM earnings e
WHERE e.professional_id = $1
GROUP BY DATE_TRUNC('month', e.created_at)
ORDER BY month DESC;
```

### Rating médio do fisioterapeuta
```sql
SELECT
  p.id,
  AVG(r.rating) as avg_rating,
  COUNT(r.id) as total_reviews
FROM professionals p
LEFT JOIN reviews r ON p.id = r.professional_id
WHERE p.id = $1
GROUP BY p.id;
```
