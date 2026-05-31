const express = require('express');
const db = require('../config/database');
const { authMiddleware, requirePro } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, requirePro, async (req, res) => {

  try {

    const prof = await db.query(
      `SELECT id, rating_avg
       FROM professionals
       WHERE user_id = $1`,
      [req.user.id]
    );

    if (!prof.rows.length) {
      return res.status(404).json({
        error: 'Profissional não encontrado'
      });
    }

    const professionalId = prof.rows[0].id;

    const pendingOrders = await db.query(`
      SELECT
        a.id,
        a.scheduled_at,
        a.service_type,
        a.address,
        u.name AS patient_name
      FROM appointments a
      JOIN users u ON u.id = a.patient_id
      WHERE a.professional_id = $1
      AND a.status = 'pending'
      ORDER BY a.scheduled_at ASC
    `, [professionalId]);

    const todaySessions = await db.query(`
      SELECT COUNT(*) AS total
      FROM appointments
      WHERE professional_id = $1
      AND DATE(scheduled_at) = CURRENT_DATE
      AND status IN ('confirmed','completed')
    `, [professionalId]);

    const todayAgenda = await db.query(`
      SELECT
        a.id,
        a.scheduled_at,
        a.status,
        u.name AS patient_name
      FROM appointments a
      JOIN users u ON u.id = a.patient_id
      WHERE a.professional_id = $1
      AND DATE(a.scheduled_at) = CURRENT_DATE
      ORDER BY a.scheduled_at ASC
    `, [professionalId]);

    const earnings = await db.query(`
      SELECT
        COALESCE(SUM(net_amount),0) AS total
      FROM earnings
      WHERE professional_id = $1
      AND created_at::date = CURRENT_DATE
    `, [professionalId]);

    res.json({
      newOrders: pendingOrders.rows.length,
      todaySessions: Number(todaySessions.rows[0].total),
      rating: Number(prof.rows[0].rating_avg || 0),
      todayEarnings: Number(earnings.rows[0].total || 0),
      pendingOrders: pendingOrders.rows,
      todayAgenda: todayAgenda.rows
    });

  } catch (err) {

    console.error('[dashboard]', err);

    res.status(500).json({
      error: 'Erro ao carregar dashboard'
    });

  }

});

module.exports = router;