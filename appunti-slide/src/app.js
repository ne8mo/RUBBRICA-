/* Appunti dalle Slide — funziona tutto in locale, nel browser. */
(function () {
  "use strict";

  pdfjsLib.GlobalWorkerOptions.workerSrc = "inline"; // il worker è già caricato nella pagina (pdfjsWorker)

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  /* ------------------------------------------------------------------ */
  /* Archivio locale (IndexedDB): file, slide, annotazioni, traduzioni   */
  /* ------------------------------------------------------------------ */
  const DB = (() => {
    // Archivio del browser (IndexedDB). Se il browser lo blocca o non risponde (succede in alcune
    // anteprime online), l'app continua lo stesso tenendo i dati in memoria finché la pagina è aperta.
    let dbp = null;
    let memory = false;
    const mem = {};
    const memStore = (n) => (mem[n] = mem[n] || new Map());
    const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
    function goMemory(reason) {
      if (memory) return;
      memory = true;
      console.warn("Archivio del browser non disponibile, uso la memoria:", reason);
      const note = document.getElementById("memNote");
      if (note) note.hidden = false;
    }
    function open() {
      if (dbp) return dbp;
      dbp = withTimeout(new Promise((res, rej) => {
        let req;
        try { req = indexedDB.open("appunti-slide", 2); } catch (e) { rej(e); return; }
        if (!req) { rej(new Error("archivio assente")); return; }
        req.onupgradeneeded = () => {
          const db = req.result;
          const has = (n) => db.objectStoreNames.contains(n);
          if (!has("files")) db.createObjectStore("files", { keyPath: "id" });
          if (!has("bytes")) db.createObjectStore("bytes");
          if (!has("slides")) db.createObjectStore("slides", { keyPath: "id" });
          if (!has("kv")) db.createObjectStore("kv");
          if (!has("schemas")) db.createObjectStore("schemas", { keyPath: "id" });
        };
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
        req.onblocked = () => rej(new Error("archivio bloccato"));
      }), 4000);
      dbp.catch((e) => goMemory(e));
      return dbp;
    }
    async function tx(store, mode, fn) {
      const db = await open();
      return withTimeout(new Promise((res, rej) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        let out;
        Promise.resolve(fn(s)).then((v) => { out = v; });
        t.oncomplete = () => res(out);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      }), 15000);
    }
    const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const keyOf = (val, key) => (key !== undefined ? key : val && val.id);
    // ogni operazione: prima l'archivio del browser, altrimenti la memoria
    async function run(idbOp, memOp, fallback) {
      if (!memory) {
        try { return await idbOp(); } catch (e) { if (!memory) { warn(e); if (/timeout|archivio|Security|InvalidState/i.test(String(e && (e.message || e.name)))) goMemory(e); else return fallback; } }
      }
      return memOp();
    }
    return {
      put: (store, val, key) => run(() => tx(store, "readwrite", (s) => { s.put(val, key); }), () => { memStore(store).set(keyOf(val, key), val); }),
      putMany: (store, vals) => run(() => tx(store, "readwrite", (s) => { vals.forEach((v) => s.put(v)); }), () => { vals.forEach((v) => memStore(store).set(v.id, v)); }),
      get: (store, key) => run(() => tx(store, "readonly", (s) => reqP(s.get(key))), () => memStore(store).get(key), undefined),
      all: (store) => run(() => tx(store, "readonly", (s) => reqP(s.getAll())), () => Array.from(memStore(store).values()), []),
      del: (store, key) => run(() => tx(store, "readwrite", (s) => { s.delete(key); }), () => { memStore(store).delete(key); }),
      clear: (store) => run(() => tx(store, "readwrite", (s) => { s.clear(); }), () => { memStore(store).clear(); }),
    };
  })();
  function warn(e) { console.warn(e); }

  /* ------------------------------------------------------------------ */
  /* Stato                                                              */
  /* ------------------------------------------------------------------ */
  const state = {
    files: [],        // {id, name, kind, order}
    slides: [],       // vedi makeSlide
    lang: "orig",
    showOrig: false,
    view: "both",
    query: "",
  };
  const fileBytes = new Map(); // fileId -> ArrayBuffer (solo PDF, per le anteprime)
  const pdfDocs = new Map();   // fileId -> Promise<PDFDocumentProxy>
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  /* ------------------------------------------------------------------ */
  /* Pulizia del testo                                                  */
  /* ------------------------------------------------------------------ */
  // Caratteri usati come pallini negli elenchi (anche quelli dei font Symbol/Wingdings).
  const BULLET_RE = /^[\s]*([•●○◦▪▫■□◆◇►▶▸▹➢➤➔→⇒✓✔✗✘❖⦿⁃∙·‣\-–—*❑❏]|[\uF000-\uF8FF])+\s*/;
  const ENUM_RE = /^\s*(\(?\d{1,2}[.)]|\(?[a-zA-Z][.)])\s+/;

  // Legature tipografiche (fi, fl, ffi…) anche quando il PDF le scrive con codici di controllo (LaTeX)
  const LIGATURES = {
    "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st",
    "\u001B": "ff", "\u001C": "fi", "\u001D": "fl", "\u001E": "ffi", "\u001F": "ffl",
    "\u000B": "ff", "\u000C": "fi", "\u000E": "ffi", "\u000F": "ffl",
  };
  function clean(s) {
    return (s || "")
      .replace(/[ﬀ-ﬆ\u000B\u000C\u000E\u000F\u001B-\u001F]/g, (c) => LIGATURES[c])
      .normalize("NFC") // NFC e non NFKC: così apici (²), pedici (₂) e simboli matematici restano intatti
      .replace(/[­​-‍﻿]/g, "")
      .replace(/[\u0000-\u0008\u000D\u0010-\u001A]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function stripBullet(s) {
    const m = s.match(BULLET_RE);
    if (m && m[0].length < s.length) return { text: s.slice(m[0].length).trim(), bullet: true };
    return { text: s, bullet: false };
  }
  // Righe da scartare perché non sono contenuto: numeri di pagina, ecc.
  function isPageNumber(s) {
    return /^(pag\.?|pagina|page|p\.|slide|diapositiva)?\s*\d{1,4}(\s*(\/|di|of)\s*\d{1,4})?$/i.test(s.trim());
  }

  /* ---------- Apici, pedici e formule scritte in linea ---------- */
  // Nel testo gli apici e i pedici che non hanno un carattere Unicode sono scritti ^{…} e _{…}
  const SUP_MAP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", "*": "*", "′": "′", "'": "′" };
  const SUB_MAP = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", "+": "₊", "-": "₋", "−": "₋", "=": "₌", "(": "₍", ")": "₎" };
  function supText(s, sub) {
    s = (s || "").trim();
    if (!s) return "";
    const map = sub ? SUB_MAP : SUP_MAP;
    if ([...s].every((c) => map[c])) return [...s].map((c) => map[c]).join("");
    return (sub ? "_{" : "^{") + s.replace(/[{}]/g, "") + "}";
  }
  const MARKUP_RE = /([\^_])\{([^{}]*)\}/g;
  // Versione in testo semplice (per copiare, cercare, tradurre, esportare in .txt)
  function plain(s) {
    return String(s || "").replace(MARKUP_RE, (_, k, v) => (k === "^" ? "^" : "_") + (v.length > 1 ? "(" + v + ")" : v));
  }
  // Versione HTML per Word
  function richHtml(s) {
    return esc(String(s || "")).replace(/([\^_])\{([^{}]*)\}/g, (_, k, v) => (k === "^" ? "<sup>" : "<sub>") + v + (k === "^" ? "</sup>" : "</sub>"));
  }

  /* ---------- Simboli dei font Symbol e Wingdings ---------- */
  // Codifica del font Symbol (lettere greche e simboli matematici)
  const SYMBOL_FONT_MAP = (() => {
    const m = {};
    const latin = "ABCDEFGHIKLMNOPQRSTUWXYZabcdefghiklmnopqrstuvwxyz";
    const greek = "ΑΒΧΔΕΦΓΗΙΚΛΜΝΟΠΘΡΣΤΥΩΞΨΖαβχδεφγηικλμνοπθρστυϖωξψζ";
    [...latin].forEach((c, i) => { m[c.charCodeAt(0)] = greek[i]; });
    Object.assign(m, {
      0x4A: "ϑ", 0x56: "ς", 0x6A: "ϕ", 0x22: "∀", 0x24: "∃", 0x27: "∋", 0x2A: "∗", 0x2D: "−", 0x40: "≅", 0x5C: "∴", 0x5E: "⊥", 0x60: "‾", 0x7E: "∼",
      0xA1: "ϒ", 0xA2: "′", 0xA3: "≤", 0xA4: "⁄", 0xA5: "∞", 0xA6: "ƒ", 0xA7: "♣", 0xA8: "♦", 0xA9: "♥", 0xAA: "♠", 0xAB: "↔", 0xAC: "←", 0xAD: "↑",
      0xAE: "→", 0xAF: "↓", 0xB0: "°", 0xB1: "±", 0xB2: "″", 0xB3: "≥", 0xB4: "×", 0xB5: "∝", 0xB6: "∂", 0xB7: "•", 0xB8: "÷", 0xB9: "≠", 0xBA: "≡",
      0xBB: "≈", 0xBC: "…", 0xC0: "ℵ", 0xC1: "ℑ", 0xC2: "ℜ", 0xC3: "℘", 0xC4: "⊗", 0xC5: "⊕", 0xC6: "∅", 0xC7: "∩", 0xC8: "∪", 0xC9: "⊃", 0xCA: "⊇",
      0xCB: "⊄", 0xCC: "⊂", 0xCD: "⊆", 0xCE: "∈", 0xCF: "∉", 0xD0: "∠", 0xD1: "∇", 0xD2: "®", 0xD3: "©", 0xD4: "™", 0xD5: "∏", 0xD6: "√", 0xD7: "⋅",
      0xD8: "¬", 0xD9: "∧", 0xDA: "∨", 0xDB: "⇔", 0xDC: "⇐", 0xDD: "⇑", 0xDE: "⇒", 0xDF: "⇓", 0xE0: "◊", 0xE1: "⟨", 0xE5: "∑", 0xF1: "⟩", 0xF2: "∫",
    });
    return m;
  })();
  // Wingdings / Dingbats: pallini, frecce e spunte più usati nelle presentazioni
  const DINGBAT_MAP = {
    wingdings: { 0x6C: "●", 0x6E: "■", 0x6F: "□", 0x71: "❑", 0x75: "◆", 0x76: "❖", 0x77: "⬥", 0x9F: "•", 0xA7: "▪", 0xA8: "◻", 0xD8: "➢", 0xDF: "←", 0xE0: "→", 0xE7: "←", 0xE8: "➔", 0xF0: "⇨", 0xFB: "✗", 0xFC: "✓", 0xFE: "☑", 0xFD: "☒", 0x46: "☞", 0x4A: "☺", 0x4C: "☹", 0xAB: "★" },
    zapf: { 0x33: "✓", 0x34: "✔", 0x35: "✕", 0x36: "✖", 0x37: "✗", 0x38: "✘", 0x48: "★", 0x6C: "●", 0x6E: "■", 0x6F: "❏", 0x71: "❑", 0x75: "◆", 0x76: "❖", 0xE0: "➠", 0xD8: "➘", 0xDC: "➜", 0xE8: "➨" },
  };
  const MATH_FONT_RE = /CMMI|CMSY|CMEX|CMBSY|CMMIB|MSAM|MSBM|EUFM|EUSM|EUEX|RSFS|STIX|Cambria.?Math|Math|LMMath|XITS|Asana|Euclid|MT.?Extra|OpenSymbol|Symbol/i;
  const BIGOP_FONT_RE = /CMEX|EUEX|Euclid.?Extra|MT.?Extra|STIXSize|LMMath.*Ext/i;
  // Converte il testo dei font simbolici; "unknown" = simbolo che non sappiamo leggere
  function fixFontText(str, font) {
    const f = font || "";
    let table = null;
    if (/Wingdings|Webdings|Marlett/i.test(f)) table = DINGBAT_MAP.wingdings;
    else if (/ZapfDingbats|Dingbats/i.test(f)) table = DINGBAT_MAP.zapf;
    else if (/Symbol/i.test(f) && !/OpenSymbol/i.test(f)) table = SYMBOL_FONT_MAP;
    if (!table) return { str, unknown: /[\uE000-\uF8FF\uFFFD]/.test(str) };
    let unknown = false;
    const out = [...str].map((ch) => {
      let c = ch.charCodeAt(0);
      if (c >= 0xF020 && c <= 0xF0FF) c -= 0xF000;
      if (c >= 0x20 && c <= 0xFF) {
        if (c === 0x20) return " ";
        if (table[c]) return table[c];
        if (table === SYMBOL_FONT_MAP && /[0-9()+=,.;:!?\[\]|/<>%&]/.test(String.fromCharCode(c))) return String.fromCharCode(c);
        unknown = true;
        return ch;
      }
      return ch; // già Unicode corretto
    }).join("");
    return { str: out, unknown };
  }

  /* ------------------------------------------------------------------ */
  /* Lettura PDF                                                        */
  /* ------------------------------------------------------------------ */
  function openPdf(fileId) {
    if (pdfDocs.has(fileId)) return pdfDocs.get(fileId);
    const p = (async () => {
      let bytes = fileBytes.get(fileId);
      if (!bytes) {
        bytes = await DB.get("bytes", fileId);
        if (!bytes) throw new Error("File non disponibile");
        fileBytes.set(fileId, bytes);
      }
      // pdf.js "consuma" il buffer che riceve: gli passiamo una copia.
      return pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false }).promise;
    })();
    p.catch(() => pdfDocs.delete(fileId));
    pdfDocs.set(fileId, p);
    return p;
  }

  // Pallino o numero d'elenco isolato (da tenere attaccato al testo che segue)
  const MARKER_ONLY_RE = /^\s*([•●○◦▪▫■□◆◇►▶▸▹➢➤➔→⇒✓✔✗✘❖⦿⁃∙·‣\-–—*]|[\uF000-\uF8FF]|\(?\d{1,2}[.)]|\(?[a-zA-Z][.)])\s*$/;

  // Accenti disegnati separatamente sopra la lettera (vecchi PDF fatti con LaTeX)
  const DIACRITICS = { "´": "́", "`": "̀", "¨": "̈", "ˆ": "̂", "˜": "̃", "¯": "̄", "˙": "̇", "˘": "̆", "ˇ": "̌", "¸": "̧", "˚": "̊", "˝": "̋" };
  const MATH_CHAR_RE = /[=+\-−±×÷·⋅∗∘<>≤≥≠≈≡∼≅∝∞∂∇∆∑∏∫∮√∀∃∈∉⊂⊃⊆⊇∪∩∧∨¬→←↔⇒⇐⇔↦′″|‖Α-Ωα-ωϑϕϖϵℏℓ℘ℜℑℵ]/;

  async function pageLines(page) {
    const tc = await page.getTextContent();
    const [, y0, , y1] = page.view;
    const height = Math.abs(y1 - y0) || 1;
    const yMin = Math.min(y0, y1);
    const fonts = {};
    const fontOf = (fn) => {
      if (!(fn in fonts)) { try { const f = page.commonObjs.get(fn); fonts[fn] = (f && f.name) || ""; } catch (e) { fonts[fn] = ""; } }
      return fonts[fn];
    };
    // Elementi di testo con posizione, dimensione e font
    let items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const t = it.transform;
      const size = Math.hypot(t[2], t[3]) || it.height || 10;
      const font = fontOf(it.fontName);
      const fx = fixFontText(it.str, font);
      const visible = fx.str.replace(/\s/g, "");
      const bigop = BIGOP_FONT_RE.test(font) || /^[∑∏∫∮⋃⋂]$/.test(visible);
      items.push({
        str: fx.str, unknown: fx.unknown, x: t[4], y: t[5], w: it.width || 0, size,
        // i simboli grandi (∑ ∫) scendono sotto la riga: la loro "scatola" è più alta
        bot: t[5] - size * (bigop ? 1.1 : 0.2), top: t[5] + size * (bigop ? 1.2 : 0.8),
        math: MATH_FONT_RE.test(font) ? visible.length : [...visible].filter((c) => MATH_CHAR_RE.test(c)).length,
        bigop,
      });
    }
    // Via i doppioni (testo disegnato due volte per ombre/grassetto finto)
    const seen = new Set();
    items = items.filter((i) => {
      const k = i.str + "|" + Math.round(i.x) + "|" + Math.round(i.y);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    // Accenti separati: uniscili alla lettera che sta sotto
    for (const m of items) {
      const d = DIACRITICS[m.str.trim()];
      if (!d || m.str.trim().length !== 1) continue;
      const cx = m.x + m.w / 2;
      const base = items.find((b) => b !== m && !b.dead && !DIACRITICS[b.str.trim()] && cx >= b.x && cx <= b.x + b.w &&
        Math.abs(m.y - b.y) <= b.size * 0.6);
      if (!base) continue;
      const chars = [...base.str];
      const idx = Math.max(0, Math.min(chars.length - 1, Math.floor(((cx - base.x) / (base.w || 1)) * chars.length)));
      chars[idx] = (chars[idx] + d).normalize("NFC");
      base.str = chars.join("");
      m.dead = true;
    }
    items = items.filter((i) => !i.dead);
    // 1) Righe: elementi che si sovrappongono in verticale (così pedici e apici restano nella riga)
    items.sort((a, b) => (b.top - a.top) || (a.x - b.x));
    const rows = [];
    for (const it of items) {
      let row = null;
      for (let k = rows.length - 1; k >= Math.max(0, rows.length - 4); k--) {
        const r = rows[k];
        const ov = Math.min(r.top, it.top) - Math.max(r.bot, it.bot);
        if (ov >= 0.5 * Math.min(r.top - r.bot, it.top - it.bot)) { row = r; break; }
      }
      if (row) {
        row.items.push(it);
        if (it.size > row.size) { row.size = it.size; row.top = it.top; row.bot = it.bot; }
      } else rows.push({ items: [it], top: it.top, bot: it.bot, size: it.size });
    }
    // Apici e pedici: caratteri più piccoli sopra o sotto la linea di base della riga
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      const base = median(r.items.filter((i) => i.size >= r.size * 0.9).map((i) => i.y));
      for (const it of r.items) {
        it.kind = "n";
        if (it.size < r.size * 0.88) {
          if (it.y > base + r.size * 0.18) it.kind = "sup";
          else if (it.y < base - r.size * 0.08) it.kind = "sub";
        }
      }
    }
    // 2) Segmenti: parti di riga separate da spazi grandi (colonne, celle di tabella)
    let segs = [];
    for (const r of rows) {
      let cur = null;
      for (const it of r.items) {
        const gap = cur ? it.x - cur.x1 : 0;
        const big = Math.max(cur ? cur.size : 0, it.size);
        // nuovo segmento se lo spazio è grande, o se dopo uno spazio medio comincia un nuovo pallino
        const split = cur && !MARKER_ONLY_RE.test(cur.raw) && it.kind === "n" &&
          (gap > big * 1.0 || (gap > big * 0.5 && MARKER_ONLY_RE.test(it.str)));
        if (!cur || split) {
          cur = { runs: [], raw: "", items: [], x0: it.x, x1: it.x + it.w, top: it.top, bot: it.bot, y: it.y, size: it.size };
          segs.push(cur);
        } else {
          cur.x1 = Math.max(cur.x1, it.x + it.w);
          cur.x0 = Math.min(cur.x0, it.x);
          cur.top = Math.max(cur.top, it.top);
          cur.bot = Math.min(cur.bot, it.bot);
          if (it.size > cur.size) { cur.size = it.size; cur.y = it.y; }
        }
        const needSpace = cur.runs.length > 0 && it.kind === "n" && gap > Math.min(cur.size, it.size) * 0.15 &&
          !/\s$/.test(cur.raw) && !/^\s/.test(it.str);
        const piece = (needSpace ? " " : "") + it.str;
        const last = cur.runs[cur.runs.length - 1];
        if (last && last.kind === it.kind) last.text += piece; else cur.runs.push({ kind: it.kind, text: piece });
        cur.raw += piece;
        cur.items.push(it);
      }
    }
    for (const s of segs) {
      // un simbolo sconosciuto all'inizio è solo un pallino
      const f = s.items[0];
      if (f.unknown && f.str.trim().length === 1 && s.items.length > 1) { f.unknown = false; s.runs[0].text = s.runs[0].text.replace(f.str.trim(), "•"); }
      s.text = clean(s.runs.map((r) => (r.kind === "n" ? r.text : supText(r.text, r.kind === "sub"))).join(""));
      const chars = s.items.reduce((a, i) => a + i.str.replace(/\s/g, "").length, 0);
      const math = s.items.reduce((a, i) => a + i.math, 0);
      s.mathish = chars > 0 && math / chars >= 0.5;
      // pezzo corto (es. "2m" sotto una frazione): può far parte di una formula vicina
      s.mathy = s.mathish || (chars <= 4 && !stripBullet(s.raw).bullet);
      s.unknown = s.items.some((i) => i.unknown);
      // formula "a più piani": operatori grandi o elementi impilati (frazioni, limiti, indici doppi)
      s.complex = s.items.some((i) => i.bigop);
      const its = s.items;
      for (let a = 0; a < its.length && !s.complex; a++) {
        for (let b = a + 1; b < its.length; b++) {
          const A = its[a], B = its[b];
          if (B.x >= A.x + A.w) break;
          const ov = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
          const narrow = Math.min(A.w, B.w);
          if (narrow > 0 && ov >= narrow * 0.5 && Math.abs(A.y - B.y) >= Math.min(A.size, B.size) * 0.3 && (A.math || B.math || A.kind !== "n" || B.kind !== "n")) { s.complex = true; break; }
        }
      }
      // testo a lettere spaziate ("T e s t o")
      const toks = s.raw.trim().split(/\s+/);
      s.spaced = toks.length >= 5 && toks.filter((t) => t.length === 1).length / toks.length >= 0.75;
    }
    // Parti della stessa formula finite su righe diverse (frazioni grandi, limiti): uniscile
    const parent = segs.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const A = segs[i], B = segs[j];
        const vov = Math.min(A.top, B.top) - Math.max(A.bot, B.bot);       // sovrapposizione verticale
        const hov = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);           // sovrapposizione orizzontale
        const minS = Math.min(A.size, B.size), maxS = Math.max(A.size, B.size);
        const big = A.complex || B.complex;
        // un integrale o una sommatoria si porta dietro tutta la riga in cui si trova e i suoi limiti
        if (big && ((vov > 0 && -hov <= maxS * 1.5) || (-vov <= maxS * 1.6 && hov > -maxS * 0.5 && (A.mathy || B.mathy)))) { parent[find(i)] = find(j); continue; }
        if (!(A.mathish || B.mathish) || !A.mathy || !B.mathy) continue;
        const stacked = -vov <= minS * 0.45 && hov >= Math.min(A.x1 - A.x0, B.x1 - B.x0) * 0.3; // numeratore/denominatore, limiti
        const sideBySide = vov > 0 && -hov <= maxS * 2.5;                                       // pezzi sulla stessa riga
        if (stacked || sideBySide) parent[find(i)] = find(j);
      }
    }
    const groups = new Map();
    segs.forEach((s, i) => { const k = find(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
    segs = [];
    for (const g of groups.values()) {
      if (g.length === 1) { segs.push(g[0]); continue; }
      g.sort((a, b) => (b.top - a.top) || (a.x0 - b.x0));
      const main = g.reduce((a, b) => (b.size > a.size || (b.size === a.size && b.x1 - b.x0 > a.x1 - a.x0) ? b : a));
      segs.push({
        ...main, text: g.map((s) => s.text).join(" "), items: g.flatMap((s) => s.items),
        x0: Math.min(...g.map((s) => s.x0)), x1: Math.max(...g.map((s) => s.x1)),
        top: Math.max(...g.map((s) => s.top)), bot: Math.min(...g.map((s) => s.bot)),
        complex: true, unknown: g.some((s) => s.unknown), spaced: false,
      });
    }
    // 3) Ordine di lettura: tagli orizzontali e verticali (colonne lette una per volta)
    const ordered = [];
    readingOrder(segs.filter((s) => s.text), ordered);
    return ordered.map((s) => ({
      text: s.text, x: s.x0, x1: s.x1, y: s.y, size: s.size, rel: (s.y - yMin) / height,
      base: s.base, right: s.right, table: !!s.table,
      complex: !!s.complex, unknown: !!s.unknown, spaced: !!s.spaced,
      bbox: { x0: s.x0, x1: s.x1, top: s.top, bot: s.bot },
    }));
  }

  function bestGap(iv) {
    if (iv.length < 2) return null;
    const s = iv.slice().sort((a, b) => a[0] - b[0]);
    let maxEnd = s[0][1], best = null;
    for (let i = 1; i < s.length; i++) {
      const g = s[i][0] - maxEnd;
      if (g > 0 && (!best || g > best.gap)) best = { gap: g, at: maxEnd + g / 2 };
      maxEnd = Math.max(maxEnd, s[i][1]);
    }
    return best;
  }
  function groupRows(segs) {
    const rows = [];
    segs.slice().sort((a, b) => b.top - a.top).forEach((s) => {
      const r = rows.find((r) => Math.min(r.top, s.top) - Math.max(r.bot, s.bot) >= 0.4 * Math.min(r.top - r.bot, s.top - s.bot));
      if (r) { r.segs.push(s); r.top = Math.max(r.top, s.top); r.bot = Math.min(r.bot, s.bot); }
      else rows.push({ segs: [s], top: s.top, bot: s.bot });
    });
    rows.forEach((r) => r.segs.sort((a, b) => a.x0 - b.x0));
    return rows;
  }
  // Una zona divisa in colonne è una tabella se le celle sono corte e allineate riga per riga
  function tableRows(segs) {
    if (segs.some((s) => stripBullet(s.text).bullet)) return null;
    const rows = groupRows(segs);
    const multi = rows.filter((r) => r.segs.length >= 2);
    if (multi.length < 3 || multi.length < rows.length * 0.6) return null;
    if (median(segs.map((s) => s.text.length)) > 30) return null;
    return rows.map((r) => {
      const f = r.segs[0];
      if (r.segs.length === 1) return f;
      return {
        text: r.segs.map((s) => s.text).join("  |  "), x0: f.x0, x1: r.segs[r.segs.length - 1].x1,
        top: r.top, bot: r.bot, y: f.y, size: Math.max(...r.segs.map((s) => s.size)), table: true,
      };
    });
  }
  function readingOrder(segs, out, base, right) {
    if (base == null) {
      base = Math.min(...segs.map((s) => s.x0));
      right = Math.max(...segs.map((s) => s.x1));
    }
    const emit = (list) => list.forEach((s) => { s.base = base; s.right = right; out.push(s); });
    if (segs.length <= 1) { emit(segs); return; }
    const med = median(segs.map((s) => s.size));
    const yg = bestGap(segs.map((s) => [s.bot, s.top]));
    const xg = bestGap(segs.map((s) => [s.x0, s.x1]));
    const xOk = xg && xg.gap > med * 0.8;
    if (xOk && (!yg || xg.gap >= yg.gap)) {
      const tr = tableRows(segs);
      if (tr) { emit(tr); return; }
      const L = segs.filter((s) => s.x1 <= xg.at), R = segs.filter((s) => s.x0 >= xg.at);
      readingOrder(L, out, Math.min(...L.map((s) => s.x0)), Math.max(...L.map((s) => s.x1)));
      readingOrder(R, out, Math.min(...R.map((s) => s.x0)), Math.max(...R.map((s) => s.x1)));
      return;
    }
    if (yg) {
      readingOrder(segs.filter((s) => s.bot >= yg.at), out, base, right);
      readingOrder(segs.filter((s) => s.top <= yg.at), out, base, right);
      return;
    }
    emit(segs.slice().sort((a, b) => (b.top - a.top) || (a.x0 - b.x0)));
  }

  function median(arr) {
    if (!arr.length) return 0;
    const a = arr.slice().sort((x, y) => x - y);
    return a[Math.floor((a.length - 1) / 2)];
  }

  // Trasforma le righe di una pagina in titolo + punti, senza aggiungere nulla.
  // Ogni riga: {text, x, x1, y, size, base?, right?, table?, weak?, img?}
  function linesToNotes(lines) {
    if (!lines.length) return { title: "", titleWeak: [], items: [] };
    const textLines = lines.filter((l) => !l.img && !l.table);
    const sizes = textLines.map((l) => l.size);
    const med = median(sizes);
    const max = sizes.length ? Math.max(...sizes) : 0;
    let title = "";
    let titleWeak = [];
    let body = lines;
    const takeTitle = (tl) => {
      title = tl.map((l) => stripBullet(l.text).text).join(" ");
      titleWeak = tl.flatMap((l) => l.weak || []);
    };
    // Titolo: le righe col carattere più grande, se è chiaramente più grande del resto
    if (textLines.length === 1 && lines[0] === textLines[0]) {
      // una sola riga di testo in cima (per esempio sopra una tabella o una formula): è il titolo
      takeTitle([lines[0]]);
      body = lines.slice(1);
    } else if (max && max >= med * 1.15) {
      const first = lines.findIndex((l) => !l.img && !l.table && l.size >= max * 0.95);
      if (first !== -1 && first <= 2) {
        let end = first;
        while (end + 1 < lines.length && !lines[end + 1].img && lines[end + 1].size >= max * 0.95 && end - first < 3) end++;
        takeTitle(lines.slice(first, end + 1));
        body = lines.slice(0, first).concat(lines.slice(end + 1));
      }
    }
    // Elenco puntato? (allora una riga senza pallino continua il punto precedente)
    const isMarker = (l) => !l.img && !l.table && (stripBullet(l.text).bullet || ENUM_RE.test(l.text));
    const listMode = body.filter(isMarker).length >= 2;
    // Distanza tipica tra le righe di uno stesso paragrafo (in "altezze del carattere")
    const gaps = [];
    for (let k = 1; k < body.length; k++) {
      const a = body[k - 1], b = body[k];
      const g = (a.y - b.y) / a.size;
      if (g > 0.8 && g < 3 && !a.img && !b.img && !a.table && !b.table && Math.abs(a.size - b.size) <= a.size * 0.12) gaps.push(g);
    }
    // la distanza più piccola è quella delle righe che vanno a capo; i punti nuovi di solito sono un po' più distanti
    gaps.sort((x, y) => x - y);
    const wrapGap = gaps.length ? Math.max(0.9, gaps[0]) : 1.25;
    // Punti
    const minX = body.length ? Math.min(...body.map((l) => l.x)) : 0;
    const items = [];
    let prev = null;
    for (const l of body) {
      const indent = l.x - (l.base != null ? l.base : minX);
      const level = indent > l.size * 1.2 ? (indent > l.size * 3 ? 2 : 1) : 0;
      if (l.table || l.img) {
        const it = { text: l.text, level: l.img ? level : 0 };
        if (l.table) it.table = true;
        if (l.img) { it.img = l.img; it.imgW = l.imgW; }
        items.push(it);
        prev = null;
        continue;
      }
      const sb = stripBullet(l.text);
      const marker = sb.bullet || ENUM_RE.test(l.text);
      const text = sb.text;
      let continues = false;
      if (prev && !marker && Math.abs(l.size - prev.size) <= prev.size * 0.12 && l.x >= prev.x - prev.size * 0.5) {
        const g = (prev.y - l.y) / prev.size;
        const near = g > 0 && g <= wrapGap * 1.12 + 0.03;
        const p = prev.item.text;
        const lowerStart = /^[a-zà-ÿ(,;]/.test(text) || /[,(\-–/]$/.test(p) ||
          /\b(e|ed|o|di|da|in|con|per|tra|fra|il|lo|la|i|gli|le|un|una|che|del|della|dei|the|and|or|of|to|in|for|with|a|an|by|from)$/i.test(p);
        const fullLine = l.right != null && prev.x1 != null && prev.x1 >= l.right - prev.size * 4;
        // In un elenco puntato le righe senza pallino sono il seguito del punto; altrove serve un indizio di "a capo"
        if (l.para != null && prev.para != null) {
          // testo letto dall'OCR: il riconoscimento indica già quali righe formano un paragrafo
          // …ma una riga che inizia con la maiuscola è quasi sempre un punto nuovo (pallino non letto)
          continues = l.para === prev.para && near && (lowerStart || (fullLine && !/^[A-ZÀ-Ý]/.test(text)));
        } else {
          continues = near && (listMode || fullLine || lowerStart) && (listMode || !/[.!?:;]$/.test(p) || lowerStart);
        }
      }
      if (continues) {
        const p = prev.item.text;
        if (/[a-zà-ÿ]-$/.test(p) && /^[a-zà-ÿ]/.test(text)) prev.item.text = p.slice(0, -1) + text;
        else prev.item.text = p + " " + text;
        if (l.weak && l.weak.length) prev.item.weak = (prev.item.weak || []).concat(l.weak);
        prev.y = l.y;
        prev.x1 = l.x1;
        continue;
      }
      const item = { text, level };
      if (l.weak && l.weak.length) item.weak = l.weak.slice();
      items.push(item);
      prev = { item, size: l.size, y: l.y, x: l.x, x1: l.x1, para: l.para };
    }
    return { title, titleWeak, items };
  }

  /* ------------------------------------------------------------------ */
  /* Lettura del testo dalle immagini (OCR), tutto in locale             */
  /* ------------------------------------------------------------------ */
  const OCR = (() => {
    // Codice eseguito nei worker, dopo il motore Tesseract incluso nella pagina.
    const WORKER_SRC = `
let M, api;
// Punteggio di una lettura: somma delle confidenze delle parole lette bene
function score(tsv) {
  let sc = 0, n = 0, sum = 0;
  for (const row of tsv.split("\\n")) {
    const c = row.split("\\t");
    if (c[0] !== "5" || !c[11] || !c[11].trim()) continue;
    const conf = +c[10];
    n++; sum += conf;
    if (conf >= 60) sc += conf * c[11].trim().length;
  }
  return { sc, mean: n ? sum / n : 0 };
}
function read(method) {
  api.SetVariable("thresholding_method", String(method));
  api.SetImageFile(1, 0);
  api.FindLines();
  const a = api.GetGradient ? api.GetGradient() : api.GetAngle();
  if (Math.abs(a) >= 0.005) api.SetImageFile(1, a);
  api.Recognize(null);
  return api.GetTSVText(0);
}
onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === "init") {
      M = await TesseractCore({});
      for (const k in m.langs) M.FS.writeFile("./" + k + ".traineddata", new Uint8Array(m.langs[k]));
      api = new M.TessBaseAPI();
      const st = api.Init(null, Object.keys(m.langs).join("+"), 1);
      api.SetVariable("tessedit_pageseg_mode", "3");
      api.SetVariable("user_defined_dpi", "300");
      api.SetVariable("tessedit_char_blacklist", "|");
      postMessage({ type: "ready", st });
    } else if (m.type === "ocr") {
      M.FS.writeFile("/input", new Uint8Array(m.img));
      // 1a lettura normale; se l'immagine è difficile, 2a lettura con soglia adattiva (luce non uniforme, foto)
      let tsv = read(0);
      const s1 = score(tsv);
      if (s1.mean < 93) {
        const tsv2 = read(2);
        if (score(tsv2).sc > s1.sc) tsv = tsv2;
      }
      postMessage({ type: "result", id: m.id, tsv });
    }
  } catch (err) {
    postMessage({ type: "error", id: m.id, msg: String((err && err.message) || err) });
  }
};`;
    let ready = null;
    const slots = [];
    const queue = [];
    const waiting = new Map();
    let seq = 0;

    function b64ToBytes(b64) {
      const bin = atob(b64);
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u;
    }
    async function gunzip(u8) {
      const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"));
      return new Response(s).arrayBuffer();
    }
    function init() {
      if (ready) return ready;
      ready = (async () => {
        const core = document.getElementById("tess-core");
        if (!core) throw new Error("Motore OCR non incluso");
        const url = URL.createObjectURL(new Blob([core.textContent + WORKER_SRC], { type: "text/javascript" }));
        const langs = {};
        for (const l of ["ita", "eng"]) langs[l] = await gunzip(b64ToBytes(document.getElementById("tess-" + l).textContent.trim()));
        const n = Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1));
        // se il browser vieta i worker, il motore OCR gira nella pagina stessa (più lento ma funziona)
        const makeWorker = () => {
          if (!window.__forceMtPage) { try { return new Worker(url); } catch (e) { /* passa alla pagina */ } }
          return null;
        };
        const pageWorker = () => {
          const fake = { onmessage: null, onerror: null, postMessage(m) { setTimeout(() => window.__ocrSend(m)); }, terminate() {} };
          window.__ocrRecv = (m) => fake.onmessage && fake.onmessage({ data: m });
          if (!window.__ocrSend) {
            const sc = document.createElement("script");
            sc.textContent = "(function(){var postMessage=function(m){window.__ocrRecv(m)};var onmessage;\n" + core.textContent + WORKER_SRC +
              "\n;window.__ocrSend=function(m){onmessage({data:m})};})();";
            document.head.append(sc);
          }
          if (!window.__ocrSend) throw new Error("Il browser non permette di avviare la lettura delle immagini");
          return fake;
        };
        const startOne = (w) => new Promise((res, rej) => {
          const t = setTimeout(() => rej(new Error("avvio troppo lento")), 60000);
          const copy = {};
          for (const k in langs) copy[k] = langs[k].slice(0);
          w.onmessage = (e) => {
            clearTimeout(t);
            const m = e.data;
            if (m.type === "ready" && m.st === 0) {
              const slot = { w, job: null };
              slots.push(slot);
              w.onmessage = (ev) => finish(slot, ev.data);
              w.onerror = () => finish(slot, { type: "error", id: slot.job, msg: "OCR interrotto" });
              res();
            } else rej(new Error(m.msg || "Avvio OCR non riuscito"));
          };
          w.onerror = (e) => { clearTimeout(t); rej(new Error(e.message || "Avvio OCR non riuscito")); };
          w.postMessage({ type: "init", langs: copy }, Object.values(copy));
        });
        try {
          const ws = Array.from({ length: n }, makeWorker);
          if (ws.some((w) => !w)) throw new Error("worker non disponibile");
          await Promise.all(ws.map(startOne));
        } catch (e) {
          console.warn("OCR nel worker non disponibile, uso la pagina:", e);
          slots.forEach((sl) => { try { sl.w.terminate(); } catch (x) { /* niente */ } });
          slots.length = 0;
          await startOne(pageWorker());
        }
        pump();
      })();
      ready.catch(() => { ready = null; });
      return ready;
    }
    function finish(slot, m) {
      slot.job = null;
      const p = waiting.get(m.id);
      waiting.delete(m.id);
      if (p) { if (m.type === "result") p.res(m.tsv); else p.rej(new Error(m.msg)); }
      pump();
    }
    function pump() {
      for (const slot of slots) {
        if (slot.job != null || !queue.length) continue;
        const job = queue.shift();
        slot.job = job.id;
        slot.w.postMessage({ type: "ocr", id: job.id, img: job.img }, [job.img]);
      }
    }
    // png: ArrayBuffer di un'immagine PNG; h: altezza in pixel. Restituisce righe di testo.
    async function recognize(png, h) {
      await init();
      const id = ++seq;
      const tsv = await new Promise((res, rej) => {
        waiting.set(id, { res, rej });
        queue.push({ id, img: png });
        pump();
      });
      return tsvToLines(tsv, h);
    }
    return { recognize };
  })();

  // Converte l'output di Tesseract in righe {text, x, y, size, rel}, scartando quelle poco affidabili.
  function tsvToLines(tsv, imgH) {
    const lines = [];
    let cur = null;
    for (const row of tsv.split("\n")) {
      const c = row.split("\t");
      if (c.length < 12) continue;
      const level = +c[0];
      const box = { left: +c[6], top: +c[7], w: +c[8], h: +c[9] };
      if (level === 4) { cur = { ...box, para: c[2] + "." + c[3], words: [] }; lines.push(cur); }
      else if (level === 5 && cur && c[11].trim()) cur.words.push({ ...box, conf: +c[10], text: c[11].trim() });
    }
    const out = [];
    for (const l of lines) {
      let words = l.words;
      if (!words.length) continue;
      const medH = median(words.filter((w) => /[\p{L}\p{N}]/u.test(w.text)).map((w) => w.h)) || l.h;
      // Il pallino iniziale viene spesso letto come un simbolo strano: lo trattiamo come pallino
      let bullet = false;
      const f = words[0];
      const looksBullet = !/[\p{L}\p{N}]/u.test(f.text) || (f.text.length === 1 && f.h < medH * 0.6) ||
        (f.text.length === 1 && /^[eoaci»«•·]$/.test(f.text) && words[1] && /^[A-ZÀ-Ý]/.test(words[1].text));
      if (words.length > 1 && looksBullet) {
        bullet = true;
        words = words.slice(1);
      }
      // "I" maiuscola letta spesso come ] [ | oppure l: se è una parola isolata davanti a un'altra parola, è una "I"
      words = words.map((w, k) => (/^[\][|]$/.test(w.text) || (k === 0 && w.text === "l")) && words[k + 1] && /^\p{L}/u.test(words[k + 1].text)
        ? { ...w, text: "I", conf: 40 } : w);
      const conf = words.reduce((a, w) => a + w.conf, 0) / words.length;
      if (conf < 60 || !words.some((w) => /[\p{L}\p{N}]{2,}/u.test(w.text) && w.conf >= 60)) {
        // Riga letta male: se sembra una formula la terremo come immagine ritagliata, altrimenti è rumore
        const t = clean(l.words.map((w) => w.text).join(" "));
        if (/[=+\-−×÷/^()<>≤≥∑∫√π∞∂]/.test(t) && l.w >= l.h * 1.5) {
          out.push({
            text: t, x: l.left, x1: l.left + l.w, y: imgH - (l.top + l.h), size: l.h, rel: 1 - (l.top + l.h / 2) / imgH,
            para: l.para, lowconf: true, box: { left: l.left, top: l.top, w: l.w, h: l.h },
          });
        }
        continue;
      }
      const text = clean(words.map((w) => w.text).join(" "));
      if (!text) continue;
      const last = words[words.length - 1];
      // riga con pezzi di formula letti male (simboli strani a bassa sicurezza): meglio il ritaglio dell'immagine
      const odd = words.filter((w) => w.conf < 55 && /[\[\]{}|°^~¢§¥@#<>?]|^[^\p{L}\p{N}]+$/u.test(w.text)).length;
      const mixed = odd >= 2 || (odd >= 1 && /[=+∫∑√]/.test(text));
      out.push({
        box: { left: l.left, top: l.top, w: l.w, h: l.h },
        lowconf: mixed || undefined,
        text: (bullet ? "• " : "") + text,
        x: words[0].left,
        x1: last.left + last.w,
        y: imgH - (l.top + l.h),
        size: medH,
        rel: 1 - (l.top + l.h / 2) / imgH,
        para: l.para,
        // parole lette con poca sicurezza: le evidenziamo perché vanno controllate
        weak: words.filter((w) => w.conf < 50 && /[\p{L}\p{N}]/u.test(w.text)).map((w) => clean(w.text)),
      });
    }
    // Le formule devono avere l'altezza di una riga di testo (non macchie o pezzi di foto)
    const lineH = median(out.filter((l) => !l.lowconf).map((l) => l.size)) || 0;
    for (let k = out.length - 1; k >= 0; k--) {
      const l = out[k];
      if (l.lowconf && (!lineH || l.box.h < lineH * 0.6 || l.box.h > lineH * 5)) out.splice(k, 1);
    }
    // Margine destro di ogni paragrafo (serve a capire quando una riga va a capo)
    const right = {};
    out.forEach((l) => { right[l.para] = Math.max(right[l.para] || 0, l.x1); });
    out.forEach((l) => { l.right = right[l.para]; });
    return out;
  }

  const normWords = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w.length > 1);
  // Righe lette dalle immagini che NON sono già presenti nel testo della slide
  function uncoveredLines(ocrLines, knownText) {
    const known = new Set(normWords(knownText));
    return ocrLines.filter((l) => {
      const ws = normWords(l.text);
      if (!ws.length) return false;
      return ws.filter((w) => known.has(w)).length / ws.length < 0.6;
    });
  }
  function notesAsItems(lines) {
    const n = linesToNotes(lines);
    return (n.title ? [{ text: n.title, level: 0, weak: n.titleWeak }] : []).concat(n.items);
  }

  function canvasToPng(canvas) {
    return new Promise((res, rej) => canvas.toBlob((b) => (b ? b.arrayBuffer().then(res, rej) : rej(new Error("png"))), "image/png"));
  }
  // Prepara un'immagine (qualsiasi formato leggibile dal browser) per l'OCR
  async function imageForOcr(blob) {
    const bmp = await createImageBitmap(blob);
    let s = 1;
    if (bmp.width < 1600) s = Math.min(3, 1600 / bmp.width);
    if (bmp.width * s > 3200) s = 3200 / bmp.width;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * s));
    c.height = Math.max(1, Math.round(bmp.height * s));
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    return { canvas: c, w: c.width, h: c.height };
  }
  // Ritaglio di una zona dell'immagine (per mostrare formule e simboli esattamente come sulla slide)
  function cropCanvas(canvas, x, y, w, h) {
    x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
    w = Math.min(canvas.width - x, Math.ceil(w)); h = Math.min(canvas.height - y, Math.ceil(h));
    if (w < 4 || h < 4) return null;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(canvas, x, y, w, h, 0, 0, w, h);
    return c;
  }
  // Zone con "inchiostro" che l'OCR non ha letto come testo (formule, simboli): restituisce i riquadri
  function uncoveredInk(canvas, boxes) {
    const f = Math.min(1, 800 / canvas.width);
    const W = Math.max(1, Math.round(canvas.width * f)), H = Math.max(1, Math.round(canvas.height * f));
    const t = document.createElement("canvas");
    t.width = W; t.height = H;
    const ctx = t.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, W, H);
    const px = ctx.getImageData(0, 0, W, H).data;
    const lum = new Float32Array(W * H);
    let sum = 0;
    for (let i = 0; i < W * H; i++) { const v = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]; lum[i] = v; sum += v; }
    const darkBg = sum / (W * H) < 110;
    const ink = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) ink[i] = darkBg ? lum[i] > 170 : lum[i] < 110;
    // via il testo già letto (con un po' di margine)
    for (const b of boxes) {
      const x0 = Math.max(0, Math.floor((b.left - 4) * f)), x1 = Math.min(W, Math.ceil((b.left + b.w + 4) * f));
      const my = Math.max(3, b.h * 0.3);
      const y0 = Math.max(0, Math.floor((b.top - my) * f)), y1 = Math.min(H, Math.ceil((b.top + b.h + my) * f));
      for (let y = y0; y < y1; y++) ink.fill(0, y * W + x0, y * W + x1);
    }
    // fasce orizzontali con inchiostro, poi blocchi separati da spazi bianchi larghi
    const rowInk = new Uint16Array(H);
    for (let y = 0; y < H; y++) { let c = 0; for (let x = 0; x < W; x++) c += ink[y * W + x]; rowInk[y] = c; }
    const bands = [];
    let y = 0;
    while (y < H) {
      if (rowInk[y] < 2) { y++; continue; }
      let y2 = y, gap = 0;
      while (y2 < H && gap <= 3) { if (rowInk[y2] >= 2) gap = 0; else gap++; y2++; }
      bands.push([y, y2 - gap]);
      y = y2;
    }
    const blocks = [];
    for (const [ya, yb] of bands) {
      const col = new Uint16Array(W);
      for (let yy = ya; yy < yb; yy++) for (let x = 0; x < W; x++) col[x] += ink[yy * W + x];
      let x = 0;
      while (x < W) {
        if (!col[x]) { x++; continue; }
        let x2 = x, gap = 0;
        while (x2 < W && gap <= 30) { if (col[x2]) gap = 0; else gap++; x2++; }
        const xb = x2 - gap;
        let n = 0;
        for (let xx = x; xx < xb; xx++) n += col[xx];
        blocks.push({ x0: x, x1: xb, y0: ya, y1: yb, ink: n });
        x = x2;
      }
    }
    // unisci i pezzi vicini (numeratore e denominatore, apici)
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i], b = blocks[j];
        const hov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), vgap = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
        if (hov > 0 && vgap <= 6) {
          blocks[i] = { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1), ink: a.ink + b.ink };
          blocks.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
    // solo blocchi con l'aspetto di una scritta: niente bordi, barre colorate, foto o puntini
    return blocks.filter((b) => {
      const w = b.x1 - b.x0, h = b.y1 - b.y0, dens = b.ink / Math.max(1, w * h);
      return h >= 8 && h <= H * 0.3 && w >= 14 && w <= W * 0.95 && dens >= 0.04 && dens <= 0.45 &&
        b.x0 > 2 && b.y0 > 2 && b.x1 < W - 2 && b.y1 < H - 2 && b.ink >= 40;
    }).map((b) => ({ left: b.x0 / f, top: b.y0 / f, w: (b.x1 - b.x0) / f, h: (b.y1 - b.y0) / f }));
  }

  // OCR di un'immagine già disegnata: le righe illeggibili (formule) diventano ritagli dell'immagine
  async function recognizeCanvas(canvas, displayW) {
    const lines = await OCR.recognize(await canvasToPng(canvas), canvas.height);
    const k = (displayW || 720) / canvas.width;
    // formule che l'OCR non ha proprio visto: aggiungile come ritagli, al loro posto
    try {
      const good = lines.filter((l) => !l.lowconf && l.box).map((l) => l.box);
      const lineH = median(lines.filter((l) => !l.lowconf).map((l) => l.size)) || 20;
      for (const b of uncoveredInk(canvas, good)) {
        if (b.h < lineH * 0.7) continue;
        if (lines.some((l) => l.lowconf && l.box && Math.min(l.box.left + l.box.w, b.left + b.w) - Math.max(l.box.left, b.left) > 0 &&
          Math.min(l.box.top + l.box.h, b.top + b.h) - Math.max(l.box.top, b.top) > 0)) {
          // si sovrappone a una riga già da ritagliare: allarga quella
          const l = lines.find((l) => l.lowconf && l.box && Math.min(l.box.left + l.box.w, b.left + b.w) - Math.max(l.box.left, b.left) > 0 &&
            Math.min(l.box.top + l.box.h, b.top + b.h) - Math.max(l.box.top, b.top) > 0);
          const x0 = Math.min(l.box.left, b.left), y0 = Math.min(l.box.top, b.top);
          l.box = { left: x0, top: y0, w: Math.max(l.box.left + l.box.w, b.left + b.w) - x0, h: Math.max(l.box.top + l.box.h, b.top + b.h) - y0 };
          continue;
        }
        lines.push({ text: "", ink: true, x: b.left, x1: b.left + b.w, y: canvas.height - (b.top + b.h), size: Math.min(b.h, lineH * 1.5), rel: 1 - (b.top + b.h / 2) / canvas.height, lowconf: true, box: b });
      }
      lines.sort((a, b) => (b.y + b.size) - (a.y + a.size) || a.x - b.x);
    } catch (e) { console.warn(e); }
    for (const l of lines) {
      if (!l.lowconf) continue;
      const pad = l.ink ? 6 : Math.max(4, l.box.h * 0.25);
      const c = cropCanvas(canvas, l.box.left - pad, l.box.top - pad, l.box.w + pad * 2, l.box.h + pad * 2);
      if (c) { l.img = c.toDataURL("image/png"); l.imgW = Math.round(c.width * k); }
    }
    return lines.filter((l) => !l.lowconf || l.img);
  }
  async function ocrBlob(blob) {
    try {
      const img = await imageForOcr(blob);
      return await recognizeCanvas(img.canvas);
    } catch (e) {
      console.warn("OCR non riuscito", e);
      return null;
    }
  }
  const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", webp: "image/webp", tif: "image/tiff", tiff: "image/tiff", svg: "image/svg+xml" };
  const extOf = (name) => (name.split(".").pop() || "").toLowerCase();

  // Testo "vero" o testo illeggibile (font senza mappatura dei caratteri)?
  function realTextLength(lines) {
    const all = lines.map((l) => l.text).join("");
    const letters = (all.match(/[\p{L}\p{N}]/gu) || []).length;
    // caratteri di alfabeti che in slide italiane/inglesi indicano un font "rotto"
    const bad = (all.match(/[\uFFFD\uE000-\uF8FF\u0400-\u04FF\u0590-\u08FF\u0E00-\u0FFF\u1100-\u11FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/g) || []).length;
    return bad > letters * 0.25 ? 0 : letters;
  }
  // Righe con formule a più piani o simboli sconosciuti: ritagliate come immagine dalla pagina.
  // Righe a lettere spaziate ("T e s t o"): rilette con l'OCR.
  async function repairLines(page, lines, vp1) {
    const need = lines.filter((l) => l.bbox && (l.complex || l.unknown || l.spaced));
    if (!need.length) return;
    const scale = Math.min(3, 2400 / vp1.width);
    const v = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = Math.ceil(v.width); c.height = Math.ceil(v.height);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: v }).promise;
    for (const l of need) {
      const padX = l.size * 0.3, padY = l.size * 0.12;
      const [ax, ay, bx, by] = v.convertToViewportRectangle([l.bbox.x0 - padX, l.bbox.bot - padY, l.bbox.x1 + padX, l.bbox.top + padY]);
      const crop = cropCanvas(c, Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
      if (!crop) continue;
      if (l.spaced && !l.complex && !l.unknown) {
        try {
          const res = await OCR.recognize(await canvasToPng(crop), crop.height);
          const t = clean(res.filter((x) => !x.lowconf).map((x) => stripBullet(x.text).text).join(" "));
          if (t.replace(/\s/g, "").length >= l.text.replace(/\s/g, "").length * 0.7) l.text = (stripBullet(l.text).bullet ? "• " : "") + t;
        } catch (e) { /* resta il testo originale */ }
        continue;
      }
      l.img = crop.toDataURL("image/png");
      l.imgW = Math.round(crop.width / scale * (720 / vp1.width));
      l.text = plain(l.text);
    }
  }

  async function readPdf(file, bytes, onPage) {
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false }).promise;
    const OPS = pdfjsLib.OPS;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      let ol = null;
      try { ol = await page.getOperatorList(); } catch (e) { /* ignora */ } // carica anche i font (servono per i simboli)
      const lines = await pageLines(page);
      const p = { lines, ratio: vp.width / vp.height, imgs: [], mode: null, ocr: null };
      if (realTextLength(lines) < 20) {
        p.mode = "full"; // nessun testo leggibile: è una scansione, un'immagine o un font illeggibile
      } else {
        try { await repairLines(page, lines, vp); } catch (e) { console.warn(e); }
        // Immagini grandi nella pagina (potrebbero contenere testo)
        if (ol) try {
          for (let k = 0; k < ol.fnArray.length; k++) {
            const fn = ol.fnArray[k], a = ol.argsArray[k];
            let w = 0, h = 0;
            if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) { w = a[1]; h = a[2]; }
            else if (fn === OPS.paintInlineImageXObject && a[0]) { w = a[0].width; h = a[0].height; }
            if (w * h >= 60000 && Math.min(w, h) >= 100) p.imgs.push(w + "x" + h);
          }
        } catch (e) { /* ignora */ }
      }
      pages.push(p);
      page.cleanup();
      onPage(i, doc.numPages, "Lettura");
      if (i % 5 === 0) await new Promise((r) => setTimeout(r));
    }
    // Immagini ripetute su molte pagine (loghi, sfondi del modello): non vanno lette
    const sigCount = new Map();
    pages.forEach((p) => new Set(p.imgs).forEach((s) => sigCount.set(s, (sigCount.get(s) || 0) + 1)));
    pages.forEach((p) => {
      if (!p.mode && p.imgs.some((s) => pages.length < 4 || sigCount.get(s) < Math.max(3, pages.length * 0.4))) p.mode = "mixed";
    });
    // OCR delle pagine che servono
    const todo = pages.map((p, idx) => ({ p, idx })).filter((x) => x.p.mode);
    let done = 0, inflight = 0;
    const jobs = [];
    const freed = [];
    for (const { p, idx } of todo) {
      const page = await doc.getPage(idx + 1);
      const vp1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(4, 2400 / vp1.width) });
      const c = document.createElement("canvas");
      c.width = Math.ceil(vp.width);
      c.height = Math.ceil(vp.height);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      page.cleanup();
      while (inflight >= 3) await new Promise((r) => freed.push(r)); // non accumulare troppe immagini in memoria
      inflight++;
      jobs.push(recognizeCanvas(c)
        .then((lines) => { p.ocr = lines; })
        .catch((e) => { console.warn(e); p.ocrFailed = true; })
        .finally(() => {
          inflight--;
          (freed.shift() || (() => {}))();
          onPage(++done, todo.length, "Lettura del testo dalle immagini");
        }));
    }
    await Promise.all(jobs);
    doc.destroy();
    pages.forEach((p) => {
      if (p.mode === "full" && p.ocr) p.lines = p.ocr;
    });
    // Intestazioni e piè di pagina ripetuti (es. nome del corso, logo testuale): via
    const repeated = new Set();
    const keyOf = (l) => l.text.replace(/\d+/g, "#").toLowerCase();
    // Solo il testo piccolo ai bordi può essere intestazione/piè di pagina (mai i titoli)
    pages.forEach((p) => {
      const med = median(p.lines.map((l) => l.size));
      p.lines.forEach((l) => { l.edge = (l.rel > 0.9 || l.rel < 0.1) && l.size <= med * 1.05; });
    });
    if (pages.length >= 3) {
      const counts = new Map();
      for (const p of pages) {
        const keys = new Set(p.lines.filter((l) => l.edge).map(keyOf));
        keys.forEach((k) => counts.set(k, (counts.get(k) || 0) + 1));
      }
      const need = pages.length < 5 ? pages.length : Math.max(3, pages.length * 0.4);
      counts.forEach((c, k) => { if (c >= need) repeated.add(k); });
    }
    const keep = (l) => {
      if (isPageNumber(stripBullet(l.text).text) && (l.rel > 0.85 || l.rel < 0.15)) return false;
      if (l.edge && repeated.has(keyOf(l))) return false;
      return true;
    };
    return pages.map((p, idx) => {
      const n = linesToNotes(p.lines.filter(keep));
      let imgItems = [];
      if (p.mode === "mixed" && p.ocr) {
        imgItems = notesAsItems(uncoveredLines(p.ocr.filter(keep), p.lines.map((l) => l.text).join(" ")));
      }
      return {
        index: idx + 1, title: n.title, titleWeak: n.titleWeak, items: n.items, imgItems, speaker: [], ratio: p.ratio,
        ocr: p.mode === "full" && !!p.ocr, ocrFailed: !!p.ocrFailed,
      };
    });
  }

  /* ---------- Formule dell'editor di equazioni (PowerPoint: OMML, LibreOffice: MathML) ---------- */
  // Parentesi solo se servono (cioè se c'è un'operazione "allo scoperto")
  const wrapP = (x) => {
    x = x.trim();
    let flat = x, prev;
    do { prev = flat; flat = flat.replace(/\([^()]*\)|\{[^{}]*\}/g, ""); } while (flat !== prev);
    return /[+\-−±=\s/×·]/.test(flat) ? "(" + x + ")" : x;
  };
  function ommlText(n) {
    const kids = (e) => (e ? Array.from(e.children) : []);
    const get = (e, name) => kids(e).find((c) => c.localName === name);
    const val = (e) => (e ? e.getAttribute("m:val") || e.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/math", "val") : null);
    const inner = (e) => kids(e).map(ommlText).join("");
    switch (n.localName) {
      case "t": return n.textContent;
      case "r": return kids(n).filter((c) => c.localName === "t").map((c) => c.textContent).join("");
      case "f": return wrapP(inner(get(n, "num"))) + "/" + wrapP(inner(get(n, "den")));
      case "sSup": return inner(get(n, "e")) + supText(inner(get(n, "sup")));
      case "sSub": return inner(get(n, "e")) + supText(inner(get(n, "sub")), true);
      case "sSubSup": return inner(get(n, "e")) + supText(inner(get(n, "sub")), true) + supText(inner(get(n, "sup")));
      case "sPre": return supText(inner(get(n, "sub")), true) + supText(inner(get(n, "sup"))) + inner(get(n, "e"));
      case "rad": {
        const deg = inner(get(n, "deg"));
        return (deg ? supText(deg) : "") + "√" + wrapP(inner(get(n, "e")));
      }
      case "nary": {
        const pr = get(n, "naryPr");
        const op = val(pr && get(pr, "chr")) || "∫";
        return op + supText(inner(get(n, "sub")), true) + supText(inner(get(n, "sup"))) + " " + inner(get(n, "e"));
      }
      case "d": {
        const pr = get(n, "dPr");
        const beg = val(pr && get(pr, "begChr")), end = val(pr && get(pr, "endChr")), sep = val(pr && get(pr, "sepChr"));
        const es = kids(n).filter((c) => c.localName === "e").map(ommlText);
        return (beg != null ? beg : "(") + es.join(sep != null ? sep : ", ") + (end != null ? end : ")");
      }
      case "func": return inner(get(n, "fName")) + " " + inner(get(n, "e"));
      case "limLow": return inner(get(n, "e")) + supText(inner(get(n, "lim")), true);
      case "limUpp": return inner(get(n, "e")) + supText(inner(get(n, "lim")));
      case "acc": {
        const pr = get(n, "accPr");
        const chr = val(pr && get(pr, "chr")) || "̂";
        return inner(get(n, "e")) + (/[̀-ͯ]/.test(chr) ? chr : "");
      }
      case "bar": return inner(get(n, "e")) + "̅";
      case "eqArr": return kids(n).filter((c) => c.localName === "e").map(ommlText).join("; ");
      case "m": if (!/math$/.test(n.namespaceURI || "")) return inner(n); // a14:m = contenitore della formula
        return "[" + kids(n).filter((c) => c.localName === "mr").map((r) => kids(r).filter((c) => c.localName === "e").map(ommlText).join(" ")).join("; ") + "]";
      case "rPr": case "fPr": case "naryPr": case "dPr": case "radPr": case "sSupPr": case "sSubPr": case "sSubSupPr":
      case "funcPr": case "accPr": case "barPr": case "ctrlPr": case "oMathParaPr": case "limLowPr": case "limUppPr": case "eqArrPr": case "mPr": case "sPrePr":
        return "";
      default: return inner(n);
    }
  }
  function mathmlText(n) {
    const kids = Array.from(n.children);
    const t = (i) => (kids[i] ? mathmlText(kids[i]) : "");
    switch (n.localName) {
      case "mi": case "mn": case "mtext": case "ms": return n.textContent.trim();
      case "mo": { const o = n.textContent.trim(); return /^[=<>≤≥≈≠→←⇒⇔±+−×÷∈]$/.test(o) ? " " + o + " " : o; }
      case "mfrac": return wrapP(t(0).trim()) + "/" + wrapP(t(1).trim());
      case "msup": return t(0) + supText(t(1).trim());
      case "msub": return t(0) + supText(t(1).trim(), true);
      case "msubsup": return t(0) + supText(t(1).trim(), true) + supText(t(2).trim());
      case "munder": return t(0) + supText(t(1).trim(), true);
      case "mover": return t(0) + supText(t(1).trim());
      case "munderover": return t(0) + supText(t(1).trim(), true) + supText(t(2).trim()) + " ";
      case "msqrt": return "√" + wrapP(kids.map(mathmlText).join("").trim());
      case "mroot": return supText(t(1).trim()) + "√" + wrapP(t(0).trim());
      case "mfenced": return (n.getAttribute("open") ?? "(") + kids.map(mathmlText).join(n.getAttribute("separators") || ", ") + (n.getAttribute("close") ?? ")");
      case "semantics": return t(0);
      case "annotation": case "annotation-xml": return "";
      default: return kids.map(mathmlText).join("");
    }
  }
  const tidyMath = (s) => clean(s.replace(/\s*([=<>≤≥≈≠→±])\s*/g, " $1 ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")"))
    .replace(/([\^_]\{)([^{}]*)\}/g, (m, a, b) => a + b.replace(/\s+/g, "") + "}");

  /* ------------------------------------------------------------------ */
  /* Lettura PowerPoint (.pptx)                                          */
  /* ------------------------------------------------------------------ */
  const xmlParser = new DOMParser();
  const byLocal = (node, name) => Array.from(node.getElementsByTagNameNS("*", name));
  const childLocal = (node, name) => Array.from(node.children).filter((c) => c.localName === name);
  const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

  function resolvePath(base, target) {
    if (target.startsWith("/")) return target.slice(1);
    const parts = base.split("/");
    parts.pop();
    for (const seg of target.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg !== ".") parts.push(seg);
    }
    return parts.join("/");
  }
  async function readXml(zip, path) {
    const f = zip.file(path);
    if (!f) return null;
    return xmlParser.parseFromString(await f.async("string"), "application/xml");
  }
  async function rels(zip, path) {
    const i = path.lastIndexOf("/");
    const relPath = path.slice(0, i) + "/_rels/" + path.slice(i + 1) + ".rels";
    const doc = await readXml(zip, relPath);
    const map = {};
    if (doc) byLocal(doc, "Relationship").forEach((r) => {
      if (r.getAttribute("TargetMode") === "External") return;
      map[r.getAttribute("Id")] = { target: resolvePath(path, r.getAttribute("Target")), type: r.getAttribute("Type") || "" };
    });
    return map;
  }
  function paraText(p) {
    let s = "";
    const walk = (n) => {
      for (const c of n.children) {
        if (c.localName === "t") s += c.textContent;
        else if (c.localName === "br") s += " ";
        else if (c.localName === "tab") s += " ";
        else if (c.localName === "r" || c.localName === "fld" || c.localName === "smartTag") walk(c);
        else if (c.localName === "m" || c.localName === "oMath" || c.localName === "oMathPara") s += " " + tidyMath(ommlText(c)) + " ";
        else if (c.localName === "AlternateContent") { const ch = childLocal(c, "Choice")[0] || childLocal(c, "Fallback")[0]; if (ch) walk(ch); }
      }
    };
    walk(p);
    return clean(s);
  }
  function shapeInfo(sp) {
    const ph = byLocal(sp, "ph")[0];
    const type = ph ? ph.getAttribute("type") || "body" : null;
    const off = byLocal(sp, "off")[0];
    const ext = byLocal(sp, "ext").find((e) => e.hasAttribute("cx"));
    return {
      type,
      x: off ? +off.getAttribute("x") : null,
      y: off ? +off.getAttribute("y") : null,
      area: ext ? (+ext.getAttribute("cx")) * (+ext.getAttribute("cy")) : 0,
    };
  }
  function slideFromXml(doc, slideRels) {
    const spTree = byLocal(doc, "spTree")[0];
    const pics = [];
    const diagrams = [];
    if (!spTree) return { title: "", items: [], pics, diagrams };
    const blocks = [];
    const relTarget = (el, attr) => {
      const id = el.getAttributeNS(REL_NS, attr) || el.getAttribute("r:" + attr);
      return id && slideRels[id] ? slideRels[id].target : null;
    };
    // Forme con testo, tabelle, immagini e SmartArt, anche dentro i gruppi
    const walk = (node) => {
      for (const c of node.children) {
        if (c.localName === "sp") {
          const info = shapeInfo(c);
          if (["sldNum", "dt", "ftr", "hdr"].includes(info.type)) continue;
          const txBody = childLocal(c, "txBody")[0];
          if (txBody) {
            const paras = childLocal(txBody, "p").map((p) => {
              const pPr = childLocal(p, "pPr")[0];
              const lvl = pPr ? +(pPr.getAttribute("lvl") || 0) : 0;
              return { text: paraText(p), level: Math.min(lvl, 2) };
            }).filter((p) => p.text);
            if (paras.length) blocks.push({ ...info, paras });
          }
          // Forma riempita con un'immagine
          const blip = byLocal(c, "blip")[0];
          const t = blip && relTarget(blip, "embed");
          if (t) pics.push({ path: t, area: info.area });
        } else if (c.localName === "pic") {
          const info = shapeInfo(c);
          const blip = byLocal(c, "blip")[0];
          const t = blip && relTarget(blip, "embed");
          if (t) pics.push({ path: t, area: info.area });
        } else if (c.localName === "graphicFrame") {
          const info = shapeInfo(c);
          const tbl = byLocal(c, "tbl")[0];
          if (tbl) {
            const paras = byLocal(tbl, "tr").map((tr) => ({
              text: childLocal(tr, "tc").map((tc) => byLocal(tc, "p").map(paraText).filter(Boolean).join(" ")).join("  |  "),
              level: 0, table: true,
            })).filter((p) => p.text.replace(/[|\s]/g, ""));
            if (paras.length) blocks.push({ ...info, paras });
          }
          const dgm = byLocal(c, "relIds")[0];
          const dm = dgm && relTarget(dgm, "dm");
          if (dm) diagrams.push(dm);
        } else if (c.localName === "grpSp") {
          walk(c);
        } else if (c.localName === "AlternateContent") {
          const choice = childLocal(c, "Choice")[0] || childLocal(c, "Fallback")[0];
          if (choice) walk(choice);
        }
      }
    };
    walk(spTree);
    // Immagine di sfondo della slide (es. slide scansionate)
    const bg = byLocal(doc, "bg")[0];
    const bgBlip = bg && byLocal(bg, "blip")[0];
    const bgT = bgBlip && relTarget(bgBlip, "embed");
    if (bgT) pics.push({ path: bgT, area: Infinity, background: true });

    const isTitle = (b) => b.type === "title" || b.type === "ctrTitle";
    const titles = blocks.filter(isTitle);
    let others = blocks.filter((b) => !isTitle(b));
    // Ordine di lettura: dall'alto in basso, da sinistra a destra (se le posizioni sono note)
    if (others.every((b) => b.y != null)) {
      others = others.slice().sort((a, b) => (Math.abs(a.y - b.y) > 200000 ? a.y - b.y : a.x - b.x));
    }
    const title = titles.map((b) => b.paras.map((p) => p.text).join(" ")).join(" — ");
    const items = [];
    for (const b of others) for (const p of b.paras) {
      const sb = p.table ? { text: p.text } : stripBullet(p.text);
      items.push({ text: sb.text, level: p.level, table: !!p.table });
    }
    return { title, items, pics, diagrams };
  }

  // Legge il testo delle immagini di una slide e tiene solo quello nuovo
  async function ocrPictures(zip, pics, minArea, known) {
    const lines = [];
    const seen = new Set();
    for (const pic of pics) {
      if (seen.has(pic.path) || pic.area < minArea) continue;
      seen.add(pic.path);
      const f = zip.file(pic.path);
      const mime = MIME[extOf(pic.path)];
      if (!f || !mime || mime === "image/svg+xml" || mime === "image/tiff") continue;
      const blob = new Blob([await f.async("uint8array")], { type: mime });
      const ls = await ocrBlob(blob);
      if (ls) lines.push(...ls);
      // le immagini piccole raramente contengono testo utile
    }
    const fresh = uncoveredLines(lines, known);
    return fresh.length ? notesAsItems(fresh) : [];
  }

  async function readPptx(file, bytes, onPage) {
    const zip = await JSZip.loadAsync(bytes);
    const pres = await readXml(zip, "ppt/presentation.xml");
    const presRels = await rels(zip, "ppt/presentation.xml");
    let slidePaths = [];
    let slideArea = 12192000 * 6858000;
    if (pres) {
      const sz = byLocal(pres, "sldSz")[0];
      if (sz) slideArea = (+sz.getAttribute("cx")) * (+sz.getAttribute("cy")) || slideArea;
      slidePaths = byLocal(pres, "sldId").map((s) => {
        const rid = s.getAttributeNS(REL_NS, "id") || s.getAttribute("r:id");
        return presRels[rid] && presRels[rid].target;
      }).filter(Boolean);
    }
    if (!slidePaths.length) {
      slidePaths = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
        .sort((a, b) => +a.match(/(\d+)\.xml$/)[1] - +b.match(/(\d+)\.xml$/)[1]);
    }
    const out = [];
    for (let i = 0; i < slidePaths.length; i++) {
      const path = slidePaths[i];
      const doc = await readXml(zip, path);
      const r = await rels(zip, path);
      const n = doc ? slideFromXml(doc, r) : { title: "", items: [], pics: [], diagrams: [] };
      // Testo degli SmartArt
      for (const dpath of n.diagrams) {
        const dd = await readXml(zip, dpath);
        if (dd) byLocal(dd, "p").forEach((p) => { const t = paraText(p); if (t) n.items.push({ text: t, level: 0 }); });
      }
      // Note del relatore
      const speaker = [];
      const notesRel = Object.values(r).find((x) => /notesSlide$/.test(x.type));
      if (notesRel) {
        const nd = await readXml(zip, notesRel.target);
        if (nd) {
          byLocal(nd, "sp").forEach((sp) => {
            const info = shapeInfo(sp);
            if (info.type !== "body") return;
            byLocal(sp, "p").forEach((p) => { const t = paraText(p); if (t && !isPageNumber(t)) speaker.push(t); });
          });
        }
      }
      // Testo dentro le immagini: tutte se la slide non ha testo, altrimenti solo quelle grandi
      const known = [n.title, ...n.items.map((x) => x.text)].join(" ");
      const hasText = !!known.trim();
      let imgItems = [];
      let ocr = false;
      if (n.pics.length) {
        onPage(i + 1, slidePaths.length, "Lettura del testo dalle immagini");
        imgItems = await ocrPictures(zip, n.pics, hasText ? slideArea * 0.08 : 0, known);
        if (!hasText && imgItems.length) {
          n.title = imgItems[0].text;
          n.titleWeak = imgItems[0].weak;
          n.items = imgItems.slice(1);
          imgItems = [];
          ocr = true;
        }
      }
      out.push({ index: i + 1, title: n.title, titleWeak: n.titleWeak, items: n.items, imgItems, speaker, ratio: 16 / 9, ocr });
      onPage(i + 1, slidePaths.length, "Lettura");
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Lettura LibreOffice / OpenOffice (.odp)                             */
  /* ------------------------------------------------------------------ */
  const DRAW_NS = "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0";
  const PRES_NS = "urn:oasis:names:tc:opendocument:xmlns:presentation:1.0";
  const SVG_NS = "urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0";
  const XLINK_NS = "http://www.w3.org/1999/xlink";
  const TEXT_NS = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
  function toCm(v) {
    const m = /^(-?[\d.]+)(cm|mm|in|pt|pc|px)?$/.exec(v || "");
    if (!m) return null;
    const f = { cm: 1, mm: 0.1, in: 2.54, pt: 2.54 / 72, pc: 2.54 / 6, px: 2.54 / 96 }[m[2] || "cm"];
    return +m[1] * f;
  }
  function odfText(node) {
    let s = "";
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) s += c.data;
        else if (c.nodeType === 1) {
          if (c.localName === "s") s += " ".repeat(+(c.getAttributeNS(TEXT_NS, "c") || 1));
          else if (c.localName === "tab" || c.localName === "line-break") s += " ";
          else if (c.localName === "note" || c.localName === "annotation") continue;
          else walk(c);
        }
      }
    };
    walk(node);
    return clean(s);
  }
  function odfParas(node) {
    const out = [];
    const walk = (n, level) => {
      for (const c of n.children) {
        if (c.namespaceURI === TEXT_NS && (c.localName === "p" || c.localName === "h")) {
          const t = odfText(c);
          if (t) out.push({ text: t, level: Math.min(Math.max(level, 0), 2) });
        } else if (c.namespaceURI === TEXT_NS && c.localName === "list") walk(c, level + 1);
        else if (c.localName === "table-row") {
          const t = Array.from(c.children).filter((x) => x.localName === "table-cell").map(odfText).join("  |  ");
          if (t.replace(/[|\s]/g, "")) out.push({ text: t, level: 0, table: true });
        } else walk(c, level);
      }
    };
    walk(node, -1);
    return out;
  }
  async function readOdp(file, bytes, onPage) {
    const zip = await JSZip.loadAsync(bytes);
    const content = await readXml(zip, "content.xml");
    if (!content) throw new Error("File .odp non valido");
    const pages = Array.from(content.getElementsByTagNameNS(DRAW_NS, "page"));
    const out = [];
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i];
      const blocks = [];
      const pics = [];
      const objs = [];
      const walk = (node) => {
        for (const c of node.children) {
          if (c.namespaceURI === PRES_NS && c.localName === "notes") continue;
          if (c.namespaceURI === DRAW_NS && c.localName === "g") { walk(c); continue; }
          if (c.namespaceURI !== DRAW_NS) continue;
          const cls = c.getAttributeNS(PRES_NS, "class") || "";
          if (["page-number", "date-time", "footer", "header"].includes(cls)) continue;
          const y = toCm(c.getAttributeNS(SVG_NS, "y")), x = toCm(c.getAttributeNS(SVG_NS, "x"));
          const w = toCm(c.getAttributeNS(SVG_NS, "width")) || 0, h = toCm(c.getAttributeNS(SVG_NS, "height")) || 0;
          // formule dell'editor di LibreOffice (oggetti incorporati)
          Array.from(c.getElementsByTagNameNS(DRAW_NS, "object")).forEach((o) => {
            const href = o.getAttributeNS(XLINK_NS, "href");
            const inline = o.getElementsByTagNameNS("*", "math")[0];
            if (inline || href) objs.push({ href, inline, x, y });
          });
          if (c.getElementsByTagNameNS(DRAW_NS, "object").length) continue;
          Array.from(c.getElementsByTagNameNS(DRAW_NS, "image")).forEach((im) => {
            const href = im.getAttributeNS(XLINK_NS, "href");
            if (href && !/^https?:/.test(href)) pics.push({ path: href.replace(/^\.\//, ""), area: w * h });
          });
          const paras = odfParas(c).filter((p) => !(p.text.length < 4 && isPageNumber(p.text)));
          if (paras.length) blocks.push({ cls, x, y, paras });
        }
      };
      walk(pg);
      for (const o of objs) {
        let m = o.inline;
        if (!m && o.href) {
          const d = await readXml(zip, o.href.replace(/^\.\//, "").replace(/\/$/, "") + "/content.xml");
          m = d && d.getElementsByTagNameNS("*", "math")[0];
        }
        const t = m ? tidyMath(mathmlText(m)) : "";
        if (t) blocks.push({ cls: "formula", x: o.x, y: o.y, paras: [{ text: t, level: 0 }] });
      }
      const titles = blocks.filter((b) => b.cls === "title");
      let others = blocks.filter((b) => b.cls !== "title");
      if (others.every((b) => b.y != null)) others = others.slice().sort((a, b) => (Math.abs(a.y - b.y) > 0.5 ? a.y - b.y : a.x - b.x));
      let title = titles.map((b) => b.paras.map((p) => p.text).join(" ")).join(" — ");
      let items = [];
      for (const b of others) for (const p of b.paras) {
        const sb = p.table ? { text: p.text } : stripBullet(p.text);
        items.push({ text: sb.text, level: p.level, table: !!p.table });
      }
      const speaker = [];
      Array.from(pg.children).filter((c) => c.namespaceURI === PRES_NS && c.localName === "notes").forEach((nt) => {
        Array.from(nt.getElementsByTagNameNS(DRAW_NS, "frame")).forEach((fr) => {
          if ((fr.getAttributeNS(PRES_NS, "class") || "") !== "notes") return;
          odfParas(fr).forEach((p) => speaker.push(p.text));
        });
      });
      const known = [title, ...items.map((x) => x.text)].join(" ");
      let imgItems = [];
      let ocr = false;
      let titleWeak = [];
      if (pics.length) {
        onPage(i + 1, pages.length, "Lettura del testo dalle immagini");
        const maxArea = Math.max(...pics.map((p) => p.area));
        imgItems = await ocrPictures(zip, pics, known.trim() ? Math.max(40, maxArea * 0.3) : 0, known);
        if (!known.trim() && imgItems.length) {
          title = imgItems[0].text;
          titleWeak = imgItems[0].weak;
          items = imgItems.slice(1);
          imgItems = [];
          ocr = true;
        }
      }
      out.push({ index: i + 1, title, titleWeak, items, imgItems, speaker, ratio: 16 / 9, ocr });
      onPage(i + 1, pages.length, "Lettura");
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Lettura PowerPoint vecchio formato (.ppt / .pps)                    */
  /* ------------------------------------------------------------------ */
  // Contenitore "Compound File" di Microsoft
  function readCfb(buf) {
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);
    if (buf.byteLength < 512 || dv.getUint32(0, true) !== 0xE011CFD0 || dv.getUint32(4, true) !== 0xE11AB1A1) throw new Error("File .ppt non valido");
    const ss = 1 << dv.getUint16(30, true), mss = 1 << dv.getUint16(32, true);
    const dirStart = dv.getUint32(48, true), cutoff = dv.getUint32(56, true);
    const miniFatStart = dv.getUint32(60, true), difatStart = dv.getUint32(68, true), nDifat = dv.getUint32(72, true);
    const END = 0xFFFFFFFA;
    const off = (s) => (s + 1) * ss;
    const difat = [];
    for (let i = 0; i < 109; i++) { const v = dv.getUint32(76 + i * 4, true); if (v < END) difat.push(v); }
    let d = difatStart;
    for (let k = 0; k < nDifat && d < END && off(d) + ss <= buf.byteLength; k++) {
      for (let i = 0; i < ss / 4 - 1; i++) { const v = dv.getUint32(off(d) + i * 4, true); if (v < END) difat.push(v); }
      d = dv.getUint32(off(d) + ss - 4, true);
    }
    const fat = [];
    for (const s of difat) {
      if (off(s) + ss > buf.byteLength) continue;
      for (let i = 0; i < ss / 4; i++) fat.push(dv.getUint32(off(s) + i * 4, true));
    }
    const chain = (start, table) => {
      const outc = [];
      const seen = new Set();
      let s = start;
      while (s < END && s < table.length && !seen.has(s)) { seen.add(s); outc.push(s); s = table[s]; }
      return outc;
    };
    const readChain = (start) => {
      const secs = chain(start, fat);
      const o = new Uint8Array(secs.length * ss);
      secs.forEach((s, i) => o.set(u8.subarray(off(s), Math.min(off(s) + ss, u8.length)), i * ss));
      return o;
    };
    const dir = readChain(dirStart);
    const ddv = new DataView(dir.buffer);
    const entries = [];
    for (let p = 0; p + 128 <= dir.length; p += 128) {
      const nl = ddv.getUint16(p + 64, true);
      let name = "";
      for (let i = 0; i < nl / 2 - 1; i++) name += String.fromCharCode(ddv.getUint16(p + i * 2, true));
      entries.push({ name, type: dir[p + 66], start: ddv.getUint32(p + 116, true), size: ddv.getUint32(p + 120, true) });
    }
    let mini = null, miniFat = null;
    return {
      get(name) {
        const e = entries.find((x) => x.name === name && x.type === 2);
        if (!e) return null;
        if (e.size < cutoff) {
          if (!mini) {
            mini = readChain(entries[0].start);
            const mf = readChain(miniFatStart);
            const mdv = new DataView(mf.buffer);
            miniFat = [];
            for (let i = 0; i < mf.length / 4; i++) miniFat.push(mdv.getUint32(i * 4, true));
          }
          const secs = chain(e.start, miniFat);
          const o = new Uint8Array(secs.length * mss);
          secs.forEach((s, i) => o.set(mini.subarray(s * mss, (s + 1) * mss), i * mss));
          return o.subarray(0, e.size);
        }
        return readChain(e.start).subarray(0, e.size);
      },
    };
  }

  async function readPpt(file, bytes, onPage) {
    const cfb = readCfb(bytes);
    const docS = cfb.get("PowerPoint Document");
    if (!docS) throw new Error("File .ppt non valido");
    const dv = new DataView(docS.buffer, docS.byteOffset, docS.byteLength);
    const len = docS.byteLength;
    const rec = (p) => (p + 8 <= len ? { ver: dv.getUint16(p, true) & 0xF, type: dv.getUint16(p + 2, true), inst: dv.getUint16(p, true) >> 4, len: dv.getUint32(p + 4, true), p } : null);
    const children = function* (start, end) {
      let p = start;
      end = Math.min(end, len);
      while (p + 8 <= end) { const r = rec(p); yield r; p += 8 + r.len; }
    };
    const dec16 = new TextDecoder("utf-16le");
    const textOf = (r) => {
      const a = docS.subarray(r.p + 8, Math.min(r.p + 8 + r.len, len));
      if (r.type === 0x0FA0) return dec16.decode(a);
      let s = "";
      for (const b of a) s += String.fromCharCode(b);
      return s;
    };
    // Raccoglie i testi (con il loro tipo: titolo, corpo, note…) dentro un record
    const collect = (r, out, state = { t: 4 }) => {
      if (r.ver === 0xF) {
        for (const c of children(r.p + 8, r.p + 8 + r.len)) collect(c, out, state);
      } else if (r.type === 0x0F9F) state.t = dv.getUint32(r.p + 8, true);
      else if (r.type === 0x0FA0 || r.type === 0x0FA8) out.push({ type: state.t, text: textOf(r) });
      return out;
    };
    // Mappa persistente: id -> posizione dei record
    const persist = new Map();
    let docRef = null;
    const cu = cfb.get("Current User");
    let edit = cu && cu.length >= 20 ? new DataView(cu.buffer, cu.byteOffset).getUint32(16, true) : null;
    if (edit == null) {
      for (let p = len - 8; p >= 0; p--) { if (dv.getUint16(p + 2, true) === 0x0FF5 && dv.getUint16(p, true) === 0) { edit = p; break; } }
    }
    for (let guard = 0; edit != null && guard < 1000; guard++) {
      const r = rec(edit);
      if (!r || r.type !== 0x0FF5) break;
      const lastEdit = dv.getUint32(edit + 16, true), pdOff = dv.getUint32(edit + 20, true);
      if (docRef == null) docRef = dv.getUint32(edit + 24, true);
      const pr = rec(pdOff);
      if (pr) {
        let p = pdOff + 8;
        const end = Math.min(p + pr.len, len);
        while (p + 4 <= end) {
          const v = dv.getUint32(p, true);
          p += 4;
          const id = v & 0xFFFFF, n = v >>> 20;
          for (let k = 0; k < n && p + 4 <= end; k++, p += 4) if (!persist.has(id + k)) persist.set(id + k, dv.getUint32(p, true));
        }
      }
      edit = lastEdit || null;
    }
    const docRec = rec(persist.get(docRef));
    if (!docRec || docRec.type !== 0x03E8) throw new Error("File .ppt non leggibile");
    // Elenco delle immagini (BStore) e flusso "Pictures" che le contiene
    const blips = [];
    const pictures = cfb.get("Pictures");
    const findBStore = (r) => {
      if (r.type === 0xF001) {
        for (const c of children(r.p + 8, r.p + 8 + r.len)) {
          blips.push(c.type === 0xF007 && c.len >= 36 ? { off: dv.getUint32(c.p + 8 + 28, true) } : null);
        }
      } else if (r.ver === 0xF) for (const c of children(r.p + 8, r.p + 8 + r.len)) findBStore(c);
    };
    // Immagini usate in un record (proprietà "pib" delle forme)
    const pibsOf = (r, out) => {
      if (r.ver === 0xF) { for (const c of children(r.p + 8, r.p + 8 + r.len)) pibsOf(c, out); }
      else if (r.type === 0xF00B || r.type === 0xF121 || r.type === 0xF122) {
        for (let k = 0; k < r.inst && r.p + 8 + k * 6 + 6 <= len; k++) {
          const opid = dv.getUint16(r.p + 8 + k * 6, true);
          if ((opid & 0x3FFF) === 0x0104 && !(opid & 0x8000)) out.add(dv.getUint32(r.p + 8 + k * 6 + 2, true));
        }
      }
      return out;
    };
    const blipBlob = (pib) => {
      const b = blips[pib - 1];
      if (!b || !pictures || b.off + 8 > pictures.length) return null;
      const size = new DataView(pictures.buffer, pictures.byteOffset + b.off, 8).getUint32(4, true);
      const data = pictures.subarray(b.off, Math.min(b.off + 8 + size, pictures.length));
      // cerca l'inizio di un PNG o JPEG nei primi byte
      for (let i = 8; i < Math.min(80, data.length - 4); i++) {
        if (data[i] === 0x89 && data[i + 1] === 0x50 && data[i + 2] === 0x4E && data[i + 3] === 0x47) return new Blob([data.subarray(i)], { type: "image/png" });
        if (data[i] === 0xFF && data[i + 1] === 0xD8 && data[i + 2] === 0xFF) return new Blob([data.subarray(i)], { type: "image/jpeg" });
      }
      return null;
    };
    const lists = { 0: [], 2: [] };
    for (const c of children(docRec.p + 8, docRec.p + 8 + docRec.len)) {
      if (c.type === 0x040B) findBStore(c);
      if (c.type !== 0x0FF0 || !(c.inst in lists)) continue;
      let cur = null, state = { t: 4 };
      for (const a of children(c.p + 8, c.p + 8 + c.len)) {
        if (a.type === 0x03F3) {
          cur = { persistId: dv.getUint32(a.p + 8, true), id: dv.getUint32(a.p + 20, true), texts: [] };
          lists[c.inst].push(cur);
          state = { t: 4 };
        } else if (cur) collect(a, cur.texts, state);
      }
    }
    // Note del relatore, collegate alle slide tramite id
    const notesById = new Map();
    for (const nt of lists[2]) {
      const r = rec(persist.get(nt.persistId));
      const texts = nt.texts.concat(r ? collect(r, []) : []).filter((t) => t.type === 2);
      notesById.set(nt.id, texts.map((t) => t.text));
    }
    const out = [];
    const split = (s) => s.split(/\r/).map((x) => clean(x.replace(/\v/g, " "))).filter((x) => x && x !== "*" && !isPageNumber(x));
    for (let i = 0; i < lists[0].length; i++) {
      const sl = lists[0][i];
      const r = rec(persist.get(sl.persistId));
      let notesRef = null;
      const fromDrawing = [];
      const pibs = r && r.ver === 0xF ? pibsOf(r, new Set()) : new Set();
      if (r && r.ver === 0xF) {
        for (const c of children(r.p + 8, r.p + 8 + r.len)) {
          if (c.type === 0x03EF && c.len >= 20) notesRef = dv.getUint32(c.p + 8 + 16, true);
          else collect(c, fromDrawing);
        }
      }
      const all = sl.texts.slice();
      const seen = new Set(all.map((t) => clean(t.text)));
      fromDrawing.forEach((t) => { if (!seen.has(clean(t.text))) { seen.add(clean(t.text)); all.push(t); } });
      const isT = (t) => t.type === 0 || t.type === 6;
      const title = all.filter(isT).map((t) => split(t.text).join(" ")).join(" — ");
      const items = [];
      all.filter((t) => !isT(t) && t.type !== 2).forEach((t) => split(t.text).forEach((x) => items.push({ text: stripBullet(x).text, level: 0 })));
      const speaker = (notesById.get(notesRef) || []).flatMap(split);
      // Testo nelle immagini della slide
      let imgItems = [], ocr = false;
      let t2 = title, it2 = items, tw = [];
      if (pibs.size) {
        onPage(i + 1, lists[0].length, "Lettura del testo dalle immagini");
        const lines = [];
        for (const pib of pibs) {
          const blob = blipBlob(pib);
          if (!blob) continue;
          const ls = await ocrBlob(blob);
          if (ls) lines.push(...ls);
        }
        const known = [title, ...items.map((x) => x.text)].join(" ");
        imgItems = notesAsItems(uncoveredLines(lines, known));
        if (!known.trim() && imgItems.length) { t2 = imgItems[0].text; tw = imgItems[0].weak; it2 = imgItems.slice(1); imgItems = []; ocr = true; }
      }
      out.push({ index: i + 1, title: t2, titleWeak: tw, items: it2, imgItems, speaker, ratio: 4 / 3, ocr });
      onPage(i + 1, lists[0].length, "Lettura");
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Foto e scansioni (JPG, PNG…)                                        */
  /* ------------------------------------------------------------------ */
  async function readImage(file, bytes) {
    const blob = new Blob([bytes], { type: file.type || MIME[extOf(file.name)] || "" });
    const img = await imageForOcr(blob); // fallisce se il browser non sa aprire l'immagine
    const ratio = img.w / img.h;
    const lines = await recognizeCanvas(img.canvas);
    const n = linesToNotes(lines.filter((l) => !(isPageNumber(stripBullet(l.text).text) && (l.rel > 0.85 || l.rel < 0.15))));
    return { title: n.title, titleWeak: n.titleWeak, items: n.items, imgItems: [], speaker: [], ratio, ocr: true };
  }
  /* ------------------------------------------------------------------ */
  /* Riconoscimento lingua (semplice, locale)                           */
  /* ------------------------------------------------------------------ */
  const IT_WORDS = new Set("il lo la i gli le di da del della dei delle che è e non per con una un sono come più anche nel nella alla al si questo questa ma tra fra se dove quando essere ha hanno può sulla sul degli allo agli".split(" "));
  const EN_WORDS = new Set("the of and to in is are that for with as on by this be it an from or not at which can was were have has will their its these into than more also such each other".split(" "));
  const IT_WORDS2 = new Set("sui sugli nei negli alle ai dalla dallo dagli dalle col cui ci ne lui lei loro noi voi era erano stato stata fa fanno molto poco tutto tutti ogni altro altri quale quali perché però già ancora sempre solo avere viene vengono sia uno ad ed od dove cioè quindi infatti mentre dunque oppure".split(" "));
  const EN_WORDS2 = new Set("you he she we they his her our your what where who how why been being would should could may might must does did do no yes there here then so if all any some most only very about after before between through during without within when while because however therefore".split(" "));
  // Riconosce la lingua (italiano o inglese) da parole comuni, finali tipici delle parole e vocali finali
  function detectLang(text) {
    const words = (String(text || "").toLowerCase().match(/[a-zàèéìòùáíóú']+/g) || []);
    let it = 0, en = 0, long = 0, vowelEnd = 0;
    for (const w of words) {
      if (IT_WORDS.has(w) || IT_WORDS2.has(w)) it += 2;
      if (EN_WORDS.has(w) || EN_WORDS2.has(w)) en += 2;
      if (w.length >= 4) {
        long++;
        if (/[aeiouàèéìòù]$/.test(w)) vowelEnd++;
        if (/(zione|zioni|mente|ità|ismo|aggio|ato|ata|ati|ate|ito|ita|uto|uta|oso|osa|ella|ello|etto|etta|ione|enza|anza|ico|ica|ici|iche)$/.test(w)) it++;
        if (/(tion|tions|ing|ed|ly|ness|ment|ments|ful|less|ship|ous|ive|able|ible|th|ck|ght|ies)$/.test(w)) en++;
        if (/[kwy]/.test(w) && !/[àèéìòù]/.test(w)) en += 0.5;
      }
    }
    if (/[àèéìòù]/.test(text)) it += 1;
    if (long >= 3) {
      const r = vowelEnd / long;
      if (r >= 0.75) it += 2; else if (r <= 0.45) en += 2;
    }
    if (Math.abs(it - en) < 1) return "unknown";
    return it > en ? "it" : "en";
  }
  function slideText(s) {
    return [plain(s.title), ...s.items.map((i) => plain(i.text)), ...(s.imgItems || []).map((i) => plain(i.text)), ...s.speaker].join("\n");
  }

  /* ------------------------------------------------------------------ */
  /* Traduzione: prima sul dispositivo (Chrome/Edge, offline), poi online */
  /* ------------------------------------------------------------------ */
  const Translate = (() => {
    // Traduzione automatica tutta sul computer: motore e modelli italiano⇄inglese sono dentro il file.
    // Nessuna connessione a internet e nessun servizio esterno.
    const cache = new Map();
    let saveTimer = null;
    let worker = null, ready = null, seq = 0;
    const waiting = new Map();
    const models = new Map();

    async function loadCache() {
      const c = await DB.get("kv", "trcache");
      if (c && typeof c === "object") Object.entries(c).forEach(([k, v]) => cache.set(k, v));
    }
    function persist() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const obj = {};
        let n = 0;
        for (const [k, v] of cache) { obj[k] = v; if (++n > 20000) break; }
        DB.put("kv", obj, "trcache");
      }, 1500);
    }
    // Dati incorporati nella pagina (base64 + gzip); in alternativa file accanto alla pagina
    async function data(id) {
      const elx = document.getElementById(id);
      let buf;
      if (elx) {
        // decodifica diretta (senza fetch: alcune pagine web la vietano)
        const bin = atob(elx.textContent.trim());
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        buf = u8.buffer;
      } else {
        const r = await fetch("traduzione/" + id + ".bin.wasm"); // versione di anteprima: dati in file separati
        if (!r.ok) throw new Error("Dati di traduzione mancanti");
        buf = await r.arrayBuffer();
      }
      const u = new Uint8Array(buf, 0, 2);
      if (u[0] !== 0x1f || u[1] !== 0x8b) return buf; // già decompresso
      return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    }
    function call(msg, transfer) {
      return new Promise((res, rej) => {
        const id = ++seq;
        waiting.set(id, { res, rej });
        worker.postMessage({ ...msg, id }, transfer || []);
      });
    }
    // Se il browser non permette il "worker" separato, il traduttore gira nella pagina stessa
    function mainThreadWorker(code) {
      const fake = { onmessage: null, onerror: null, postMessage(m) { setTimeout(() => window.__mtSend(m)); } };
      window.__mtRecv = (m) => fake.onmessage && fake.onmessage({ data: m });
      const sc = document.createElement("script");
      sc.textContent = "(function(){var postMessage=function(m){window.__mtRecv(m)};var onmessage;\n" + code +
        "\n;window.__mtSend=function(m){onmessage({data:m})};})();";
      document.head.append(sc);
      if (!window.__mtSend) throw new Error("Il browser non permette di avviare il traduttore");
      return fake;
    }
    let mode = "";
    function boot(w) {
      return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error("avvio troppo lento")), 45000);
        w.onmessage = (e) => {
          const m = e.data;
          if (m.type === "ready") { clearTimeout(t); res(); }
          else if (m.type === "error" && m.id == null) { clearTimeout(t); rej(new Error(m.msg)); }
          else {
            const x = waiting.get(m.id);
            if (!x) return;
            waiting.delete(m.id);
            if (m.type === "error") x.rej(new Error(m.msg)); else x.res(m);
          }
        };
        w.onerror = (e) => { clearTimeout(t); rej(new Error(e.message || "Traduttore non avviato")); };
      });
    }
    function start() {
      if (ready) return ready;
      ready = (async () => {
        if (typeof DecompressionStream === "undefined") throw new Error("browser troppo vecchio: aggiorna Chrome, Edge, Firefox o Safari");
        const code = document.getElementById("mt-worker").textContent;
        const wasm = await data("mt-wasm");
        try {
          if (window.__forceMtPage) throw new Error("prova");
          worker = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
          const b = boot(worker);
          worker.postMessage({ type: "wasm", bin: wasm.slice(0) });
          await b;
          mode = "worker";
        } catch (e) {
          console.warn("Traduttore nel worker non disponibile, uso la pagina:", e);
          try { worker && worker.terminate && worker.terminate(); } catch (x) { /* niente */ }
          worker = mainThreadWorker(code);
          const b = boot(worker);
          worker.postMessage({ type: "wasm", bin: wasm });
          await b;
          mode = "page";
        }
      })();
      ready.catch(() => { ready = null; });
      return ready;
    }
    function model(pair) {
      if (models.has(pair)) return models.get(pair);
      const p = (async () => {
        await start();
        const [m, l, v] = await Promise.all([
          data("mt-model-" + pair),
          data("mt-lex-" + pair),
          data("mt-vocab"),
        ]);
        await call({ type: "model", pair, model: m, lex: l, vocab: v }, [m, l, v]);
      })();
      models.set(pair, p);
      p.catch(() => models.delete(pair));
      return p;
    }
    // Prepara in anticipo il traduttore (per esempio quando si apre il pannello)
    function prepare(from, to) { if (from !== to) model(from + to).catch(warn); }

    // Le formule e i simboli non devono passare dal traduttore (li rovinerebbe):
    // vengono sostituiti da numeri-segnaposto, che il traduttore lascia intatti, e poi rimessi al loro posto.
    const SAFE_RE = /^[\p{Script=Latin}\p{Nd}\s.,;:!?'"’‘“”«»()\[\]\-–—%&@#€$*]+$/u;
    const VAR_RE = /^\(?\p{L}\d*[,.;:)\]]*$|^\(?[\d.,]+[)\],.;:]*$/u;   // variabile di una lettera (x, x1) o numero
    const OP_RE = /[=+\-−<>≤≥≠≈×·⋅÷^_/∈∉⊂⊆→←⇒⇔±∓∝∼≡]/;
    // Glossario (parole sempre tradotte così) e correzioni fatte a mano
    let glossary = [];
    const fixes = new Map();
    async function loadUser() {
      glossary = (await DB.get("kv", "glossario")) || [];
      const f = await DB.get("kv", "trfix");
      if (f && typeof f === "object") Object.entries(f).forEach(([k, v]) => fixes.set(k, v));
    }
    let gen = 0; // cambia quando cambia il glossario: le traduzioni vecchie non vanno più salvate
    function setGlossary(list) { glossary = list; gen++; DB.put("kv", list, "glossario"); cache.clear(); DB.put("kv", {}, "trcache"); }
    function setFix(from, to, orig, fixed) {
      const k = from + to + "|" + orig;
      if (fixed && fixed.trim()) fixes.set(k, fixed.trim()); else fixes.delete(k);
      DB.put("kv", Object.fromEntries(fixes), "trfix");
    }
    const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    function protect(text, from, to) {
      const spans = [];
      const newCode = () => { let c; do { c = String(7301 + spans.length * 7 + Math.floor(Math.random() * 3)); } while (text.includes(c)); return c; };
      // i termini del glossario vengono sostituiti dalla loro traduzione scelta
      for (const g of glossary) {
        const src = (g[from] || "").trim(), dst = (g[to] || "").trim();
        if (!src || !dst) continue;
        text = text.replace(new RegExp("(?<![\\p{L}\\p{N}])" + reEsc(src) + "(?![\\p{L}\\p{N}])", "giu"), (m) => {
          const code = newCode();
          const cap = m[0] !== m[0].toLowerCase() && dst[0] === dst[0].toLowerCase();
          spans.push({ code, span: cap ? dst[0].toUpperCase() + dst.slice(1) : dst });
          return code;
        });
      }
      const toks = text.split(/(\s+)/);
      const words = [];
      toks.forEach((t, i) => { if (t.trim()) words.push(i); });
      const isMath = new Set(words.filter((i) => !SAFE_RE.test(toks[i])));
      // variabili e numeri accanto a una formula fanno parte della formula
      let grew = true;
      while (grew) {
        grew = false;
        words.forEach((i, k) => {
          if (isMath.has(i)) return;
          const p = k > 0 ? words[k - 1] : null, n = k < words.length - 1 ? words[k + 1] : null;
          // una variabile o un numero entra nella formula se è vicino a un operatore (=, +, ≤ …)
          const nearOp = (p != null && isMath.has(p) && OP_RE.test(toks[p])) || (n != null && isMath.has(n) && OP_RE.test(toks[n]));
          // la parentesi che chiude una formula aperta prima, es. "ψ(x, t)"
          const closes = /^[^()]*\)/.test(toks[i]) && toks[i].length <= 4 && p != null && isMath.has(p) && /\([^)]*$/.test(toks[p]);
          if ((VAR_RE.test(toks[i]) && nearOp) || closes) { isMath.add(i); grew = true; }
        });
      }
      if (!isMath.size) return { masked: text, spans };
      let out = "", k = 0;
      while (k < words.length) {
        const i = words[k];
        if (!isMath.has(i)) { out += (out ? " " : "") + toks[i]; k++; continue; }
        let j = k;
        while (j + 1 < words.length && isMath.has(words[j + 1])) j++;
        const span = toks.slice(words[k], words[j] + 1).join("");
        const code = newCode();
        spans.push({ code, span });
        out += (out ? " " : "") + code;
        k = j + 1;
      }
      return { masked: out, spans };
    }
    function restore(tr, spans) {
      // dall'ultimo al primo: una formula può contenere un termine del glossario
      for (const { code, span } of spans.slice().reverse()) {
        if (tr.split(code).length !== 2) return null;
        tr = tr.replace(code, () => span);
      }
      return tr;
    }

    // Traduce un elenco di righe mantenendo la corrispondenza 1:1
    async function lines(arr, from, to) {
      const result = new Array(arr.length);
      const todo = [];
      arr.forEach((t, i) => {
        if (!t || !t.trim() || from === to) { result[i] = t; return; }
        const k = from + to + "|" + t;
        if (fixes.has(k)) { result[i] = fixes.get(k); return; }
        if (cache.has(k)) result[i] = cache.get(k); else todo.push(i);
      });
      if (!todo.length) return result;
      const pair = from + to;
      const myGen = gen;
      await model(pair);
      const prot = todo.map((i) => protect(arr[i], from, to));
      const r = await call({ type: "translate", pair, texts: prot.map((p) => p.masked) });
      for (let j = 0; j < todo.length; j++) {
        const i = todo[j], p = prot[j];
        let t = p.spans.length ? restore(r.out[j], p.spans) : r.out[j];
        if (t == null) {
          // il traduttore ha spostato i segnaposto: traduci a pezzi il testo tra una formula e l'altra
          const parts = p.masked.split(new RegExp("(" + p.spans.map((x) => x.code).join("|") + ")"));
          const prose = parts.filter((x, k) => k % 2 === 0 && x.trim());
          const rr = prose.length ? (await call({ type: "translate", pair, texts: prose })).out : [];
          let q = 0;
          t = parts.map((x, k) => (k % 2 ? p.spans.find((sp) => sp.code === x).span : x.trim() ? rr[q++] : x)).join(" ").replace(/\s+/g, " ").trim();
        }
        result[i] = t;
        if (myGen === gen) cache.set(from + to + "|" + arr[i], t);
      }
      persist();
      return result;
    }
    async function text(t, from, to) {
      return (await lines(t.split("\n"), from, to)).join("\n");
    }
    return { lines, text, loadCache, prepare, loadUser, setGlossary, getGlossary: () => glossary, setFix, mode: () => mode };
  })();

  /* ------------------------------------------------------------------ */
  /* Interfaccia                                                        */
  /* ------------------------------------------------------------------ */
  const list = $("#list");
  const rowsById = new Map();

  // Finestra di conferma / richiesta di un nome, fatta dall'app (le finestrelle del browser
  // possono essere bloccate, per esempio nell'anteprima online)
  function ask(message, { ok = "OK", danger = false, input = null } = {}) {
    return new Promise((resolve) => {
      const dlg = $("#askDlg"), inp = $("#askInput"), okB = $("#askOk"), noB = $("#askCancel");
      $("#askText").textContent = message;
      inp.hidden = input == null;
      if (input != null) inp.value = input;
      okB.textContent = ok;
      okB.classList.toggle("danger-btn", danger);
      dlg.hidden = false;
      (input != null ? inp : okB).focus();
      if (input != null) inp.select();
      const done = (v) => { dlg.hidden = true; okB.onclick = noB.onclick = inp.onkeydown = dlg.onkeydown = null; resolve(v); };
      okB.onclick = () => done(input != null ? inp.value : true);
      noB.onclick = () => done(input != null ? null : false);
      dlg.onkeydown = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(input != null ? null : false); } };
      inp.onkeydown = (e) => { if (e.key === "Enter") done(inp.value); };
    });
  }

  // Messaggio in basso; con "action" compare un pulsante (es. Annulla)
  function toast(msg, ms = 3500, action) {
    const t = $("#toast");
    t.textContent = msg;
    if (action) {
      const b = el("button", "toast-btn", action.label);
      b.onclick = () => { t.hidden = true; action.fn(); };
      t.append(b);
      ms = Math.max(ms, 8000);
    }
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, ms);
  }

  function sortedSlides() {
    const forder = new Map(state.files.map((f) => [f.id, f.order]));
    return state.slides.slice().sort((a, b) => (forder.get(a.fileId) - forder.get(b.fileId)) || (a.index - b.index));
  }

  function refreshChrome() {
    const has = state.slides.length > 0;
    $("#upload").classList.toggle("empty", !has);
    $("#workspace").hidden = !has;
    $("#btnExport").disabled = !has;
    const chips = $("#fileChips");
    chips.textContent = "";
    $("#filesLabel").hidden = !state.files.length;
    state.files.slice().sort((a, b) => a.order - b.order).forEach((f) => {
      const c = el("span", "chip");
      c.append(el("span", "kind", f.kind === "img" ? "FOTO" : f.kind.toUpperCase()), el("span", null, f.name + " · " + state.slides.filter((s) => s.fileId === f.id).length));
      const x = el("button", "chip-del", "✕ Elimina");
      x.title = "Elimina questo file e tutti i suoi appunti";
      x.setAttribute("aria-label", "Elimina " + f.name + " e i suoi appunti");
      x.onclick = () => removeFile(f.id);
      c.append(x);
      chips.append(c);
    });
    updateCount();
  }
  function updateCount() {
    const vis = state.slides.filter((s) => !rowsById.get(s.id)?.row.hidden).length;
    $("#count").textContent = state.query ? `${vis} di ${state.slides.length} slide` : `${state.slides.length} slide`;
  }

  // Numerazione progressiva di tutte le slide caricate
  function renumber() {
    sortedSlides().forEach((s, i) => {
      s.n = i + 1;
      const r = rowsById.get(s.id);
      if (r) r.badge.textContent = "Slide " + s.n;
    });
  }

  function buildRow(s) {
    const row = el("article", "row");
    row.dataset.id = s.id;
    const thumb = el("div", "thumb");
    thumb.title = "Apri la slide";
    const f = state.files.find((x) => x.id === s.fileId);
    if (s.kind === "pdf" || s.kind === "img") {
      if (s.ratio) thumb.style.aspectRatio = String(Math.max(0.6, Math.min(2.4, s.ratio)));
      thumb.append(el("div", "ph", "Anteprima…"));
    } else {
      const ts = el("div", "textslide");
      ts.append(el("b", null, s.title || ""));
      s.items.slice(0, 12).forEach((it) => ts.append(el("div", null, (it.level ? "   ".repeat(it.level) : "") + (it.table ? "" : "• ") + it.text)));
      thumb.append(ts);
    }
    thumb.onclick = () => openViewer(s.id);

    const notes = el("div", "notes");
    const head = el("div", "notes-head");
    const badge = el("span", "badge", "Slide " + (s.n || s.index));
    const src = el("span", "src", s.kind === "img" ? (s.name || "") : (f ? f.name : "") + (s.kind === "pdf" ? " · pag. " : " · diapositiva ") + s.index);
    const trTag = el("span", "tr-tag", "tradotto");
    trTag.hidden = true;
    const copy = el("button", "mini", "Copia");
    copy.title = "Copia gli appunti di questa slide";
    copy.onclick = () => {
      navigator.clipboard.writeText(rowPlainText(s)).then(() => toast("Appunti copiati"), () => toast("Copia non riuscita"));
    };
    head.append(badge, src);
    if (s.ocr) {
      const o = el("span", "ocr-tag", "letto dall'immagine");
      o.title = "Testo riconosciuto automaticamente da un'immagine: controllalo con la slide";
      head.append(o);
    }
    const fix = el("button", "mini", "Correggi");
    fix.title = "Correggi a mano gli appunti di questa slide";
    fix.onclick = () => editSlide(s);
    const sch = el("button", "mini", "Schema");
    sch.title = "Crea una bozza di schema con gli appunti di questa slide";
    sch.onclick = () => Schema.draftFromSlides([s]);
    const del = el("button", "mini danger-mini", "Elimina");
    del.title = "Elimina questa slide dagli appunti";
    del.onclick = () => deleteSlide(s);
    head.append(trTag, fix, sch, copy, del);
    const content = el("div", "content");
    const ta = el("textarea", "mynote");
    ta.placeholder = "Le tue annotazioni su questa slide…";
    ta.value = s.user || "";
    ta.rows = 1;
    const fit = () => { ta.style.height = "auto"; ta.style.height = Math.max(42, ta.scrollHeight + 2) + "px"; ta.classList.toggle("blank", !ta.value.trim()); };
    let t;
    ta.addEventListener("input", () => {
      s.user = ta.value;
      fit();
      clearTimeout(t);
      t = setTimeout(() => DB.put("slides", s), 400);
    });
    notes.append(head, content, ta);
    row.append(thumb, notes);
    const r = { row, thumb, content, trTag, badge, ta, fit, rendered: false, shownLang: null };
    rowsById.set(s.id, r);
    renderContent(s, r, null);
    return row;
  }

  // Testo con le parole incerte (lette male dall'immagine) evidenziate
  // Testo con apici/pedici (^{…} _{…}) e parole incerte (lette male dall'immagine) evidenziate
  function withWeak(tag, cls, text, weak) {
    const e = el(tag, cls);
    const set = new Set(weak || []);
    const addPlain = (str) => {
      if (!set.size) { e.append(document.createTextNode(str)); return; }
      str.split(/(\s+)/).forEach((tok) => {
        if (tok && set.has(tok)) {
          const m = el("span", "unsure", tok);
          m.title = "Parola letta dall'immagine con poca sicurezza: controllala sulla slide";
          e.append(m);
        } else if (tok) e.append(document.createTextNode(tok));
      });
    };
    let last = 0;
    String(text || "").replace(MARKUP_RE, (m, k, v, off) => {
      addPlain(text.slice(last, off));
      e.append(el(k === "^" ? "sup" : "sub", null, v));
      last = off + m.length;
      return m;
    });
    addPlain(String(text || "").slice(last));
    return e;
  }
  // Formula o simbolo mostrati come ritaglio della slide
  function formulaImg(it) {
    const im = el("img", "formula");
    im.src = it.img;
    im.alt = plain(it.text) || "formula";
    im.title = "Ritaglio dalla slide (formula o simboli)";
    if (it.imgW) im.style.width = it.imgW + "px";
    return im;
  }

  function renderContent(s, r, tr) {
    // tr = versione tradotta {title, items[], imgItems[], speaker[]} oppure null per l'originale
    const d = tr || s;
    const c = r.content;
    c.textContent = "";
    if (d.title) c.append(withWeak("h3", null, d.title, tr ? null : s.titleWeak));
    if (d.items.length) {
      const ul = el("ul");
      d.items.forEach((it, i) => {
        const src = s.items[i];
        const cls = (src.table ? "tbl " : "") + (src.level ? "l" + src.level : "") + (src.img ? " fli" : "");
        if (src.img) { const li = el("li", cls); li.append(formulaImg(src)); ul.append(li); return; }
        ul.append(withWeak("li", cls, it.text, tr ? null : src.weak));
      });
      c.append(ul);
    }
    const img = d.imgItems || [];
    if (img.length) {
      const box = el("div", "imgtext");
      box.append(el("b", null, "Testo nelle immagini della slide"));
      const ul = el("ul");
      img.forEach((it, i) => {
        const src = s.imgItems[i];
        if (src.img) { const li = el("li", "fli"); li.append(formulaImg(src)); ul.append(li); return; }
        ul.append(withWeak("li", src.level ? "l" + src.level : "", it.text, tr ? null : src.weak));
      });
      box.append(ul);
      c.append(box);
    }
    if (!d.title && !d.items.length && !img.length) {
      c.append(el("p", "empty-note", s.ocrFailed
        ? "Non è stato possibile leggere il testo di questa slide: aggiorna il browser (Chrome, Edge, Firefox o Safari recenti) e ricaricala."
        : "In questa slide non c'è testo da leggere (solo immagini o grafici senza scritte)."));
    }
    if (d.speaker.length) {
      const sp = el("div", "speaker");
      sp.append(el("b", null, "Note del relatore"));
      d.speaker.forEach((t) => sp.append(el("div", null, t)));
      c.append(sp);
    }
    // ✕ per eliminare un punto sbagliato (con possibilità di annullare)
    const addDel = (li, list, i) => {
      const b = el("button", "del-item", "✕");
      b.title = "Elimina questo punto";
      b.setAttribute("aria-label", "Elimina questo punto");
      b.onclick = (ev) => { ev.stopPropagation(); deleteItem(s, list, i); };
      li.append(b);
    };
    c.querySelectorAll(":scope > ul > li").forEach((li, i) => addDel(li, "items", i));
    c.querySelectorAll(".imgtext li").forEach((li, i) => addDel(li, "imgItems", i));
    r.trTag.hidden = !tr;
    r.trTag.textContent = "tradotto";
    // sotto la traduzione, in piccolo, il testo originale (per controllare)
    if (tr && state.showOrig) {
      const lis = c.querySelectorAll(":scope > ul > li");
      s.items.forEach((src, i) => { if (!src.img && lis[i] && plain(src.text) !== d.items[i].text) lis[i].append(withWeak("div", "orig", src.text)); });
      const h = c.querySelector("h3");
      if (h && s.title && plain(s.title) !== d.title) h.after(withWeak("div", "orig orig-title", s.title));
    }
  }

  /* ---------------- Correzione a mano degli appunti ---------------- */
  const IMG_MARK = "[Testo nelle immagini]";
  // Le formule (ritagli della slide) compaiono come [formula 1], [formula 2]… e restano al loro posto
  function slideFormulas(s) { return s.items.concat(s.imgItems || []).filter((i) => i.img); }
  function notesToEditText(s) {
    const out = [];
    const fs = slideFormulas(s);
    const txt = (it) => (it.img ? "[formula " + (fs.indexOf(it) + 1) + "]" : it.text);
    if (s.title) out.push(s.title);
    s.items.forEach((it) => out.push(it.table ? it.text : "  ".repeat(it.level || 0) + "- " + txt(it)));
    if ((s.imgItems || []).length) {
      out.push("", IMG_MARK);
      s.imgItems.forEach((it) => out.push("  ".repeat(it.level || 0) + "- " + txt(it)));
    }
    return out.join("\n");
  }
  function parseEditText(txt, hadTitle, formulas) {
    const res = { title: "", items: [], imgItems: [] };
    let target = res.items;
    let first = true;
    for (const raw of txt.split("\n")) {
      if (!raw.trim()) continue;
      if (raw.trim() === IMG_MARK) { target = res.imgItems; first = false; continue; }
      const m = /^(\s*)[-•*]\s+(.*)$/.exec(raw);
      if (first && !m && hadTitle !== false) { res.title = clean(raw); first = false; continue; }
      first = false;
      const text = clean(m ? m[2] : raw);
      if (!text) continue;
      const level = m ? Math.min(2, Math.floor(m[1].replace(/\t/g, "  ").length / 2)) : 0;
      const fm = /^\[formula (\d+)\]$/i.exec(text);
      if (fm && formulas && formulas[+fm[1] - 1]) { target.push({ ...formulas[+fm[1] - 1], level }); continue; }
      target.push(/ \| /.test(text) && !m ? { text, level: 0, table: true } : { text, level });
    }
    return res;
  }
  /* ---------------- Eliminare punti o slide sbagliati ---------------- */
  function refreshSlide(s) {
    const r = rowsById.get(s.id);
    if (!r) return;
    r.shownLang = null; r.trData = null;
    renderContent(s, r, null);
    if (state.lang !== "orig") syncLang(s);
  }
  function deleteItem(s, list, i) {
    const arr = s[list] || [];
    const [gone] = arr.splice(i, 1);
    if (!gone) return;
    DB.put("slides", s);
    refreshSlide(s);
    toast("Punto eliminato", 8000, { label: "Annulla", fn: () => { arr.splice(i, 0, gone); DB.put("slides", s); refreshSlide(s); } });
  }
  function deleteSlide(s) {
    const idx = state.slides.indexOf(s);
    if (idx < 0) return;
    state.slides.splice(idx, 1);
    const r = rowsById.get(s.id);
    if (r) { io.unobserve(r.row); r.row.remove(); rowsById.delete(s.id); }
    DB.del("slides", s.id);
    renumber();
    refreshChrome();
    toast("Slide eliminata", 8000, {
      label: "Annulla",
      fn: () => { state.slides.splice(idx, 0, s); DB.put("slides", s); renderAll(); },
    });
  }

  // Lingua di partenza di una riga (per sapere quale traduzione correggere)
  function lineLang(s, t) {
    const l = detectLang(t);
    if (l !== "unknown") return l;
    return s.lang && s.lang !== "unknown" ? s.lang : (state.lang === "it" ? "en" : "it");
  }
  // Correzione a mano della traduzione: viene ricordata e usata ogni volta che compare la stessa frase
  function editTranslation(s, r) {
    const lang = state.lang;
    const d = r.trData;
    const t = {
      title: d.title,
      items: s.items.map((src, i) => (src.img ? src : { ...src, text: d.items[i].text })),
      imgItems: (s.imgItems || []).map((src, i) => (src.img ? src : { ...src, text: d.imgItems[i].text })),
    };
    r.editing = true;
    const c = r.content;
    c.textContent = "";
    const help = el("p", "edit-help", "Stai correggendo la TRADUZIONE (" + (lang === "it" ? "italiano" : "inglese") + "). Le correzioni vengono ricordate e usate ogni volta che ricompare la stessa frase. Il testo originale non cambia.");
    const ta = el("textarea", "edit-area");
    ta.value = notesToEditText(t);
    ta.rows = Math.min(20, ta.value.split("\n").length + 2);
    const bar = el("div", "edit-bar");
    const save = el("button", "btn small primary", "Salva traduzione");
    const cancel = el("button", "btn small", "Annulla");
    bar.append(save, cancel);
    c.append(help, ta, bar);
    ta.focus();
    const close = () => { r.editing = false; r.shownLang = null; r.trData = null; syncLang(s); };
    cancel.onclick = close;
    save.onclick = () => {
      const res = parseEditText(ta.value, true, slideFormulas(t));
      // [originale, traduzione attuale, traduzione corretta]: si ricordano solo le righe cambiate
      const pairs = [[s.title, t.title, res.title]];
      const textOnly = (arr) => arr.filter((i) => !i.img);
      const a1 = textOnly(s.items), c1 = textOnly(t.items), b1 = textOnly(res.items);
      a1.forEach((src, i) => b1[i] && pairs.push([src.text, c1[i] && c1[i].text, b1[i].text]));
      const a2 = textOnly(s.imgItems || []), c2 = textOnly(t.imgItems), b2 = textOnly(res.imgItems);
      a2.forEach((src, i) => b2[i] && pairs.push([src.text, c2[i] && c2[i].text, b2[i].text]));
      for (const [o, cur, n] of pairs) {
        const op = plain(o);
        if (!op || !n || clean(n) === clean(cur || "")) continue;
        const from = lineLang(s, op);
        if (from !== lang) Translate.setFix(from, lang, op, n);
      }
      close();
      toast("Traduzione corretta e ricordata");
    };
  }
  function editSlide(s) {
    const r = rowsById.get(s.id);
    if (!r || r.editing) return;
    if (state.lang !== "orig" && r.trData && r.shownLang === state.lang) { editTranslation(s, r); return; }
    r.editing = true;
    const c = r.content;
    c.textContent = "";
    const help = el("p", "edit-help", "Correggi il testo. Prima riga = titolo; ogni punto inizia con «- » (due spazi prima per un sottopunto).");
    const ta = el("textarea", "edit-area");
    ta.value = notesToEditText(s);
    ta.rows = Math.min(20, ta.value.split("\n").length + 2);
    const bar = el("div", "edit-bar");
    const save = el("button", "btn small primary", "Salva");
    const cancel = el("button", "btn small", "Annulla");
    bar.append(save, cancel);
    c.append(help, ta, bar);
    ta.focus();
    const close = () => { r.editing = false; r.shownLang = null; r.trData = null; renderContent(s, r, null); if (state.lang !== "orig") syncLang(s); };
    cancel.onclick = close;
    save.onclick = () => {
      const res = parseEditText(ta.value, !!s.title || !s.items.length, slideFormulas(s));
      s.title = res.title;
      s.items = res.items;
      s.imgItems = res.imgItems;
      s.titleWeak = [];
      s.edited = true;
      s.lang = detectLang(slideText(s)) === "unknown" ? s.lang : detectLang(slideText(s));
      DB.put("slides", s);
      close();
      toast("Appunti corretti e salvati");
    };
  }

  function rowPlainText(s) {
    const r = rowsById.get(s.id);
    const tr = r && r.trData && r.shownLang === state.lang ? r.trData : s;
    const line = (src, it) => (src.img ? "[formula: vedi la slide " + s.n + "]" : plain(it.text));
    const out = ["Slide " + s.n + (tr.title ? " — " + plain(tr.title) : "")];
    tr.items.forEach((it, i) => out.push("  ".repeat(s.items[i].level || 0) + (s.items[i].table ? "" : "• ") + line(s.items[i], it)));
    if ((tr.imgItems || []).length) {
      out.push("Testo nelle immagini:");
      tr.imgItems.forEach((it, i) => out.push("  • " + line(s.imgItems[i], it)));
    }
    if (tr.speaker.length) out.push("Note del relatore: " + tr.speaker.join(" "));
    if (s.user && s.user.trim()) out.push("Mie annotazioni: " + s.user.trim());
    return out.join("\n");
  }

  async function translatedSlide(s, lang) {
    const slideFrom = s.lang && s.lang !== "unknown" ? s.lang : (lang === "it" ? "en" : "it");
    const img = s.imgItems || [];
    // le formule (ritagli) non si traducono; apici e pedici vanno al traduttore in forma semplice
    const tx = (i) => (i.img ? "" : plain(i.text));
    const arr = [plain(s.title), ...s.items.map(tx), ...img.map(tx), ...s.speaker];
    // la lingua si decide riga per riga: una frase inglese in una slide italiana viene tradotta lo stesso
    const tr = arr.slice();
    const groups = { it: [], en: [] };
    let changed = 0;
    arr.forEach((t, i) => {
      if (!t || !t.trim()) return;
      let l = detectLang(t);
      if (l === "unknown") l = slideFrom;
      if (l !== lang) groups[l].push(i);
    });
    for (const from of ["it", "en"]) {
      const idx = groups[from];
      if (!idx.length) continue;
      const out = await Translate.lines(idx.map((i) => arr[i]), from, lang);
      idx.forEach((i, k) => { tr[i] = out[k]; if (out[k] !== arr[i]) changed++; });
    }
    if (!changed) return { same: true };
    const a = 1 + s.items.length, b = a + img.length;
    return {
      title: tr[0],
      items: s.items.map((it, i) => ({ text: tr[1 + i] })),
      imgItems: img.map((it, i) => ({ text: tr[a + i] })),
      speaker: tr.slice(b),
    };
  }

  // Aggiorna una riga nella lingua scelta (solo quando è visibile)
  async function syncLang(s) {
    const r = rowsById.get(s.id);
    if (!r || r.shownLang === state.lang) return;
    const want = state.lang;
    const tok = (r.tok = (r.tok || 0) + 1); // solo l'ultima richiesta conta
    if (want === "orig") { renderContent(s, r, null); r.shownLang = "orig"; r.trData = null; return; }
    try {
      const tr = await translatedSlide(s, want);
      if (state.lang !== want || r.tok !== tok || r.editing) return;
      if (tr && tr.same) {
        r.trData = null;
        renderContent(s, r, null);
        r.trTag.hidden = false;
        r.trTag.textContent = want === "it" ? "già in italiano" : "already in English";
      } else {
        r.trData = tr;
        renderContent(s, r, tr);
      }
      r.shownLang = want;
    } catch (e) {
      r.shownLang = null;
      if (!syncLang._warned) { syncLang._warned = true; toast("Traduzione non riuscita (" + (e && e.message || "errore") + ").", 8000);
        console.error(e); }
    }
  }

  // Anteprime e traduzioni caricate solo quando la slide entra nello schermo
  const thumbQueue = [];
  let thumbBusy = false;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const id = e.target.dataset.id;
      const s = state.slides.find((x) => x.id === id);
      const r = rowsById.get(id);
      if (!s || !r) return;
      if ((s.kind === "pdf" || s.kind === "img") && !r.rendered && state.view === "both") { r.rendered = true; thumbQueue.push(s); pumpThumbs(); }
      if (state.lang !== "orig") syncLang(s);
      if (!r.fitted) { r.fitted = true; r.fit(); }
    });
  }, { rootMargin: "600px 0px" });

  async function pumpThumbs() {
    if (thumbBusy) return;
    thumbBusy = true;
    while (thumbQueue.length) {
      const s = thumbQueue.shift();
      const r = rowsById.get(s.id);
      if (!r) continue;
      try {
        if (s.kind === "img") {
          const url = await imageUrl(s);
          const img = new Image();
          img.alt = "Slide " + s.n;
          img.src = url;
          r.thumb.textContent = "";
          r.thumb.append(img);
          continue;
        }
        const doc = await openPdf(s.fileId);
        const page = await doc.getPage(s.index);
        const vp1 = page.getViewport({ scale: 1 });
        const scale = Math.min(2.2, (r.thumb.clientWidth || 480) * Math.min(window.devicePixelRatio || 1, 2) / vp1.width);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        page.cleanup();
        const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
        const img = new Image();
        img.alt = "Slide " + s.n;
        img.src = URL.createObjectURL(blob);
        r.thumb.textContent = "";
        r.thumb.append(img);
      } catch (e) {
        r.thumb.querySelector(".ph") && (r.thumb.querySelector(".ph").textContent = "Anteprima non disponibile");
      }
    }
    thumbBusy = false;
  }

  const imageUrls = new Map();
  async function imageUrl(s) {
    if (imageUrls.has(s.id)) return imageUrls.get(s.id);
    const rec = await DB.get("bytes", s.id);
    if (!rec) throw new Error("Immagine non disponibile");
    const url = URL.createObjectURL(new Blob([rec.buf], { type: rec.type || "" }));
    imageUrls.set(s.id, url);
    return url;
  }

  function renderAll() {
    io.disconnect();
    list.textContent = "";
    rowsById.clear();
    renumber();
    const frag = document.createDocumentFragment();
    sortedSlides().forEach((s) => {
      const row = buildRow(s);
      frag.append(row);
    });
    list.append(frag);
    rowsById.forEach((r) => io.observe(r.row));
    applySearch();
    refreshChrome();
  }

  function appendSlides(newSlides) {
    renumber();
    const frag = document.createDocumentFragment();
    newSlides.forEach((s) => frag.append(buildRow(s)));
    list.append(frag);
    newSlides.forEach((s) => io.observe(rowsById.get(s.id).row));
    applySearch();
    refreshChrome();
  }

  /* ---------------- Caricamento file ---------------- */
  let busy = Promise.resolve();
  function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    busy = busy.then(() => importFiles(files));
  }

  const DOC_KINDS = { pdf: "pdf", pptx: "pptx", ppsx: "pptx", potx: "pptx", pptm: "pptx", ppsm: "pptx", ppt: "ppt", pps: "ppt", pot: "ppt", odp: "odp", otp: "odp" };
  const IMG_EXT = new Set(["jpg", "jpeg", "png", "gif", "bmp", "webp", "jfif", "avif"]);
  const READERS = { pdf: readPdf, pptx: readPptx, ppt: readPpt, odp: readOdp };

  function finishSlides(fileId, kind, pages) {
    const slides = pages.map((p) => {
      const s = {
        id: uid(), fileId, kind, index: p.index, title: p.title, titleWeak: p.titleWeak || [], items: p.items, imgItems: p.imgItems || [],
        speaker: p.speaker || [], ratio: p.ratio, ocr: !!p.ocr, ocrFailed: !!p.ocrFailed, name: p.name, user: "",
      };
      s.lang = detectLang(slideText(s));
      return s;
    });
    // Lingua prevalente del file per le slide brevi in cui non si capisce
    const votes = { it: 0, en: 0 };
    slides.forEach((s) => { if (s.lang !== "unknown") votes[s.lang]++; });
    const main = votes.it === votes.en ? "unknown" : votes.it > votes.en ? "it" : "en";
    slides.forEach((s) => { if (s.lang === "unknown") s.lang = main; });
    return slides;
  }
  async function addFileRecord(name, kind) {
    const frec = { id: uid(), name, kind, order: state.files.reduce((m, f) => Math.max(m, f.order), 0) + 1 };
    state.files.push(frec);
    await DB.put("files", frec);
    return frec;
  }

  async function importFiles(files) {
    const prog = $("#progress"), bar = $("#progressBar"), txt = $("#progressText");
    prog.hidden = false;
    const skipped = [];
    let total = 0;
    const docs = [], images = [];
    for (const f of files) {
      const ext = extOf(f.name);
      if (DOC_KINDS[ext]) docs.push(f);
      else if (IMG_EXT.has(ext) || /^image\//.test(f.type)) images.push(f);
      else skipped.push(f.name + (ext === "key" ? " (da Keynote esporta in PDF o PowerPoint)" : " (formato non supportato)"));
    }
    const nAll = docs.length + (images.length ? 1 : 0);
    for (let fi = 0; fi < docs.length; fi++) {
      const file = docs[fi];
      const name = file.name;
      const kind = DOC_KINDS[extOf(name)];
      txt.textContent = `${name} (${fi + 1}/${nAll})`;
      bar.style.width = "0%";
      try {
        const bytes = await file.arrayBuffer();
        const onPage = (i, n, what) => {
          bar.style.width = Math.round((i / n) * 100) + "%";
          txt.textContent = `${what || "Lettura"}: ${name} — ${i}/${n}` + (nAll > 1 ? ` (file ${fi + 1} di ${nAll})` : "");
        };
        const pages = await READERS[kind](file, bytes, onPage);
        const frec = await addFileRecord(name, kind);
        if (kind === "pdf") { fileBytes.set(frec.id, bytes); await DB.put("bytes", bytes, frec.id); }
        const slides = finishSlides(frec.id, kind, pages);
        state.slides.push(...slides);
        await DB.putMany("slides", slides);
        appendSlides(slides);
        total += slides.length;
      } catch (e) {
        console.error(e);
        skipped.push(name + (/password/i.test(String(e && e.message)) ? " (protetto da password)" : " (file non leggibile)"));
      }
    }
    if (images.length) {
      // Le immagini caricate insieme diventano un unico gruppo, in ordine di nome
      images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
      const frec = await addFileRecord(images.length === 1 ? images[0].name : `Immagini (${images.length})`, "img");
      const slides = [];
      for (let i = 0; i < images.length; i++) {
        const f = images[i];
        bar.style.width = Math.round((i / images.length) * 100) + "%";
        txt.textContent = `Lettura del testo dalle immagini: ${i + 1}/${images.length}`;
        try {
          const buf = await f.arrayBuffer();
          const p = await readImage(f, buf);
          const [s] = finishSlides(frec.id, "img", [{ ...p, index: i + 1, name: f.name }]);
          await DB.put("bytes", { buf, type: f.type || MIME[extOf(f.name)] || "" }, s.id);
          slides.push(s);
        } catch (e) {
          console.error(e);
          skipped.push(f.name + " (immagine non leggibile)");
        }
      }
      if (slides.length) {
        state.slides.push(...slides);
        await DB.putMany("slides", slides);
        appendSlides(slides);
        total += slides.length;
      } else {
        state.files = state.files.filter((x) => x.id !== frec.id);
        DB.del("files", frec.id);
      }
    }
    prog.hidden = true;
    if (skipped.length) toast("Non caricati: " + skipped.join(", "), 8000);
    else if (total) toast(`Caricate ${total} slide`);
    refreshChrome();
  }

  async function removeFile(fileId) {
    const f = state.files.find((x) => x.id === fileId);
    if (!f || !(await ask(`Eliminare "${f.name}" e tutti i suoi appunti?`, { ok: "Elimina", danger: true }))) return;
    const gone = state.slides.filter((s) => s.fileId === fileId);
    state.slides = state.slides.filter((s) => s.fileId !== fileId);
    state.files = state.files.filter((x) => x.id !== fileId);
    gone.forEach((s) => { if (s.kind === "img") DB.del("bytes", s.id); const r = rowsById.get(s.id); if (r) { io.unobserve(r.row); r.row.remove(); rowsById.delete(s.id); } DB.del("slides", s.id); });
    DB.del("files", fileId);
    DB.del("bytes", fileId);
    fileBytes.delete(fileId);
    const d = pdfDocs.get(fileId); pdfDocs.delete(fileId); if (d) d.then((x) => x.destroy()).catch(() => {});
    renumber();
    refreshChrome();
  }

  async function clearAll() {
    if (!(await ask("Eliminare tutti i file caricati e tutti gli appunti?", { ok: "Elimina tutto", danger: true }))) return;
    state.files = []; state.slides = [];
    pdfDocs.forEach((p) => p.then((x) => x.destroy()).catch(() => {}));
    pdfDocs.clear(); fileBytes.clear();
    await DB.clear("files"); await DB.clear("bytes"); await DB.clear("slides");
    imageUrls.forEach((u) => URL.revokeObjectURL(u)); imageUrls.clear();
    renderAll();
  }

  /* ---------------- Ricerca e vista ---------------- */
  function applySearch() {
    const q = state.query.trim().toLowerCase();
    state.slides.forEach((s) => {
      const r = rowsById.get(s.id);
      if (!r) return;
      if (!q) { r.row.hidden = false; return; }
      const hay = (slideText(s) + "\n" + (s.user || "") + "\n" + (r.row.querySelector(".content").textContent)).toLowerCase();
      r.row.hidden = !hay.includes(q);
    });
    updateCount();
  }

  /* ---------------- Visualizzatore grande ---------------- */
  let viewerIdx = -1;
  function visibleSlides() { return sortedSlides().filter((s) => !rowsById.get(s.id)?.row.hidden); }
  function openViewer(id) {
    const vs = visibleSlides();
    viewerIdx = vs.findIndex((s) => s.id === id);
    $("#viewer").hidden = false;
    showViewer();
  }
  async function showViewer() {
    const vs = visibleSlides();
    const s = vs[viewerIdx];
    if (!s) return;
    $("#vLabel").textContent = `Slide ${s.n} di ${state.slides.length}`;
    const body = $("#vBody");
    body.textContent = "";
    if (s.kind === "pdf") {
      try {
        const doc = await openPdf(s.fileId);
        const page = await doc.getPage(s.index);
        const vp1 = page.getViewport({ scale: 1 });
        const fitScale = Math.min((body.clientWidth - 32) / vp1.width, (body.clientHeight - 16) / vp1.height);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vp = page.getViewport({ scale: fitScale * dpr });
        const c = document.createElement("canvas");
        c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        c.style.width = Math.floor(vp.width / dpr) + "px";
        c.style.height = Math.floor(vp.height / dpr) + "px";
        await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        if (vs[viewerIdx] !== s) return;
        body.textContent = "";
        body.append(c);
      } catch (e) { body.append(el("p", null, "Anteprima non disponibile")); }
    } else if (s.kind === "img") {
      try {
        const im = new Image();
        im.className = "viewer-img";
        im.src = await imageUrl(s);
        if (vs[viewerIdx] !== s) return;
        body.textContent = "";
        body.append(im);
      } catch (e) { body.append(el("p", null, "Anteprima non disponibile")); }
    } else {
      const box = el("div", "textslide-big");
      if (s.title) box.append(el("h3", null, s.title));
      const ul = el("ul");
      s.items.forEach((it) => { const li = el("li", null, it.text); li.style.marginLeft = it.level * 20 + "px"; ul.append(li); });
      box.append(ul);
      body.append(box);
    }
  }
  function moveViewer(d) {
    const n = visibleSlides().length;
    viewerIdx = Math.max(0, Math.min(n - 1, viewerIdx + d));
    showViewer();
  }

  /* ---------------- Esportazione ---------------- */
  async function ensureTranslatedAll() {
    if (state.lang === "orig") return;
    const todo = sortedSlides().filter((s) => rowsById.get(s.id)?.shownLang !== state.lang);
    if (!todo.length) return;
    const prog = $("#progress"), bar = $("#progressBar"), txt = $("#progressText");
    prog.hidden = false;
    for (let i = 0; i < todo.length; i++) {
      txt.textContent = `Traduzione ${i + 1}/${todo.length}`;
      bar.style.width = Math.round(((i + 1) / todo.length) * 100) + "%";
      await syncLang(todo[i]);
    }
    prog.hidden = true;
  }
  function exportName(ext) {
    const base = state.files.length === 1 ? state.files[0].name.replace(/\.[^.]+$/, "") : "slide";
    return "Appunti - " + base + (state.lang !== "orig" ? " (" + state.lang.toUpperCase() + ")" : "") + "." + ext;
  }
  // Nell'anteprima su claude.ai i file si salvano tramite la pagina ospite; nel file normale con un link
  async function download(name, blob) {
    try {
      const host = window.claude && window.claude.use ? await Promise.race([window.claude.use("downloads"), new Promise((r) => setTimeout(() => r(null), 3000))]) : null;
      if (host) {
        await host.save({ filename: name.replace(/\.doc$/, ".html"), data: blob });
        return;
      }
    } catch (e) {
      if (e && e.code === "declined") return;
      console.warn(e);
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  async function doExport(kind) {
    await ensureTranslatedAll();
    const slides = sortedSlides().filter((s) => !rowsById.get(s.id)?.row.hidden);
    if (kind === "txt") {
      const txt = slides.map(rowPlainText).join("\n\n");
      download(exportName("txt"), new Blob(["﻿" + txt], { type: "text/plain;charset=utf-8" }));
    } else if (kind === "doc") {
      let h = `<html><head><meta charset="utf-8"><title>Appunti</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt}h2{font-size:14pt;margin:14pt 0 4pt}.s{color:#666;font-size:9pt}.n{background:#f2f2f2;padding:4pt}.m{border-left:3px solid #2f5bea;padding-left:6pt}</style></head><body>`;
      for (const s of slides) {
        const r = rowsById.get(s.id);
        const d = r && r.trData && r.shownLang === state.lang ? r.trData : s;
        const f = state.files.find((x) => x.id === s.fileId);
        h += `<h2>Slide ${s.n}${d.title ? " — " + richHtml(d.title) : ""}</h2><p class="s">${esc(f ? f.name : "")} · ${s.index}</p>`;
        const cell = (src, it) => (src.img ? `<img src="${src.img}" width="${Math.round((src.imgW || 300) * 0.75)}" alt="formula">` : richHtml(it.text));
        if (d.items.length) {
          h += "<ul>";
          d.items.forEach((it, i) => { h += `<li style="margin-left:${(s.items[i].level || 0) * 18}pt">${cell(s.items[i], it)}</li>`; });
          h += "</ul>";
        }
        if ((d.imgItems || []).length) h += `<p class="s">Testo nelle immagini:</p><ul>${d.imgItems.map((it, i) => `<li>${cell(s.imgItems[i], it)}</li>`).join("")}</ul>`;
        if (d.speaker.length) h += `<p class="n"><b>Note del relatore:</b> ${esc(d.speaker.join(" "))}</p>`;
        if (s.user && s.user.trim()) h += `<p class="m"><b>Mie annotazioni:</b> ${esc(s.user.trim()).replace(/\n/g, "<br>")}</p>`;
      }
      h += "</body></html>";
      download(exportName("doc"), new Blob(["﻿" + h], { type: "application/msword" }));
    } else if (kind === "print") {
      rowsById.forEach((r) => r.fit());
      window.print();
    }
  }

  /* ---------------- Traduttore rapido ---------------- */
  let trFrom = "en", trTo = "it";
  const LANG_NAME = { it: "Italiano", en: "Inglese" };
  function setTrLabels() {
    $("#trFrom").textContent = LANG_NAME[trFrom];
    $("#trTo").textContent = LANG_NAME[trTo];
  }
  let trTimer = null, trSeq = 0;
  async function runQuickTranslate() {
    const text = $("#trIn").value;
    const seq = ++trSeq;
    if (!text.trim()) { $("#trOut").textContent = ""; return; }
    // Se si scrive nell'altra lingua, inverti da solo
    const d = detectLang(text);
    if (d !== "unknown" && d === trTo && text.trim().split(/\s+/).length >= 3) { [trFrom, trTo] = [trTo, trFrom]; setTrLabels(); }
    $("#trOut").textContent = "…";
    try {
      const out = await Translate.text(text, trFrom, trTo);
      if (seq !== trSeq) return;
      $("#trOut").textContent = out;
    } catch (e) {
      if (seq !== trSeq) return;
      $("#trOut").textContent = "Traduzione non riuscita: " + ((e && e.message) || "errore sconosciuto") + ".";
    }
  }

  // Traduzione al volo del testo selezionato negli appunti
  function setupSelection() {
    const pop = $("#selPop");
    let selText = "";
    document.addEventListener("mouseup", (ev) => {
      if (pop.contains(ev.target)) return;
      setTimeout(() => {
        const sel = window.getSelection();
        const t = sel ? sel.toString().trim() : "";
        const inNotes = sel && sel.anchorNode && list.contains(sel.anchorNode) && !(ev.target.closest && ev.target.closest("textarea"));
        if (!t || t.length > 2000 || !inNotes) { pop.hidden = true; return; }
        selText = t;
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        $("#selOut").textContent = "";
        pop.hidden = false;
        pop.style.left = Math.max(8, Math.min(window.scrollX + rect.left, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 8)) + "px";
        pop.style.top = (window.scrollY + rect.bottom + 6) + "px";
      });
    });
    $("#selBtn").addEventListener("click", async () => {
      const d = detectLang(selText);
      const from = d === "unknown" ? "en" : d, to = from === "en" ? "it" : "en";
      $("#selOut").textContent = "…";
      try { $("#selOut").textContent = await Translate.text(selText, from, to); }
      catch (e) { $("#selOut").textContent = "Traduzione non disponibile"; }
    });
    $("#selSchema").addEventListener("click", () => {
      pop.hidden = true;
      Schema.addTexts(selText.split(/\n+/));
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") pop.hidden = true; });
  }

  /* ---------------- Glossario ---------------- */
  function renderGlossary() {
    const ul = $("#glList");
    ul.textContent = "";
    Translate.getGlossary().forEach((g, i) => {
      const li = el("li");
      li.append(el("span", null, g.it + "  ⇄  " + g.en));
      const x = el("button", null, "✕");
      x.title = "Togli dal glossario";
      x.onclick = () => { const l = Translate.getGlossary().slice(); l.splice(i, 1); Translate.setGlossary(l); renderGlossary(); retranslate(); };
      li.append(x);
      ul.append(li);
    });
  }
  function retranslate() {
    rowsById.forEach((r) => { r.shownLang = null; r.trData = null; io.unobserve(r.row); io.observe(r.row); });
    if ($("#trIn").value.trim()) runQuickTranslate();
  }

  /* ---------------- Collegamenti eventi ---------------- */
  function wire() {
    const drop = $("#drop"), input = $("#fileInput");
    drop.addEventListener("click", () => input.click());
    drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    input.addEventListener("change", () => { handleFiles(input.files); input.value = ""; });
    ["dragenter", "dragover"].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === "drop" || !e.relatedTarget) drop.classList.remove("over"); }));
    document.addEventListener("drop", (e) => handleFiles(e.dataTransfer && e.dataTransfer.files));

    $$(".seg").forEach((b) => b.addEventListener("click", () => {
      $$(".seg").forEach((x) => x.classList.toggle("active", x === b));
      state.view = b.dataset.view;
      list.className = "list view-" + state.view;
      if (state.view === "both") { rowsById.forEach((r) => { io.unobserve(r.row); io.observe(r.row); }); }
    }));
    let st;
    $("#search").addEventListener("input", (e) => { clearTimeout(st); st = setTimeout(() => { state.query = e.target.value; applySearch(); }, 150); });
    $("#btnClear").addEventListener("click", clearAll);

    $("#glAdd").addEventListener("click", () => {
      const it = clean($("#glIt").value), en = clean($("#glEn").value);
      if (!it || !en) { toast("Scrivi la parola in italiano e in inglese"); return; }
      const l = Translate.getGlossary().filter((g) => g.it.toLowerCase() !== it.toLowerCase());
      l.push({ it, en });
      Translate.setGlossary(l);
      $("#glIt").value = ""; $("#glEn").value = "";
      renderGlossary();
      retranslate();
      toast("Aggiunto al glossario");
    });
    $("#showOrig").addEventListener("change", (e) => {
      state.showOrig = e.target.checked;
      DB.put("kv", state.showOrig, "showOrig");
      rowsById.forEach((r) => { r.shownLang = null; io.unobserve(r.row); io.observe(r.row); });
    });
    $("#langView").addEventListener("change", async (e) => {
      state.lang = e.target.value;
      $("#origPick").hidden = state.lang === "orig";
      DB.put("kv", state.lang, "lang");
      syncLang._warned = false;
      if (state.lang !== "orig") Translate.prepare(state.lang === "it" ? "en" : "it", state.lang); // prepara il traduttore
      // Aggiorna subito le slide visibili, le altre quando si scorre
      rowsById.forEach((r) => { io.unobserve(r.row); io.observe(r.row); });
    });

    $("#btnExport").addEventListener("click", (e) => { e.stopPropagation(); $("#exportMenu").hidden = !$("#exportMenu").hidden; });
    document.addEventListener("click", () => { $("#exportMenu").hidden = true; });
    $$("#exportMenu button").forEach((b) => b.addEventListener("click", () => { $("#exportMenu").hidden = true; doExport(b.dataset.export); }));

    $("#btnTranslator").addEventListener("click", () => {
      const d = $("#translator");
      d.hidden = !d.hidden;
      if (!d.hidden) { $("#trIn").focus(); Translate.prepare(trFrom, trTo); }
    });
    $("#closeTranslator").addEventListener("click", () => { $("#translator").hidden = true; });
    $("#trSwap").addEventListener("click", () => {
      [trFrom, trTo] = [trTo, trFrom];
      setTrLabels();
      const out = $("#trOut").textContent;
      if (out && out !== "…") $("#trIn").value = out;
      runQuickTranslate();
    });
    $("#trIn").addEventListener("input", () => { clearTimeout(trTimer); trTimer = setTimeout(runQuickTranslate, 350); });
    $("#trCopy").addEventListener("click", () => navigator.clipboard.writeText($("#trOut").textContent).then(() => toast("Traduzione copiata")));

    $("#vPrev").addEventListener("click", () => moveViewer(-1));
    $("#vNext").addEventListener("click", () => moveViewer(1));
    $("#vClose").addEventListener("click", () => { $("#viewer").hidden = true; });
    $("#viewer").addEventListener("click", (e) => { if (e.target.id === "vBody") $("#viewer").hidden = true; });
    document.addEventListener("keydown", (e) => {
      if ($("#viewer").hidden) return;
      if (e.key === "ArrowRight") moveViewer(1);
      else if (e.key === "ArrowLeft") moveViewer(-1);
      else if (e.key === "Escape") $("#viewer").hidden = true;
    });
    setupSelection();
    setTrLabels();
  }

/*__SCHEMA__*/
  /* ---------------- Avvio ---------------- */
  async function start() {
    wire();
    try { await Schema.init(); } catch (e) { warn(e); }
    try {
      const [files, slides, lang] = await Promise.all([DB.all("files"), DB.all("slides"), DB.get("kv", "lang")]);
      state.files = files.map(({ id, name, kind, order }) => ({ id, name, kind, order }));
      state.slides = slides.filter((s) => state.files.some((f) => f.id === s.fileId));
      if (lang && ["orig", "it", "en"].includes(lang)) { state.lang = lang; $("#langView").value = lang; }
      $("#origPick").hidden = state.lang === "orig";
      state.showOrig = !!(await DB.get("kv", "showOrig"));
      $("#showOrig").checked = state.showOrig;
      await Translate.loadCache();
      await Translate.loadUser();
      renderGlossary();
    } catch (e) { warn(e); }
    renderAll();
  }
  start();
})();
