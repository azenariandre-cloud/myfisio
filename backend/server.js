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
