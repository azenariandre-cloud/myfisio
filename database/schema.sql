-- Database Schema para myFisio

-- Users (base para pacientes e fisioterapeutas)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  cpf VARCHAR(14) UNIQUE,
  phone VARCHAR(20),
  user_type VARCHAR(20) CHECK (user_type IN ('patient', 'professional')),
  avatar_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Professionals (fisioterapeutas)
CREATE TABLE professionals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crefito VARCHAR(20) UNIQUE NOT NULL,
  crefito_uf VARCHAR(2) NOT NULL,
  bio TEXT,
  specialties TEXT[] DEFAULT ARRAY[]::TEXT[],
  avg_rating DECIMAL(3,2) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  years_experience INTEGER,
  education TEXT,
  is_online BOOLEAN DEFAULT false,
  is_verified_crefito BOOLEAN DEFAULT false,
  verification_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Professional Services
CREATE TABLE professional_services (
  id SERIAL PRIMARY KEY,
  professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  service_name VARCHAR(255) NOT NULL,
  price_per_session DECIMAL(10,2) NOT NULL,
  duration_minutes INTEGER DEFAULT 50,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Professional Availability
CREATE TABLE professional_availability (
  id SERIAL PRIMARY KEY,
  professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Professional Location
CREATE TABLE professional_locations (
  id SERIAL PRIMARY KEY,
  professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  address VARCHAR(500) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(2) NOT NULL,
  zip_code VARCHAR(10),
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  service_type VARCHAR(20) CHECK (service_type IN ('clinic', 'home', 'both')),
  max_distance_km INTEGER DEFAULT 5,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Appointments
CREATE TABLE appointments (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES users(id),
  professional_id INTEGER NOT NULL REFERENCES professionals(id),
  service_id INTEGER REFERENCES professional_services(id),
  scheduled_date TIMESTAMP NOT NULL,
  duration_minutes INTEGER DEFAULT 50,
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  price DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(20),
  notes TEXT,
  cancellation_reason TEXT,
  cancelled_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reviews/Ratings
CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  appointment_id INTEGER UNIQUE NOT NULL REFERENCES appointments(id),
  professional_id INTEGER NOT NULL REFERENCES professionals(id),
  patient_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Earnings (histórico de ganhos dos fisioterapeutas)
CREATE TABLE earnings (
  id SERIAL PRIMARY KEY,
  professional_id INTEGER NOT NULL REFERENCES professionals(id),
  appointment_id INTEGER NOT NULL REFERENCES appointments(id),
  gross_amount DECIMAL(10,2) NOT NULL,
  fee_percentage DECIMAL(5,2) DEFAULT 5.00,
  fee_amount DECIMAL(10,2) NOT NULL,
  net_amount DECIMAL(10,2) NOT NULL,
  transfer_status VARCHAR(20) DEFAULT 'pending' CHECK (transfer_status IN ('pending', 'transferred', 'failed')),
  transfer_date TIMESTAMP,
  pix_key VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_professionals_user_id ON professionals(user_id);
CREATE INDEX idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX idx_appointments_professional_id ON appointments(professional_id);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_scheduled_date ON appointments(scheduled_date);
CREATE INDEX idx_reviews_professional_id ON reviews(professional_id);
CREATE INDEX idx_earnings_professional_id ON earnings(professional_id);
CREATE INDEX idx_professional_locations ON professional_locations(latitude, longitude);
