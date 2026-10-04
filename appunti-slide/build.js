// Crea il file unico "AppuntiSlide.html" (tutto incluso, funziona offline con doppio clic).
// Uso: node build.js            -> AppuntiSlide.html (completo, con i modelli di traduzione)
//      node build.js anteprima  -> anteprima/ (pagina + modelli in file separati, per l'anteprima online)
const fs = require("fs");
const path = require("path");
const r = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
const b64 = (p) => fs.readFileSync(path.join(__dirname, p)).toString("base64");
const safe = (js) => js.replace(/<\/script/gi, "<\\/script");
const preview = process.argv[2] === "anteprima";
const T = "vendor/traduzione/";
const MODELS = [
  ["mt-model-enit", "model.enit.intgemm.alphas.bin.gz"], ["mt-lex-enit", "lex.50.50.enit.s2t.bin.gz"],
  ["mt-model-iten", "model.iten.intgemm.alphas.bin.gz"], ["mt-lex-iten", "lex.50.50.iten.s2t.bin.gz"],
  ["mt-vocab", "vocab.it-en.spm.gz"],
];
const parts = {
  "/*__CSS__*/": r("src/style.css"),
  "/*__PDFJS__*/": safe(r("vendor/pdf.min.js")),
  "/*__PDFWORKER__*/": safe(r("vendor/pdf.worker.min.js")),
  "/*__JSZIP__*/": safe(r("vendor/jszip.min.js")),
  "/*__APP__*/": safe(r("src/app.js").replace("/*__SCHEMA__*/", () => r("src/schema.js"))),
  // Motore OCR (Tesseract) e lingue italiano/inglese, incorporati come testo
  "/*__TESSCORE__*/": safe(r("vendor/tesseract-core-simd-lstm.wasm.js")),
  "/*__TESSENG__*/": b64("vendor/eng.traineddata.gz"),
  "/*__TESSITA__*/": b64("vendor/ita.traineddata.gz"),
  // Traduttore offline (Bergamot, lo stesso motore della traduzione di Firefox) e modelli it⇄en
  "/*__MTWORKER__*/": safe(r("src/mt-worker-pre.js") + "\n" + r(T + "bergamot-translator-worker.js") + "\n" + r("src/mt-worker-post.js")),
  "/*__MTWASM__*/": b64(T + "bergamot.wasm.gz"),
  "/*__MTMODELS__*/": preview ? "" : MODELS.map(([id, f]) => `<script type="text/plain" id="${id}">${b64(T + f)}</script>`).join("\n"),
};
let html = r("src/index.html");
for (const [k, v] of Object.entries(parts)) html = html.replace(k, () => v);
if (preview) {
  const dir = path.join(__dirname, "anteprima");
  fs.mkdirSync(path.join(dir, "traduzione"), { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
  MODELS.forEach(([id, f]) => fs.copyFileSync(path.join(__dirname, T, f), path.join(dir, "traduzione", id + ".bin.wasm")));
  console.log("Creata anteprima/ (" + (html.length / 1024 / 1024).toFixed(2) + " MB + modelli)");
} else {
  fs.writeFileSync(path.join(__dirname, "AppuntiSlide.html"), html);
  console.log("Creato AppuntiSlide.html (" + (html.length / 1024 / 1024).toFixed(2) + " MB)");
}
