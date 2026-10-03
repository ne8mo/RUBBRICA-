// Crea il file unico "AppuntiSlide.html" (tutto incluso, funziona offline con doppio clic).
// Uso: node build.js
const fs = require("fs");
const path = require("path");
const r = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
const safe = (js) => js.replace(/<\/script/gi, "<\\/script");
const parts = {
  "/*__CSS__*/": r("src/style.css"),
  "/*__PDFJS__*/": safe(r("vendor/pdf.min.js")),
  "/*__PDFWORKER__*/": safe(r("vendor/pdf.worker.min.js")),
  "/*__JSZIP__*/": safe(r("vendor/jszip.min.js")),
  "/*__APP__*/": safe(r("src/app.js")),
  // Motore OCR (Tesseract) e lingue italiano/inglese, incorporati come testo
  "/*__TESSCORE__*/": safe(r("vendor/tesseract-core-simd-lstm.wasm.js")),
  "/*__TESSENG__*/": fs.readFileSync(path.join(__dirname, "vendor/eng.traineddata.gz")).toString("base64"),
  "/*__TESSITA__*/": fs.readFileSync(path.join(__dirname, "vendor/ita.traineddata.gz")).toString("base64"),
};
let html = r("src/index.html");
for (const [k, v] of Object.entries(parts)) html = html.replace(k, () => v);
fs.writeFileSync(path.join(__dirname, "AppuntiSlide.html"), html);
console.log("Creato AppuntiSlide.html (" + (html.length / 1024 / 1024).toFixed(2) + " MB)");
