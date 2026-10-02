# Agenda a Tre

Agenda di appuntamenti condivisa da tre persone, ognuna con il suo colore, con rubrica clienti
(nome, cognome, email, telefono) e collegamenti diretti a email e WhatsApp.

Il sito è fatto solo di file statici (`agenda/index.html`). I dati condivisi stanno su
**Firebase Firestore** e l'accesso è protetto da **email e password** (Firebase Authentication),
entrambi gratuiti per questo uso. Senza Firebase l'agenda funziona in modalità prova:
nessuna password e dati salvati solo sul dispositivo.

## Come è protetto l'accesso

- Si entra solo con email e password. Dal sito nessuno può registrarsi da solo: gli account li crei tu.
- Anche con un account valido, il database risponde solo alle tre email scritte in `agenda/firestore.rules`.
  Il controllo lo fa il server di Firebase, quindi non si aggira modificando la pagina.
- Ognuno sceglie la propria password con il link "Password dimenticata?" e può cambiarla dal suo profilo.

## 1. Crea il database e gli account (una volta sola, circa 15 minuti)

1. Vai su <https://console.firebase.google.com> e crea un progetto (Google Analytics non serve).
2. **Build → Firestore Database → Crea database**: sede europea (es. `eur3`), **modalità produzione**.
3. **Build → Authentication → Inizia → Email/password**: attiva solo la prima opzione e salva.
4. **Authentication → Utenti → Aggiungi utente**: crea i tre account con le loro email
   e una password provvisoria qualsiasi.
5. **Authentication → Impostazioni → Azioni utente**: togli la spunta da **Abilita creazione (registrazione)**,
   così nessun altro può creare account.
6. Apri `agenda/firestore.rules`, sostituisci le tre email di esempio con quelle vere,
   poi copia tutto in **Firestore → Regole** e premi **Pubblica**.
7. **Impostazioni progetto** (ingranaggio) → **Le tue app** → icona `</>` (app web) → registra l'app
   e copia l'oggetto `firebaseConfig`.
8. Apri `agenda/firebase-config.js` e sostituisci `window.FIREBASE_CONFIG = null;`
   con `window.FIREBASE_CONFIG = { ...i valori copiati... };`.
   Questi valori non sono segreti: la protezione sta nelle password e nelle regole.

## 2. Pubblica il sito con GitHub Pages

1. Su GitHub: **Settings → Pages → Build and deployment**.
2. Source: **Deploy from a branch**, branch `main`, cartella `/ (root)`, **Save**.
3. Dopo un minuto il sito è su `https://<utente>.github.io/<repository>/`.
4. In Firebase, **Authentication → Impostazioni → Domini autorizzati**: aggiungi `<utente>.github.io`.

## 3. Primo accesso di ogni persona

1. Apre il sito, scrive la sua email e tocca **Password dimenticata?**.
2. Riceve un'email con il link per scegliere la propria password.
3. Entra con email e password, sceglie un posto libero, scrive il nome e prende un colore.

Per uscire, o per cambiare la password, basta toccare il proprio nome in alto.
