# Appunti dalle Slide

App che funziona sul tuo computer e non serve installarla. Carichi le slide e ottieni gli appunti.

## Come si usa
1. Fai **doppio clic su `AppuntiSlide.html`**. Si apre nel browser (meglio Chrome o Edge).
2. Trascina le slide nel riquadro al centro, oppure clicca **scegli i file**.
   Puoi caricare file **PDF** e **PowerPoint (.pptx)**, anche tanti insieme.
3. Per ogni slide vedi a sinistra l'immagine e a destra gli appunti.
   Sotto ogni slide c'è uno spazio per scrivere le **tue annotazioni**, che si salvano da sole.

## Gli appunti
- Riportano **solo il testo che c'è nelle slide**, nello stesso ordine: titolo, punti, sottopunti, tabelle.
  Nei PowerPoint ci sono anche le **note del relatore**.
- L'app non inventa e non riassume nulla. Toglie solo i numeri di pagina e le intestazioni o i piè di pagina che si ripetono su tutte le slide.
- Se una slide è solo un'immagine (per esempio una scansione), l'app non può leggerne il testo e te lo segnala.
- I vecchi file `.ppt`: aprili in PowerPoint e salvali come `.pptx` o PDF.

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
Per gli sviluppatori: il codice sorgente è in `src/` e le librerie (pdf.js, JSZip) sono in `vendor/`.
Con `node build.js` si rigenera `AppuntiSlide.html`.
