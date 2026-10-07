// engine.js — costruisce la pagina scritta dall'utente e la mette alla prova.

// Errore "didattico": un controllo non superato, con un messaggio per l'utente.
class Fail extends Error {}
const need = (cond, msg) => { if (!cond) throw new Fail(msg); };
const show = (v) => {
  if (v === undefined) return 'undefined';
  try { return JSON.stringify(v); } catch (e) { return String(v); }
};
// Confronta due valori (anche array e oggetti) e spiega la differenza.
const eq = (actual, expected, label) => {
  if (show(actual) === show(expected)) return;
  let msg = `${label} ha restituito ${show(actual)}, mi aspettavo ${show(expected)}.`;
  if (actual === undefined) msg += ' Hai dimenticato il return?';
  throw new Fail(msg);
};

const Engine = (() => {
  // Questo codice gira DENTRO la pagina dell'utente, prima del suo codice.
  function shimCode(PREFIX, TEST, JSLINE) {
    var lab = { logs: [], errors: [] };
    window.__lab = lab;
    function send(kind, text) {
      if (TEST) return;
      try { parent.postMessage({ __lab: true, kind: kind, text: text }, '*'); } catch (e) {}
    }

    // localStorage separato per ogni missione, così la tua app non tocca i dati dell'Officina.
    var real = null;
    try { real = window.localStorage; real.getItem('__prova'); } catch (e) { real = null; }
    if (!real) {
      var mem;
      try { mem = parent.__labMem || (parent.__labMem = {}); } catch (e) { mem = {}; }
      real = {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
        setItem: function (k, v) { mem[k] = String(v); },
        removeItem: function (k) { delete mem[k]; },
        key: function (i) { return Object.keys(mem)[i] || null; },
        get length() { return Object.keys(mem).length; }
      };
    }
    function keys() {
      var out = [];
      for (var i = 0; i < real.length; i++) {
        var k = real.key(i);
        if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length));
      }
      return out;
    }
    var store = {
      getItem: function (k) { return real.getItem(PREFIX + k); },
      setItem: function (k, v) { real.setItem(PREFIX + k, String(v)); },
      removeItem: function (k) { real.removeItem(PREFIX + k); },
      clear: function () { keys().forEach(function (k) { real.removeItem(PREFIX + k); }); },
      key: function (i) { var k = keys(); return i < k.length ? k[i] : null; },
      get length() { return keys().length; }
    };
    try { Object.defineProperty(window, 'localStorage', { value: store, configurable: true }); } catch (e) {}

    function fmt(v) {
      if (typeof v === 'string') return v;
      try {
        if (v instanceof Element) return '<' + v.tagName.toLowerCase() + (v.id ? ' id="' + v.id + '"' : '') + '>';
        if (typeof v === 'function') return 'ƒ ' + (v.name || 'anonima') + '()';
        var s = JSON.stringify(v);
        return s === undefined ? String(v) : s;
      } catch (e) { return String(v); }
    }
    ['log', 'info', 'warn', 'error'].forEach(function (m) {
      var orig = console[m] ? console[m].bind(console) : function () {};
      console[m] = function () {
        var text = Array.prototype.map.call(arguments, fmt).join(' ');
        lab.logs.push(text);
        send(m, text);
        orig.apply(null, arguments);
      };
    });
    function where(line) {
      if (!line) return '';
      return line > JSLINE ? ' (JS riga ' + (line - JSLINE) + ')' : ' (riga ' + line + ' della pagina)';
    }
    window.addEventListener('error', function (e) {
      var msg = (e.message || 'Errore') + where(e.lineno);
      lab.errors.push(msg);
      send('error', msg);
    });
    window.addEventListener('unhandledrejection', function (e) {
      var r = e.reason;
      var msg = 'Promise rifiutata: ' + (r && r.message ? r.message : String(r));
      lab.errors.push(msg);
      send('error', msg);
    });
    if (TEST) {
      // Durante la verifica le finestre bloccanti diventano messaggi in console.
      window.alert = function (m) { lab.logs.push('[alert] ' + m); };
      window.confirm = function () { return true; };
      window.prompt = function () { return ''; };
    }
  }

  function insertAt(doc, index, s) { return doc.slice(0, index) + s + doc.slice(index); }
  function afterTag(doc, re) { const m = doc.match(re); return m ? m.index + m[0].length : -1; }

  // Mette insieme HTML, CSS e JS in un'unica pagina.
  // bare = true → senza il codice dell'Officina (per l'esportazione).
  function build(code, opts = {}) {
    const html = code.html || '';
    const css = code.css || '';
    const js = (code.js || '').replace(/<\/script/gi, '<\\/script');
    const head = opts.bare ? '' :
      `<script>(${shimCode.toString()})(${JSON.stringify(opts.prefix || 'lab:')}, ${!!opts.test}, __JSLINE__);<\/script>` +
      (opts.setup ? `<script>${opts.setup}<\/script>` : '');
    const style = css.trim() ? `<style>\n${css}\n</style>\n` : '';
    const hasJs = js.trim().length > 0;
    const script = hasJs ? `<script>\n${js}\n<\/script>\n` : '';

    let doc;
    const full = /<!doctype|<html[\s>]/i.test(html);
    if (full) {
      doc = html;
      let i = afterTag(doc, /<head[^>]*>/i);
      if (i < 0) i = afterTag(doc, /<html[^>]*>/i);
      if (i < 0) i = afterTag(doc, /<!doctype[^>]*>/i);
      doc = insertAt(doc, Math.max(i, 0), head);
      const endHead = doc.search(/<\/head>/i);
      if (style) doc = endHead >= 0 ? insertAt(doc, endHead, style) : insertAt(doc, Math.max(afterTag(doc, /<\/script>/i), 0), style);
    } else {
      doc = `<!DOCTYPE html>\n<html lang="it">\n<head>\n<meta charset="UTF-8">\n${head}\n${style}</head>\n<body>\n${html}\n</body>\n</html>`;
    }
    let jsStart = -1;
    if (hasJs) {
      let end = doc.toLowerCase().lastIndexOf('</body>');
      if (end < 0) end = doc.toLowerCase().lastIndexOf('</html>');
      if (end < 0) end = doc.length;
      doc = insertAt(doc, end, script);
      jsStart = end + '<script>\n'.length;
    }
    const jsLine = jsStart >= 0 ? doc.slice(0, jsStart).split('\n').length - 1 : 1e9;
    return doc.replace('__JSLINE__', String(jsLine));
  }

  // Carica la pagina in un iframe nuovo (così timer e dati vecchi spariscono).
  function render(host, code, opts) {
    return new Promise((resolve) => {
      host.querySelectorAll('iframe').forEach((f) => f.remove());
      const frame = document.createElement('iframe');
      frame.title = 'Anteprima della tua app';
      frame.srcdoc = build(code, opts);
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(frame); } };
      frame.addEventListener('load', () => {
        try { if (frame.contentWindow.__lab) finish(); } catch (e) { finish(); }
      });
      host.appendChild(frame);
      setTimeout(finish, 3000);
    });
  }

  function clearStorage(prefix) {
    try {
      const ls = window.localStorage;
      const del = [];
      for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(prefix)) del.push(k); }
      del.forEach((k) => ls.removeItem(k));
    } catch (e) {
      if (window.__labMem) Object.keys(window.__labMem).forEach((k) => { if (k.startsWith(prefix)) delete window.__labMem[k]; });
    }
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Il "contesto" che i controlli usano per provare la pagina come farebbe un utente.
  function makeCtx(host, code, opts) {
    const low = { html: (code.html || ''), css: (code.css || ''), js: (code.js || '') };
    const c = {
      src: low,
      wait,
      async load() {
        c.frame = await render(host, code, opts);
        c.win = c.frame.contentWindow;
        c.doc = c.win.document;
        await wait(40);
      },
      reload() { return c.load(); },
      get logs() { return (c.win.__lab && c.win.__lab.logs) || []; },
      get errors() { return (c.win.__lab && c.win.__lab.errors) || []; },
      $: (s) => c.doc.querySelector(s),
      $$: (s) => Array.from(c.doc.querySelectorAll(s)),
      el(x) {
        if (typeof x !== 'string') return x;
        const e = c.$(x);
        need(e, `Non trovo l'elemento ${x} nella pagina.`);
        return e;
      },
      text: (x) => {
        const e = typeof x === 'string' ? c.$(x) : x;
        if (!e) return '';
        const t = 'value' in e && /^(INPUT|TEXTAREA|OUTPUT)$/.test(e.tagName) ? e.value : e.textContent;
        return String(t || '').replace(/\s+/g, ' ').trim();
      },
      style: (x, prop) => c.win.getComputedStyle(c.el(x))[prop],
      visible(x) {
        const e = c.el(x);
        if (e.hidden) return false;
        for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
          const s = c.win.getComputedStyle(n);
          if (s.display === 'none' || s.visibility === 'hidden') return false;
        }
        return true;
      },
      get(name) { try { return c.win.eval(name); } catch (e) { return undefined; } },
      fn(name) {
        const f = c.get(name);
        need(typeof f === 'function', `Non trovo la funzione ${name}. Controlla il nome (maiuscole comprese) e che non ci siano errori nel codice.`);
        return f;
      },
      async click(x, times = 1) {
        const e = c.el(x);
        for (let i = 0; i < times; i++) e.click();
        await wait(20);
      },
      async type(x, value) {
        const e = c.el(x);
        e.focus && e.focus();
        e.value = value;
        e.dispatchEvent(new c.win.Event('input', { bubbles: true }));
        e.dispatchEvent(new c.win.Event('change', { bubbles: true }));
        await wait(10);
      },
      async check(x, on) {
        const e = c.el(x);
        e.checked = on;
        e.dispatchEvent(new c.win.Event('input', { bubbles: true }));
        e.dispatchEvent(new c.win.Event('change', { bubbles: true }));
        await wait(10);
      },
      async key(x, key) {
        const e = c.el(x);
        const keyCode = key === 'Enter' ? 13 : 0;
        for (const t of ['keydown', 'keypress', 'keyup']) {
          e.dispatchEvent(new c.win.KeyboardEvent(t, { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true }));
        }
        await wait(20);
      },
      async submit(x) {
        const form = c.el(x);
        const before = c.doc;
        if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new c.win.Event('submit', { bubbles: true, cancelable: true }));
        await wait(80);
        let same = true;
        try { same = c.frame.contentWindow.document === before; } catch (e) { same = false; }
        need(same, 'La pagina si è ricaricata quando hai inviato il modulo: hai dimenticato event.preventDefault()?');
      }
    };
    return c;
  }

  // Esegue i controlli di un passo, uno alla volta, ognuno su una pagina appena caricata.
  async function runChecks(host, code, checks, opts, onEach) {
    const results = [];
    for (const chk of checks) {
      clearStorage(opts.prefix);
      const c = makeCtx(host, code, opts);
      let pass = false, msg = '';
      try {
        await c.load();
        const r = await Promise.race([
          Promise.resolve(chk.f(c)),
          wait(12000).then(() => { throw new Fail('La prova ci sta mettendo troppo: forse un ciclo che non finisce mai?'); })
        ]);
        if (typeof r === 'string') msg = r;
        else pass = r !== false;
      } catch (e) {
        msg = e instanceof Fail ? e.message : `Durante la prova il tuo codice ha dato un errore: ${e && e.message ? e.message : e}`;
      }
      if (!pass) {
        let errs = [];
        try { errs = c.errors; } catch (e) {}
        if (errs.length) msg += ` ⚠️ Errore nel codice: ${errs[0]}`;
      }
      const res = { t: chk.t, pass, msg };
      results.push(res);
      onEach && onEach(res, results.length);
    }
    clearStorage(opts.prefix);
    return results;
  }

  // Traduce gli errori più comuni in consigli comprensibili.
  function explain(msg) {
    const m = String(msg);
    const rules = [
      [/is not defined/, 'Stai usando un nome che non esiste. Controlla di averlo dichiarato (const/let/function) e scritto uguale, maiuscole comprese.'],
      [/Cannot read propert(y|ies) of (null|undefined)/, 'Stai usando qualcosa che non esiste (null/undefined). Spesso è un id sbagliato in getElementById o querySelector: controlla che sia identico nell\'HTML.'],
      [/Cannot set propert(y|ies) of (null|undefined)/, 'Stai modificando un elemento che non esiste: controlla l\'id/selettore.'],
      [/is not a function/, 'Stai chiamando con () qualcosa che non è una funzione. Controlla il nome del metodo (es. addEventListener, querySelector).'],
      [/Unexpected token|Unexpected end of input|missing \) after|Unexpected identifier|Invalid or unexpected token|Unexpected string/, 'Errore di sintassi: manca o c\'è in più una parentesi, una graffa, una virgola o una virgoletta. Guarda la riga indicata e quelle subito prima.'],
      [/Assignment to constant variable/, 'Stai cambiando una variabile dichiarata con const. Se deve cambiare, usa let.'],
      [/has already been declared/, 'Hai dichiarato due volte la stessa variabile. Togli uno dei due const/let.'],
      [/before initialization/, 'Stai usando una variabile prima della riga in cui la dichiari. Sposta la dichiarazione più in alto.'],
      [/JSON/, 'Problema con JSON: forse stai facendo JSON.parse di qualcosa che non è JSON valido (o è null).']
    ];
    for (const [re, tip] of rules) if (re.test(m)) return tip;
    return '';
  }

  return { build, render, runChecks, clearStorage, explain };
})();
