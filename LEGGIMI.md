# Agenda a Tre

Agenda di appuntamenti condivisa da tre persone, ognuna con il suo colore, con rubrica clienti
(nome, cognome, email, telefono) e collegamenti diretti a email e WhatsApp.

Il sito è fatto solo di file statici (`agenda/index.html`). I dati condivisi stanno su
**Firebase Firestore** (gratuito per questo uso). Senza Firebase l'agenda funziona in
modalità prova, con i dati salvati solo sul dispositivo.

## 1. Crea il database (una volta sola, circa 10 minuti)

1. Vai su <https://console.firebase.google.com> e crea un progetto (Google Analytics non serve).
2. Menu **Build → Firestore Database → Crea database**, scegli una sede europea
   (es. `eur3`) e la **modalità produzione**.
3. Scheda **Regole**: sostituisci tutto con il contenuto di `agenda/firestore.rules` e premi **Pubblica**.
4. **Impostazioni progetto** (ingranaggio) → **Le tue app** → icona `</>` (app web) → registra l'app.
   Copia l'oggetto `firebaseConfig` che compare.
5. Apri `agenda/firebase-config.js` e sostituisci `window.FIREBASE_CONFIG = null;`
   con `window.FIREBASE_CONFIG = { ...i valori copiati... };`.

## 2. Pubblica il sito con GitHub Pages

1. Su GitHub: **Settings → Pages → Build and deployment**.
2. Source: **Deploy from a branch**, branch `main`, cartella `/ (root)`, **Save**.
3. Dopo un minuto il sito è su `https://<utente>.github.io/<repository>/`.

## 3. Primo accesso

1. La prima persona apre il sito e sceglie **Crea nuova agenda**.
2. Sceglie il suo posto, scrive il nome e prende un colore.
3. Tocca il proprio nome in alto, copia il **link da inviare** e lo manda alle altre due
   (c'è anche il pulsante per inviarlo su WhatsApp).
4. Le altre due aprono il link, scelgono un posto libero, il nome e il colore.

Il link contiene il codice segreto dell'agenda: chi lo ha può leggerla e modificarla,
quindi condividilo solo con le persone giuste.
