// ─────────────────────────────────────────────
//  myFisio — Inicializa o banco de dados
//  Execute: node database/init.js
// ─────────────────────────────────────────────
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function init() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('✅ Schema criado/atualizado com sucesso.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro ao inicializar banco:', err.message);
    process.exit(1);
  }
}

init();
