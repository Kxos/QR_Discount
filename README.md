# QR Sconti Manager

Applicazione web per la **generazione e devalidazione di buoni sconto con QR code**, pensata per team distribuiti su più postazioni. Ogni operatore accede dal browser — nessuna installazione richiesta.

**Stack:** Node.js · Express · PostgreSQL (Supabase) · JWT

---

## Funzionalità

- Generazione di buoni sconto con QR code (valore fisso in € o percentuale)
- Devalidazione buoni tramite scansione QR o inserimento manuale del codice
- Protezione da race condition: nessun buono può essere usato due volte contemporaneamente
- Gestione utenti con tre ruoli: `operatore`, `manager`, `admin`
- Dashboard con statistiche in tempo reale
- Export CSV dell'archivio buoni
- Log completo di tutte le operazioni

---

## Architettura

```
Browser (qualsiasi PC)
      │
      ▼
Express server  ──►  Supabase (PostgreSQL cloud)
  + Frontend
  statico
```

Il backend serve anche il frontend statico — un unico servizio da deployare.

---

## Deploy in cloud (consigliato)

L'applicazione è predisposta per il deploy su **Render** (gratuito) con database **Supabase** (gratuito).

### 1. Crea il database su Supabase

1. Registrati su [supabase.com](https://supabase.com) → **New Project**
2. Vai su **SQL Editor → New Query**, incolla il contenuto di `database.sql` e clicca **Run**
3. Vai su **Connect → Session pooler** e copia la stringa URI

### 2. Deploy su Render

1. Registrati su [render.com](https://render.com) con il tuo account GitHub
2. **New → Web Service** → seleziona questo repository
3. Render rileva automaticamente `render.yaml` — non serve configurare nulla
4. Aggiungi le variabili d'ambiente (vedi sezione sotto)
5. Clicca **Create Web Service** — in 2-3 minuti l'app è online

### Variabili d'ambiente richieste

| Variabile | Descrizione |
|---|---|
| `DATABASE_URL` | Stringa di connessione Supabase (Session pooler, porta 5432) |
| `JWT_SECRET` | Stringa segreta per la firma dei token JWT (min. 32 caratteri) |
| `SESSION_SECRET` | Stringa segreta per le sessioni Express |
| `PORT` | Porta del server (default: `3000`) |

> ⚠️ Non committare mai il file `.env` nel repository. È già escluso da `.gitignore`.

---

## Esecuzione in locale

### Prerequisiti

- Node.js 18+
- Un progetto Supabase attivo con le tabelle create (vedi `database.sql`)

### Setup

```bash
# 1. Installa le dipendenze
npm install

# 2. Configura le variabili d'ambiente
cp .env.example .env
# Modifica .env con la tua stringa DATABASE_URL e i segreti JWT

# 3. Avvia il server
npm start        # produzione
npm run dev      # sviluppo con auto-reload
```

Apri il browser su `http://localhost:3000`

**Credenziali iniziali:** `admin` / `admin123` — cambia la password al primo accesso.

---

## Build come eseguibile Windows (.exe)

Per distribuire l'app come programma standalone su PC Windows (senza installare Node.js):

```bash
# Richiede Node.js solo sulla macchina che esegue la build
build.bat
```

Al termine trovi nella cartella `dist/`:

```
dist/
├── QRScontiManager.exe   # il programma
├── public/               # frontend (non spostare)
└── .env                  # configurare prima della distribuzione
```

Copia la cartella `dist/` su ogni PC — doppio clic sull'exe apre automaticamente il browser.

---

## Struttura del progetto

```
├── src/
│   ├── server.js           # Entry point Express
│   ├── db.js               # Pool PostgreSQL con wrapper compatibile mysql2
│   ├── auth.js             # Middleware JWT
│   └── routes/
│       ├── auth.js         # Login, gestione utenti
│       └── buoni.js        # Generazione, devalidazione, export CSV
├── public/
│   └── index.html          # Frontend SPA (vanilla JS)
├── database.sql            # Schema PostgreSQL per Supabase
├── render.yaml             # Configurazione deploy Render
├── build.bat               # Script build exe Windows (pkg)
├── .env.example            # Template variabili d'ambiente
└── package.json
```

---

## Ruoli utente

| Ruolo | Permessi |
|---|---|
| `operatore` | Verifica e devalida buoni |
| `manager` | Tutto quanto sopra + genera buoni + export CSV |
| `admin` | Tutto quanto sopra + gestione utenti |

---

## Note tecniche

- Il frontend usa `window.location.origin` come base URL per le API — funziona sia in locale che in cloud senza modifiche
- La devalidazione usa `SELECT ... FOR UPDATE` per prevenire utilizzi doppi in caso di accessi concorrenti
- I token JWT hanno durata di 12 ore
- Il driver `pg` è wrappato per mantenere la stessa interfaccia di `mysql2` (`[rows, fields]`) — le route non richiedono modifiche per cambiare database
