// ─────────────────────────────────────────────
//  myFisio — Rotas do Painel Admin
// ─────────────────────────────────────────────
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../config/database');
const router   = express.Router();

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token admin não fornecido.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Acesso restrito.' });
    req.admin = payload;
    next();
  } catch { return res.status(401).json({ error: 'Token inválido.' }); }
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@myfisio.pro';
  const adminPassHash = process.env.ADMIN_PASSWORD_HASH;
  const plainPass = process.env.ADMIN_PASSWORD || 'myfisio@admin2024';
  const ok = adminPassHash
    ? (email === adminEmail && await bcrypt.compare(password, adminPassHash))
    : (email === adminEmail && password === plainPass);
  if (!ok) return res.status(401).json({ error: 'Credenciais inválidas.' });
  const token = jwt.sign({ id: 'admin', email: adminEmail, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, email: adminEmail, role: 'admin' });
});

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [patients, professionals, sessions, revenue, pending] = await Promise.all([
      db.query("SELECT COUNT(*) FROM users WHERE role='patient' AND is_active=TRUE"),
      db.query("SELECT COUNT(*) FROM users WHERE role='professional' AND is_active=TRUE"),
      db.query("SELECT COUNT(*) FROM appointments WHERE status='completed'"),
      db.query("SELECT COALESCE(SUM(fee_amount),0) AS total FROM earnings"),
      db.query("SELECT COUNT(*) FROM appointments WHERE status='pending'"),
    ]);
    const monthly = await db.query(`
      SELECT TO_CHAR(DATE_TRUNC('month',scheduled_at),'Mon') AS month,
             DATE_TRUNC('month',scheduled_at) AS month_date, COUNT(*) AS total
      FROM appointments WHERE scheduled_at >= NOW()-INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month',scheduled_at) ORDER BY month_date`);
    const statusBreak = await db.query(`SELECT status, COUNT(*) AS total FROM appointments GROUP BY status`);
    const growth = await db.query(`
      SELECT TO_CHAR(DATE_TRUNC('month',created_at),'Mon') AS month,role,COUNT(*) AS total
      FROM users WHERE created_at >= NOW()-INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month',created_at),role,TO_CHAR(DATE_TRUNC('month',created_at),'Mon')
      ORDER BY DATE_TRUNC('month',created_at)`);
    res.json({
      totals: { patients: parseInt(patients.rows[0].count), professionals: parseInt(professionals.rows[0].count),
                sessions: parseInt(sessions.rows[0].count), revenue: parseFloat(revenue.rows[0].total), pending: parseInt(pending.rows[0].count) },
      monthly: monthly.rows, statusBreak: statusBreak.rows, growth: growth.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/patients', requireAdmin, async (req, res) => {
  const { search, limit = 50, offset = 0 } = req.query;
  try {
    const sql = `SELECT u.id,u.name,u.email,u.phone,u.address,u.health_plan,u.is_active,u.created_at,
      COUNT(a.id) AS total_sessions,
      COUNT(a.id) FILTER(WHERE a.status='completed') AS completed_sessions,
      COUNT(a.id) FILTER(WHERE a.status='cancelled') AS cancelled_sessions,
      COALESCE(SUM(a.gross_price) FILTER(WHERE a.status='completed'),0) AS total_spent
      FROM users u LEFT JOIN appointments a ON a.patient_id=u.id
      WHERE u.role='patient' ${search ? "AND (u.name ILIKE '%'||$3||'%' OR u.email ILIKE '%'||$3||'%')" : ''}
      GROUP BY u.id ORDER BY u.created_at DESC LIMIT $1 OFFSET $2`;
    const params = search ? [parseInt(limit), parseInt(offset), search] : [parseInt(limit), parseInt(offset)];
    const result = await db.query(sql, params);
    res.json({ patients: result.rows, total: result.rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/professionals', requireAdmin, async (req, res) => {
  const { search, specialty, limit = 50, offset = 0 } = req.query;
  try {
    const params = [parseInt(limit), parseInt(offset)];
    let w = '';
    if (search) { params.push(search); w += ` AND (u.name ILIKE '%'||$${params.length}||'%' OR p.crefito ILIKE '%'||$${params.length}||'%')`; }
    if (specialty) { params.push(specialty); w += ` AND $${params.length}=ANY(p.specialties)`; }
    const sql = `SELECT u.id,u.name,u.email,u.phone,u.is_active,u.created_at,
      p.id AS prof_id,p.crefito,p.crefito_uf,p.specialties,p.service_types,p.session_price,
      p.is_verified,p.is_online,p.rating_avg,p.rating_count,p.latitude,p.longitude,p.work_start,p.work_end,p.bio,
      COUNT(a.id) FILTER(WHERE a.status='completed') AS completed_sessions,
      COALESCE(SUM(e.fee_amount),0) AS total_fees
      FROM users u JOIN professionals p ON p.user_id=u.id
      LEFT JOIN appointments a ON a.professional_id=p.id
      LEFT JOIN earnings e ON e.professional_id=p.id
      WHERE u.role='professional' ${w}
      GROUP BY u.id,p.id ORDER BY u.created_at DESC LIMIT $1 OFFSET $2`;
    const result = await db.query(sql, params);
    res.json({ professionals: result.rows, total: result.rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/appointments', requireAdmin, async (req, res) => {
  const { status, search, limit = 100, offset = 0 } = req.query;
  try {
    const params = [parseInt(limit), parseInt(offset)];
    let w = '';
    if (status) { params.push(status); w += ` AND a.status=$${params.length}`; }
    if (search) { params.push(search); w += ` AND (up.name ILIKE '%'||$${params.length}||'%' OR uf.name ILIKE '%'||$${params.length}||'%')`; }
    const sql = `SELECT a.id,a.scheduled_at,a.status,a.service_type,a.gross_price,a.app_fee,a.net_price,a.notes,a.created_at,
      up.name AS patient_name,up.email AS patient_email,
      uf.name AS professional_name,p.specialties,
      (SELECT rating FROM reviews WHERE appointment_id=a.id LIMIT 1) AS review_rating,
      (SELECT comment FROM reviews WHERE appointment_id=a.id LIMIT 1) AS review_comment
      FROM appointments a JOIN users up ON up.id=a.patient_id
      JOIN professionals p ON p.id=a.professional_id JOIN users uf ON uf.id=p.user_id
      WHERE 1=1 ${w} ORDER BY a.scheduled_at DESC LIMIT $1 OFFSET $2`;
    const result = await db.query(sql, params);
    res.json({ appointments: result.rows, total: result.rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/finance', requireAdmin, async (req, res) => {
  const m = parseInt(req.query.month) || new Date().getMonth() + 1;
  const y = parseInt(req.query.year)  || new Date().getFullYear();
  try {
    const [monthly, byPro, pending, transferred] = await Promise.all([
      db.query(`SELECT TO_CHAR(DATE_TRUNC('month',created_at),'Mon/YY') AS month,
        DATE_TRUNC('month',created_at) AS month_date,
        SUM(gross_amount) AS gross,SUM(fee_amount) AS fees,SUM(net_amount) AS net,COUNT(*) AS sessions
        FROM earnings WHERE created_at>=NOW()-INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month',created_at) ORDER BY month_date`),
      db.query(`SELECT u.name,u.email,p.specialties,
        COUNT(e.id) AS sessions,SUM(e.gross_amount) AS gross,SUM(e.fee_amount) AS fees,SUM(e.net_amount) AS net
        FROM earnings e JOIN professionals p ON p.id=e.professional_id JOIN users u ON u.id=p.user_id
        WHERE EXTRACT(MONTH FROM e.created_at)=$1 AND EXTRACT(YEAR FROM e.created_at)=$2
        GROUP BY u.name,u.email,p.specialties ORDER BY gross DESC LIMIT 10`, [m, y]),
      db.query(`SELECT COALESCE(SUM(net_amount),0) AS total,COUNT(*) AS sessions FROM earnings WHERE status='pending'`),
      db.query(`SELECT COALESCE(SUM(net_amount),0) AS total,COUNT(*) AS sessions FROM earnings WHERE status='transferred'`),
    ]);
    res.json({ monthly: monthly.rows, byPro: byPro.rows, pending: pending.rows[0], transferred: transferred.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/patient/:id', requireAdmin, async (req, res) => {
  try {
    const user = await db.query(`SELECT u.*,
      COUNT(a.id) AS total_sessions,
      COUNT(a.id) FILTER(WHERE a.status='completed') AS completed_sessions,
      COALESCE(SUM(a.gross_price) FILTER(WHERE a.status='completed'),0) AS total_spent
      FROM users u LEFT JOIN appointments a ON a.patient_id=u.id WHERE u.id=$1 GROUP BY u.id`, [req.params.id]);
    const appts = await db.query(`SELECT a.*,uf.name AS professional_name
      FROM appointments a JOIN professionals p ON p.id=a.professional_id JOIN users uf ON uf.id=p.user_id
      WHERE a.patient_id=$1 ORDER BY a.scheduled_at DESC LIMIT 20`, [req.params.id]);
    res.json({ user: user.rows[0], appointments: appts.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/professional/:id', requireAdmin, async (req, res) => {
  try {
    const pro = await db.query(`SELECT u.*,p.*,
      COUNT(a.id) FILTER(WHERE a.status='completed') AS completed_sessions,
      COALESCE(SUM(e.fee_amount),0) AS total_fees
      FROM users u JOIN professionals p ON p.user_id=u.id
      LEFT JOIN appointments a ON a.professional_id=p.id
      LEFT JOIN earnings e ON e.professional_id=p.id
      WHERE u.id=$1 GROUP BY u.id,p.id`, [req.params.id]);
    const appts = await db.query(`SELECT a.*,up.name AS patient_name
      FROM appointments a JOIN users up ON up.id=a.patient_id
      WHERE a.professional_id=(SELECT id FROM professionals WHERE user_id=$1)
      ORDER BY a.scheduled_at DESC LIMIT 20`, [req.params.id]);
    const reviews = await db.query(`SELECT r.*,u.name AS patient_name
      FROM reviews r JOIN users u ON u.id=r.patient_id
      WHERE r.professional_id=(SELECT id FROM professionals WHERE user_id=$1)
      ORDER BY r.created_at DESC LIMIT 10`, [req.params.id]);
    res.json({ pro: pro.rows[0], appointments: appts.rows, reviews: reviews.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/users/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const result = await db.query('UPDATE users SET is_active=NOT is_active WHERE id=$1 RETURNING id,name,is_active', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Não encontrado.' });
    res.json({ message: result.rows[0].is_active ? 'Ativado.' : 'Desativado.', ...result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/professionals/:id/verify', requireAdmin, async (req, res) => {
  const verified = req.body.verified !== false;
  try {
    await db.query('UPDATE professionals SET is_verified=$1 WHERE id=$2', [verified, req.params.id]);
    res.json({ message: verified ? 'Verificado.' : 'Verificação removida.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = { router, requireAdmin };
