-- ─────────────────────────────────────────────────────────────
--  myFisio — Schema do banco de dados (PostgreSQL)
--  Execute: psql $DATABASE_URL -f database/schema.sql
-- ─────────────────────────────────────────────────────────────

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ── USUÁRIOS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(120) UNIQUE NOT NULL,
  cpf           VARCHAR(14)  UNIQUE NOT NULL,
  phone         VARCHAR(15)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL CHECK (role IN ('patient','professional')),
  birth_date    DATE,
  address       TEXT,
  health_plan   VARCHAR(80),
  avatar_url    TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── FISIOTERAPEUTAS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS professionals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crefito         VARCHAR(20)  NOT NULL,
  crefito_uf      CHAR(2)      NOT NULL,
  specialties     TEXT[]       NOT NULL DEFAULT '{}',
  service_types   TEXT[]       NOT NULL DEFAULT '{}',  -- domiciliar, clinica
  session_price   NUMERIC(8,2) NOT NULL DEFAULT 0,
  radius_km       INTEGER      NOT NULL DEFAULT 5,
  work_start      TIME         NOT NULL DEFAULT '08:00',
  work_end        TIME         NOT NULL DEFAULT '20:00',
  bio             TEXT,
  diploma_url     TEXT,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  is_online       BOOLEAN DEFAULT FALSE,
  is_verified     BOOLEAN DEFAULT FALSE,
  rating_avg      NUMERIC(3,2) DEFAULT 0,
  rating_count    INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── AGENDAMENTOS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id       UUID NOT NULL REFERENCES users(id),
  professional_id  UUID NOT NULL REFERENCES professionals(id),
  scheduled_at     TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 50,
  service_type     VARCHAR(30) NOT NULL DEFAULT 'domiciliar',
  gross_price      NUMERIC(8,2) NOT NULL,
  app_fee          NUMERIC(8,2) NOT NULL,   -- 5%
  net_price        NUMERIC(8,2) NOT NULL,   -- 95%
  status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','confirmed','completed','cancelled','disputed')),
  address          TEXT,
  notes            TEXT,
  paid_at          TIMESTAMPTZ,
  pix_transfer_id  TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── AVALIAÇÕES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id   UUID UNIQUE NOT NULL REFERENCES appointments(id),
  patient_id       UUID NOT NULL REFERENCES users(id),
  professional_id  UUID NOT NULL REFERENCES professionals(id),
  rating           INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment          TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── REPASSES / EARNINGS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS earnings (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id  UUID NOT NULL REFERENCES professionals(id),
  appointment_id   UUID NOT NULL REFERENCES appointments(id),
  gross_amount     NUMERIC(8,2) NOT NULL,
  fee_amount       NUMERIC(8,2) NOT NULL,
  net_amount       NUMERIC(8,2) NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','transferred','failed')),
  pix_key          VARCHAR(100),
  transferred_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── REFRESH TOKENS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── ÍNDICES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_professionals_location
  ON professionals (latitude, longitude)
  WHERE is_online = TRUE AND is_verified = TRUE;

CREATE INDEX IF NOT EXISTS idx_appointments_patient
  ON appointments (patient_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_professional
  ON appointments (professional_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_earnings_professional
  ON earnings (professional_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_email
  ON users (email);

-- ── FUNÇÃO updated_at automático ─────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_professionals_updated_at
  BEFORE UPDATE ON professionals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── FUNÇÃO: recalcular rating do profissional ─────────────────
CREATE OR REPLACE FUNCTION refresh_professional_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE professionals SET
    rating_avg   = (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM reviews WHERE professional_id = NEW.professional_id),
    rating_count = (SELECT COUNT(*) FROM reviews WHERE professional_id = NEW.professional_id)
  WHERE id = NEW.professional_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_refresh_rating
  AFTER INSERT OR UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION refresh_professional_rating();
