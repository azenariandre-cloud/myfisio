// ─────────────────────────────────────────────
//  myFisio — Conexão com PostgreSQL
//  Compatível com Render, Neon, Supabase ou
//  qualquer Postgres que exija SSL (sslmode=require)
// ─────────────────────────────────────────────
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não definida nas variáveis de ambiente.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon, Render e a maioria dos provedores gratuitos exigem SSL.
  // rejectUnauthorized:false evita erro de certificado self-signed
  // em alguns provedores — seguro neste contexto (conexão já é
  // autenticada via usuário/senha na própria connection string).
  ssl: { rejectUnauthorized: false },
  // Neon "free tier" suspende o compute após inatividade — a primeira
  // query após um período ocioso pode demorar alguns segundos para
  // o banco "acordar". Timeout generoso evita falha prematura.
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
  max: 10, // pool size — suficiente para o tráfego do myFisio
});

pool.on('error', (err) => {
  console.error('❌ Erro inesperado no pool do PostgreSQL:', err.message);
});

async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 2000) {
      console.warn(`⚠️  Query lenta (${duration}ms): ${text.slice(0, 80)}...`);
    }
    return res;
  } catch (err) {
    console.error('❌ Erro na query:', err.message);
    throw err;
  }
}

module.exports = { query, pool };
