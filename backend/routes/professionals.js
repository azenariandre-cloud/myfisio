const express = require('express');
const { body, query, validationResult } = require('express-validator');
const db      = require('../config/database');
const { authMiddleware, requirePro } = require('../middleware/auth');

const router = express.Router();

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
}

// ── GET /api/professionals ────────────────────
// Busca fisioterapeutas próximos (geolocalização via Haversine)
router.get('/', [
  query('lat').optional().isFloat(),
  query('lng').optional().isFloat(),
  query('radius').optional().isInt({ min: 1, max: 50 }),
  query('specialty').optional().trim(),
  query('service_type').optional().isIn(['domiciliar', 'clinica']),
], validate, async (req, res) => {
  const {
    lat, lng,
    radius   = 10,
    specialty,
    service_type,
    limit    = 20,
    offset   = 0,
  } = req.query;

  try {
    let sql = `
      SELECT
        p.id, p.crefito, p.crefito_uf, p.specialties, p.service_types,
        p.session_price, p.radius_km, p.is_online, p.is_verified,
        p.rating_avg, p.rating_count, p.latitude, p.longitude,
        p.work_start, p.work_end, p.bio,
        u.name, u.avatar_url,
        ${lat && lng
          ? `ROUND((6371 * acos(
               LEAST(1, cos(radians($1)) * cos(radians(p.latitude))
               * cos(radians(p.longitude) - radians($2))
               + sin(radians($1)) * sin(radians(p.latitude)))
             ))::NUMERIC, 2) AS distance_km`
          : '0 AS distance_km'}
      FROM professionals p
      JOIN users u ON u.id = p.user_id
      WHERE p.is_verified = TRUE
        AND u.is_active   = TRUE
    `;

    const params = [];
    let pIdx = 1;

    if (lat && lng) {
      params.push(parseFloat(lat), parseFloat(lng));
      pIdx = 3;
      sql += ` AND p.latitude  IS NOT NULL
               AND p.longitude IS NOT NULL
               AND (6371 * acos(
                 LEAST(1, cos(radians($1)) * cos(radians(p.latitude))
                 * cos(radians(p.longitude) - radians($2))
                 + sin(radians($1)) * sin(radians(p.latitude)))
               )) <= $${pIdx}`;
      params.push(parseInt(radius));
      pIdx++;
    }

    if (specialty) {
      sql += ` AND $${pIdx} = ANY(p.specialties)`;
      params.push(specialty);
      pIdx++;
    }

    if (service_type) {
      sql += ` AND $${pIdx} = ANY(p.service_types)`;
      params.push(service_type);
      pIdx++;
    }

    sql += ` ORDER BY p.is_online DESC, distance_km ASC, p.rating_avg DESC
             LIMIT $${pIdx} OFFSET $${pIdx + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(sql, params);
    res.json({
      professionals: result.rows,
      total: result.rowCount,
    });
  } catch (err) {
    console.error('[professionals/list]', err.message);
    res.status(500).json({ error: 'Erro ao buscar fisioterapeutas.' });
  }
});

// ── GET /api/professionals/:id ────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.*, u.name, u.email, u.phone, u.avatar_url
       FROM professionals p
       JOIN users u ON u.id = p.user_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Profissional não encontrado.' });

    // Busca últimas avaliações
    const reviews = await db.query(
      `SELECT r.rating, r.comment, r.created_at, u.name AS patient_name
       FROM reviews r JOIN users u ON u.id = r.patient_id
       WHERE r.professional_id = $1
       ORDER BY r.created_at DESC LIMIT 10`,
      [req.params.id]
    );

    res.json({ ...result.rows[0], reviews: reviews.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar profissional.' });
  }
});

// ── PUT /api/professionals/profile ───────────
router.put('/profile', authMiddleware, requirePro, [
  body('specialties').optional().isArray(),
  body('session_price').optional().isFloat({ min: 0 }),
  body('radius_km').optional().isInt({ min: 1, max: 50 }),
], validate, async (req, res) => {
  const {
    specialties, service_types, session_price,
    radius_km, work_start, work_end, bio,
    latitude, longitude,
  } = req.body;

  try {
    // Atualiza dados do usuário
    const { name, phone, address } = req.body;
    if (name || phone || address) {
      await db.query(
        `UPDATE users SET
           name    = COALESCE($1, name),
           phone   = COALESCE($2, phone),
           address = COALESCE($3, address)
         WHERE id = $4`,
        [name || null, phone || null, address || null, req.user.id]
      );
    }

    // Atualiza dados profissionais
    await db.query(
      `UPDATE professionals SET
         specialties   = COALESCE($1, specialties),
         service_types = COALESCE($2, service_types),
         session_price = COALESCE($3, session_price),
         radius_km     = COALESCE($4, radius_km),
         work_start    = COALESCE($5, work_start),
         work_end      = COALESCE($6, work_end),
         bio           = COALESCE($7, bio),
         latitude      = COALESCE($8, latitude),
         longitude     = COALESCE($9, longitude)
       WHERE user_id = $10`,
      [
        specialties   || null,
        service_types || null,
        session_price || null,
        radius_km     || null,
        work_start    || null,
        work_end      || null,
        bio           || null,
        latitude      || null,
        longitude     || null,
        req.user.id,
      ]
    );
    res.json({ message: 'Perfil atualizado com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar perfil.' });
  }
});

// ── PATCH /api/professionals/online ───────────
// Toggle online/offline no mapa
router.patch('/online', authMiddleware, requirePro, [
  body('is_online').isBoolean(),
  body('latitude').optional().isFloat(),
  body('longitude').optional().isFloat(),
], validate, async (req, res) => {
  const { is_online, latitude, longitude } = req.body;
  try {
    await db.query(
      `UPDATE professionals SET
         is_online  = $1,
         latitude   = COALESCE($2, latitude),
         longitude  = COALESCE($3, longitude)
       WHERE user_id = $4`,
      [is_online, latitude || null, longitude || null, req.user.id]
    );
    res.json({ is_online, message: is_online ? 'Você está online.' : 'Você está offline.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar status online.' });
  }
});

module.exports = router;
