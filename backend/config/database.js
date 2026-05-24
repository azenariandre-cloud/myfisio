const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }  // Render exige SSL
    : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool PostgreSQL:', err.message);
});

// Testa conexão na inicialização
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Falha ao conectar ao banco de dados:', err.message);
  } else {
    console.log('✅ Banco de dados PostgreSQL conectado.');
    release();
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
