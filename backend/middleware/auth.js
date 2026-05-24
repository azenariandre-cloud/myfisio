const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;   // { id, role, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

// Garante que o usuário é fisioterapeuta
function requirePro(req, res, next) {
  if (req.user?.role !== 'professional') {
    return res.status(403).json({ error: 'Acesso restrito a fisioterapeutas.' });
  }
  next();
}

// Garante que o usuário é paciente
function requirePatient(req, res, next) {
  if (req.user?.role !== 'patient') {
    return res.status(403).json({ error: 'Acesso restrito a pacientes.' });
  }
  next();
}

module.exports = { authMiddleware, requirePro, requirePatient };
