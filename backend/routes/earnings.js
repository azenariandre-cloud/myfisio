const express = require('express');
const db      = require('../config/database');
const { authMiddleware, requirePro } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/earnings ─────────────────────────
// Resumo do mês atual
router.get('/', authMiddleware, requirePro, async (req, res) => {
  const { month, year } = req.query;
  const now  = new Date();
  const m    = parseInt(month) || now.getMonth() + 1;
  const y    = parseInt(year)  || now.getFullYear();

  try {
    const profResult = await db.query(
      'SELECT id FROM professionals WHERE user_id=$1', [req.user.id]
    );
    if (!profResult.rows[0]) return res.status(404).json({ error: 'Perfil profissional não encontrado.' });
    const profId = profResult.rows[0].id;

    const summary = await db.query(
      `SELECT
         COUNT(*)                      AS total_sessions,
         SUM(gross_amount)             AS total_gross,
         SUM(fee_amount)               AS total_fee,
         SUM(net_amount)               AS total_net,
         SUM(CASE WHEN status='transferred' THEN net_amount ELSE 0 END) AS transferred,
         SUM(CASE WHEN status='pending'     THEN net_amount ELSE 0 END) AS pending
       FROM earnings
       WHERE professional_id = $1
         AND EXTRACT(MONTH FROM created_at) = $2
         AND EXTRACT(YEAR  FROM created_at) = $3`,
      [profId, m, y]
    );

    const today = await db.query(
      `SELECT SUM(net_amount) AS today_net, COUNT(*) AS today_sessions
       FROM earnings
       WHERE professional_id=$1
         AND created_at::date = CURRENT_DATE`,
      [profId]
    );

    res.json({
      month: m,
      year: y,
      summary:   summary.rows[0],
      today:     today.rows[0],
      fee_rate:  `${process.env.APP_FEE_PERCENT || 5}%`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar ganhos.' });
  }
});

// ── GET /api/earnings/sessions ────────────────
// Histórico de sessões com detalhamento da taxa
router.get('/sessions', authMiddleware, requirePro, async (req, res) => {
  const { limit = 30, offset = 0, status } = req.query;

  try {
    const profResult = await db.query(
      'SELECT id FROM professionals WHERE user_id=$1', [req.user.id]
    );
    if (!profResult.rows[0]) return res.status(404).json({ error: 'Perfil não encontrado.' });
    const profId = profResult.rows[0].id;

    const result = await db.query(
      `SELECT
         e.id, e.gross_amount, e.fee_amount, e.net_amount, e.status, e.transferred_at, e.created_at,
         a.scheduled_at, a.service_type, a.duration_minutes,
         u.name AS patient_name
       FROM earnings e
       JOIN appointments a ON a.id = e.appointment_id
       JOIN users u        ON u.id = a.patient_id
       WHERE e.professional_id = $1
         ${status ? 'AND e.status = $4' : ''}
       ORDER BY e.created_at DESC
       LIMIT $2 OFFSET $3`,
      status
        ? [profId, parseInt(limit), parseInt(offset), status]
        : [profId, parseInt(limit), parseInt(offset)]
    );

    res.json({ sessions: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar sessões.' });
  }
});

module.exports = router;
