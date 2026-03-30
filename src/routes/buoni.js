const express = require('express');
const db      = require('../db');
const { requireAuth, requireRuolo } = require('../auth');

const router = express.Router();

// Converte placeholder ? (MySQL) in $1,$2,... (PostgreSQL)
function pg(sql, params = []) {
  let i = 0;
  return [sql.replace(/\?/g, () => `$${++i}`), params];
}

// ── Genera codice univoco ─────────────────────────────
function generaCodice() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'QRS-';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function codiceUnico(conn) {
  let codice, exists = true;
  while (exists) {
    codice = generaCodice();
    const [rows] = await conn.query(...pg('SELECT id FROM buoni WHERE codice = ?', [codice]));
    exists = rows.length > 0;
  }
  return codice;
}

// ── GET /api/buoni/stats ──────────────────────────────
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        COUNT(*)                                                                        AS totale,
        SUM(CASE WHEN stato = 'valido' AND scadenza >= CURRENT_DATE THEN 1 ELSE 0 END) AS validi,
        SUM(CASE WHEN stato = 'usato'  THEN 1 ELSE 0 END)                              AS usati,
        SUM(CASE WHEN stato = 'valido' AND scadenza <  CURRENT_DATE THEN 1 ELSE 0 END) AS scaduti
      FROM buoni
    `);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore interno.' });
  }
});

// ── GET /api/buoni — archivio con filtri ─────────────
router.get('/', requireAuth, async (req, res) => {
  const { q, stato, sconto, limit = 200, offset = 0 } = req.query;

  let where = [];
  let params = [];

  if (q) {
    where.push('(b.codice ILIKE ? OR b.note ILIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (stato === 'valido')  { where.push("b.stato = 'valido' AND b.scadenza >= CURRENT_DATE"); }
  if (stato === 'usato')   { where.push("b.stato = 'usato'"); }
  if (stato === 'scaduto') { where.push("b.stato = 'valido' AND b.scadenza < CURRENT_DATE"); }
  if (sconto) {
    if (sconto.endsWith('%')) {
      where.push("b.valore = ? AND b.tipo = '%'");
      params.push(parseFloat(sconto));
    } else if (sconto.startsWith('€')) {
      where.push("b.valore = ? AND b.tipo = '€'");
      params.push(parseFloat(sconto.slice(1)));
    }
  }

  const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const countParams = [...params];
  params.push(parseInt(limit), parseInt(offset));

  const statoEff = `CASE WHEN b.stato = 'valido' AND b.scadenza < CURRENT_DATE THEN 'scaduto' ELSE b.stato END`;

  try {
    const [rows] = await db.query(...pg(`
      SELECT
        b.id, b.codice, b.valore, b.tipo,
        TO_CHAR(b.scadenza, 'YYYY-MM-DD') AS scadenza,
        b.note, b.azienda, b.stato,
        ${statoEff} AS stato_effettivo,
        b.creato_il, uc.username AS creato_da,
        b.usato_il,  uu.username AS usato_da
      FROM buoni b
      JOIN utenti uc ON b.creato_da = uc.id
      LEFT JOIN utenti uu ON b.usato_da = uu.id
      ${whereSQL}
      ORDER BY b.creato_il DESC
      LIMIT ? OFFSET ?
    `, params));

    const [countRows] = await db.query(...pg(
      `SELECT COUNT(*) AS totale FROM buoni b ${whereSQL}`,
      countParams
    ));

    res.json({ buoni: rows, totale: parseInt(countRows[0].totale) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore interno.' });
  }
});

// ── GET /api/buoni/recenti — per dashboard ───────────
router.get('/recenti', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        b.codice, b.valore, b.tipo,
        TO_CHAR(b.scadenza, 'YYYY-MM-DD') AS scadenza,
        b.note,
        CASE WHEN b.stato = 'valido' AND b.scadenza < CURRENT_DATE THEN 'scaduto' ELSE b.stato END AS stato_effettivo,
        b.creato_il
      FROM buoni b
      ORDER BY b.creato_il DESC
      LIMIT 10
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Errore interno.' });
  }
});

// ── POST /api/buoni/genera — manager + admin ─────────
router.post('/genera', requireAuth, requireRuolo('manager', 'admin'), async (req, res) => {
  const { valore, tipo, quantita, scadenza, note, azienda } = req.body;

  if (!valore || valore <= 0)        return res.status(400).json({ error: 'Valore non valido.' });
  if (!['%', '€'].includes(tipo))    return res.status(400).json({ error: 'Tipo non valido.' });
  if (!scadenza)                     return res.status(400).json({ error: 'Scadenza obbligatoria.' });
  if (!quantita || quantita < 1 || quantita > 500)
                                     return res.status(400).json({ error: 'Quantità tra 1 e 500.' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const buoniCreati = [];
    for (let i = 0; i < quantita; i++) {
      const codice = await codiceUnico(conn);
      await conn.query(...pg(
        'INSERT INTO buoni (codice, valore, tipo, scadenza, note, azienda, creato_da) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [codice, valore, tipo, scadenza, note || null, azienda || null, req.user.id]
      ));
      buoniCreati.push({ codice, valore, tipo, scadenza, note, azienda });
    }

    await conn.query(...pg(
      'INSERT INTO log_operazioni (utente_id, azione, dettaglio) VALUES (?, ?, ?)',
      [req.user.id, 'genera_buoni', `quantita: ${quantita}, valore: ${valore}${tipo}, scadenza: ${scadenza}`]
    ));

    await conn.commit();
    res.status(201).json({ buoni: buoniCreati, generati: buoniCreati.length });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Errore durante la generazione.' });
  } finally {
    conn.release();
  }
});

// ── GET /api/buoni/:codice — verifica singolo buono ──
router.get('/:codice', requireAuth, async (req, res) => {
  const codice = req.params.codice.toUpperCase().trim();
  try {
    const [rows] = await db.query(...pg(`
      SELECT
        b.id, b.codice, b.valore, b.tipo,
        TO_CHAR(b.scadenza, 'YYYY-MM-DD') AS scadenza,
        b.note, b.azienda, b.stato,
        CASE WHEN b.stato = 'valido' AND b.scadenza < CURRENT_DATE THEN 'scaduto' ELSE b.stato END AS stato_effettivo,
        b.creato_il, uc.username AS creato_da,
        b.usato_il,  uu.username AS usato_da
      FROM buoni b
      JOIN utenti uc ON b.creato_da = uc.id
      LEFT JOIN utenti uu ON b.usato_da = uu.id
      WHERE b.codice = ?
    `, [codice]));

    if (!rows.length) return res.status(404).json({ error: 'Buono non trovato.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Errore interno.' });
  }
});

// ── POST /api/buoni/:codice/devalida ─────────────────
router.post('/:codice/devalida', requireAuth, async (req, res) => {
  const codice = req.params.codice.toUpperCase().trim();
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // FOR UPDATE funziona uguale in PostgreSQL — nessuna race condition
    const [rows] = await conn.query(...pg(`
      SELECT id, stato, scadenza,
        CASE WHEN stato = 'valido' AND scadenza < CURRENT_DATE THEN 'scaduto' ELSE stato END AS stato_effettivo
      FROM buoni WHERE codice = ? FOR UPDATE
    `, [codice]));

    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Buono non trovato.' });
    }

    const buono = rows[0];

    if (buono.stato === 'usato') {
      await conn.rollback();
      return res.status(409).json({ error: 'Buono già utilizzato.' });
    }
    if (buono.stato_effettivo === 'scaduto') {
      await conn.rollback();
      return res.status(409).json({ error: 'Buono scaduto, non devalidabile.' });
    }

    await conn.query(...pg(
      "UPDATE buoni SET stato = ?, usato_il = NOW(), usato_da = ? WHERE codice = ?",
      ['usato', req.user.id, codice]
    ));

    await conn.query(...pg(
      'INSERT INTO log_operazioni (utente_id, azione, dettaglio, ip) VALUES (?, ?, ?, ?)',
      [req.user.id, 'devalida', `codice: ${codice}`, req.ip]
    ));

    await conn.commit();
    res.json({ messaggio: 'Buono devalidato con successo.', codice });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Errore interno.' });
  } finally {
    conn.release();
  }
});

// ── GET /api/buoni/export/csv — solo admin/manager ───
router.get('/export/csv', requireAuth, requireRuolo('admin', 'manager'), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        b.codice,
        b.valore || b.tipo                         AS sconto,
        b.note, b.azienda,
        TO_CHAR(b.creato_il, 'DD/MM/YYYY')         AS creato_il,
        TO_CHAR(b.scadenza,  'DD/MM/YYYY')         AS scadenza,
        CASE WHEN b.stato = 'valido' AND b.scadenza < CURRENT_DATE THEN 'scaduto' ELSE b.stato END AS stato,
        TO_CHAR(b.usato_il, 'DD/MM/YYYY HH24:MI')  AS usato_il,
        uu.username                                 AS usato_da
      FROM buoni b
      JOIN utenti uc ON b.creato_da = uc.id
      LEFT JOIN utenti uu ON b.usato_da = uu.id
      ORDER BY b.creato_il DESC
    `);

    const headers = ['Codice','Sconto','Note','Azienda','Creato il','Scadenza','Stato','Usato il','Usato da'];
    const csv = [
      headers.join(','),
      ...rows.map(r => [
        r.codice, r.sconto, `"${r.note||''}"`, `"${r.azienda||''}"`,
        r.creato_il, r.scadenza, r.stato,
        r.usato_il||'', r.usato_da||''
      ].join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="buoni_${new Date().toISOString().slice(0,10)}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (err) {
    res.status(500).json({ error: 'Errore interno.' });
  }
});

module.exports = router;
