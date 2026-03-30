require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const authRoutes  = require('./routes/auth');
const buoniRoutes = require('./routes/buoni');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toLocaleTimeString('it-IT')}  ${req.method} ${req.path}`);
    next();
  });
}

// ── FRONTEND STATICO ──────────────────────────────────
// Compatibile sia con Node normale che con pkg (exe)
const publicPath = process.pkg
  ? path.join(path.dirname(process.execPath), 'public')
  : path.join(__dirname, '..', 'public');

app.use(express.static(publicPath));

// ── API ROUTES ────────────────────────────────────────
app.use('/api/auth',  authRoutes);
app.use('/api/buoni', buoniRoutes);

// ── HEALTH CHECK ──────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── CATCH-ALL: serve index.html per SPA ───────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// ── AVVIO ─────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ◈  QR Sconti Manager');
  console.log('  ─────────────────────────────────────────');
  console.log(`  🚀  Server avviato su http://localhost:${PORT}`);
  console.log(`  🌐  Rete locale:  http://<IP-DEL-SERVER>:${PORT}`);
  console.log('  ─────────────────────────────────────────');
  console.log('  Premi CTRL+C per fermare il server');
  console.log('');

  // Apre automaticamente il browser (solo su Windows con exe)
  if (process.pkg) {
    const { exec } = require('child_process');
    setTimeout(() => {
      exec(`start http://localhost:${PORT}`);
    }, 1000);
  }
});

process.on('unhandledRejection', (err) => {
  console.error('Errore non gestito:', err.message);
});
