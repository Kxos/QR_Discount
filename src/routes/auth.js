const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../db');
const { generaToken, requireAuth, requireRuolo } = require('../auth');

const router = express.Router();

// Converte placeholder ? (MySQL) in $1,$2,... (PostgreSQL)
function pg(sql, params = []) {
  let i = 0;
  return [sql.replace(/\?/g, () => `$${++i}`), params];
}

// ── POST /api/auth/login ─────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username e password sono obbligatori.' });
  }

  try {
    const [rows] = await db.query(...pg(
      'SELECT * FROM utenti WHERE username = ? AND attivo = true',
      [username]
    ));

    if (!rows.length) {
      return res.status(401).json({ error: 'Credenziali non valide.' });
    }

    const utente = rows[0];
    const match  = await bcrypt.compare(password, utente.password);

    if (!match) {
      return res.status(401).json({ error: 'Credenziali non valide.' });
    }

    await db.query(...pg(
      'INSERT INTO log_operazioni (utente_id, azione, ip) VALUES (?, ?, ?)',
      [utente.id, 'login', req.ip]
    ));

    const token = generaToken(utente);
    res.json({
      token,
      utente: { id: utente.id, username: utente.username, ruolo: utente.ruolo }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore interno del server.' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(...pg(
      'SELECT id, username, ruolo, creato_il FROM utenti WHERE id = ?',
      [req.user.id]
    ));
    if (!rows.length) return res.status(404).json({ error: 'Utente non trovato.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Errore interno.' });
  }
});

// ── GET /api/auth/utenti — solo admin ────────────────
router.get('/utenti', requireAuth, requireRuolo('admin'), async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, username, ruolo, attivo, creato_il FROM utenti ORDER BY creato_il DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Errore interno.' });
  }
});

// ── POST /api/auth/utenti — solo admin ───────────────
router.post('/utenti', requireAuth, requireRuolo('admin'), async (req, res) => {
  const { username, password, ruolo } = req.body;
  if (!username || !password || !ruolo) {
    return res.status(400).json({ error: 'Tutti i campi sono obbligatori.' });
  }
  const ruoliValidi = ['operatore', 'manager', 'admin'];
  if (!ruoliValidi.includes(ruolo)) {
    return res.status(400).json({ error: 'Ruolo non valido.' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query(...pg(
      'INSERT INTO utenti (username, password, ruolo) VALUES (?, ?, ?)',
      [username, hash, ruolo]
    ));
    await db.query(...pg(
      'INSERT INTO log_operazioni (utente_id, azione, dettaglio) VALUES (?, ?, ?)',
      [req.user.id, 'crea_utente', `username: ${username}, ruolo: ${ruolo}`]
    ));
    res.status(201).json({ messaggio: 'Utente creato con successo.' });
  } catch (err) {
    // PostgreSQL: codice errore unique violation = 23505
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username già esistente.' });
    }
    res.status(500).json({ error: 'Errore interno.' });
  }
});

// ── DELETE /api/auth/utenti/:id — solo admin ─────────
router.delete('/utenti/:id', requireAuth, requireRuolo('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Non puoi eliminare te stesso.' });
  }
  try {
    await db.query(...pg('UPDATE utenti SET attivo = false WHERE id = ?', [id]));
    await db.query(...pg(
      'INSERT INTO log_operazioni (utente_id, azione, dettaglio) VALUES (?, ?, ?)',
      [req.user.id, 'disabilita_utente', `utente_id: ${id}`]
    ));
    res.json({ messaggio: 'Utente disabilitato.' });
  } catch (err) {
    res.status(500).json({ error: 'Errore interno.' });
  }
});

// ── PUT /api/auth/utenti/:id/password — admin o sé stesso
router.put('/utenti/:id/password', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (id !== req.user.id && req.user.ruolo !== 'admin') {
    return res.status(403).json({ error: 'Non autorizzato.' });
  }
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password troppo corta (min. 6 caratteri).' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query(...pg('UPDATE utenti SET password = ? WHERE id = ?', [hash, id]));
    res.json({ messaggio: 'Password aggiornata.' });
  } catch (err) {
    res.status(500).json({ error: 'Errore interno.' });
  }
});

module.exports = router;
