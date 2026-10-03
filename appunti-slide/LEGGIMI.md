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

## Traduzione italiano ⇄ inglese
- **Appunti in** (in alto): scegli *Italiano* o *English* e tutti gli appunti vengono mostrati tradotti.
  Le slide che sono già in quella lingua restano come sono.
- **Traduttore**: scrivi o incolla un testo e la traduzione appare mentre scrivi. Il tasto ⇄ inverte le lingue.
- Puoi anche **selezionare del testo** negli appunti e cliccare **Traduci**.
- Chrome ed Edge aggiornati traducono direttamente sul computer, anche senza internet.
  Con gli altri browser la traduzione usa internet.
  La traduzione è automatica, quindi può contenere qualche imprecisione. Il testo originale delle slide non viene mai modificato.

## Esportare
**Esporta appunti** → documento Word (.doc), testo (.txt) oppure stampa / salva come PDF.

## Dove finiscono i dati
Tutto resta nel browser di questo computer. Niente viene inviato a nessuno, tranne il testo da tradurre quando la traduzione passa da internet.
Se riapri il file con lo stesso browser, ritrovi slide e annotazioni.
**Svuota tutto** cancella ogni cosa.

---
Per gli sviluppatori: il codice sorgente è in `src/` e le librerie (pdf.js, JSZip, Tesseract OCR con le lingue italiano e inglese) sono in `vendor/`.
Con `node build.js` si rigenera `AppuntiSlide.html`.
