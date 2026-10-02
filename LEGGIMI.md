# Agenda a Tre

Agenda di appuntamenti condivisa da tre persone, ognuna con il suo colore, con rubrica clienti
(nome, cognome, email, telefono) e collegamenti diretti a email e WhatsApp.

Il sito è fatto solo di file statici (`agenda/index.html`). I dati condivisi stanno su
**Firebase Firestore** e l'accesso è protetto da **un nome utente e una password uguali per tutti e tre**
(Firebase Authentication), entrambi gratuiti per questo uso. Senza Firebase l'agenda funziona in
modalità prova: nessuna password e dati salvati solo sul dispositivo.

## Come è protetto l'accesso

- Si entra con un solo nome utente e una sola password, condivisi dalle tre persone.
- Dopo l'accesso ognuno sceglie chi è (nome e colore): il telefono o il computer se lo ricorda.
- Dal sito nessuno può creare altri accessi, e il database risponde solo a quello indicato in
  `agenda/firestore.rules`. Il controllo lo fa il server di Firebase, quindi non si aggira modificando la pagina.
- La password si cambia dal profilo (tocca il tuo nome in alto). Poi va comunicata agli altri due.

## 1. Crea il database e l'accesso (una volta sola, circa 15 minuti)

1. Vai su <https://console.firebase.google.com> e crea un progetto (Google Analytics non serve).
2. **Build → Firestore Database → Crea database**: sede europea (es. `eur3`), **modalità produzione**.
3. **Build → Authentication → Inizia → Email/password**: attiva solo la prima opzione e salva.
4. **Authentication → Utenti → Aggiungi utente**:
   - Email: `agenda@agenda-a-tre.app` (la parte prima della @ è il **nome utente**: qui `agenda`).
     Non è un indirizzo vero e non riceve posta: serve solo a Firebase.
   - Password: quella che userete in tre (almeno 6 caratteri).
5. **Authentication → Impostazioni → Azioni utente**: togli la spunta da **Abilita creazione (registrazione)**,
   così nessun altro può creare accessi.
6. Copia il contenuto di `agenda/firestore.rules` in **Firestore → Regole** e premi **Pubblica**.
   Se hai scelto un nome utente diverso da `agenda`, cambialo anche nelle regole.
7. **Impostazioni progetto** (ingranaggio) → **Le tue app** → icona `</>` (app web) → registra l'app
   e copia l'oggetto `firebaseConfig`.
8. Apri `agenda/firebase-config.js` e sostituisci `window.FIREBASE_CONFIG = null;`
   con `window.FIREBASE_CONFIG = { ...i valori copiati... };`.
   Questi valori non sono segreti: la protezione sta nella password e nelle regole.

## 2. Pubblica il sito con GitHub Pages

1. Su GitHub: **Settings → Pages → Build and deployment**.
2. Source: **Deploy from a branch**, branch `main`, cartella `/ (root)`, **Save**.
3. Dopo un minuto il sito è su `https://<utente>.github.io/<repository>/`.
4. In Firebase, **Authentication → Impostazioni → Domini autorizzati**: aggiungi `<utente>.github.io`.

## 3. Primo accesso di ogni persona

1. Apre il sito e inserisce nome utente e password.
2. Sceglie un posto libero, scrive il suo nome e prende un colore.

Per uscire, cambiare persona o cambiare la password, basta toccare il proprio nome in alto.
Se la password viene dimenticata, si reimposta da Firebase: **Authentication → Utenti → ⋮ → Reimposta password**
non funziona con un indirizzo finto, quindi elimina l'utente e ricrealo con la nuova password.
