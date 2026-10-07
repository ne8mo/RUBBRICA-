// missioni.js — il percorso. Ogni passo ha un obiettivo, dei suggerimenti e dei controlli automatici.
// Regola dell'Officina: gli esempi parlano SEMPRE di un caso diverso da quello che devi costruire.

const num = (s) => { const m = String(s).replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
const lower = (s) => String(s || '').toLowerCase();

// Server meteo finto usato nella missione 8 (così funziona anche senza internet).
const METEO_SETUP = `
(function(){
  var DATI = {
    roma: { citta: 'Roma', temperatura: 24, condizione: 'soleggiato' },
    milano: { citta: 'Milano', temperatura: 18, condizione: 'nuvoloso' },
    napoli: { citta: 'Napoli', temperatura: 26, condizione: 'sereno' },
    torino: { citta: 'Torino', temperatura: 15, condizione: 'pioggia' },
    palermo: { citta: 'Palermo', temperatura: 29, condizione: 'sereno' },
    firenze: { citta: 'Firenze', temperatura: 21, condizione: 'variabile' },
    bari: { citta: 'Bari', temperatura: 25, condizione: 'ventoso' }
  };
  var vero = window.fetch;
  window.fetch = function (url, opzioni) {
    var u;
    try { u = new URL(String(url)); } catch (e) { return Promise.reject(new TypeError('Indirizzo non valido: ' + url)); }
    if (u.hostname !== 'api.esempio.it') return vero ? vero(url, opzioni) : Promise.reject(new TypeError('Failed to fetch'));
    return new Promise(function (ok) {
      setTimeout(function () {
        var c = (u.searchParams.get('citta') || '').trim().toLowerCase();
        var d = u.pathname === '/meteo' ? DATI[c] : null;
        var corpo = d ? d : { errore: 'Città non trovata' };
        ok(new Response(JSON.stringify(corpo), { status: d ? 200 : 404, headers: { 'Content-Type': 'application/json' } }));
      }, 300);
    });
  };
})();`;

const METODO = `
<div class="metodo">
  <strong>🧭 Il metodo per costruire qualsiasi app</strong>
  <ol>
    <li>Scrivi in italiano, a frasi semplici, cosa deve fare l'app.</li>
    <li>HTML: metti nella pagina tutti gli elementi che servono, con un <code>id</code>.</li>
    <li>Dati: decidi come rappresentarli (un array di oggetti?).</li>
    <li>Una funzione <code>disegna()</code> che mostra i dati nella pagina.</li>
    <li>Eventi: cosa succede quando l'utente clicca/scrive? Cambia i dati, poi <code>disegna()</code>.</li>
    <li>Salvataggio con <code>localStorage</code>, se serve.</li>
    <li>Stile con il CSS, per ultimo.</li>
  </ol>
  <p>Una cosa alla volta, e controlla l'anteprima a ogni passo.</p>
</div>`;

const MISSIONI = [
  // ───────────────────────────── 1. HTML
  {
    id: 'm01', group: 'guidata', emoji: '🪪', title: 'Il tuo biglietto da visita',
    intro: 'Costruisci la tua prima pagina web: un biglietto da visita su di te. Impari i mattoni dell\'HTML.',
    tabs: ['html'], start: { html: '<!-- Scrivi qui il tuo HTML -->\n', css: '', js: '' },
    skills: ['Scrivere tag HTML con apertura e chiusura', 'Titoli, paragrafi, liste, link e immagini', 'Raggruppare elementi con <div> e class'],
    steps: [
      {
        title: 'Un titolo con il tuo nome',
        task: `<p>L'HTML è fatto di <strong>tag</strong>: <code>&lt;nome&gt;</code> apre, <code>&lt;/nome&gt;</code> chiude, e in mezzo c'è il contenuto.</p>
               <p>Scrivi un titolo principale <code>&lt;h1&gt;</code> che contenga il tuo nome.</p>`,
        example: '<h1>Pizzeria da Gino</h1>',
        hints: ['Il tag del titolo principale si chiama h1.', 'Struttura: <h1>…il tuo nome…</h1> — non dimenticare la barra / nel tag di chiusura.'],
        checks: [{ t: 'C\'è un <h1> con del testo', f: (c) => {
          const h = c.$('h1');
          need(h, 'Non vedo nessun <h1> nella pagina.');
          need(c.text(h).length >= 2, 'Il tuo <h1> è vuoto: scrivi il tuo nome tra <h1> e </h1>.');
        } }]
      },
      {
        title: 'Un paragrafo su di te',
        task: `<p>Sotto il titolo aggiungi un paragrafo <code>&lt;p&gt;</code> con una frase che ti descrive (almeno 15 caratteri).</p>`,
        example: '<p>Dal 1985 facciamo la pizza con il forno a legna.</p>',
        hints: ['Il paragrafo usa il tag p.', 'Scrivilo su una nuova riga, dopo la riga dell\'h1.'],
        checks: [{ t: 'C\'è un <p> con una frase', f: (c) => {
          const ps = c.$$('p');
          need(ps.length, 'Manca il paragrafo <p>.');
          need(ps.some((p) => c.text(p).length >= 15), 'Il paragrafo è troppo corto: scrivi almeno 15 caratteri.');
        } }]
      },
      {
        title: 'Un sottotitolo e una lista',
        task: `<p>Aggiungi un sottotitolo <code>&lt;h2&gt;</code> (per esempio "I miei hobby") e sotto una lista puntata <code>&lt;ul&gt;</code> con <strong>almeno 3</strong> voci <code>&lt;li&gt;</code>.</p>
               <p>Nota: i <code>&lt;li&gt;</code> stanno <em>dentro</em> l'<code>&lt;ul&gt;</code>.</p>`,
        example: '<h2>Ingredienti</h2>\n<ul>\n  <li>Farina</li>\n  <li>Acqua</li>\n</ul>',
        hints: ['ul = lista non ordinata (puntata), li = elemento della lista.', 'Apri <ul>, metti dentro tre righe <li>…</li>, poi chiudi </ul>.'],
        checks: [
          { t: 'C\'è un <h2>', f: (c) => need(c.text('h2'), 'Manca il sottotitolo <h2> (o è vuoto).') },
          { t: 'C\'è una <ul> con almeno 3 <li>', f: (c) => {
            const ul = c.$('ul');
            need(ul, 'Manca la lista <ul>.');
            const n = ul.querySelectorAll('li').length;
            need(n >= 3, `Nella lista ci sono ${n} voci <li>, ne servono almeno 3.`);
          } }
        ]
      },
      {
        title: 'Un link',
        task: `<p>Aggiungi un link <code>&lt;a&gt;</code> a un sito che ti piace. L'indirizzo va nell'<strong>attributo</strong> <code>href</code> e deve iniziare con <code>https://</code>. Tra apertura e chiusura metti il testo cliccabile.</p>`,
        example: '<a href="https://www.wikipedia.org">Vai a Wikipedia</a>',
        hints: ['Gli attributi si scrivono dentro il tag di apertura: <a href="…">.', 'Controlla di avere le virgolette attorno all\'indirizzo.'],
        checks: [{ t: 'C\'è un link <a href="https://…"> con testo', f: (c) => {
          const a = c.$('a[href]');
          need(a, 'Manca un <a> con l\'attributo href.');
          need(/^https?:\/\//.test(a.getAttribute('href')), 'L\'indirizzo in href deve iniziare con https://');
          need(c.text(a), 'Il link non ha testo: scrivi qualcosa tra <a …> e </a>.');
        } }]
      },
      {
        title: 'Un\'immagine',
        task: `<p>Aggiungi un'immagine con <code>&lt;img&gt;</code>. Ha due attributi: <code>src</code> (l'indirizzo dell'immagine) e <code>alt</code> (una descrizione, per chi non vede l'immagine).</p>
               <p><code>&lt;img&gt;</code> non ha il tag di chiusura. Puoi usare l'indirizzo <code>https://picsum.photos/150</code> (immagine casuale; senza internet vedrai solo il testo alt).</p>`,
        example: '<img src="https://esempio.it/forno.jpg" alt="Il nostro forno a legna">',
        hints: ['Due attributi nello stesso tag, separati da uno spazio.', '<img src="___" alt="___">'],
        checks: [{ t: 'C\'è un <img> con src e alt', f: (c) => {
          const img = c.$('img');
          need(img, 'Manca il tag <img>.');
          need((img.getAttribute('src') || '').trim(), 'L\'immagine non ha l\'attributo src.');
          need((img.getAttribute('alt') || '').trim(), 'L\'immagine non ha l\'attributo alt (una breve descrizione).');
        } }]
      },
      {
        title: 'Metti tutto in una scatola',
        task: `<p>Racchiudi <strong>tutto</strong> quello che hai scritto in un <code>&lt;div class="card"&gt;</code> … <code>&lt;/div&gt;</code>.</p>
               <p>Il <code>div</code> è una scatola invisibile; la <code>class</code> è un'etichetta che useremo nella prossima missione per darle uno stile.</p>`,
        example: '<div class="menu">\n  <h2>Pizze</h2>\n  <p>…</p>\n</div>',
        hints: ['Scrivi <div class="card"> nella prima riga e </div> nell\'ultima.', 'Per ordine, rientra con due spazi le righe dentro il div.'],
        checks: [{ t: 'Titolo, lista e immagine stanno dentro .card', f: (c) => {
          const card = c.$('.card');
          need(card, 'Non trovo un elemento con class="card".');
          for (const s of ['h1', 'p', 'ul', 'img']) need(card.querySelector(s), `Il <${s}> deve stare DENTRO il <div class="card">.`);
        } }]
      }
    ]
  },

  // ───────────────────────────── 2. CSS
  {
    id: 'm02', group: 'guidata', emoji: '🎨', title: 'Dai stile al biglietto',
    intro: 'Riprendi il tuo biglietto e rendilo bello con il CSS: colori, spazi, bordi, ombre, layout.',
    tabs: ['html', 'css'], startFrom: 'm01', start: { html: '<div class="card">\n  <h1>Il tuo nome</h1>\n  <p>Una frase su di te, bella lunga.</p>\n  <h2>I miei hobby</h2>\n  <ul>\n    <li>Uno</li>\n    <li>Due</li>\n    <li>Tre</li>\n  </ul>\n  <a href="https://www.wikipedia.org">Un link</a>\n  <img src="https://picsum.photos/150" alt="Una foto">\n</div>\n', css: '/* Scrivi qui il tuo CSS */\n', js: '' },
    skills: ['Selettori (tag, .class) e proprietà CSS', 'Colori, padding, margin, bordi arrotondati, ombre', 'Centrare e mettere in fila gli elementi con flexbox', 'Stati come :hover'],
    steps: [
      {
        title: 'Colora lo sfondo della pagina',
        task: `<p>Apri la scheda <strong>CSS</strong>. Una regola CSS è: <em>selettore</em> <code>{ proprietà: valore; }</code>.</p>
               <p>Cambia il colore di sfondo di tutta la pagina (il selettore è <code>body</code>, la proprietà <code>background-color</code>). Non bianco!</p>`,
        example: 'footer {\n  background-color: #2d3436;\n}',
        hints: ['Selettore body, proprietà background-color.', 'I colori si scrivono come nome (lightblue) o codice esadecimale (#e0f2fe).'],
        checks: [{ t: 'Il body ha uno sfondo colorato', f: (c) => {
          const bg = c.style('body', 'backgroundColor');
          need(bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)', 'Lo sfondo del body è ancora bianco o trasparente.');
        } }]
      },
      {
        title: 'Colore e font del titolo',
        task: `<p>Dai al titolo <code>h1</code> un colore del testo (<code>color</code>) diverso dal nero e cambia il carattere con <code>font-family</code>.</p>`,
        example: 'h2 {\n  color: darkred;\n  font-family: Georgia, serif;\n}',
        hints: ['Puoi mettere più proprietà nella stessa regola, una per riga, ognuna con il ; finale.', 'Font sicuri da provare: Arial, Verdana, Georgia, "Trebuchet MS", sans-serif.'],
        checks: [
          { t: 'L\'h1 non è nero', f: (c) => need(c.style('h1', 'color') !== 'rgb(0, 0, 0)', 'Il titolo h1 è ancora nero: usa la proprietà color.') },
          { t: 'Hai usato font-family', f: (c) => need(/font-family\s*:/.test(c.src.css), 'Non vedo nessuna proprietà font-family nel CSS.') }
        ]
      },
      {
        title: 'Trasforma il div in una carta',
        task: `<p>Per selezionare una <strong>class</strong> si usa il punto: <code>.card</code>. Dai alla carta:</p>
               <ul><li>uno sfondo diverso da quello della pagina</li><li><code>padding</code> di almeno 16px (spazio interno)</li><li><code>border-radius</code> di almeno 8px (angoli arrotondati)</li></ul>`,
        example: '.bottone {\n  background-color: white;\n  padding: 10px;\n  border-radius: 4px;\n}',
        hints: ['Il selettore inizia con un punto perché "card" è una class: .card { … }', 'Le misure vogliono l\'unità attaccata: 20px, non 20 px.'],
        checks: [
          { t: 'La carta ha uno sfondo suo', f: (c) => {
            const bg = c.style('.card', 'backgroundColor');
            need(bg !== 'rgba(0, 0, 0, 0)', 'La .card non ha uno sfondo: usa background-color.');
            need(bg !== c.style('body', 'backgroundColor'), 'La .card ha lo stesso colore della pagina: scegline uno diverso.');
          } },
          { t: 'padding ≥ 16px', f: (c) => need(parseFloat(c.style('.card', 'paddingTop')) >= 16, 'La .card ha meno di 16px di padding.') },
          { t: 'border-radius ≥ 8px', f: (c) => need(parseFloat(c.style('.card', 'borderTopLeftRadius')) >= 8, 'Gli angoli della .card non sono arrotondati (border-radius ≥ 8px).') }
        ]
      },
      {
        title: 'Larghezza e centratura',
        task: `<p>Limita la carta a una larghezza massima di <strong>400px</strong> (<code>max-width</code>) e centrala orizzontalmente nella pagina.</p>
               <p>Trucco classico: <code>margin</code> con i lati sinistro e destro su <code>auto</code>.</p>`,
        example: '.foto {\n  max-width: 300px;\n  margin: 20px auto;\n}',
        hints: ['margin: 40px auto; significa 40px sopra e sotto, auto a destra e sinistra.', 'auto a destra e sinistra divide lo spazio libero a metà: ecco perché centra.'],
        checks: [{ t: 'Carta larga al massimo 400px e centrata', f: (c) => {
          const r = c.el('.card').getBoundingClientRect();
          const extra = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce((t, p) => t + parseFloat(c.style('.card', p)), 0);
          need(r.width - extra <= 405, `La carta è larga ${Math.round(r.width)}px: usa max-width: 400px.`);
          const centro = (r.left + r.right) / 2, pagina = c.doc.documentElement.clientWidth / 2;
          need(Math.abs(centro - pagina) < 20, 'La carta non è centrata: prova margin: 0 auto;');
        } }]
      },
      {
        title: 'Un\'ombra',
        task: `<p>Aggiungi un'ombra alla carta con <code>box-shadow</code>. I valori sono: spostamento orizzontale, verticale, sfocatura, colore.</p>`,
        example: '.popup {\n  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);\n}',
        hints: ['rgba(0,0,0,0.2) è un nero trasparente al 20%: perfetto per le ombre.'],
        checks: [{ t: 'La carta ha un\'ombra', f: (c) => need(c.style('.card', 'boxShadow') !== 'none', 'La .card non ha box-shadow.') }]
      },
      {
        title: 'Hobby in fila con flexbox',
        task: `<p>Metti le voci della lista una accanto all'altra: sulla <code>ul</code> usa <code>display: flex</code> e uno spazio tra gli elementi con <code>gap</code>. Togli anche i pallini con <code>list-style: none</code>.</p>`,
        example: 'nav {\n  display: flex;\n  gap: 12px;\n}',
        hints: ['Selettore ul. Tre proprietà: display, gap, list-style.', 'Dopo, prova a dare ai li un background e un border-radius: diventano "pillole".'],
        checks: [
          { t: 'La lista usa display: flex', f: (c) => need(c.style('ul', 'display') === 'flex', 'La ul non ha display: flex.') },
          { t: 'C\'è un gap', f: (c) => need(parseFloat(c.style('ul', 'columnGap')) > 0, 'Manca gap sulla ul.') },
          { t: 'Niente pallini', f: (c) => need(c.style('li', 'listStyleType') === 'none', 'I pallini ci sono ancora: list-style: none;') }
        ]
      },
      {
        title: 'Reagisci al mouse',
        task: `<p>Fai cambiare stile al link quando ci passi sopra con il mouse, usando lo stato <code>:hover</code> (es. <code>a:hover</code>).</p>`,
        example: 'button:hover {\n  background-color: orange;\n}',
        hints: ['Lo stato si attacca al selettore senza spazi: a:hover.'],
        checks: [{ t: 'C\'è una regola :hover', f: (c) => need(/:hover\s*[{,]/.test(c.src.css), 'Non vedo nessuna regola con :hover nel CSS.') }]
      }
    ]
  },

  // ───────────────────────────── 3. JavaScript di base
  {
    id: 'm03', group: 'guidata', emoji: '🧠', title: 'Pensare come un programma',
    intro: 'Il JavaScript è il cervello delle app. Qui alleni le basi (variabili, funzioni, condizioni, cicli, array, oggetti) guardando la console.',
    tabs: ['js'], start: { html: '', css: '', js: '// Scrivi qui il tuo JavaScript.\n// I messaggi di console.log compaiono nella Console, in basso a destra.\n' },
    skills: ['Variabili con const e let', 'Funzioni con parametri e return', 'if / else if / else', 'Cicli for', 'Array e oggetti', 'filter e map'],
    steps: [
      {
        title: 'Parla in console',
        task: `<p>Scrivi un messaggio nella console con <code>console.log(...)</code>. Il testo va tra virgolette.</p>`,
        example: 'console.log("Buongiorno!");',
        hints: ['Guarda il riquadro Console in basso a destra dopo aver scritto.'],
        checks: [{ t: 'Qualcosa compare in console', f: (c) => need(c.logs.length > 0, 'Non vedo messaggi in console.') }]
      },
      {
        title: 'Variabili',
        task: `<p>Crea una variabile <code>nome</code> con il tuo nome (testo, tra virgolette) e una variabile <code>eta</code> con la tua età (numero, <strong>senza</strong> virgolette).</p>
               <p>Poi stampa in console una frase che le contenga entrambe usando un <strong>template literal</strong>: testo tra apici inversi <code>\`</code> con le variabili dentro <code>\${...}</code>.</p>`,
        example: 'const citta = "Bari";\nconst abitanti = 316000;\nconsole.log(`${citta} ha ${abitanti} abitanti`);',
        hints: ['const = valore che non cambierà. Va bene per entrambe.', 'L\'apice inverso ` su tastiera italiana: Alt+96 (Windows) o Alt+9 (Mac).'],
        checks: [
          { t: 'nome è un testo', f: (c) => need(typeof c.get('nome') === 'string' && c.get('nome').trim(), 'Crea const nome = "…" con del testo.') },
          { t: 'eta è un numero', f: (c) => need(typeof c.get('eta') === 'number', 'eta deve essere un numero, senza virgolette.') },
          { t: 'La frase in console contiene nome ed età', f: (c) => {
            const n = c.get('nome'), e = c.get('eta');
            need(c.logs.some((l) => l.includes(n) && l.includes(String(e))), 'Nessun messaggio in console contiene sia il nome che l\'età.');
            need(/`[^`]*\$\{/.test(c.src.js), 'Usa un template literal: `… ${nome} …`');
          } }
        ]
      },
      {
        title: 'La prima funzione',
        task: `<p>Una funzione è un pezzo di codice riutilizzabile: riceve dei valori (<em>parametri</em>) e restituisce un risultato con <code>return</code>.</p>
               <p>Scrivi la funzione <code>saluta(persona)</code> che restituisce il testo <code>"Ciao, NOME!"</code>. Esempio: <code>saluta("Luca")</code> → <code>"Ciao, Luca!"</code>.</p>`,
        example: 'function raddoppia(n) {\n  return n * 2;\n}\nconsole.log(raddoppia(4)); // 8',
        hints: ['return restituisce il valore, non lo stampa.', 'Attento a virgola, spazio e punto esclamativo: "Ciao, " + persona + "!"'],
        checks: [{ t: 'saluta("Luca") → "Ciao, Luca!"', f: (c) => {
          const f = c.fn('saluta');
          eq(f('Luca'), 'Ciao, Luca!', 'saluta("Luca")');
          eq(f('Anna'), 'Ciao, Anna!', 'saluta("Anna")');
        } }]
      },
      {
        title: 'Prendere decisioni',
        task: `<p>Scrivi <code>esito(voto)</code> che restituisce:</p>
               <ul><li><code>"Promosso"</code> se il voto è 6 o più</li><li><code>"Rimandato"</code> se è esattamente 5</li><li><code>"Bocciato"</code> altrimenti</li></ul>`,
        example: 'function biglietto(eta) {\n  if (eta < 6) {\n    return "Gratis";\n  } else if (eta >= 65) {\n    return "Ridotto";\n  } else {\n    return "Intero";\n  }\n}',
        hints: ['Operatori: >= maggiore o uguale, === uguale, < minore.', 'L\'ordine dei controlli conta: controlla prima >= 6, poi === 5.'],
        checks: [{ t: 'esito funziona con 8, 6, 5 e 3', f: (c) => {
          const f = c.fn('esito');
          eq(f(8), 'Promosso', 'esito(8)'); eq(f(6), 'Promosso', 'esito(6)');
          eq(f(5), 'Rimandato', 'esito(5)'); eq(f(3), 'Bocciato', 'esito(3)');
        } }]
      },
      {
        title: 'Cicli e array',
        task: `<p>Un <strong>array</strong> è una lista: <code>[4, 8, 15]</code>. Con un ciclo <code>for</code> lo puoi scorrere.</p>
               <p>Scrivi <code>somma(numeri)</code> che riceve un array di numeri e restituisce la loro somma. Usa un ciclo <code>for</code>. Con un array vuoto deve restituire 0.</p>`,
        example: 'function contaPari(lista) {\n  let conta = 0;\n  for (let i = 0; i < lista.length; i++) {\n    if (lista[i] % 2 === 0) conta++;\n  }\n  return conta;\n}',
        hints: ['Ti serve una variabile che parte da 0 e cresce: usa let, perché cambia.', 'Dentro il ciclo: totale = totale + numeri[i];'],
        checks: [{ t: 'somma funziona e usa un for', f: (c) => {
          const f = c.fn('somma');
          eq(f([1, 2, 3]), 6, 'somma([1, 2, 3])'); eq(f([10, -4]), 6, 'somma([10, -4])'); eq(f([]), 0, 'somma([])');
          need(/\bfor\s*\(/.test(c.src.js), 'Risultato giusto, ma per allenarti usa un ciclo for.');
        } }]
      },
      {
        title: 'Oggetti',
        task: `<p>Un <strong>oggetto</strong> raggruppa dati con un nome: <code>{ chiave: valore }</code>.</p>
               <p>1) Crea <code>persona</code> con le proprietà <code>nome</code>, <code>eta</code>, <code>citta</code>.<br>
               2) Scrivi <code>presenta(p)</code> che restituisce <code>"NOME ha ETA anni e vive a CITTA"</code>. Esempio: <code>presenta({nome:"Anna", eta:30, citta:"Bari"})</code> → <code>"Anna ha 30 anni e vive a Bari"</code>.</p>`,
        example: 'const libro = { titolo: "Pinocchio", pagine: 240 };\nfunction descrivi(l) {\n  return `${l.titolo}: ${l.pagine} pagine`;\n}',
        hints: ['Alle proprietà si accede col punto: p.nome, p.eta…', 'Il parametro si chiama p: dentro la funzione usa p, non persona.'],
        checks: [
          { t: 'persona ha nome, eta e citta', f: (c) => {
            const p = c.get('persona');
            need(p && typeof p === 'object', 'Non trovo l\'oggetto persona.');
            for (const k of ['nome', 'eta', 'citta']) need(k in p, `A persona manca la proprietà ${k}.`);
          } },
          { t: 'presenta funziona', f: (c) => eq(c.fn('presenta')({ nome: 'Anna', eta: 30, citta: 'Bari' }), 'Anna ha 30 anni e vive a Bari', 'presenta({nome:"Anna", eta:30, citta:"Bari"})') }
        ]
      },
      {
        title: 'Filtrare e trasformare liste',
        task: `<p>Nelle app vere i dati sono quasi sempre <strong>array di oggetti</strong>. Due metodi indispensabili:</p>
               <ul><li><code>lista.filter(x =&gt; condizione)</code> tiene solo gli elementi che rispettano la condizione;</li><li><code>lista.map(x =&gt; nuovoValore)</code> trasforma ogni elemento.</li></ul>
               <p>Scrivi <code>maggiorenni(persone)</code> che restituisce solo le persone con <code>eta</code> ≥ 18, e <code>soloNomi(persone)</code> che restituisce l'array dei soli nomi.</p>`,
        example: 'const prodotti = [{ nome: "Pane", prezzo: 2 }, { nome: "Vino", prezzo: 9 }];\nconst economici = prodotti.filter(p => p.prezzo < 5);\nconst prezzi = prodotti.map(p => p.prezzo); // [2, 9]',
        hints: ['filter e map restituiscono un NUOVO array: mettilo nel return.', 'return persone.filter(p => p.eta ___ 18);'],
        checks: [
          { t: 'maggiorenni funziona', f: (c) => {
            const gente = [{ nome: 'Ada', eta: 17 }, { nome: 'Bea', eta: 18 }, { nome: 'Ciro', eta: 40 }];
            const r = c.fn('maggiorenni')(gente);
            need(Array.isArray(r), 'maggiorenni deve restituire un array.');
            eq(r.map((p) => p.nome), ['Bea', 'Ciro'], 'maggiorenni(...) (nomi del risultato)');
          } },
          { t: 'soloNomi funziona', f: (c) => eq(c.fn('soloNomi')([{ nome: 'Ada', eta: 17 }, { nome: 'Bea', eta: 18 }]), ['Ada', 'Bea'], 'soloNomi(...)') }
        ]
      }
    ]
  },

  // ───────────────────────────── 4. DOM ed eventi
  {
    id: 'm04', group: 'guidata', emoji: '🔢', title: 'Il contatore',
    intro: 'La tua prima vera app interattiva: HTML, CSS e JavaScript insieme. Il JS legge e cambia la pagina quando l\'utente clicca.',
    tabs: ['html', 'css', 'js'], start: { html: '', css: '', js: '' },
    skills: ['Prendere elementi con getElementById', 'Reagire ai click con addEventListener', 'Cambiare il testo con textContent', 'Tenere lo "stato" in una variabile', 'Aggiungere/togliere classi CSS con classList'],
    steps: [
      {
        title: 'L\'HTML del contatore',
        task: `<p>Nella scheda HTML crea:</p><ul><li>un <code>&lt;h1 id="numero"&gt;</code> che mostra <code>0</code></li><li>un <code>&lt;button id="piu"&gt;</code> con scritto <code>+1</code></li></ul>
               <p>L'<code>id</code> è un nome unico che permette al JavaScript di trovare l'elemento.</p>`,
        example: '<p id="messaggio">Benvenuto</p>\n<button id="chiudi">Chiudi</button>',
        hints: ['Due righe di HTML. L\'id va dentro il tag di apertura.'],
        checks: [
          { t: '#numero mostra 0', f: (c) => { need(c.$('#numero'), 'Non trovo id="numero".'); need(c.text('#numero') === '0', `#numero deve mostrare 0, ora mostra "${c.text('#numero')}".`); } },
          { t: '#piu è un bottone', f: (c) => need(c.$('#piu') && c.$('#piu').tagName === 'BUTTON', 'Serve un <button id="piu">.') }
        ]
      },
      {
        title: 'Fallo contare',
        task: `<p>Nella scheda JS:</p><ol><li>prendi i due elementi con <code>document.getElementById(...)</code> e mettili in due costanti;</li><li>crea <code>let conteggio = 0;</code></li><li>con <code>addEventListener("click", ...)</code> sul bottone: aumenta <code>conteggio</code> di 1 e scrivilo nel numero con <code>.textContent</code>.</li></ol>`,
        example: 'const luce = document.getElementById("luce");\nconst interruttore = document.getElementById("interruttore");\nlet accesa = false;\n\ninterruttore.addEventListener("click", () => {\n  accesa = !accesa;\n  luce.textContent = accesa ? "ON" : "OFF";\n});',
        hints: ['Ricorda: prima cambi la variabile, poi aggiorni la pagina.', 'conteggio++ aumenta di 1. Poi: numero.textContent = conteggio;'],
        checks: [{ t: '3 click su +1 → 3', f: async (c) => {
          await c.click('#piu', 3);
          need(c.text('#numero') === '3', `Dopo 3 click mi aspettavo 3, ma #numero mostra "${c.text('#numero')}".`);
        } }]
      },
      {
        title: 'Anche all\'indietro',
        task: `<p>Aggiungi un bottone <code>#meno</code> (−1) che diminuisce il conteggio.</p>`,
        example: '',
        hints: ['È quasi uguale al bottone +1: nuovo elemento in HTML, nuovo getElementById, nuovo addEventListener.'],
        checks: [{ t: '+1, +1, −1 → 1', f: async (c) => {
          await c.click('#piu', 2); await c.click('#meno');
          need(c.text('#numero') === '1', `Mi aspettavo 1, ma #numero mostra "${c.text('#numero')}".`);
        } }]
      },
      {
        title: 'Mai sotto zero',
        task: `<p>Il contatore non deve mai scendere sotto lo 0: se è a 0 e premo −1, resta 0.</p>`,
        example: 'if (vite > 0) {\n  vite--;\n}',
        hints: ['Ti serve un if nel click di #meno.'],
        checks: [{ t: 'Da 0, −1 due volte → 0', f: async (c) => {
          await c.click('#meno', 2);
          need(c.text('#numero') === '0', `Mi aspettavo 0, ma #numero mostra "${c.text('#numero')}".`);
          await c.click('#piu');
          need(c.text('#numero') === '1', 'Dopo essere rimasto a 0, +1 deve portare a 1 (la variabile è scesa sotto zero di nascosto?).');
        } }]
      },
      {
        title: 'Azzera',
        task: `<p>Aggiungi un bottone <code>#reset</code> che riporta il contatore a 0.</p>`,
        example: '',
        hints: ['Devi azzerare sia la pagina che la variabile! Se azzeri solo il testo, al click successivo ricompare il vecchio numero.'],
        checks: [{ t: '+4, reset, +1 → 1', f: async (c) => {
          await c.click('#piu', 4); await c.click('#reset');
          need(c.text('#numero') === '0', 'Dopo reset #numero deve mostrare 0.');
          await c.click('#piu');
          need(c.text('#numero') === '1', `Dopo reset e +1 mi aspettavo 1, ma vedo "${c.text('#numero')}": hai azzerato anche la variabile?`);
        } }]
      },
      {
        title: 'Cambia colore oltre il 10',
        task: `<p>Quando il conteggio supera 10, aggiungi al numero la classe CSS <code>alto</code>; quando torna a 10 o meno, toglila.</p>
               <p>Nel CSS crea la regola <code>.alto</code> con un colore a tua scelta. Ti servirà <code>elemento.classList.toggle("classe", condizione)</code>.</p>`,
        example: 'campo.classList.toggle("errore", testo.length === 0);',
        hints: ['Conviene scrivere una funzione aggiorna() che fa textContent e classList, e chiamarla in tutti e tre i click.', 'Così non ripeti il codice tre volte.'],
        checks: [{ t: 'Classe "alto" sopra 10, tolta a 10', f: async (c) => {
          await c.click('#piu', 11);
          need(c.el('#numero').classList.contains('alto'), 'A 11 il numero deve avere la classe "alto".');
          await c.click('#meno');
          need(!c.el('#numero').classList.contains('alto'), 'Tornato a 10 la classe "alto" va tolta.');
          need(/\.alto\s*\{/.test(c.src.css), 'Manca la regola .alto { … } nel CSS.');
        } }]
      },
      {
        title: 'Rendilo bello',
        task: `<p>Ultimo tocco, nel CSS: numero grande (<code>font-size</code> almeno 48px) e bottoni comodi (<code>padding</code> almeno 8px). Il resto è libero: centra tutto, colori, angoli…</p>`,
        example: '',
        hints: ['Selettori: #numero e button.'],
        checks: [
          { t: 'Numero ≥ 48px', f: (c) => need(parseFloat(c.style('#numero', 'fontSize')) >= 48, 'Il numero è più piccolo di 48px.') },
          { t: 'Bottoni con padding ≥ 8px', f: (c) => need(parseFloat(c.style('#piu', 'paddingTop')) >= 8, 'I bottoni hanno meno di 8px di padding.') }
        ]
      }
    ]
  },

  // ───────────────────────────── 5. Liste dinamiche e salvataggio
  {
    id: 'm05', group: 'guidata', emoji: '🛒', title: 'Lista della spesa',
    intro: 'Un\'app che crea elementi al volo, li elimina e se li ricorda anche dopo aver chiuso la pagina.',
    tabs: ['html', 'css', 'js'], start: { html: '', css: '', js: '' },
    skills: ['Leggere ciò che scrive l\'utente (.value)', 'Creare elementi con createElement e append', 'Il modello "dati → disegna()"', 'Eliminare elementi', 'Salvare con localStorage e JSON'],
    steps: [
      {
        title: 'L\'HTML',
        task: `<p>Crea un campo di testo <code>&lt;input id="nuovo"&gt;</code> (con un <code>placeholder</code>), un bottone <code>#aggiungi</code> e una lista vuota <code>&lt;ul id="lista"&gt;&lt;/ul&gt;</code>.</p>`,
        example: '<input id="ricerca" placeholder="Cerca…">',
        hints: ['<input> non ha tag di chiusura.'],
        checks: [{ t: 'Ci sono #nuovo, #aggiungi e ul#lista', f: (c) => {
          need(c.$('input#nuovo'), 'Manca <input id="nuovo">.');
          need(c.$('button#aggiungi'), 'Manca <button id="aggiungi">.');
          need(c.$('ul#lista'), 'Manca <ul id="lista">.');
        } }]
      },
      {
        title: 'Aggiungi un prodotto',
        task: `<p>Al click su <code>#aggiungi</code>: leggi il testo con <code>.value</code>, crea un <code>&lt;li&gt;</code> con <code>document.createElement("li")</code>, mettici il testo e aggiungilo alla lista con <code>.append(...)</code>.</p>`,
        example: 'const p = document.createElement("p");\np.textContent = "Nuovo messaggio";\ndocument.body.append(p);',
        hints: ['Il valore va letto DENTRO la funzione del click, non fuori (fuori sarebbe vuoto).', 'lista.append(li);'],
        checks: [{ t: 'Scrivo "Pane", clicco → compare un <li> Pane', f: async (c) => {
          await c.type('#nuovo', 'Pane'); await c.click('#aggiungi');
          const li = c.$$('#lista li');
          need(li.length === 1, `Mi aspettavo 1 <li> nella lista, ne vedo ${li.length}.`);
          need(c.text(li[0]).includes('Pane'), 'Il <li> non contiene "Pane".');
        } }]
      },
      {
        title: 'Pulizia',
        task: `<p>Dopo aver aggiunto, svuota il campo. E se il testo è vuoto (o solo spazi) non aggiungere niente: usa <code>.trim()</code> e un <code>if</code>.</p>`,
        example: 'const parola = campo.value.trim();\nif (parola === "") return; // esce dalla funzione',
        hints: ['campo.value = ""; svuota il campo.'],
        checks: [
          { t: 'Il campo si svuota', f: async (c) => { await c.type('#nuovo', 'Latte'); await c.click('#aggiungi'); need(c.el('#nuovo').value === '', 'Dopo aver aggiunto il campo #nuovo deve tornare vuoto.'); } },
          { t: 'Spazi vuoti ignorati', f: async (c) => { await c.type('#nuovo', '   '); await c.click('#aggiungi'); need(c.$$('#lista li').length === 0, 'Con un testo vuoto non deve comparire nessun <li>.'); } }
        ]
      },
      {
        title: 'Anche con Invio',
        task: `<p>Fai in modo che premendo <strong>Invio</strong> nel campo il prodotto venga aggiunto. Ascolta l'evento <code>"keydown"</code> sul campo e controlla <code>event.key === "Enter"</code>.</p>`,
        example: 'campo.addEventListener("keydown", (event) => {\n  if (event.key === "Escape") campo.value = "";\n});',
        hints: ['Per non ripetere codice, sposta la logica in una funzione aggiungi() e chiamala sia dal click che dall\'Invio.'],
        checks: [{ t: 'Invio aggiunge un solo prodotto', f: async (c) => {
          await c.type('#nuovo', 'Uova'); await c.key('#nuovo', 'Enter');
          const n = c.$$('#lista li').length;
          need(n === 1, n ? `Premendo Invio sono comparsi ${n} prodotti invece di 1: ascolta un solo evento (keydown).` : 'Premendo Invio non è stato aggiunto niente.');
        } }]
      },
      {
        title: 'Prima i dati, poi la pagina',
        task: `<p>Il segreto di tutte le app: <strong>i dati stanno in un array</strong>, e una funzione li <em>disegna</em> nella pagina.</p>
               <ol><li>Crea <code>let prodotti = [];</code></li><li>Scrivi <code>function disegna()</code> che svuota la lista (<code>lista.innerHTML = ""</code>) e ricrea un <code>&lt;li&gt;</code> per ogni prodotto dell'array.</li><li>Quando aggiungi: fai <code>prodotti.push(testo)</code> e poi <code>disegna()</code>.</li></ol>`,
        example: 'let voti = [7, 8];\nfunction mostraVoti() {\n  elenco.innerHTML = "";\n  for (const v of voti) {\n    const li = document.createElement("li");\n    li.textContent = v;\n    elenco.append(li);\n  }\n}',
        hints: ['Il click non crea più il <li> direttamente: aggiorna l\'array e chiama disegna().', 'for (const p of prodotti) { … } scorre tutti i prodotti.'],
        checks: [{ t: 'Array prodotti e funzione disegna', f: async (c) => {
          need(typeof c.get('disegna') === 'function', 'Manca la funzione disegna().');
          await c.type('#nuovo', 'Pane'); await c.click('#aggiungi');
          await c.type('#nuovo', 'Latte'); await c.click('#aggiungi');
          const p = c.get('prodotti');
          need(Array.isArray(p), 'Manca l\'array prodotti (let prodotti = [];).');
          need(p.length === 2, `Dopo 2 aggiunte prodotti dovrebbe avere 2 elementi, ne ha ${p.length}.`);
          need(c.$$('#lista li').length === 2, 'Nella pagina dovrebbero esserci 2 <li>.');
        } }]
      },
      {
        title: 'Elimina',
        task: `<p>In ogni <code>&lt;li&gt;</code> aggiungi un <code>&lt;button&gt;</code> ✕ che elimina quel prodotto: toglilo dall'array e richiama <code>disegna()</code>.</p>
               <p>Dentro il ciclo puoi usare l'indice: <code>prodotti.splice(indice, 1)</code> rimuove 1 elemento in posizione <code>indice</code>.</p>`,
        example: 'voti.forEach((v, i) => {\n  const btn = document.createElement("button");\n  btn.textContent = "✕";\n  btn.addEventListener("click", () => {\n    voti.splice(i, 1);\n    mostraVoti();\n  });\n  // …metti btn dentro il li\n});',
        hints: ['Crea il bottone dentro disegna(), per ogni prodotto, e mettilo nel li con li.append(btn).', 'forEach ti dà sia l\'elemento che il suo indice.'],
        checks: [{ t: 'Elimino il primo di due → resta il secondo', f: async (c) => {
          await c.type('#nuovo', 'Mele'); await c.click('#aggiungi');
          await c.type('#nuovo', 'Pere'); await c.click('#aggiungi');
          const b = c.$('#lista li button');
          need(b, 'Non trovo un <button> dentro i <li>.');
          await c.click(b);
          const li = c.$$('#lista li');
          need(li.length === 1, `Dopo l'eliminazione mi aspettavo 1 prodotto, ne vedo ${li.length}.`);
          need(c.text(li[0]).includes('Pere'), 'È stato eliminato il prodotto sbagliato.');
          need(c.get('prodotti').length === 1, 'Il prodotto è sparito dalla pagina ma non dall\'array prodotti.');
        } }]
      },
      {
        title: 'Memoria',
        task: `<p>Fai sopravvivere la lista alla chiusura della pagina con <code>localStorage</code>, che salva solo testo:</p>
               <ul><li>salva: <code>localStorage.setItem("chiave", JSON.stringify(array))</code> ogni volta che i dati cambiano;</li><li>all'avvio: <code>JSON.parse(localStorage.getItem("chiave"))</code>, oppure <code>[]</code> se non c'è niente.</li></ul>`,
        example: 'function salva() {\n  localStorage.setItem("voti", JSON.stringify(voti));\n}\nlet voti = JSON.parse(localStorage.getItem("voti")) || [];',
        hints: ['Il posto più comodo per chiamare salva() è dentro disegna(): ogni cambiamento passa da lì.', 'Ricordati di chiamare disegna() una volta all\'avvio, sennò i dati caricati non si vedono.'],
        checks: [{ t: 'Dopo il ricaricamento il prodotto c\'è ancora', f: async (c) => {
          await c.type('#nuovo', 'Caffè'); await c.click('#aggiungi');
          await c.reload();
          need(c.$$('#lista li').some((li) => c.text(li).includes('Caffè')), 'Ho ricaricato la pagina e "Caffè" non c\'è più.');
        } }]
      },
      {
        title: 'Quanti prodotti?',
        task: `<p>Aggiungi un elemento <code>#totale</code> che mostra quanti prodotti ci sono, es. "2 prodotti". Deve essere giusto anche all'avvio e dopo un'eliminazione.</p>`,
        example: '',
        hints: ['Aggiornalo dentro disegna(): prodotti.length.'],
        checks: [{ t: '#totale sempre corretto', f: async (c) => {
          need(c.$('#totale'), 'Manca l\'elemento #totale.');
          need(num(c.text('#totale')) === 0, 'All\'avvio #totale deve indicare 0.');
          await c.type('#nuovo', 'A'); await c.click('#aggiungi');
          await c.type('#nuovo', 'B'); await c.click('#aggiungi');
          need(num(c.text('#totale')) === 2, `Con 2 prodotti #totale mostra "${c.text('#totale')}".`);
          await c.click('#lista li button');
          need(num(c.text('#totale')) === 1, 'Dopo un\'eliminazione #totale non si è aggiornato.');
        } }]
      }
    ]
  },

  // ───────────────────────────── 6. Rubrica
  {
    id: 'm06', group: 'guidata', emoji: '📇', title: 'La rubrica',
    intro: 'Una rubrica contatti completa: moduli, oggetti, ordinamento, ricerca, eliminazione sicura con gli id e salvataggio.',
    tabs: ['html', 'css', 'js'], start: { html: '', css: '', js: '' },
    skills: ['Moduli <form> e l\'evento submit', 'Validare i dati e mostrare errori', 'Ordinare con sort e localeCompare', 'Ricerca in tempo reale', 'Identificare i dati con un id unico'],
    steps: [
      {
        title: 'Il modulo',
        task: `<p>Crea un <code>&lt;form id="form-contatto"&gt;</code> con dentro tre input (<code>#nome</code>, <code>#telefono</code>, <code>#email</code>) e un <code>&lt;button type="submit"&gt;</code>. Sotto il form una lista <code>&lt;ul id="contatti"&gt;</code>.</p>
               <p>Usa <code>&lt;label&gt;</code> per dare un nome a ogni campo: è più chiaro e accessibile.</p>`,
        example: '<form id="login">\n  <label>Utente <input id="utente"></label>\n  <button type="submit">Entra</button>\n</form>',
        hints: ['Per l\'email puoi usare <input type="email">, per il telefono type="tel".'],
        checks: [{ t: 'Form con #nome, #telefono, #email, submit e ul#contatti', f: (c) => {
          const f = c.$('form#form-contatto');
          need(f, 'Manca <form id="form-contatto">.');
          for (const id of ['nome', 'telefono', 'email']) need(f.querySelector('#' + id), `Manca il campo #${id} dentro il form.`);
          need(f.querySelector('button:not([type=button]), input[type=submit]'), 'Manca il bottone di invio nel form.');
          need(c.$('ul#contatti'), 'Manca <ul id="contatti">.');
        } }]
      },
      {
        title: 'Salva un contatto',
        task: `<p>Ascolta l'evento <code>"submit"</code> del form. Per prima cosa chiama <code>event.preventDefault()</code> (sennò la pagina si ricarica!). Poi crea un <strong>oggetto</strong> <code>{ nome, telefono, email }</code>, aggiungilo all'array <code>contatti</code> e chiama <code>disegna()</code>, che mostra un <code>&lt;li&gt;</code> con nome e telefono.</p>`,
        example: 'form.addEventListener("submit", (event) => {\n  event.preventDefault();\n  const libro = { titolo: campoTitolo.value, autore: campoAutore.value };\n  libri.push(libro);\n  disegna();\n});',
        hints: ['Stesso schema della lista della spesa, ma ogni elemento ora è un oggetto.', 'Nel li: li.textContent = `${c.nome} — ${c.telefono}`;'],
        checks: [{ t: 'Invio un contatto → compare con nome e telefono', f: async (c) => {
          await c.type('#nome', 'Mario Rossi'); await c.type('#telefono', '333 1234567'); await c.type('#email', 'mario@esempio.it');
          await c.submit('#form-contatto');
          const li = c.$$('#contatti li');
          need(li.length === 1, `Mi aspettavo 1 contatto nella lista, ne vedo ${li.length}.`);
          need(c.text(li[0]).includes('Mario Rossi') && c.text(li[0]).includes('333 1234567'), 'Il <li> deve mostrare nome e telefono.');
          const arr = c.get('contatti');
          need(Array.isArray(arr) && arr[0] && arr[0].nome === 'Mario Rossi', 'L\'array contatti deve contenere oggetti con la proprietà nome.');
        } }]
      },
      {
        title: 'Controlla i dati',
        task: `<p>Se il nome è vuoto: non salvare e scrivi un messaggio in un elemento <code>#errore</code>. Se il contatto è valido: salva, svuota il messaggio di errore e svuota il modulo (<code>form.reset()</code>).</p>`,
        example: 'if (titolo === "") {\n  avviso.textContent = "Il titolo è obbligatorio";\n  return;\n}\navviso.textContent = "";',
        hints: ['Il return dentro l\'if ferma la funzione: il resto non viene eseguito.'],
        checks: [
          { t: 'Nome vuoto → errore e niente salvato', f: async (c) => {
            await c.type('#telefono', '0123'); await c.submit('#form-contatto');
            need(c.$$('#contatti li').length === 0, 'Con il nome vuoto non deve essere aggiunto niente.');
            need(c.text('#errore'), 'Con il nome vuoto #errore deve mostrare un messaggio.');
          } },
          { t: 'Contatto valido → errore sparito e modulo vuoto', f: async (c) => {
            await c.submit('#form-contatto');
            await c.type('#nome', 'Lucia'); await c.submit('#form-contatto');
            need(c.$$('#contatti li').length === 1, 'Il contatto valido non è stato aggiunto.');
            need(!c.text('#errore'), 'Dopo un salvataggio riuscito #errore deve tornare vuoto.');
            need(c.el('#nome').value === '', 'Dopo il salvataggio il modulo va svuotato (form.reset()).');
          } }
        ]
      },
      {
        title: 'In ordine alfabetico',
        task: `<p>Mostra i contatti in ordine alfabetico per nome, senza badare a maiuscole e minuscole. Usa <code>sort</code> con <code>localeCompare</code>.</p>`,
        example: 'citta.sort((a, b) => a.nome.localeCompare(b.nome));',
        hints: ['Ordina dentro disegna(), prima di creare i li.'],
        checks: [{ t: 'Zeno, Anna, marco → Anna, marco, Zeno', f: async (c) => {
          for (const n of ['Zeno', 'Anna', 'marco']) { await c.type('#nome', n); await c.submit('#form-contatto'); }
          const t = c.$$('#contatti li').map((li) => c.text(li));
          need(t.length === 3, `Mi aspettavo 3 contatti, ne vedo ${t.length}.`);
          need(t[0].includes('Anna') && t[1].includes('marco') && t[2].includes('Zeno'), `Ordine sbagliato: ${t.join(' | ')}`);
        } }]
      },
      {
        title: 'Cerca',
        task: `<p>Aggiungi <code>&lt;input id="cerca"&gt;</code>. Mentre l'utente scrive (evento <code>"input"</code>) mostra solo i contatti il cui nome contiene il testo cercato, senza badare a maiuscole/minuscole.</p>`,
        example: 'const visibili = film.filter(f => f.titolo.toLowerCase().includes(testo.toLowerCase()));',
        hints: ['In disegna() filtra l\'array prima di creare i li; l\'array originale NON va modificato.', 'Nell\'evento input di #cerca basta chiamare disegna().'],
        checks: [{ t: 'Cercando "BR" resta solo Bruno', f: async (c) => {
          for (const n of ['Anna', 'Bruno', 'Carla']) { await c.type('#nome', n); await c.submit('#form-contatto'); }
          await c.type('#cerca', 'BR');
          const vis = c.$$('#contatti li').filter((li) => c.visible(li));
          need(vis.length === 1 && c.text(vis[0]).includes('Bruno'), `Cercando "BR" mi aspettavo solo Bruno, vedo ${vis.length} contatti.`);
          await c.type('#cerca', '');
          need(c.$$('#contatti li').filter((li) => c.visible(li)).length === 3, 'Svuotando la ricerca devono tornare tutti e 3.');
          need(c.get('contatti').length === 3, 'La ricerca ha cancellato contatti dall\'array: filtra una copia, non l\'originale.');
        } }]
      },
      {
        title: 'Elimina quello giusto',
        task: `<p>Aggiungi un bottone ✕ a ogni contatto. Attenzione: con ricerca e ordinamento, la posizione nella pagina <strong>non</strong> corrisponde alla posizione nell'array! Soluzione professionale: dai a ogni contatto un <code>id</code> unico quando lo crei (es. <code>Date.now()</code>) ed elimina per id con <code>filter</code>.</p>`,
        example: 'const nota = { id: Date.now(), testo: "…" };\n// per eliminare:\nnote = note.filter(n => n.id !== nota.id);',
        hints: ['Se contatti era const, per riassegnarlo serve let.', 'Nel click del bottone hai già il contatto della riga: usa il suo id.'],
        checks: [{ t: 'Cerco Carla e la elimino → restano Anna e Bruno', f: async (c) => {
          for (const n of ['Anna', 'Bruno', 'Carla']) { await c.type('#nome', n); await c.submit('#form-contatto'); await c.wait(5); }
          await c.type('#cerca', 'carla');
          const li = c.$$('#contatti li').filter((x) => c.visible(x));
          need(li.length === 1, 'La ricerca non funziona più.');
          const b = li[0].querySelector('button');
          need(b, 'Non trovo il bottone di eliminazione dentro il <li>.');
          await c.click(b);
          const nomi = c.get('contatti').map((x) => x.nome);
          need(!nomi.includes('Carla'), `Carla è ancora nell'array (contiene: ${nomi.join(', ')}).`);
          need(nomi.includes('Anna') && nomi.includes('Bruno'), `È stato eliminato il contatto sbagliato: restano ${nomi.join(', ')}.`);
        } }]
      },
      {
        title: 'Salva tutto',
        task: `<p>Salva i contatti in <code>localStorage</code> e ricaricali all'avvio, come nella lista della spesa.</p>`,
        example: '',
        hints: ['Stesso schema di prima: salva in disegna(), carica all\'avvio con JSON.parse(...) || [].'],
        checks: [{ t: 'Dopo il ricaricamento i contatti ci sono ancora', f: async (c) => {
          await c.type('#nome', 'Giulia'); await c.submit('#form-contatto');
          await c.reload();
          need(c.$$('#contatti li').some((li) => c.text(li).includes('Giulia')), 'Dopo il ricaricamento Giulia non c\'è più.');
        } }]
      }
    ]
  },

  // ───────────────────────────── 7. Quiz
  {
    id: 'm07', group: 'guidata', emoji: '❓', title: 'Il quiz',
    intro: 'Un quiz a risposta multipla. Impari a costruire un\'interfaccia che cambia in base allo "stato" (domanda corrente, punteggio).',
    tabs: ['html', 'css', 'js'], start: { html: '', css: '', js: '' },
    skills: ['Descrivere contenuti con dati strutturati', 'Generare bottoni dai dati', 'Gestire lo stato (indice, punteggio)', 'Schermata finale e "ricomincia"'],
    steps: [
      {
        title: 'Le domande sono dati',
        task: `<p>Crea <code>const domande</code>: un array di <strong>almeno 3</strong> oggetti, ognuno con:</p>
               <ul><li><code>testo</code>: la domanda</li><li><code>risposte</code>: array di almeno 2 risposte</li><li><code>corretta</code>: l'<strong>indice</strong> della risposta giusta (0 = la prima)</li></ul>`,
        example: 'const ricette = [\n  { nome: "Carbonara", ingredienti: ["uova", "guanciale"], tempo: 20 },\n  { nome: "Pesto", ingredienti: ["basilico", "pinoli"], tempo: 10 }\n];',
        hints: ['Ogni oggetto tra { }, separati da virgole, dentro [ ].'],
        checks: [{ t: 'domande è valido', f: (c) => {
          const d = c.get('domande');
          need(Array.isArray(d), 'Non trovo l\'array domande.');
          need(d.length >= 3, `Servono almeno 3 domande, ne hai ${d.length}.`);
          d.forEach((q, i) => {
            need(typeof q.testo === 'string' && q.testo, `La domanda ${i + 1} non ha un testo.`);
            need(Array.isArray(q.risposte) && q.risposte.length >= 2, `La domanda ${i + 1} deve avere un array risposte con almeno 2 elementi.`);
            need(Number.isInteger(q.corretta) && q.corretta >= 0 && q.corretta < q.risposte.length, `Nella domanda ${i + 1}, corretta deve essere un indice valido (da 0 a ${q.risposte.length - 1}).`);
          });
        } }]
      },
      {
        title: 'Mostra la domanda',
        task: `<p>HTML: <code>#domanda</code>, un contenitore <code>#risposte</code>, <code>#punteggio</code>.</p>
               <p>JS: <code>let indice = 0;</code> e una funzione <code>mostraDomanda()</code> che scrive il testo della domanda corrente in <code>#domanda</code> e crea in <code>#risposte</code> un <code>&lt;button&gt;</code> per ogni risposta. Chiamala all'avvio.</p>`,
        example: 'const r = ricette[indice];\ntitolo.textContent = r.nome;\nlista.innerHTML = "";\nr.ingredienti.forEach((ing) => {\n  const b = document.createElement("button");\n  b.textContent = ing;\n  lista.append(b);\n});',
        hints: ['Prima di creare i bottoni svuota #risposte, sennò si accumulano.'],
        checks: [{ t: 'Prima domanda e i suoi bottoni', f: (c) => {
          const d = c.get('domande');
          need(c.$('#domanda') && c.$('#risposte') && c.$('#punteggio'), 'Servono #domanda, #risposte e #punteggio.');
          need(c.text('#domanda') === d[0].testo.trim(), `#domanda dovrebbe mostrare "${d[0].testo}".`);
          const b = c.$$('#risposte button');
          need(b.length === d[0].risposte.length, `Mi aspettavo ${d[0].risposte.length} bottoni in #risposte, ne vedo ${b.length}.`);
        } }]
      },
      {
        title: 'Rispondi',
        task: `<p>Al click su una risposta: se è quella giusta aumenta <code>punteggio</code> e aggiornalo in <code>#punteggio</code>; poi in ogni caso passa alla domanda successiva.</p>`,
        example: 'r.ingredienti.forEach((ing, i) => {\n  // …\n  b.addEventListener("click", () => scegli(i));\n});',
        hints: ['Confronta l\'indice del bottone cliccato con domande[indice].corretta.', 'Dopo: indice++ e mostraDomanda().'],
        checks: [
          { t: 'Risposta giusta → +1 e domanda successiva', f: async (c) => {
            const d = c.get('domande');
            await c.click(c.$$('#risposte button')[d[0].corretta]);
            need(c.text('#domanda') === d[1].testo.trim(), 'Dopo la risposta non si passa alla domanda 2.');
            need(num(c.text('#punteggio')) === 1, `Dopo una risposta giusta #punteggio deve indicare 1, mostra "${c.text('#punteggio')}".`);
          } },
          { t: 'Risposta sbagliata → nessun punto', f: async (c) => {
            const d = c.get('domande');
            await c.click(c.$$('#risposte button')[d[0].corretta === 0 ? 1 : 0]);
            need(c.text('#domanda') === d[1].testo.trim(), 'Dopo la risposta non si passa alla domanda 2.');
            need(!(num(c.text('#punteggio')) > 0), 'Una risposta sbagliata non deve dare punti.');
          } }
        ]
      },
      {
        title: 'A che punto sei',
        task: `<p>Aggiungi <code>#progresso</code> che mostra <code>Domanda 1 di 3</code> (con i numeri giusti).</p>`,
        example: '',
        hints: ['indice parte da 0, ma per le persone si conta da 1: indice + 1.'],
        checks: [{ t: 'Domanda 1 di N → Domanda 2 di N', f: async (c) => {
          const n = c.get('domande').length;
          need(c.text('#progresso').includes(`1 di ${n}`), `All'inizio #progresso deve contenere "1 di ${n}".`);
          await c.click('#risposte button');
          need(c.text('#progresso').includes(`2 di ${n}`), `Dopo una risposta #progresso deve contenere "2 di ${n}".`);
        } }]
      },
      {
        title: 'Fine e ricomincia',
        task: `<p>Dopo l'ultima domanda scrivi in <code>#domanda</code> un messaggio come <code>Fine! Hai fatto 3 su 3</code> (deve contenere "fine" e "X su N"), svuota le risposte e mostra un bottone <code>#ricomincia</code> che azzera tutto.</p>`,
        example: '',
        hints: ['In mostraDomanda(), all\'inizio: if (indice >= domande.length) { …schermata finale…; return; }', 'Ricomincia = indice e punteggio a 0, poi mostraDomanda().'],
        checks: [{ t: 'Schermata finale e ricomincia', f: async (c) => {
          const d = c.get('domande');
          for (const q of d) await c.click(c.$$('#risposte button')[q.corretta]);
          const t = lower(c.text('#domanda'));
          need(t.includes('fine'), 'Alla fine #domanda deve contenere "Fine".');
          need(t.includes(`${d.length} su ${d.length}`), `Rispondendo tutto giusto il messaggio deve contenere "${d.length} su ${d.length}".`);
          need(c.$$('#risposte button').length === 0, 'Alla fine non devono restare bottoni di risposta.');
          await c.click('#ricomincia');
          need(c.text('#domanda') === d[0].testo.trim(), 'Dopo "ricomincia" deve tornare la prima domanda.');
          need(!(num(c.text('#punteggio')) > 0), 'Dopo "ricomincia" il punteggio deve tornare 0.');
        } }]
      }
    ]
  },

  // ───────────────────────────── 8. fetch
  {
    id: 'm08', group: 'guidata', emoji: '🌦️', title: 'Il meteo (dati da internet)',
    intro: 'Le app prendono dati dai server con fetch. Qui c\'è un server meteo finto (funziona anche offline) all\'indirizzo https://api.esempio.it/meteo?citta=Roma',
    tabs: ['html', 'css', 'js'], setup: METEO_SETUP, start: { html: '', css: '', js: '' },
    skills: ['Chiamare un\'API con fetch', 'async / await', 'Leggere JSON', 'Stato di caricamento', 'Gestire gli errori con try / catch'],
    steps: [
      {
        title: 'L\'interfaccia',
        task: `<p>Crea <code>&lt;input id="citta"&gt;</code>, <code>&lt;button id="cerca"&gt;</code> e un <code>&lt;div id="risultato"&gt;</code>.</p>`,
        example: '',
        hints: ['Ormai lo sai fare: tre elementi con il loro id.'],
        checks: [{ t: 'Ci sono #citta, #cerca, #risultato', f: (c) => { for (const s of ['input#citta', 'button#cerca', '#risultato']) need(c.$(s), `Manca ${s}.`); } }]
      },
      {
        title: 'Chiedi i dati al server',
        task: `<p>Scrivi <code>async function caricaMeteo(citta)</code> che:</p>
               <ol><li>fa <code>await fetch(...)</code> all'indirizzo <code>https://api.esempio.it/meteo?citta=</code> + la città;</li><li>trasforma la risposta con <code>await risposta.json()</code>;</li><li>restituisce i dati (un oggetto con <code>citta</code>, <code>temperatura</code>, <code>condizione</code>).</li></ol>
               <p>Prova in console: <code>caricaMeteo("Roma").then(d =&gt; console.log(d))</code></p>`,
        example: 'async function caricaUtente(id) {\n  const risposta = await fetch(`https://api.altro.it/utenti/${id}`);\n  const dati = await risposta.json();\n  return dati;\n}',
        hints: ['await "aspetta" che arrivi la risposta; si può usare solo dentro funzioni async.', 'Città disponibili: Roma, Milano, Napoli, Torino, Palermo, Firenze, Bari.'],
        checks: [{ t: 'caricaMeteo("Roma") restituisce i dati', f: async (c) => {
          const d = await c.fn('caricaMeteo')('Roma');
          need(d && typeof d === 'object', `caricaMeteo("Roma") ha restituito ${show(d)}: deve restituire l'oggetto dei dati (hai fatto return di risposta.json()?).`);
          need(d.temperatura === 24, `Dati inattesi: ${show(d)}. Controlla l'indirizzo.`);
        } }]
      },
      {
        title: 'Mostralo nella pagina',
        task: `<p>Al click su <code>#cerca</code> leggi la città scritta, chiama <code>caricaMeteo</code> e mostra in <code>#risultato</code> qualcosa come <code>Roma: 24°C, soleggiato</code>.</p>`,
        example: 'bottone.addEventListener("click", async () => {\n  const u = await caricaUtente(campo.value);\n  box.textContent = `${u.nome} (${u.eta} anni)`;\n});',
        hints: ['Anche la funzione del click deve essere async per poter usare await.'],
        checks: [{ t: 'Cerco Roma → vedo 24 e soleggiato', f: async (c) => {
          await c.type('#citta', 'Roma'); await c.click('#cerca'); await c.wait(600);
          const t = lower(c.text('#risultato'));
          need(t.includes('24') && t.includes('soleggiato'), `#risultato mostra "${c.text('#risultato')}", mi aspettavo temperatura (24) e condizione (soleggiato).`);
        } }]
      },
      {
        title: 'Caricamento…',
        task: `<p>Il server impiega un po' a rispondere. Appena l'utente clicca, scrivi <code>Caricamento...</code> in <code>#risultato</code>; poi sostituiscilo con il meteo.</p>`,
        example: '',
        hints: ['Scrivi il messaggio PRIMA dell\'await.'],
        checks: [{ t: 'Prima "Caricamento", poi i dati', f: async (c) => {
          await c.type('#citta', 'Milano'); await c.click('#cerca');
          need(lower(c.text('#risultato')).includes('caricamento'), 'Subito dopo il click #risultato deve dire "Caricamento...".');
          await c.wait(600);
          need(c.text('#risultato').includes('18'), 'Dopo il caricamento devono comparire i dati di Milano (18°C).');
        } }]
      },
      {
        title: 'Quando va storto',
        task: `<p>Se la città non esiste il server risponde con un errore (<code>risposta.ok</code> è <code>false</code>). In <code>caricaMeteo</code>, in quel caso, lancia un errore: <code>throw new Error("Città non trovata")</code>. Nel click usa <code>try / catch</code> e mostra il messaggio dell'errore in <code>#risultato</code>.</p>`,
        example: 'try {\n  const u = await caricaUtente(id);\n  box.textContent = u.nome;\n} catch (errore) {\n  box.textContent = errore.message;\n}',
        hints: ['if (!risposta.ok) throw new Error("Città non trovata"); va subito dopo il fetch.'],
        checks: [{ t: 'Atlantide → "Città non trovata"', f: async (c) => {
          await c.type('#citta', 'Atlantide'); await c.click('#cerca'); await c.wait(600);
          const t = lower(c.text('#risultato'));
          need(t.includes('non trovata'), `Per una città inesistente mi aspettavo "Città non trovata", vedo "${c.text('#risultato')}".`);
          need(!t.includes('undefined'), 'Nel risultato compare "undefined": stai mostrando dati che non esistono.');
        } }]
      },
      {
        title: 'Rifiniture',
        task: `<p>Se il campo è vuoto non chiamare il server: mostra <code>Scrivi una città</code>. E fai partire la ricerca anche con il tasto Invio.</p>
               <p class="muted">🌍 Bonus fuori dal laboratorio: le API vere funzionano allo stesso modo. Prova sul tuo PC il servizio gratuito <code>https://api.open-meteo.com/v1/forecast?latitude=41.9&amp;longitude=12.5&amp;current_weather=true</code></p>`,
        example: '',
        hints: ['Ormai conosci sia trim() che l\'evento keydown con event.key === "Enter".'],
        checks: [
          { t: 'Campo vuoto → "Scrivi una città"', f: async (c) => { await c.click('#cerca'); await c.wait(400); need(lower(c.text('#risultato')).includes('scrivi'), 'Con il campo vuoto #risultato deve dire "Scrivi una città".'); } },
          { t: 'Invio avvia la ricerca', f: async (c) => { await c.type('#citta', 'Napoli'); await c.key('#citta', 'Enter'); await c.wait(600); need(c.text('#risultato').includes('26'), 'Premendo Invio non compare il meteo di Napoli.'); } }
        ]
      }
    ]
  },

  // ───────────────────────────── 9. Sul tuo PC
  {
    id: 'm09', group: 'guidata', emoji: '💻', title: 'Dal laboratorio al tuo PC',
    intro: 'Finora l\'Officina ti ha preparato la pagina. Ora impari a creare un progetto vero sul tuo computer, da una cartella vuota.',
    tabs: ['html'], start: { html: '', css: '', js: '' },
    skills: ['La struttura completa di un file HTML', 'Collegare CSS e JS esterni', 'Lavorare con VS Code', 'Usare gli strumenti per sviluppatori (F12)', 'Pubblicare online con GitHub Pages'],
    steps: [
      {
        title: 'La pagina completa',
        task: `<p>Un file HTML vero ha sempre questa struttura. Scrivila tutta tu (niente copia-incolla!):</p>
               <ul><li><code>&lt;!DOCTYPE html&gt;</code></li><li><code>&lt;html lang="it"&gt;</code> che contiene <code>&lt;head&gt;</code> e <code>&lt;body&gt;</code></li><li>nell'head: <code>&lt;meta charset="UTF-8"&gt;</code>, il meta <code>viewport</code> (serve per i telefoni) e un <code>&lt;title&gt;</code></li><li>nel body: un <code>&lt;h1&gt;</code></li><li>e i collegamenti ai file esterni: <code>&lt;link rel="stylesheet" href="style.css"&gt;</code> nell'head e <code>&lt;script src="app.js" defer&gt;&lt;/script&gt;</code></li></ul>`,
        example: '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        hints: ['head = informazioni sulla pagina (non visibili); body = ciò che si vede.', 'defer fa partire lo script quando la pagina è pronta: così getElementById trova gli elementi.'],
        checks: [
          { t: 'DOCTYPE e <html lang>', f: (c) => { need(/<!doctype html>/i.test(c.src.html), 'Manca <!DOCTYPE html> all\'inizio.'); need(/<html[^>]*\blang=/i.test(c.src.html), 'Manca <html lang="it">.'); } },
          { t: 'head con charset, viewport e title', f: (c) => {
            need(/<meta[^>]*charset/i.test(c.src.html), 'Manca <meta charset="UTF-8">.');
            need(/<meta[^>]*name=["']?viewport/i.test(c.src.html), 'Manca il meta viewport.');
            need(c.doc.title.trim(), 'Manca il <title> (o è vuoto).');
          } },
          { t: 'body con un h1', f: (c) => need(c.$('body h1'), 'Manca un <h1> nel body.') },
          { t: 'CSS e JS collegati', f: (c) => {
            need(/<link[^>]*rel=["']?stylesheet[^>]*href=["']?style\.css|<link[^>]*href=["']?style\.css[^>]*rel=["']?stylesheet/i.test(c.src.html), 'Manca <link rel="stylesheet" href="style.css">.');
            need(/<script[^>]*src=["']?app\.js/i.test(c.src.html), 'Manca <script src="app.js" defer></script>.');
          } }
        ]
      },
      {
        title: 'Prepara il tuo PC',
        task: `<p>Fuori dall'Officina, sul tuo computer:</p>`,
        hints: ['VS Code è gratuito: code.visualstudio.com. In VS Code: menu File → Apri cartella.'],
        checks: [
          { manual: true, t: 'Ho installato Visual Studio Code (code.visualstudio.com)' },
          { manual: true, t: 'Ho creato una cartella "prima-app" sul Desktop e l\'ho aperta in VS Code (File → Apri cartella)' },
          { manual: true, t: 'Ho installato l\'estensione "Live Server" (icona dei quadratini a sinistra, cerca "Live Server")' }
        ]
      },
      {
        title: 'I tre file',
        task: `<p>Dentro la cartella crea tre file: <code>index.html</code>, <code>style.css</code>, <code>app.js</code>.</p>
               <p>In <code>index.html</code> scrivi la struttura che hai imparato al passo 1. Trucco: in VS Code scrivi <code>!</code> e premi Tab: la struttura base si scrive da sola (ma ora sai cosa significa ogni riga).</p>
               <p>Clic destro su index.html → <strong>Open with Live Server</strong>: si apre il browser e si aggiorna da solo a ogni salvataggio (Ctrl+S).</p>`,
        hints: ['Se Live Server non c\'è, basta un doppio clic su index.html per aprirlo nel browser (poi aggiorna con F5).'],
        checks: [
          { manual: true, t: 'Ho creato index.html, style.css e app.js' },
          { manual: true, t: 'Ho aperto la pagina nel browser e vedo il mio h1' },
          { manual: true, t: 'Ho scritto una regola nello style.css e un console.log nell\'app.js, e funzionano' }
        ]
      },
      {
        title: 'Rifai il contatore… a memoria',
        task: `<p>Ricostruisci nei tuoi tre file il <strong>contatore</strong> della missione 4, senza guardare. Se ti blocchi, riguarda solo il punto che ti serve e poi chiudi.</p>
               <p>Rifare a memoria è il modo più veloce per fissare quello che hai imparato.</p>`,
        hints: ['Ordine: HTML (elementi con id) → JS (getElementById, variabile, addEventListener) → CSS.'],
        checks: [
          { manual: true, t: 'Il contatore funziona sul mio PC (+1, −1, reset, mai sotto zero)' }
        ]
      },
      {
        title: 'Leggi gli errori (F12)',
        task: `<p>Nel browser premi <strong>F12</strong> (o Ctrl+Shift+I) e apri la scheda <strong>Console</strong>. È la stessa console dell'Officina, ma vera.</p>
               <p>Ora rompi qualcosa di proposito: scrivi male un id in <code>getElementById</code>, salva, e leggi l'errore. Clicca sul nome del file a destra dell'errore: ti porta alla riga sbagliata. Poi correggi.</p>`,
        hints: ['Gli errori più comuni: "is not defined" (nome sbagliato), "Cannot read properties of null" (elemento non trovato).'],
        checks: [
          { manual: true, t: 'Ho aperto la console con F12' },
          { manual: true, t: 'Ho provocato un errore, l\'ho letto, ho trovato la riga e l\'ho corretto' }
        ]
      },
      {
        title: 'Pubblica online (gratis)',
        task: `<p>Metti la tua app su internet con <strong>GitHub Pages</strong>:</p>
               <ol><li>su github.com crea un nuovo repository (es. <code>contatore</code>);</li><li>"Add file → Upload files" e carica i tre file;</li><li>Settings → Pages → Branch: <code>main</code> → Save;</li><li>dopo un minuto la tua app è su <code>https://TUO-NOME.github.io/contatore</code>.</li></ol>`,
        hints: ['Il file principale deve chiamarsi esattamente index.html.'],
        checks: [
          { manual: true, t: 'La mia app è online e l\'ho aperta dal telefono' }
        ]
      }
    ]
  },

  // ───────────────────────────── 10. Progetto finale
  {
    id: 'm10', group: 'guidata', emoji: '🎓', title: 'Progetto finale: un\'app che insegna',
    intro: 'Costruisci una piccola "palestra" di esercizi di programmazione: l\'utente scrive una funzione, l\'app la prova e dice se è giusta. È lo stesso principio di questa Officina!',
    tabs: ['html', 'css', 'js'], start: { html: '', css: '', js: '' },
    skills: ['Progettare un\'app partendo dai dati', 'Eseguire codice scritto dall\'utente con new Function', 'Verifiche automatiche con casi di prova', 'Gestire progressi salvati'],
    steps: [
      {
        title: 'L\'interfaccia',
        task: `<p>Crea: <code>#titolo</code>, <code>#consegna</code> (il testo dell'esercizio), una <code>&lt;textarea id="codice"&gt;</code>, un bottone <code>#verifica</code>, un <code>#esito</code>, un bottone <code>#prossimo</code> e un <code>#progresso</code>.</p>`,
        example: '<textarea id="note" rows="8" cols="40"></textarea>',
        hints: ['Sono 7 elementi. Puoi scegliere tu i tag (h2, p, div…), basta che abbiano gli id giusti.'],
        checks: [{ t: 'Ci sono tutti gli elementi', f: (c) => {
          for (const s of ['#titolo', '#consegna', 'textarea#codice', 'button#verifica', '#esito', 'button#prossimo', '#progresso']) need(c.$(s), `Manca ${s}.`);
        } }]
      },
      {
        title: 'Gli esercizi sono dati',
        task: `<p>Crea <code>const esercizi</code>, un array di <strong>almeno 3</strong> oggetti con:</p>
               <ul><li><code>titolo</code> e <code>consegna</code> (testi)</li><li><code>nome</code>: il nome della funzione che l'utente deve scrivere</li><li><code>prove</code>: array di casi di prova <code>{ input: [...argomenti], atteso: risultato }</code></li></ul>
               <p>Il <strong>primo</strong> esercizio deve chiedere la funzione <code>doppio(n)</code> che restituisce il doppio di n.</p>`,
        example: '{\n  titolo: "Saluto",\n  consegna: "Scrivi saluta(nome) che restituisce \\"Ciao NOME\\"",\n  nome: "saluta",\n  prove: [\n    { input: ["Ugo"], atteso: "Ciao Ugo" },\n    { input: ["Bea"], atteso: "Ciao Bea" }\n  ]\n}',
        hints: ['Per doppio: prove come { input: [3], atteso: 6 }.', 'Idee per gli altri: somma(a, b), maiuscolo(testo), ultimo(array)…'],
        checks: [{ t: 'esercizi è valido e il primo è doppio', f: (c) => {
          const e = c.get('esercizi');
          need(Array.isArray(e) && e.length >= 3, 'Serve un array esercizi con almeno 3 elementi.');
          e.forEach((x, i) => {
            for (const k of ['titolo', 'consegna', 'nome']) need(typeof x[k] === 'string' && x[k], `L'esercizio ${i + 1} non ha ${k}.`);
            need(Array.isArray(x.prove) && x.prove.length && x.prove.every((p) => Array.isArray(p.input) && 'atteso' in p), `L'esercizio ${i + 1} deve avere prove come { input: [...], atteso: ... }.`);
          });
          need(e[0].nome === 'doppio', 'Il primo esercizio deve avere nome: "doppio".');
          need(e[0].prove.every((p) => p.atteso === p.input[0] * 2), 'Le prove di doppio non sono corrette (atteso deve essere input × 2).');
        } }]
      },
      {
        title: 'Mostra l\'esercizio',
        task: `<p>Con <code>let corrente = 0;</code> scrivi <code>mostraEsercizio()</code> che scrive titolo e consegna dell'esercizio corrente, svuota la textarea e l'esito. Chiamala all'avvio.</p>`,
        example: '',
        hints: ['Stessa idea di mostraDomanda() nel quiz.'],
        checks: [{ t: 'All\'avvio si vede il primo esercizio', f: (c) => {
          const e = c.get('esercizi');
          need(c.text('#titolo') === e[0].titolo.trim(), '#titolo non mostra il titolo del primo esercizio.');
          need(c.text('#consegna') === e[0].consegna.replace(/\s+/g, ' ').trim(), '#consegna non mostra la consegna del primo esercizio.');
        } }]
      },
      {
        title: 'Il verificatore',
        task: `<p>Il cuore dell'app. Al click su <code>#verifica</code>:</p>
               <ol><li>trasforma il testo della textarea in una funzione vera: <code>new Function(codice + "\\nreturn " + es.nome + ";")()</code></li><li>per ogni prova chiama la funzione con <code>...prova.input</code> e confronta il risultato con <code>prova.atteso</code> (usa <code>JSON.stringify</code> su entrambi, così funziona anche con gli array);</li><li>se passano tutte scrivi <code>✅ Corretto!</code> in <code>#esito</code>, altrimenti <code>❌ Riprova</code>.</li></ol>
               <p>Il codice dell'utente può contenere errori: metti tutto in un <code>try / catch</code> e in caso di errore mostra <code>❌</code> con il messaggio.</p>`,
        example: '// new Function crea una funzione da un testo:\nconst f = new Function("a", "b", "return a * b;");\nf(3, 4); // 12\n\n// ...argomenti "spacchetta" un array:\nMath.max(...[4, 9, 2]); // 9',
        hints: ['const fn = new Function(codice + "\\nreturn " + es.nome + ";")(); — notare le () finali: esegui il codice e ti fai restituire la funzione.', 'const ok = es.prove.every(p => JSON.stringify(fn(...p.input)) === JSON.stringify(p.atteso));'],
        checks: [
          { t: 'Soluzione giusta → ✅', f: async (c) => {
            await c.type('#codice', 'function doppio(n) {\n  return n * 2;\n}'); await c.click('#verifica');
            need(c.text('#esito').includes('✅'), `Con una soluzione corretta #esito deve contenere ✅, mostra "${c.text('#esito')}".`);
          } },
          { t: 'Soluzione sbagliata → ❌', f: async (c) => {
            await c.type('#codice', 'function doppio(n) {\n  return n + 1;\n}'); await c.click('#verifica');
            need(c.text('#esito').includes('❌'), 'Con una soluzione sbagliata #esito deve contenere ❌.');
          } },
          { t: 'Codice con errori → ❌ senza bloccarsi', f: async (c) => {
            await c.type('#codice', 'function doppio(n) {'); await c.click('#verifica');
            need(c.text('#esito').includes('❌'), 'Con codice non valido #esito deve mostrare ❌ (usa try/catch).');
          } }
        ]
      },
      {
        title: 'Avanti',
        task: `<p>Il bottone <code>#prossimo</code> passa all'esercizio successivo (all'ultimo torna al primo, così non si rompe).</p>`,
        example: 'corrente = (corrente + 1) % esercizi.length;',
        hints: ['% è il resto della divisione: con 3 esercizi, (2 + 1) % 3 = 0.'],
        checks: [{ t: '#prossimo mostra il secondo esercizio', f: async (c) => {
          const e = c.get('esercizi');
          await c.type('#codice', 'qualcosa'); await c.click('#prossimo');
          need(c.text('#titolo') === e[1].titolo.trim(), 'Dopo #prossimo deve comparire il titolo del secondo esercizio.');
          need(c.el('#codice').value === '', 'Passando al prossimo esercizio la textarea deve svuotarsi.');
          for (let i = 1; i < e.length; i++) await c.click('#prossimo');
          need(c.text('#titolo') === e[0].titolo.trim(), 'Dopo l\'ultimo esercizio #prossimo deve tornare al primo.');
        } }]
      },
      {
        title: 'Progressi salvati',
        task: `<p>Tieni traccia degli esercizi risolti (un array di indici, senza doppioni) e mostra in <code>#progresso</code> qualcosa come <code>Risolti: 1/3</code>. Salvalo in <code>localStorage</code>, così resta anche riaprendo l'app.</p>`,
        example: 'if (!completati.includes(i)) completati.push(i);',
        hints: ['Aggiorna #progresso all\'avvio e dopo ogni verifica riuscita.'],
        checks: [{ t: '0/N → 1/N, niente doppioni, salvato', f: async (c) => {
          const n = c.get('esercizi').length;
          need(c.text('#progresso').includes(`0/${n}`), `All'inizio #progresso deve contenere "0/${n}".`);
          await c.type('#codice', 'function doppio(n) { return n * 2; }');
          await c.click('#verifica'); await c.click('#verifica');
          need(c.text('#progresso').includes(`1/${n}`), `Dopo aver risolto il primo esercizio (anche due volte) #progresso deve contenere "1/${n}", mostra "${c.text('#progresso')}".`);
          await c.reload();
          need(c.text('#progresso').includes(`1/${n}`), 'Dopo il ricaricamento il progresso è andato perso.');
        } }]
      },
      {
        title: 'Collaudo',
        task: `<p>Usa la tua app come farebbe un tuo studente: risolvi tutti gli esercizi nell'anteprima. Aggiungi un quarto esercizio inventato da te, poi dai uno stile all'app.</p>
               <p><strong>Complimenti:</strong> hai costruito un'app che insegna, con un verificatore automatico. Ora passa alle <em>Sfide da zero</em>.</p>`,
        hints: ['Esporta il file con il bottone ⤓ e aprilo sul tuo PC.'],
        checks: [
          { manual: true, t: 'Ho risolto tutti gli esercizi nella mia app' },
          { manual: true, t: 'Ho aggiunto un esercizio inventato da me' }
        ]
      }
    ]
  },

  // ───────────────────────────── SFIDE DA ZERO
  {
    id: 'z01', group: 'zero', emoji: '🍅', title: 'Timer Pomodoro',
    intro: 'Hai solo i requisiti, come in un lavoro vero. Decidi tu come costruirla.',
    tabs: ['html', 'css', 'js'], start: { html: '', css: '', js: '' },
    skills: ['Timer con setInterval / clearInterval', 'Formattare il tempo (mm:ss)'],
    steps: [{
      title: 'Requisiti',
      task: `<ul class="req"><li><code>#display</code> mostra <code>25:00</code> all'avvio</li><li><code>#start</code> avvia il conto alla rovescia (un secondo alla volta)</li><li><code>#pausa</code> lo ferma</li><li><code>#reset</code> lo ferma e torna a <code>25:00</code></li><li>premere Start due volte non deve farlo andare a velocità doppia</li></ul>${METODO}`,
      hints: ['Cerca: setInterval, clearInterval, padStart.'],
      checks: [
        { t: 'All\'avvio 25:00', f: (c) => need(c.text('#display') === '25:00', `#display deve mostrare 25:00, mostra "${c.text('#display')}".`) },
        { t: 'Start conta alla rovescia', f: async (c) => { await c.click('#start'); await c.wait(1150); need(c.text('#display') === '24:59', `Dopo 1 secondo mi aspettavo 24:59, vedo "${c.text('#display')}".`); } },
        { t: 'Pausa ferma il tempo', f: async (c) => { await c.click('#start'); await c.wait(1150); await c.click('#pausa'); const t = c.text('#display'); await c.wait(1200); need(c.text('#display') === t, 'Dopo la pausa il tempo continua a scorrere.'); } },
        { t: 'Reset torna a 25:00 e si ferma', f: async (c) => { await c.click('#start'); await c.wait(1150); await c.click('#reset'); need(c.text('#display') === '25:00', 'Dopo reset #display deve mostrare 25:00.'); await c.wait(1150); need(c.text('#display') === '25:00', 'Dopo reset il timer deve restare fermo.'); } },
        { t: 'Doppio Start non accelera', f: async (c) => { await c.click('#start'); await c.click('#start'); await c.wait(1150); need(c.text('#display') === '24:59', `Con due click su Start dopo 1 secondo vedo "${c.text('#display')}": il timer va a velocità doppia.`); } }
      ]
    }]
  },
  {
    id: 'z02', group: 'zero', emoji: '💶', title: 'Gestore spese',
    intro: 'Tieni traccia delle spese e del totale.',
    tabs: ['html', 'css', 'js'], start: { html: '', css: '', js: '' },
    skills: ['Numeri da input (Number, toFixed)', 'Somme con reduce o for', 'Il modello dati → disegna() da solo'],
    steps: [{
      title: 'Requisiti',
      task: `<ul class="req"><li>campi <code>#descrizione</code> e <code>#importo</code> (numero), bottone <code>#aggiungi</code></li><li>le spese compaiono come <code>&lt;li&gt;</code> in <code>ul#spese</code> (descrizione e importo)</li><li><code>#totale</code> mostra la somma con 2 decimali (es. <code>20.50</code>)</li><li>non si aggiungono spese senza descrizione o con importo ≤ 0</li><li>ogni spesa ha un bottone per eliminarla</li><li>tutto resta salvato riaprendo la pagina</li></ul>${METODO}`,
      hints: ['Il valore di un input è sempre testo: Number(campo.value).'],
      checks: [
        { t: 'Due spese → totale 20.50', f: async (c) => {
          await c.type('#descrizione', 'Pizza'); await c.type('#importo', '12.5'); await c.click('#aggiungi');
          await c.type('#descrizione', 'Cinema'); await c.type('#importo', '8'); await c.click('#aggiungi');
          need(c.$$('#spese li').length === 2, 'Dopo due spese mi aspettavo 2 <li> in #spese.');
          need(/20[.,]50/.test(c.text('#totale')), `#totale deve mostrare 20.50, mostra "${c.text('#totale')}".`);
        } },
        { t: 'Dati non validi ignorati', f: async (c) => {
          await c.type('#descrizione', ''); await c.type('#importo', '5'); await c.click('#aggiungi');
          await c.type('#descrizione', 'Gratis'); await c.type('#importo', '0'); await c.click('#aggiungi');
          need(c.$$('#spese li').length === 0, 'Spese senza descrizione o con importo 0 non vanno aggiunte.');
        } },
        { t: 'Eliminare aggiorna il totale', f: async (c) => {
          await c.type('#descrizione', 'Libro'); await c.type('#importo', '15'); await c.click('#aggiungi');
          await c.type('#descrizione', 'Caffè'); await c.type('#importo', '1.2'); await c.click('#aggiungi');
          const b = c.$('#spese li button'); need(b, 'Manca il bottone di eliminazione nei <li>.');
          await c.click(b);
          need(c.$$('#spese li').length === 1, 'Dopo l\'eliminazione deve restare 1 spesa.');
          need(/1[.,]20|15[.,]00/.test(c.text('#totale')), `Dopo l'eliminazione il totale non è corretto: "${c.text('#totale')}".`);
        } },
        { t: 'Salvataggio', f: async (c) => {
          await c.type('#descrizione', 'Treno'); await c.type('#importo', '9.9'); await c.click('#aggiungi');
          await c.reload();
          need(c.$$('#spese li').some((li) => c.text(li).includes('Treno')), 'Dopo il ricaricamento la spesa non c\'è più.');
          need(/9[.,]90/.test(c.text('#totale')), 'Dopo il ricaricamento il totale non è corretto.');
        } }
      ]
    }]
  },
  {
    id: 'z03', group: 'zero', emoji: '📝', title: 'Blocco note',
    intro: 'Un blocco note che salva da solo mentre scrivi.',
    tabs: ['html', 'css', 'js'], start: { html: '', css: '', js: '' },
    skills: ['Salvataggio automatico con l\'evento input', 'Contatori dal vivo'],
    steps: [{
      title: 'Requisiti',
      task: `<ul class="req"><li>una <code>&lt;textarea id="nota"&gt;</code></li><li>il testo si salva da solo mentre scrivi e ricompare riaprendo la pagina</li><li><code>#caratteri</code> mostra quanti caratteri ci sono (anche all'avvio)</li><li><code>#cancella</code> svuota la nota (anche quella salvata) e azzera il contatore</li></ul>${METODO}`,
      hints: ['L\'evento "input" scatta a ogni tasto.'],
      checks: [
        { t: 'Salva mentre scrivi', f: async (c) => { await c.type('#nota', 'Comprare il pane'); await c.reload(); need(c.el('#nota').value === 'Comprare il pane', 'Dopo il ricaricamento la nota non c\'è più.'); } },
        { t: 'Conta i caratteri', f: async (c) => {
          need(num(c.text('#caratteri')) === 0, 'All\'avvio #caratteri deve indicare 0.');
          await c.type('#nota', 'Ciao!'); need(num(c.text('#caratteri')) === 5, `Con "Ciao!" #caratteri deve indicare 5, mostra "${c.text('#caratteri')}".`);
          await c.reload(); need(num(c.text('#caratteri')) === 5, 'Riaprendo la pagina #caratteri deve essere già corretto.');
        } },
        { t: 'Cancella tutto', f: async (c) => {
          await c.type('#nota', 'Da cancellare'); await c.click('#cancella');
          need(c.el('#nota').value === '' && num(c.text('#caratteri')) === 0, '#cancella deve svuotare la nota e azzerare #caratteri.');
          await c.reload(); need(c.el('#nota').value === '', 'Dopo #cancella e ricaricamento la vecchia nota ricompare: va cancellata anche dal salvataggio.');
        } }
      ]
    }]
  },
  {
    id: 'z04', group: 'zero', emoji: '🔐', title: 'Generatore di password',
    intro: 'Genera password casuali con le opzioni scelte dall\'utente.',
    tabs: ['html', 'css', 'js'], start: { html: '', css: '', js: '' },
    skills: ['Numeri casuali con Math.random', 'Checkbox e opzioni', 'Costruire stringhe in un ciclo'],
    steps: [{
      title: 'Requisiti',
      task: `<ul class="req"><li><code>&lt;input type="number" id="lunghezza"&gt;</code>, due checkbox <code>#numeri</code> e <code>#simboli</code>, bottone <code>#genera</code></li><li>la password appare in <code>#password</code> ed è lunga esattamente quanto richiesto</li><li>senza opzioni: solo lettere (maiuscole e minuscole)</li><li>con <code>#numeri</code>: contiene <strong>sempre</strong> almeno una cifra</li><li>con <code>#simboli</code>: contiene <strong>sempre</strong> almeno un simbolo (es. <code>!@#$%&amp;*</code>)</li></ul>${METODO}`,
      hints: ['Math.floor(Math.random() * testo.length) ti dà una posizione casuale in una stringa.', '"Sempre almeno uno": puoi inserire di sicuro un carattere di quel tipo in una posizione a caso.'],
      checks: [
        { t: 'Lunghezza giusta, solo lettere', f: async (c) => {
          await c.type('#lunghezza', '12'); await c.check('#numeri', false); await c.check('#simboli', false); await c.click('#genera');
          const p = c.text('#password');
          need(p.length === 12, `Ho chiesto 12 caratteri e la password ne ha ${p.length} ("${p}").`);
          need(/^[a-zA-Z]+$/.test(p), `Senza opzioni la password deve avere solo lettere: "${p}".`);
        } },
        { t: 'Con #numeri c\'è sempre una cifra', f: async (c) => {
          await c.type('#lunghezza', '8'); await c.check('#numeri', true); await c.check('#simboli', false);
          for (let i = 0; i < 25; i++) { await c.click('#genera'); const p = c.text('#password'); need(p.length === 8 && /\d/.test(p), `Con #numeri attivo ho ottenuto "${p}": serve sempre almeno una cifra (e lunghezza 8).`); }
        } },
        { t: 'Con #simboli c\'è sempre un simbolo', f: async (c) => {
          await c.type('#lunghezza', '8'); await c.check('#numeri', false); await c.check('#simboli', true);
          for (let i = 0; i < 25; i++) { await c.click('#genera'); const p = c.text('#password'); need(p.length === 8 && /[^a-zA-Z0-9]/.test(p), `Con #simboli attivo ho ottenuto "${p}": serve sempre almeno un simbolo.`); }
        } },
        { t: 'Ogni volta una password diversa', f: async (c) => {
          await c.type('#lunghezza', '16'); await c.click('#genera'); const a = c.text('#password'); await c.click('#genera');
          need(a !== c.text('#password'), 'Due generazioni di fila hanno dato la stessa password.');
        } }
      ]
    }]
  },

  // ───────────────────────────── LABORATORIO LIBERO
  {
    id: 'lab', group: 'libero', emoji: '🧪', title: 'Laboratorio libero',
    intro: 'Nessun controllo, nessun suggerimento: costruisci quello che vuoi. Quando è pronto, esportalo e portalo sul tuo PC.',
    tabs: ['html', 'css', 'js'], start: { html: '<h1>La mia app</h1>\n', css: '', js: '' },
    skills: [],
    free: `<p><strong>Idee per allenarti:</strong></p>
           <ul><li>🎲 Lancio dei dadi con storico dei lanci</li><li>✅ Lista di cose da fare con filtri (tutte / da fare / fatte)</li><li>🃏 Memory con le carte da girare</li><li>📅 Conto alla rovescia per una data</li><li>🎯 Indovina il numero (troppo alto / troppo basso)</li><li>🧮 Calcolatrice</li><li>📚 La tua libreria personale con voti e ricerca</li></ul>${METODO}`,
    steps: []
  }
];
