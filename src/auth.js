const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_cambia_in_produzione';

// Genera token JWT
function generaToken(utente) {
  return jwt.sign(
    { id: utente.id, username: utente.username, ruolo: utente.ruolo },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

// Middleware: verifica token
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({ error: 'Token mancante. Effettua il login.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token non valido o scaduto. Effettua nuovamente il login.' });
  }
}

// Middleware: richiede ruolo specifico
function requireRuolo(...ruoli) {
  return (req, res, next) => {
    if (!ruoli.includes(req.user?.ruolo)) {
      return res.status(403).json({ error: `Accesso negato. Ruolo richiesto: ${ruoli.join(' o ')}` });
    }
    next();
  };
}

module.exports = { generaToken, requireAuth, requireRuolo };
