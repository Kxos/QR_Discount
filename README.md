# QR Sconti Manager

Applicazione web per la **generazione e devalidazione di buoni sconto con QR code**, pensata per team distribuiti su più postazioni. Ogni operatore accede dal browser — nessuna installazione richiesta.

**Stack:** Node.js · Express · PostgreSQL (Supabase) · JWT

Servizio di **hosting**: Render.

Accessibile qui: https://qr-discount.onrender.com/

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

```

---

## Ruoli utente

| Ruolo | Permessi |
|---|---|
| `operatore` | Verifica e devalida buoni |
| `manager` | Tutto quanto sopra + genera buoni + export CSV |
| `admin` | Tutto quanto sopra + gestione utenti |

---