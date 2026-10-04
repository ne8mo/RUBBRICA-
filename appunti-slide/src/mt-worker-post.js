// Gestione dei messaggi: carica i modelli e traduce.
var __service = null, __models = {};
function __mem(buf, align) {
  var bytes = new Int8Array(buf);
  var m = new Module.AlignedMemory(bytes.byteLength, align);
  m.getByteArrayView().set(bytes);
  return m;
}
var __CONFIG = "beam-size: 1\nnormalize: 1.0\nword-penalty: 0\ncpu-threads: 0\ngemm-precision: int8shiftAlphaAll\nskip-cost: true\n" +
  "alignment: soft\nquiet: true\nquiet-translation: true\nmax-length-break: 128\nmini-batch-words: 1024\nworkspace: 128\nmax-length-factor: 2.0\n";
onmessage = async function (e) {
  var m = e.data;
  try {
    if (m.type === "wasm") { __wasmReady(m.bin); await __runtimePromise; __service = new Module.BlockingService({ cacheSize: 0 }); postMessage({ type: "ready" }); }
    else if (m.type === "model") {
      var vocabs = new Module.AlignedMemoryList();
      vocabs.push_back(__mem(m.vocab, 64));
      __models[m.pair] = new Module.TranslationModel(__CONFIG, __mem(m.model, 256), __mem(m.lex, 64), vocabs, null);
      postMessage({ type: "loaded", id: m.id });
    } else if (m.type === "translate") {
      var input = new Module.VectorString(), opts = new Module.VectorResponseOptions();
      m.texts.forEach(function (t) { input.push_back(t); opts.push_back({ alignment: false, html: false, qualityScores: false }); });
      var res = __service.translate(__models[m.pair], input, opts);
      var out = m.texts.map(function (_, i) { return res.get(i).getTranslatedText(); });
      input.delete(); opts.delete(); res.delete();
      postMessage({ type: "result", id: m.id, out: out });
    }
  } catch (err) { postMessage({ type: "error", id: m.id, msg: String((err && err.message) || err) }); }
};
