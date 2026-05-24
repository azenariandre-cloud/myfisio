const express = require('express');
const { body, validationResult } = require('express-validator');
const db      = require('../config/database');
const { authMiddleware, requirePatient } = require('../middleware/auth');

const router = express.Router();

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
}

// ── GET /api/patients/profile ─────────────────
router.get('/profile', authMiddleware, requirePatient, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, phone, birth_date, address, health_plan, avatar_url, created_at
       FROM users WHERE id=$1`,
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar perfil.' });
  }
});

// ── PUT /api/patients/profile ─────────────────
router.put('/profile', authMiddleware, requirePatient, [
  body('name').optional().trim().notEmpty(),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  body('health_plan').optional().trim(),
], validate, async (req, res) => {
  const { name, phone, address, health_plan } = req.body;
  try {
    await db.query(
      `UPDATE users SET
         name        = COALESCE($1, name),
         phone       = COALESCE($2, phone),
         address     = COALESCE($3, address),
         health_plan = COALESCE($4, health_plan)
       WHERE id = $5`,
      [name || null, phone || null, address || null, health_plan || null, req.user.id]
    );
    res.json({ message: 'Perfil atualizado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar perfil.' });
  }
});

// ── GET /api/patients/stats ───────────────────
router.get('/stats', authMiddleware, requirePatient, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status='completed')  AS completed,
         COUNT(*) FILTER (WHERE status='cancelled')  AS cancelled,
         COUNT(*) FILTER (WHERE status='confirmed')  AS upcoming,
         COUNT(DISTINCT professional_id)              AS unique_professionals,
         SUM(gross_price) FILTER (WHERE status='completed') AS total_spent
       FROM appointments
       WHERE patient_id = $1`,
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar estatísticas.' });
  }
});

module.exports = router;
