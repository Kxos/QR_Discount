# QR Sconti Manager — Supabase Edition

Backend Node.js + Express con database **PostgreSQL gratuito su Supabase**.

---

## Setup in 5 passi

### 1. Crea il database su Supabase (gratis, per sempre)

1. Vai su [supabase.com](https://supabase.com) e crea un account
2. Clicca **New Project**, scegli un nome e una password per il DB
3. Aspetta ~2 minuti che il progetto venga creato

### 2. Crea le tabelle

1. Nel pannello Supabase, vai su **SQL Editor → New Query**
2. Copia e incolla tutto il contenuto di `database.sql`
3. Clicca **Run**

### 3. Configura le credenziali

1. In Supabase vai su **Settings → Database → Connection string → URI**
2. Copia la stringa (contiene già host, porta, utente)
3. Crea il file `.env` copiando `.env.example`:
   ```
   cp .env.example .env
   ```
4. Incolla la stringa in `DATABASE_URL` e sostituisci `[YOUR-PASSWORD]` con la password scelta al passo 1

### 4. Installa le dipendenze

```bash
npm install
```

> ⚠️ Se hai la vecchia versione con MySQL, il pacchetto `mysql2` è stato sostituito con `pg`.
> `npm install` si occupa di tutto automaticamente.

### 5. Avvia il server

```bash
npm start        # produzione
npm run dev      # sviluppo (auto-reload)
```

Apri il browser su `http://localhost:3000`

**Credenziali iniziali:** `admin` / `admin123` — cambia la password subito!

---

## Differenze rispetto alla versione MySQL

| Aspetto | Prima (MySQL) | Ora (Supabase/PostgreSQL) |
|---|---|---|
| Driver | `mysql2` | `pg` |
| Placeholder query | `?` | `$1, $2, ...` (gestito automaticamente dal wrapper in `db.js`) |
| CURDATE() | `CURDATE()` | `CURRENT_DATE` |
| LIKE case-insensitive | `LIKE` | `ILIKE` |
| Formattazione date | `DATE_FORMAT(...)` | `TO_CHAR(...)` |
| Concatenazione | `CONCAT(a, b)` | `a \|\| b` |
| Boolean | `TINYINT(1)` | `BOOLEAN` |
| Auto increment | `AUTO_INCREMENT` | `SERIAL` |
| Errore duplicato | `ER_DUP_ENTRY` | codice `23505` |

Il file `src/db.js` include un wrapper che rende trasparenti la maggior parte di queste differenze.

---

## Struttura del progetto

```
qr-sconti-backend/
├── src/
│   ├── server.js          # Entry point Express
│   ├── db.js              # Connessione PostgreSQL (pool + wrapper mysql2-compatibile)
│   ├── auth.js            # JWT middleware
│   └── routes/
│       ├── auth.js        # Login, gestione utenti
│       └── buoni.js       # CRUD buoni, genera, devalida, export CSV
├── public/
│   └── index.html         # Frontend SPA
├── database.sql           # Schema PostgreSQL — incollare in Supabase SQL Editor
├── .env.example           # Template variabili ambiente
└── package.json
```
