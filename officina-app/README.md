# 🛠️ Officina App

Un'app per **imparare a creare app facendole**, non leggendo lezioni.
L'Officina non scrive mai il codice al posto tuo: ti dà un obiettivo, tu scrivi il codice, un verificatore automatico prova la tua app come farebbe un utente e ti dice cosa non va.

## Come avviarla sul tuo PC

1. Scarica questa cartella (`officina-app`) sul computer.
2. Fai **doppio clic su `index.html`**: si apre nel browser (Chrome, Edge o Firefox).

Non serve installare niente e funziona anche senza internet. I progressi vengono salvati nel browser.

## Il percorso

| # | Missione | Cosa impari |
|---|----------|-------------|
| 1 | 🪪 Biglietto da visita | HTML: tag, titoli, liste, link, immagini |
| 2 | 🎨 Dai stile al biglietto | CSS: colori, spazi, bordi, ombre, flexbox, :hover |
| 3 | 🧠 Pensare come un programma | JavaScript: variabili, funzioni, if, cicli, array, oggetti, filter/map |
| 4 | 🔢 Il contatore | DOM ed eventi: getElementById, addEventListener, classList |
| 5 | 🛒 Lista della spesa | Elementi dinamici, il modello "dati → disegna()", localStorage |
| 6 | 📇 La rubrica | Moduli, validazione, ordinamento, ricerca, id unici |
| 7 | ❓ Il quiz | Interfacce guidate dallo stato |
| 8 | 🌦️ Il meteo | fetch, async/await, JSON, errori con try/catch |
| 9 | 💻 Dal laboratorio al tuo PC | File HTML completo, VS Code, F12, GitHub Pages |
| 10 | 🎓 Progetto finale | Un'app che insegna, con verificatore automatico (come questa!) |

Poi le **sfide da zero** (solo requisiti, niente esempi): Timer Pomodoro, Gestore spese, Blocco note, Generatore di password.
E il **laboratorio libero** per le tue idee, con esportazione in un file `.html`.

## Come funziona dentro

- `assets/missioni.js`: tutte le missioni. Ogni passo ha un compito, un esempio (sempre su un caso *diverso*), suggerimenti progressivi e i controlli automatici.
- `assets/engine.js`: costruisce la tua pagina in un iframe e la mette alla prova (click, digitazione, ricaricamento…).
- `assets/app.js`: l'interfaccia (editor, anteprima, console, progressi).

Vuoi aggiungere una missione? Copia un oggetto in `missioni.js` e scrivi i tuoi controlli: è un ottimo esercizio dopo la missione 10.
