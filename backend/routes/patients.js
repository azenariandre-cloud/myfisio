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
      'SELECT id, name, email, phone, birth_date, address, health_plan, avatar_url, created_at FROM users WHERE id=$1',
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erro ao buscar perfil.' }); }
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
      [name||null, phone||null, address||null, health_plan||null, req.user.id]
    );
    res.json({ message: 'Perfil atualizado.' });
  } catch (err) { res.status(500).json({ error: 'Erro ao atualizar perfil.' }); }
});

// ── GET /api/patients/stats ───────────────────
router.get('/stats', authMiddleware, requirePatient, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status='completed')  AS completed,
         COUNT(*) FILTER (WHERE status='cancelled')  AS cancelled,
         COUNT(*) FILTER (WHERE status IN ('pending','confirmed')) AS upcoming,
         COUNT(DISTINCT professional_id)              AS unique_professionals,
         COALESCE(SUM(gross_price) FILTER (WHERE status='completed'), 0) AS total_spent
       FROM appointments WHERE patient_id = $1`,
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erro ao buscar estatísticas.' }); }
});

// ── GET /api/patients/favorites ──────────────
router.get('/favorites', authMiddleware, requirePatient, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT f.professional_id, p.session_price, p.specialties, p.rating_avg,
              p.rating_count, p.is_online, p.latitude, p.longitude,
              u.name, u.avatar_url
       FROM favorites f
       JOIN professionals p ON p.id = f.professional_id
       JOIN users u ON u.id = p.user_id
       WHERE f.patient_id = $1
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json({ favorites: result.rows });
  } catch (err) { res.status(500).json({ error: 'Erro ao buscar favoritos.' }); }
});

// ── POST /api/patients/favorites ─────────────
router.post('/favorites', authMiddleware, requirePatient, [
  body('professional_id').isUUID(),
], validate, async (req, res) => {
  const { professional_id } = req.body;
  try {
    await db.query(
      `INSERT INTO favorites (patient_id, professional_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.user.id, professional_id]
    );
    res.status(201).json({ message: 'Adicionado aos favoritos.' });
  } catch (err) { res.status(500).json({ error: 'Erro ao favoritar.' }); }
});

// ── DELETE /api/patients/favorites/:profId ────
router.delete('/favorites/:profId', authMiddleware, requirePatient, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM favorites WHERE patient_id=$1 AND professional_id=$2',
      [req.user.id, req.params.profId]
    );
    res.json({ message: 'Removido dos favoritos.' });
  } catch (err) { res.status(500).json({ error: 'Erro ao remover favorito.' }); }
});

// ── GET /api/patients/notifications ──────────
router.get('/notifications', authMiddleware, requirePatient, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT n.* FROM notifications n
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json({ notifications: result.rows });
  } catch (err) {
    // Tabela pode não existir ainda — retorna vazio
    res.json({ notifications: [] });
  }
});

module.exports = router;
