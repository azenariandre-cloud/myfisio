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
const { router: adminRoutes } = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Segurança ─────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3001',
  'https://myfisio.pro',
  'https://www.myfisio.pro',
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

// ── Rate limits ───────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente em 15 minutos.' },
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Muitas tentativas. Tente em 15 minutos.' },
});
app.use('/api/auth/', authLimiter);

// Admin com limit mais generoso
const adminLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 300,
  message: { error: 'Limite admin excedido.' },
});
app.use('/api/admin/', adminLimiter);

// ── Body parser ───────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'myFisio API',
    version: '1.1.0',
    timestamp: new Date().toISOString(),
  });
});

// ── Setup — cria tabelas via URL ───────────────
app.get('/setup', async (req, res) => {
  const secret = process.env.SETUP_SECRET;
  if (!secret || req.query.key !== secret) {
    return res.status(403).json({ error: 'Chave inválida.' });
  }
  try {
    const fs   = require('fs');
    const path = require('path');
    const db   = require('./config/database');
    const sql  = fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf8');
    await db.query(sql);
    res.json({ status: 'ok', message: '✅ Tabelas criadas com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: 'Erro: ' + err.message });
  }
});

// ── Setup extras (favoritos, notificações) ─────
app.get('/setup2', async (req, res) => {
  const secret = process.env.SETUP_SECRET;
  if (!secret || req.query.key !== secret) {
    return res.status(403).json({ error: 'Chave inválida.' });
  }
  try {
    const fs   = require('fs');
    const path = require('path');
    const db   = require('./config/database');
    const sql  = fs.readFileSync(path.join(__dirname, 'database', 'schema_additions.sql'), 'utf8');
    await db.query(sql);
    res.json({ status: 'ok', message: '✅ Tabelas adicionais criadas!' });
  } catch (err) {
    res.status(500).json({ error: 'Erro: ' + err.message });
  }
});

// ── Rotas ─────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/professionals', profRoutes);
app.use('/api/patients',      patientRoutes);
app.use('/api/appointments',  appointmentRoutes);
app.use('/api/earnings',      earningsRoutes);
app.use('/api/admin',         adminRoutes);

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    message: 'myFisio API v1.1.0',
    endpoints: ['/health', '/api/auth', '/api/professionals', '/api/patients', '/api/appointments', '/api/earnings', '/api/admin'],
  });
});

// ── 404 ───────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado.' });
});

// ── Erro global ───────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[ERRO]', err.message);
  res.status(err.status || 500).json({
    error: err.status === 500 || !err.status ? 'Erro interno do servidor.' : err.message,
  });
});

// ── Start ─────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ myFisio API v1.1.0 porta ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app;
