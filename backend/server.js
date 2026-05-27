// ─────────────────────────────────────────────
//  myFisio — Servidor principal
// ─────────────────────────────────────────────
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

const authRoutes         = require('./routes/auth');
const profRoutes         = require('./routes/professionals');
const patientRoutes      = require('./routes/patients');
const appointmentRoutes  = require('./routes/appointments');
const earningsRoutes     = require('./routes/earnings');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Segurança ─────────────────────────────────
app.use(helmet());

// ── CORS — permite o frontend do GitHub Pages ─
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5500',   // Live Server (desenvolvimento)
  'http://127.0.0.1:5500',
  'http://localhost:3001',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      cb(null, true);
    } else {
      cb(new Error(`CORS bloqueado para origem: ${origin}`));
    }
  },
  credentials: true,
}));

// ── Rate limit — proteção básica contra abuso ─
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' },
});
app.use('/api/', limiter);

// Limite mais restrito para login/cadastro
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Muitas tentativas de autenticação. Tente em 15 minutos.' },
});
app.use('/api/auth/', authLimiter);

// ── Body parser ───────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'myFisio API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ── Setup — cria as tabelas no banco via URL ───
// Acesse: /setup?key=SETUP_SECRET (defina a variável de ambiente SETUP_SECRET)
app.get('/setup', async (req, res) => {
  const secret = process.env.SETUP_SECRET;
  if (!secret || req.query.key !== secret) {
    return res.status(403).json({ error: 'Chave inválida. Acesse /setup?key=SUA_CHAVE' });
  }
  try {
    const fs   = require('fs');
    const path = require('path');
    const db   = require('./config/database');
    const sql  = fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf8');
    await db.query(sql);
    res.json({
      status: 'ok',
      message: '✅ Tabelas criadas/atualizadas com sucesso! O myFisio está pronto.',
    });
  } catch (err) {
    console.error('[setup]', err.message);
    res.status(500).json({ error: 'Erro ao criar tabelas: ' + err.message });
  }
});

// ── Rotas ─────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/professionals', profRoutes);
app.use('/api/patients',      patientRoutes);
app.use('/api/appointments',  appointmentRoutes);
app.use('/api/earnings',      earningsRoutes);

// Rota raiz informativa
app.get('/', (req, res) => {
  res.json({
    message: 'myFisio API — acesse /health para status ou /api/* para os endpoints.',
    docs: 'https://github.com/azenariandre-cloud/myfisio/blob/main/docs/API.md',
  });
});

// ── 404 ───────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado.' });
});

// ── Erro global ───────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[ERRO]', err.message);
  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? 'Erro interno do servidor.' : err.message,
  });
});

// ── Start ─────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ myFisio API rodando na porta ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app;

app.get('/setup', async (req, res) => {
  const sql = `
    -- Tabela de favoritos
    CREATE TABLE IF NOT EXISTS favorites (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      patient_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (patient_id, professional_id)
    );

    -- Tabela de notificações
    CREATE TABLE IF NOT EXISTS notifications (
      id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title      VARCHAR(120) NOT NULL,
      body       TEXT NOT NULL,
      type       VARCHAR(30) DEFAULT 'info',
      read       BOOLEAN DEFAULT FALSE,
      data       JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Índices
    CREATE INDEX IF NOT EXISTS idx_favorites_patient ON favorites(patient_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at DESC);

    -- Trigger: cria notificação automática quando agendamento muda de status
    CREATE OR REPLACE FUNCTION notify_appointment_change()
    RETURNS TRIGGER AS $$
    DECLARE
      patient_name  TEXT;
      pro_name      TEXT;
      msg_title     TEXT;
      msg_body      TEXT;
      target_user   UUID;
    BEGIN
      SELECT u.name INTO patient_name FROM users u WHERE u.id = NEW.patient_id;
      SELECT u.name INTO pro_name
        FROM professionals p JOIN users u ON u.id = p.user_id
        WHERE p.id = NEW.professional_id;

      IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
        msg_title  := '✅ Sessão confirmada!';
        msg_body   := pro_name || ' confirmou sua sessão.';
        target_user := NEW.patient_id;
      ELSIF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
        IF TG_OP = 'UPDATE' THEN
          msg_title  := '❌ Sessão cancelada';
          msg_body   := 'Uma sessão foi cancelada. Verifique suas consultas.';
          target_user := NEW.patient_id;
        END IF;
      ELSIF NEW.status = 'completed' THEN
        msg_title  := '⭐ Como foi sua sessão?';
        msg_body   := 'Avalie o atendimento de ' || pro_name || ' e ajude outros pacientes.';
        target_user := NEW.patient_id;
      END IF;

      IF target_user IS NOT NULL AND msg_title IS NOT NULL THEN
        INSERT INTO notifications (user_id, title, body, type, data)
        VALUES (
          target_user, msg_title, msg_body, 'appointment',
          jsonb_build_object('appointment_id', NEW.id, 'status', NEW.status)
        );
      END IF;

      IF NEW.status = 'pending' AND TG_OP = 'INSERT' THEN
        SELECT p.user_id INTO target_user FROM professionals p WHERE p.id = NEW.professional_id;
        INSERT INTO notifications (user_id, title, body, type, data)
        VALUES (
          target_user,
          '📬 Novo pedido de sessão!',
          patient_name || ' quer agendar uma sessão com você.',
          'new_appointment',
          jsonb_build_object('appointment_id', NEW.id)
        );
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_notify_appointment ON appointments;
    CREATE TRIGGER trg_notify_appointment
      AFTER INSERT OR UPDATE OF status ON appointments
      FOR EACH ROW EXECUTE FUNCTION notify_appointment_change();
  `;

  try {
    // IMPORTANTE: Se o seu projeto usar a variável 'db' em vez de 'pool', mude aqui para db.query(sql);
    await pool.query(sql); 
    res.status(200).send("<h1>Sucesso! Todo o banco de dados (tabelas, índices e triggers) foi atualizado com êxito!</h1>");
  } catch (error) {
    console.error("Erro ao rodar o schema:", error);
    res.status(500).send("<h1>Erro ao criar estrutura:</h1><pre>" + error.message + "</pre>");
  }
});
