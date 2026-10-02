# Rubrica Salone

Rubrica clienti per il negozio: sezioni (Estetica, Parrucchiere…), trattamenti con data, note
e pulsante diretto per WhatsApp. Si usa dal telefono come un'app e **chi aggiunge un cliente
lo fa comparire su tutti i dispositivi del negozio**. Funziona anche senza rete: le modifiche
partono appena la connessione torna.

L'app è fatta di due pezzi gratuiti:

- **GitHub Pages** la mette online a un indirizzo tipo `https://ne8mo.github.io/RUBBRICA-/`.
- **Firebase** (di Google) conserva i contatti e li sincronizza tra i telefoni.

La configurazione si fa una volta sola, in circa 15 minuti.

---

## 1. Crea il progetto Firebase

1. Vai su <https://console.firebase.google.com> ed entra con un account Google (va bene uno nuovo per il negozio).
2. **Crea un progetto** → nome per esempio `rubrica-salone` → Google Analytics si può disattivare → **Crea**.

## 2. Attiva l'accesso con email e password

1. Nel menu a sinistra: **Build → Authentication → Inizia**.
2. Scheda **Metodo di accesso** → **Email/password** → attiva il primo interruttore → **Salva**.
3. Scheda **Utenti** → **Aggiungi utente**: crea l'account del negozio, per esempio
   `salone@tuodominio.it` con una password robusta.
   Tutte le persone del negozio useranno questa email e questa password
   (oppure crea un utente per ciascuna, funziona uguale).

## 3. Crea il database

1. Menu a sinistra: **Build → Firestore Database → Crea database**.
2. Posizione: **eur3 (Europa)** → **Avanti** → scegli **Modalità di produzione** → **Crea**.
3. Apri la scheda **Regole**, cancella tutto e incolla il contenuto del file `firestore.rules`:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

   Poi **Pubblica**. Così i contatti li vede solo chi entra con l'account del negozio.

## 4. Collega l'app a Firebase

1. Ruota dentata in alto a sinistra → **Impostazioni progetto**.
2. In basso, **Le tue app** → icona **`</>`** (Web) → nome `Rubrica` → **Registra app**
   (non serve Firebase Hosting).
3. Firebase mostra un blocco `const firebaseConfig = { apiKey: "...", ... }`.
4. Apri il file `config.js` di questo progetto e sostituisci i valori `INSERISCI...` con i tuoi.
   Questi valori non sono segreti: la protezione la fanno la password e le regole del punto 3.

Se vuoi, incolla qui a Claude il blocco `firebaseConfig` e lo inserisce lui.

## 5. Metti l'app online con GitHub Pages

GitHub Pages gratis funziona con i repository **pubblici**. Nel codice non ci sono dati dei clienti
(stanno in Firebase, protetti da password), quindi rendere pubblico il repository è sicuro.

1. Su GitHub apri il repository → **Settings → General** → in fondo **Change visibility → Public**.
2. **Settings → Pages** → *Source*: **Deploy from a branch** → Branch **main**, cartella **/ (root)** → **Save**.
3. Dopo un paio di minuti l'app è su `https://ne8mo.github.io/RUBBRICA-/`.

Alternativa senza rendere pubblico il repository: <https://app.netlify.com/drop>, trascina la cartella
del progetto e Netlify ti dà un indirizzo.

## 6. Installala sui telefoni

Apri l'indirizzo e:

- **iPhone (Safari)**: tasto Condividi → **Aggiungi alla schermata Home**.
- **Android (Chrome)**: menu ⋮ → **Installa app** (o *Aggiungi a schermata Home*).

Al primo avvio entra con email e password del negozio. Il dispositivo resta collegato.

---

## Uso quotidiano

- **Nuovo**: aggiungi un cliente. Nome, cognome, telefono, sezione e note.
- **Trattamenti**: scrivi cosa ha fatto (per esempio "colore e piega") e la data, poi **Aggiungi**.
  L'ultimo trattamento si vede nell'elenco.
- **+ Sezioni**: aggiungi, rinomina o togli le sezioni. La prima volta crea *Estetica* e *Parrucchiere*.
- **WhatsApp**: apre la chat con il cliente. Se il numero non ha prefisso viene usato +39 (Italia);
  per i numeri esteri scrivi il prefisso, per esempio `+41 79 123 45 67`.
- **Scarica elenco (CSV)**: copia di sicurezza che si apre con Excel.

Senza la configurazione di Firebase l'app funziona lo stesso in **modalità prova**,
ma i contatti restano solo sul dispositivo che stai usando.

## File del progetto

| File | A cosa serve |
| --- | --- |
| `index.html` | L'app |
| `config.js` | Collegamento al tuo progetto Firebase |
| `firestore.rules` | Regole di sicurezza da incollare in Firebase |
| `manifest.webmanifest`, `icon*.png`, `icon.svg` | Nome e icona quando la installi sul telefono |
| `sw.js` | Permette di aprire l'app anche senza rete |
