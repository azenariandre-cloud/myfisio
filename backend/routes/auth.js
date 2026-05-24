const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db      = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── Helpers ───────────────────────────────────
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }
  next();
}

// ── POST /api/auth/register ───────────────────
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Nome obrigatório.'),
  body('email').isEmail().withMessage('E-mail inválido.').normalizeEmail(),
  body('cpf').trim().notEmpty().withMessage('CPF obrigatório.'),
  body('phone').trim().notEmpty().withMessage('Telefone obrigatório.'),
  body('password').isLength({ min: 8 }).withMessage('Senha mínima de 8 caracteres.'),
  body('role').isIn(['patient', 'professional']).withMessage('Tipo de conta inválido.'),
], validate, async (req, res) => {
  const { name, email, cpf, phone, password, role, birth_date, address, health_plan } = req.body;

  try {
    // Verifica duplicidade
    const exists = await db.query(
      'SELECT id FROM users WHERE email = $1 OR cpf = $2',
      [email, cpf.replace(/\D/g, '')]
    );
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'E-mail ou CPF já cadastrado.' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const cleanCpf = cpf.replace(/\D/g, '');

    const result = await db.query(
      `INSERT INTO users (name, email, cpf, phone, password_hash, role, birth_date, address, health_plan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, name, email, role`,
      [name, email, cleanCpf, phone, password_hash, role, birth_date || null, address || null, health_plan || null]
    );

    const user  = result.rows[0];
    const token = generateToken(user);

    // Se for fisioterapeuta, cria registro profissional vazio
    if (role === 'professional') {
      const { crefito, crefito_uf, specialties, service_types, session_price, radius_km } = req.body;
      await db.query(
        `INSERT INTO professionals (user_id, crefito, crefito_uf, specialties, service_types, session_price, radius_km)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          user.id,
          crefito || '',
          crefito_uf || 'SP',
          specialties || [],
          service_types || ['domiciliar'],
          session_price || 0,
          radius_km || 5,
        ]
      );
    }

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('[register]', err.message);
    res.status(500).json({ error: 'Erro ao criar conta.' });
  }
});

// ── POST /api/auth/login ──────────────────────
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], validate, async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await db.query(
      'SELECT id, name, email, role, password_hash, is_active FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'Conta desativada. Entre em contato com o suporte.' });
    }

    const token = generateToken(user);
    const { password_hash, ...safeUser } = user;

    res.json({ token, user: safeUser });
  } catch (err) {
    console.error('[login]', err.message);
    res.status(500).json({ error: 'Erro ao fazer login.' });
  }
});

// ── GET /api/auth/me ──────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.phone, u.birth_date, u.address, u.health_plan, u.avatar_url,
              p.id AS prof_id, p.crefito, p.crefito_uf, p.specialties, p.service_types,
              p.session_price, p.radius_km, p.is_online, p.is_verified, p.rating_avg, p.rating_count,
              p.latitude, p.longitude
       FROM users u
       LEFT JOIN professionals p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar dados do usuário.' });
  }
});

// ── PUT /api/auth/password ────────────────────
router.put('/password', authMiddleware, [
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 8 }),
], validate, async (req, res) => {
  const { current_password, new_password } = req.body;
  try {
    const result = await db.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    const user   = result.rows[0];
    if (!user || !(await bcrypt.compare(current_password, user.password_hash))) {
      return res.status(401).json({ error: 'Senha atual incorreta.' });
    }
    const hash = await bcrypt.hash(new_password, 12);
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
    res.json({ message: 'Senha atualizada com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar senha.' });
  }
});

module.exports = router;
