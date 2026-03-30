const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // richiesto da Supabase
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Compatibilità con l'API mysql2: pool.query() ritorna [rows, fields]
// In pg ritorna { rows, fields } — adattiamo il pool per non toccare le routes
const originalQuery = pool.query.bind(pool);

pool.query = async (...args) => {
  const result = await originalQuery(...args);
  return [result.rows, result.fields];
};

// getConnection() — usata nelle transazioni in buoni.js
pool.getConnection = async () => {
  const client = await pool.connect();

  // Stessa interfaccia di mysql2: conn.query(), beginTransaction(), commit(), rollback(), release()
  const conn = {
    query: async (...args) => {
      const result = await client.query(...args);
      return [result.rows, result.fields];
    },
    beginTransaction: () => client.query('BEGIN'),
    commit:           () => client.query('COMMIT'),
    rollback:         () => client.query('ROLLBACK'),
    release:          () => client.release(),
  };

  return conn;
};

// Test connessione all'avvio
pool.connect()
  .then(client => {
    console.log('✅ PostgreSQL (Supabase) connesso.');
    client.release();
  })
  .catch(err => {
    console.error('❌ Errore connessione PostgreSQL:', err.message);
    console.error('   Controlla DATABASE_URL nel file .env');
    process.exit(1);
  });

module.exports = pool;
