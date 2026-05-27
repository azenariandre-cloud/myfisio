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

// ── GET /api/appointments/slots ───────────────
// Retorna horários disponíveis de um profissional em uma data
router.get('/slots', authMiddleware, async (req, res) => {
  const { professional_id, date } = req.query;
  if (!professional_id || !date) {
    return res.status(400).json({ error: 'professional_id e date são obrigatórios.' });
  }
  try {
    const prof = await db.query(
      'SELECT work_start, work_end FROM professionals WHERE id=$1',
      [professional_id]
    );
    if (!prof.rows[0]) return res.status(404).json({ error: 'Profissional não encontrado.' });

    const { work_start, work_end } = prof.rows[0];
    const startH = parseInt((work_start || '08:00').split(':')[0]);
    const endH   = parseInt((work_end   || '20:00').split(':')[0]);

    // Busca horários já ocupados naquela data
    const busy = await db.query(
      `SELECT scheduled_at FROM appointments
       WHERE professional_id = $1
         AND DATE(scheduled_at AT TIME ZONE 'America/Sao_Paulo') = $2
         AND status NOT IN ('cancelled')`,
      [professional_id, date]
    );
    const busyHours = new Set(busy.rows.map(r => new Date(r.scheduled_at).getUTCHours() - 3));

    const slots = [];
    for (let h = startH; h < endH; h++) {
      slots.push({
        hour: h,
        time: `${String(h).padStart(2,'0')}:00`,
        available: !busyHours.has(h),
        datetime: `${date}T${String(h).padStart(2,'0')}:00:00-03:00`,
      });
    }
    res.json({ slots, date, professional_id });
  } catch (err) {
    console.error('[slots]', err.message);
    res.status(500).json({ error: 'Erro ao buscar horários.' });
  }
});

// ── POST /api/appointments ────────────────────
router.post('/', authMiddleware, requirePatient, [
  body('professional_id').isUUID(),
  body('scheduled_at').isISO8601(),
  body('service_type').isIn(['domiciliar', 'clinica']),
  body('address').optional().trim(),
  body('notes').optional().trim(),
], validate, async (req, res) => {
  const { professional_id, scheduled_at, service_type, address, notes } = req.body;
  try {
    const prof = await db.query(
      'SELECT session_price FROM professionals WHERE id=$1',
      [professional_id]
    );
    if (!prof.rows[0]) return res.status(404).json({ error: 'Profissional não encontrado.' });

    // Verifica conflito de horário
    const conflict = await db.query(
      `SELECT id FROM appointments
       WHERE professional_id=$1 AND scheduled_at=$2 AND status NOT IN ('cancelled')`,
      [professional_id, scheduled_at]
    );
    if (conflict.rows.length > 0) {
      return res.status(409).json({ error: 'Este horário já está reservado. Escolha outro.' });
    }

    const gross = parseFloat(prof.rows[0].session_price) || 0;
    const fee   = parseFloat((gross * FEE).toFixed(2));
    const net   = parseFloat((gross - fee).toFixed(2));

    const result = await db.query(
      `INSERT INTO appointments
         (patient_id, professional_id, scheduled_at, service_type,
          gross_price, app_fee, net_price, address, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
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
router.get('/', authMiddleware, async (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;
  const isPro = req.user.role === 'professional';
  try {
    let sql, params;
    if (isPro) {
      const profResult = await db.query('SELECT id FROM professionals WHERE user_id=$1', [req.user.id]);
      if (!profResult.rows[0]) return res.json({ appointments: [] });
      const profId = profResult.rows[0].id;
      sql = `
        SELECT a.*,
               u.name AS patient_name, u.phone AS patient_phone, u.email AS patient_email,
               -- verifica se já existe avaliação
               (SELECT rating FROM reviews WHERE appointment_id = a.id LIMIT 1) AS review_rating
        FROM appointments a
        JOIN users u ON u.id = a.patient_id
        WHERE a.professional_id = $1
        ${status ? "AND a.status = '" + status + "'" : ''}
        ORDER BY a.scheduled_at DESC
        LIMIT $2 OFFSET $3`;
      params = [profId, parseInt(limit), parseInt(offset)];
    } else {
      sql = `
        SELECT a.*,
               u.name AS professional_name,
               p.rating_avg, p.specialties, p.id AS prof_id,
               (SELECT rating FROM reviews WHERE appointment_id = a.id LIMIT 1) AS review_rating
        FROM appointments a
        JOIN professionals p ON p.id = a.professional_id
        JOIN users u ON u.id = p.user_id
        WHERE a.patient_id = $1
        ${status ? "AND a.status = '" + status + "'" : ''}
        ORDER BY a.scheduled_at DESC
        LIMIT $2 OFFSET $3`;
      params = [req.user.id, parseInt(limit), parseInt(offset)];
    }
    const result = await db.query(sql, params);
    res.json({ appointments: result.rows });
  } catch (err) {
    console.error('[appointments/list]', err.message);
    res.status(500).json({ error: 'Erro ao listar agendamentos.' });
  }
});

// ── PATCH /api/appointments/:id/status ────────
router.patch('/:id/status', authMiddleware, [
  body('status').isIn(['confirmed', 'completed', 'cancelled', 'disputed']),
  body('cancel_reason').optional().trim(),
], validate, async (req, res) => {
  const { id } = req.params;
  const { status, cancel_reason } = req.body;
  const isPro = req.user.role === 'professional';
  try {
    const appt = await db.query(
      `SELECT a.*, p.user_id AS prof_user_id
       FROM appointments a
       JOIN professionals p ON p.id = a.professional_id
       WHERE a.id = $1`, [id]
    );
    if (!appt.rows[0]) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    const row = appt.rows[0];
    const isOwner = isPro ? row.prof_user_id === req.user.id : row.patient_id === req.user.id;
    if (!isOwner) return res.status(403).json({ error: 'Sem permissão.' });

    const allowed = {
      patient:      { pending: ['cancelled'], confirmed: ['cancelled'] },
      professional: { pending: ['confirmed', 'cancelled'], confirmed: ['completed', 'cancelled'] },
    };
    const role = isPro ? 'professional' : 'patient';
    const transitions = allowed[role][row.status] || [];
    if (!transitions.includes(status)) {
      return res.status(400).json({ error: `Não é possível mudar de "${row.status}" para "${status}".` });
    }

    // Salva motivo do cancelamento nas notes se fornecido
    const notesSql = cancel_reason
      ? `, notes = COALESCE(notes || ' | ', '') || 'Cancelado: ' || $3`
      : '';
    const updateParams = cancel_reason ? [status, id, cancel_reason] : [status, id];
    await db.query(`UPDATE appointments SET status=$1${notesSql} WHERE id=$2`, updateParams);

    if (status === 'completed') {
      await db.query(
        `INSERT INTO earnings (professional_id, appointment_id, gross_amount, fee_amount, net_amount)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [row.professional_id, id, row.gross_price, row.app_fee, row.net_price]
      );
    }
    res.json({ message: `Agendamento ${status}.`, status, appointment_id: id });
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
  const { id } = req.params;
  const { rating, comment } = req.body;
  try {
    const appt = await db.query(
      'SELECT * FROM appointments WHERE id=$1 AND patient_id=$2',
      [id, req.user.id]
    );
    if (!appt.rows[0]) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    if (!['completed','confirmed'].includes(appt.rows[0].status)) {
      return res.status(400).json({ error: 'Só é possível avaliar sessões concluídas.' });
    }
    await db.query(
      `INSERT INTO reviews (appointment_id, patient_id, professional_id, rating, comment)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (appointment_id) DO UPDATE SET rating=$4, comment=$5`,
      [id, req.user.id, appt.rows[0].professional_id, rating, comment || null]
    );
    res.status(201).json({ message: 'Avaliação enviada!' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao enviar avaliação.' });
  }
});

module.exports = router;
