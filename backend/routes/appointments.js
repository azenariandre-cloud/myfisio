const express = require('express');
const { body, validationResult } = require('express-validator');
const db      = require('../config/database');
const { authMiddleware, requirePro, requirePatient } = require('../middleware/auth');

const router = express.Router();
const FEE    = parseFloat(process.env.APP_FEE_PERCENT || 5) / 100;

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
}

// ── POST /api/appointments ────────────────────
// Paciente cria agendamento
router.post('/', authMiddleware, requirePatient, [
  body('professional_id').isUUID(),
  body('scheduled_at').isISO8601(),
  body('service_type').isIn(['domiciliar', 'clinica']),
  body('address').optional().trim(),
  body('notes').optional().trim(),
], validate, async (req, res) => {
  const { professional_id, scheduled_at, service_type, address, notes } = req.body;

  try {
    // Busca preço do profissional
    const prof = await db.query(
      'SELECT session_price, is_verified, is_online FROM professionals WHERE id=$1',
      [professional_id]
    );
    if (!prof.rows[0]) return res.status(404).json({ error: 'Profissional não encontrado.' });
    if (!prof.rows[0].is_verified) return res.status(400).json({ error: 'Profissional ainda não verificado.' });

    const gross = parseFloat(prof.rows[0].session_price);
    const fee   = parseFloat((gross * FEE).toFixed(2));
    const net   = parseFloat((gross - fee).toFixed(2));

    const result = await db.query(
      `INSERT INTO appointments
         (patient_id, professional_id, scheduled_at, service_type,
          gross_price, app_fee, net_price, address, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [req.user.id, professional_id, scheduled_at, service_type, gross, fee, net, address || null, notes || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[appointments/create]', err.message);
    res.status(500).json({ error: 'Erro ao criar agendamento.' });
  }
});

// ── GET /api/appointments ─────────────────────
// Lista agendamentos do usuário logado (paciente ou fisio)
router.get('/', authMiddleware, async (req, res) => {
  const { status, limit = 20, offset = 0 } = req.query;
  const isPro = req.user.role === 'professional';

  try {
    let sql, params;

    if (isPro) {
      const profResult = await db.query(
        'SELECT id FROM professionals WHERE user_id=$1', [req.user.id]
      );
      if (!profResult.rows[0]) return res.status(404).json({ error: 'Perfil profissional não encontrado.' });
      const profId = profResult.rows[0].id;

      sql = `
        SELECT a.*, u.name AS patient_name, u.phone AS patient_phone
        FROM appointments a
        JOIN users u ON u.id = a.patient_id
        WHERE a.professional_id = $1
        ${status ? 'AND a.status = $2' : ''}
        ORDER BY a.scheduled_at DESC
        LIMIT $${status ? 3 : 2} OFFSET $${status ? 4 : 3}
      `;
      params = status
        ? [profId, status, parseInt(limit), parseInt(offset)]
        : [profId, parseInt(limit), parseInt(offset)];
    } else {
      sql = `
        SELECT a.*, u.name AS professional_name, p.rating_avg, p.specialties
        FROM appointments a
        JOIN professionals p ON p.id = a.professional_id
        JOIN users u ON u.id = p.user_id
        WHERE a.patient_id = $1
        ${status ? 'AND a.status = $2' : ''}
        ORDER BY a.scheduled_at DESC
        LIMIT $${status ? 3 : 2} OFFSET $${status ? 4 : 3}
      `;
      params = status
        ? [req.user.id, status, parseInt(limit), parseInt(offset)]
        : [req.user.id, parseInt(limit), parseInt(offset)];
    }

    const result = await db.query(sql, params);
    res.json({ appointments: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar agendamentos.' });
  }
});

// ── PATCH /api/appointments/:id/status ────────
router.patch('/:id/status', authMiddleware, [
  body('status').isIn(['confirmed', 'completed', 'cancelled', 'disputed']),
], validate, async (req, res) => {
  const { id }     = req.params;
  const { status } = req.body;
  const isPro      = req.user.role === 'professional';

  try {
    // Verifica que o agendamento pertence ao usuário
    const appt = await db.query(
      `SELECT a.*, p.user_id AS prof_user_id
       FROM appointments a
       JOIN professionals p ON p.id = a.professional_id
       WHERE a.id = $1`,
      [id]
    );
    if (!appt.rows[0]) return res.status(404).json({ error: 'Agendamento não encontrado.' });

    const row = appt.rows[0];
    const isOwner = isPro
      ? row.prof_user_id === req.user.id
      : row.patient_id   === req.user.id;

    if (!isOwner) return res.status(403).json({ error: 'Sem permissão para alterar este agendamento.' });

    // Regras de transição de status
    const allowed = {
      patient:      { pending: ['cancelled'], confirmed: ['cancelled'] },
      professional: { pending: ['confirmed', 'cancelled'], confirmed: ['completed', 'cancelled'] },
    };
    const role        = isPro ? 'professional' : 'patient';
    const transitions = allowed[role][row.status] || [];

    if (!transitions.includes(status)) {
      return res.status(400).json({
        error: `Não é possível mudar de "${row.status}" para "${status}".`,
      });
    }

    await db.query('UPDATE appointments SET status=$1 WHERE id=$2', [status, id]);

    // Se concluída → cria registro de ganhos
    if (status === 'completed') {
      await db.query(
        `INSERT INTO earnings (professional_id, appointment_id, gross_amount, fee_amount, net_amount)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT DO NOTHING`,
        [row.professional_id, id, row.gross_price, row.app_fee, row.net_price]
      );
    }

    res.json({ message: `Agendamento ${status}.`, status });
  } catch (err) {
    console.error('[appointments/status]', err.message);
    res.status(500).json({ error: 'Erro ao atualizar status.' });
  }
});

// ── POST /api/appointments/:id/review ─────────
router.post('/:id/review', authMiddleware, requirePatient, [
  body('rating').isInt({ min: 1, max: 5 }),
  body('comment').optional().trim(),
], validate, async (req, res) => {
  const { id }              = req.params;
  const { rating, comment } = req.body;

  try {
    const appt = await db.query(
      'SELECT * FROM appointments WHERE id=$1 AND patient_id=$2 AND status=$3',
      [id, req.user.id, 'completed']
    );
    if (!appt.rows[0]) return res.status(404).json({ error: 'Agendamento não encontrado ou não concluído.' });

    await db.query(
      `INSERT INTO reviews (appointment_id, patient_id, professional_id, rating, comment)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (appointment_id) DO UPDATE SET rating=$4, comment=$5`,
      [id, req.user.id, appt.rows[0].professional_id, rating, comment || null]
    );

    res.status(201).json({ message: 'Avaliação enviada com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao enviar avaliação.' });
  }
});

module.exports = router;
