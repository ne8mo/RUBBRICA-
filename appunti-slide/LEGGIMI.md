# Appunti dalle Slide

App che funziona sul tuo computer e non serve installarla. Carichi le slide e ottieni gli appunti.

## Come si usa
1. Fai **doppio clic su `AppuntiSlide.html`**. Si apre nel browser (meglio Chrome o Edge).
2. Trascina le slide nel riquadro al centro, oppure clicca **scegli i file**.
   Puoi caricare, anche tanti insieme:
   - **PDF**, compresi quelli scansionati
   - **PowerPoint** nuovo (.pptx, .ppsx) e vecchio (.ppt, .pps)
   - **LibreOffice / OpenOffice** (.odp)
   - **foto e scansioni** (JPG, PNG, GIF, BMP, WEBP): ogni immagine diventa una slide
3. Per ogni slide vedi a sinistra l'immagine e a destra gli appunti.
   Sotto ogni slide c'è uno spazio per scrivere le **tue annotazioni**, che si salvano da sole.

## Gli appunti
- Riportano **solo il testo che c'è nelle slide**, nello stesso ordine: titolo, punti, sottopunti, tabelle.
  Nei PowerPoint ci sono anche le **note del relatore**.
- Rispetta l'impaginazione: le slide a **due colonne** si leggono una colonna per volta, le **tabelle** diventano righe con le celle separate da «|», le frasi che vanno a capo restano intere e i pedici restano al loro posto (CO2).
- L'app non inventa e non riassume nulla. Toglie solo i numeri di pagina e le intestazioni o i piè di pagina che si ripetono su tutte le slide.
- **Slide fatte di immagini** (scansioni, foto, testo dentro un'immagine): l'app legge il testo dall'immagine, tutto sul computer e senza internet.
  Questi appunti hanno l'etichetta gialla **"letto dall'immagine"**. Sulle immagini difficili (foto storte, luce non uniforme, sfondi scuri, bassa risoluzione) l'app fa una seconda lettura più accurata e tiene la migliore.
  Le parole su cui l'app non è sicura sono **evidenziate in giallo**: controllale sulla slide accanto.
- **Correggi**: ogni slide ha il pulsante *Correggi* per sistemare a mano gli appunti (prima riga = titolo, ogni punto inizia con «- »). Le correzioni si salvano da sole.
- Se una slide ha sia testo sia immagini con scritte (per esempio uno screenshot o una tabella incollata come immagine), il testo delle immagini compare a parte, sotto **"Testo nelle immagini della slide"**.
- Le scritte a mano e le immagini molto piccole o confuse possono non essere lette. Le foto senza scritte vengono ignorate.
- Keynote (.key): esporta prima la presentazione in PDF o PowerPoint.

## Schemi (mappe con forme e frecce)
Clicca **Schemi** in alto: accanto agli appunti si apre un foglio dove costruire il tuo schema.
- **Forme**: rettangolo, quadrato, triangolo, cerchio/ovale, rombo e solo testo. Clicca una forma per aggiungerla; scegli il colore dai pallini.
- **Diramazioni**: seleziona una forma e premi il **+** blu (o il tasto **Tab**) per farne partire un ramo. Trascinando il **+** su un'altra forma le colleghi. Con **Collega** unisci due forme qualsiasi; cliccando una freccia puoi trasformarla in linea o tratteggio.
- **Scrivere**: doppio clic su una forma (o tasto Invio). La forma si allarga da sola per contenere il testo.
- **Parole dagli appunti**: seleziona delle parole negli appunti e **trascinale** nel foglio, oppure usa **＋ Schema** nel menu che compare, oppure il **+** che appare accanto a ogni riga degli appunti. Se le lasci cadere su una forma vuota la riempiono; su una forma piena creano un nuovo ramo.
- **Testo non ancora elaborato**: con **Testo libero** si apre un riquadro dove scrivere o incollare qualsiasi testo, oppure **importarlo da un file** (PDF, PowerPoint, foto, .txt) senza trasformarlo in appunti. Seleziona le parole e trascinale, o premi *Aggiungi selezione* (una forma per riga).
- **Bozza dagli appunti**: crea in un attimo uno schema con il titolo della slide al centro e i suoi punti come rami (c'è anche il pulsante *Schema* su ogni slide). Usa solo le parole degli appunti; poi modifichi tutto come vuoi.
- Sposta le forme trascinandole, ridimensionale dal quadratino in basso a destra, elimina con **Canc**. **Annulla/Ripeti** con Ctrl+Z / Ctrl+Y. Trascina il foglio per spostarti, Ctrl + rotella per lo zoom, **Adatta** per vedere tutto.
- Puoi avere **più schemi** (Nuovo, rinomina ✎, elimina 🗑): si salvano da soli.
- **Immagine** salva lo schema come PNG; **Stampa / PDF** lo stampa o lo salva in PDF.

## Traduzione italiano ⇄ inglese
La traduzione avviene **tutta sul computer**: niente internet, niente servizi o app esterne. Il traduttore è dentro il file (è lo stesso motore che usa Firefox per tradurre senza connessione).
- **Appunti in** (in alto): scegli *Italiano* o *English* e tutti gli appunti vengono mostrati tradotti.
  Le slide che sono già in quella lingua restano come sono.
- **Traduttore**: scrivi o incolla un testo e la traduzione appare mentre scrivi. Il tasto ⇄ inverte le lingue.
- Puoi anche **selezionare del testo** negli appunti e cliccare **Traduci**.
- La prima volta che traduci servono alcuni secondi per preparare il traduttore; dopo è immediato.
- È una traduzione automatica, quindi può contenere qualche imprecisione. Il testo originale delle slide non viene mai modificato: per tornarci scegli *Lingua originale*.

## Esportare
**Esporta appunti** → documento Word (.doc), testo (.txt) oppure stampa / salva come PDF.

## Dove finiscono i dati
Tutto resta nel browser di questo computer. L'app non si collega a internet e non invia niente a nessuno.
Se riapri il file con lo stesso browser, ritrovi slide e annotazioni.
**Svuota tutto** cancella ogni cosa.

---
## Il file
`AppuntiSlide.html` pesa circa 55 MB perché contiene tutto: lettore di PDF e PowerPoint, lettura del testo nelle immagini e traduttore. Per mandarlo a qualcuno usa un servizio come Google Drive, WeTransfer o una chiavetta (per una normale email è troppo grande).

---
Per gli sviluppatori: il codice sorgente è in `src/` e le librerie sono in `vendor/`: pdf.js, JSZip, Tesseract OCR con le lingue italiano e inglese, e il traduttore Bergamot (Mozilla) con i modelli italiano⇄inglese di Firefox Translations in `vendor/traduzione/`.
Con `node build.js` si rigenera `AppuntiSlide.html`.
