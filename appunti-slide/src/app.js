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
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res, rej) => {
        let req;
        try { req = indexedDB.open("appunti-slide", 1); } catch (e) { rej(e); return; }
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore("files", { keyPath: "id" });
          db.createObjectStore("bytes");
          db.createObjectStore("slides", { keyPath: "id" });
          db.createObjectStore("kv");
        };
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      return dbp;
    }
    async function tx(store, mode, fn) {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        let out;
        Promise.resolve(fn(s)).then((v) => { out = v; });
        t.oncomplete = () => res(out);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    }
    const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    return {
      put: (store, val, key) => tx(store, "readwrite", (s) => { s.put(val, key); }).catch(warn),
      putMany: (store, vals) => tx(store, "readwrite", (s) => { vals.forEach((v) => s.put(v)); }).catch(warn),
      get: (store, key) => tx(store, "readonly", (s) => reqP(s.get(key))).catch(() => undefined),
      all: (store) => tx(store, "readonly", (s) => reqP(s.getAll())).catch(() => []),
      del: (store, key) => tx(store, "readwrite", (s) => { s.delete(key); }).catch(warn),
      clear: (store) => tx(store, "readwrite", (s) => { s.clear(); }).catch(warn),
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
  const BULLET_RE = /^[\s]*([•●○◦▪▫■□◆◇►▶▸▹➢➤➔→⇒✓✔✗✘❖⦿⁃∙·‣\-–—*]|[-])+\s*/;
  const ENUM_RE = /^\s*(\(?\d{1,2}[.)]|\(?[a-zA-Z][.)])\s+/;

  function clean(s) {
    return (s || "")
      .normalize("NFKC")
      .replace(/[­​-‍﻿]/g, "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
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

  async function pageLines(page) {
    const tc = await page.getTextContent({ disableCombineTextItems: false });
    const [, y0, , y1] = page.view;
    const height = Math.abs(y1 - y0) || 1;
    // Elementi di testo con posizione e dimensione
    let items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) {
        if (it.str && items.length) items.push({ space: true, x: it.transform[4], y: it.transform[5] });
        continue;
      }
      const t = it.transform;
      const size = Math.hypot(t[2], t[3]) || it.height || 10;
      items.push({ str: it.str, x: t[4], y: t[5], w: it.width || 0, size });
    }
    items = items.filter((i) => !i.space);
    // Via i doppioni (testo disegnato due volte per ombre/grassetto finto)
    const seen = new Set();
    items = items.filter((i) => {
      const k = i.str + "|" + Math.round(i.x) + "|" + Math.round(i.y);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    items.sort((a, b) => (b.y - a.y) || (a.x - b.x));
    // Raggruppa in righe
    const lines = [];
    for (const it of items) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) <= Math.min(last.size, it.size) * 0.5) {
        last.parts.push(it);
        last.size = Math.max(last.size, it.size);
      } else {
        lines.push({ y: it.y, size: it.size, parts: [it] });
      }
    }
    return lines.map((l) => {
      l.parts.sort((a, b) => a.x - b.x);
      let text = "";
      let prevEnd = null;
      for (const p of l.parts) {
        if (prevEnd != null) {
          const gap = p.x - prevEnd;
          const needSpace = gap > p.size * 0.15 && !/\s$/.test(text) && !/^\s/.test(p.str);
          // Colonne molto distanti sulla stessa riga: separale chiaramente
          text += gap > p.size * 4 ? "   " : needSpace ? " " : "";
        }
        text += p.str;
        prevEnd = p.x + p.w;
      }
      const rel = (l.y - Math.min(y0, y1)) / height; // 0 = fondo, 1 = cima
      return { text: clean(text), x: l.parts[0].x, y: l.y, size: l.size, rel };
    }).filter((l) => l.text);
  }

  function median(arr) {
    if (!arr.length) return 0;
    const a = arr.slice().sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)];
  }

  // Trasforma le righe di una pagina in titolo + punti, senza aggiungere nulla.
  function linesToNotes(lines) {
    if (!lines.length) return { title: "", items: [] };
    const sizes = lines.map((l) => l.size);
    const med = median(sizes);
    const max = Math.max(...sizes);
    let title = "";
    let body = lines;
    // Titolo: le righe col carattere più grande, se è chiaramente più grande del resto
    if (lines.length === 1) {
      title = lines[0].text;
      body = [];
    } else if (max >= med * 1.15) {
      const first = lines.findIndex((l) => l.size >= max * 0.95);
      if (first !== -1 && first <= 2) {
        let end = first;
        while (end + 1 < lines.length && lines[end + 1].size >= max * 0.95 && end - first < 3) end++;
        const tlines = lines.slice(first, end + 1);
        title = tlines.map((l) => stripBullet(l.text).text).join(" ");
        body = lines.slice(0, first).concat(lines.slice(end + 1));
      }
    }
    // Punti
    const minX = body.length ? Math.min(...body.map((l) => l.x)) : 0;
    const items = [];
    let prev = null;
    for (const l of body) {
      const sb = stripBullet(l.text);
      const en = ENUM_RE.test(l.text);
      const marker = sb.bullet || en;
      const text = sb.text;
      const level = l.x - minX > l.size * 1.2 ? (l.x - minX > l.size * 3 ? 2 : 1) : 0;
      const continues = prev && !marker && Math.abs(l.size - prev.size) <= prev.size * 0.12 &&
        (prev.y - l.y) <= prev.size * 1.9 && !/[.!?:;]$/.test(prev.item.text) &&
        (/^[a-zà-ÿ(,]/.test(text) || /[,(\-–/]$/.test(prev.item.text) || /\b(e|ed|o|di|da|in|con|per|tra|fra|il|lo|la|i|gli|le|un|una|the|and|or|of|to|in|for|with|a|an)$/i.test(prev.item.text)) &&
        l.x >= prev.x - prev.size * 0.5;
      if (continues) {
        const p = prev.item.text;
        if (/[a-zà-ÿ]-$/.test(p) && /^[a-zà-ÿ]/.test(text)) prev.item.text = p.slice(0, -1) + text;
        else prev.item.text = p + " " + text;
        prev.y = l.y;
        continue;
      }
      const item = { text, level };
      items.push(item);
      prev = { item, size: l.size, y: l.y, x: l.x };
    }
    return { title, items };
  }

  async function readPdf(file, bytes, onPage) {
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      const lines = await pageLines(page);
      pages.push({ lines, ratio: vp.width / vp.height });
      page.cleanup();
      onPage(i, doc.numPages);
      if (i % 5 === 0) await new Promise((r) => setTimeout(r));
    }
    doc.destroy();
    // Intestazioni e piè di pagina ripetuti (es. nome del corso, logo testuale): via
    const repeated = new Set();
    if (pages.length >= 4) {
      const counts = new Map();
      for (const p of pages) {
        const keys = new Set(p.lines.filter((l) => l.rel > 0.9 || l.rel < 0.1).map((l) => l.text.replace(/\d+/g, "#").toLowerCase()));
        keys.forEach((k) => counts.set(k, (counts.get(k) || 0) + 1));
      }
      counts.forEach((c, k) => { if (c >= Math.max(3, pages.length * 0.4)) repeated.add(k); });
    }
    return pages.map((p, idx) => {
      const lines = p.lines.filter((l) => {
        if (isPageNumber(l.text) && (l.rel > 0.85 || l.rel < 0.15)) return false;
        if ((l.rel > 0.9 || l.rel < 0.1) && repeated.has(l.text.replace(/\d+/g, "#").toLowerCase())) return false;
        return true;
      });
      const n = linesToNotes(lines);
      return { index: idx + 1, title: n.title, items: n.items, speaker: [], ratio: p.ratio };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Lettura PowerPoint (.pptx)                                          */
  /* ------------------------------------------------------------------ */
  const xmlParser = new DOMParser();
  const byLocal = (node, name) => Array.from(node.getElementsByTagNameNS("*", name));
  const childLocal = (node, name) => Array.from(node.children).filter((c) => c.localName === name);

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
      }
    };
    walk(p);
    return clean(s);
  }
  function shapeInfo(sp) {
    const ph = byLocal(sp, "ph")[0];
    const type = ph ? ph.getAttribute("type") || "body" : null;
    const off = byLocal(sp, "off")[0];
    return {
      type,
      x: off ? +off.getAttribute("x") : null,
      y: off ? +off.getAttribute("y") : null,
    };
  }
  function slideFromXml(doc) {
    const spTree = byLocal(doc, "spTree")[0];
    if (!spTree) return { title: "", items: [] };
    const blocks = [];
    // Forme con testo e tabelle, nell'ordine del documento (anche dentro i gruppi)
    const walk = (node) => {
      for (const c of node.children) {
        if (c.localName === "sp") {
          const info = shapeInfo(c);
          if (["sldNum", "dt", "ftr", "hdr"].includes(info.type)) continue;
          const txBody = childLocal(c, "txBody")[0];
          if (!txBody) continue;
          const paras = childLocal(txBody, "p").map((p) => {
            const pPr = childLocal(p, "pPr")[0];
            const lvl = pPr ? +(pPr.getAttribute("lvl") || 0) : 0;
            return { text: paraText(p), level: Math.min(lvl, 2) };
          }).filter((p) => p.text);
          if (paras.length) blocks.push({ ...info, paras });
        } else if (c.localName === "graphicFrame") {
          const tbl = byLocal(c, "tbl")[0];
          if (!tbl) continue;
          const info = shapeInfo(c);
          const paras = byLocal(tbl, "tr").map((tr) => ({
            text: childLocal(tr, "tc").map((tc) => byLocal(tc, "p").map(paraText).filter(Boolean).join(" ")).join("  |  "),
            level: 0, table: true,
          })).filter((p) => p.text.replace(/[|\s]/g, ""));
          if (paras.length) blocks.push({ ...info, paras });
        } else if (c.localName === "grpSp") {
          walk(c);
        }
      }
    };
    walk(spTree);
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
    return { title, items };
  }

  async function readPptx(file, bytes, onPage) {
    const zip = await JSZip.loadAsync(bytes);
    const pres = await readXml(zip, "ppt/presentation.xml");
    const presRels = await rels(zip, "ppt/presentation.xml");
    let slidePaths = [];
    if (pres) {
      slidePaths = byLocal(pres, "sldId").map((s) => {
        const rid = s.getAttribute("r:id") || s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
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
      const n = doc ? slideFromXml(doc) : { title: "", items: [] };
      // Note del relatore
      const speaker = [];
      const r = await rels(zip, path);
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
      out.push({ index: i + 1, title: n.title, items: n.items, speaker, ratio: 16 / 9 });
      onPage(i + 1, slidePaths.length);
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Riconoscimento lingua (semplice, locale)                           */
  /* ------------------------------------------------------------------ */
  const IT_WORDS = new Set("il lo la i gli le di da del della dei delle che è e non per con una un sono come più anche nel nella alla al si questo questa ma tra fra se dove quando essere ha hanno può sulla sul degli allo agli".split(" "));
  const EN_WORDS = new Set("the of and to in is are that for with as on by this be it an from or not at which can was were have has will their its these into than more also such each other".split(" "));
  function detectLang(text) {
    const words = (text.toLowerCase().match(/[a-zàèéìòù']+/g) || []);
    let it = 0, en = 0;
    for (const w of words) { if (IT_WORDS.has(w)) it++; if (EN_WORDS.has(w)) en++; }
    if (/[àèéìòù]/.test(text)) it += 1;
    if (it === en) return "unknown";
    return it > en ? "it" : "en";
  }
  function slideText(s) {
    return [s.title, ...s.items.map((i) => i.text), ...s.speaker].join("\n");
  }

  /* ------------------------------------------------------------------ */
  /* Traduzione: prima sul dispositivo (Chrome/Edge, offline), poi online */
  /* ------------------------------------------------------------------ */
  const Translate = (() => {
    const cache = new Map();
    const native = new Map();
    let engine = "";
    let saveTimer = null;

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
    const ready = new Map();      // coppia di lingue -> traduttore offline pronto
    const preparing = new Set();
    const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
    // Restituisce subito il traduttore integrato se è già pronto; altrimenti
    // ne avvia lo scaricamento in background e intanto si usa quello online.
    async function getNative(from, to) {
      const key = from + ">" + to;
      if (ready.has(key)) return ready.get(key);
      if (!("Translator" in self)) return null;
      try {
        const av = await withTimeout(self.Translator.availability({ sourceLanguage: from, targetLanguage: to }), 3000);
        if (av === "available" || av === "readily") {
          const t = await withTimeout(self.Translator.create({ sourceLanguage: from, targetLanguage: to }), 8000);
          ready.set(key, t);
          return t;
        }
        if ((av === "downloadable" || av === "downloading" || av === "after-download") && !preparing.has(key)) {
          preparing.add(key);
          self.Translator.create({ sourceLanguage: from, targetLanguage: to })
            .then((t) => ready.set(key, t))
            .catch(() => {})
            .finally(() => preparing.delete(key));
        }
      } catch (e) { /* non disponibile */ }
      return null;
    }
    async function fetchJson(url) {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 10000);
      try {
        const r = await fetch(url, { signal: ac.signal });
        if (!r.ok) throw new Error("HTTP " + r.status);
        return await r.json();
      } finally { clearTimeout(t); }
    }
    async function online(text, from, to) {
      // Divide i testi lunghi in blocchi, rispettando gli a capo
      const chunks = [];
      let cur = "";
      for (const line of text.split("\n")) {
        if ((cur + "\n" + line).length > 1500 && cur) { chunks.push(cur); cur = line; }
        else cur = cur ? cur + "\n" + line : line;
      }
      if (cur) chunks.push(cur);
      const out = [];
      for (const c of chunks) {
        let res = null;
        try {
          const url = "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=" + from + "&tl=" + to + "&q=" + encodeURIComponent(c);
          const j = await fetchJson(url);
          res = (j[0] || []).map((x) => x[0]).join("");
        } catch (e) { /* passa al servizio successivo */ }
        if (res == null) {
          const parts = [];
          for (const line of c.split("\n")) {
            if (!line.trim()) { parts.push(line); continue; }
            const url = "https://api.mymemory.translated.net/get?langpair=" + from + "|" + to + "&q=" + encodeURIComponent(line.slice(0, 480));
            const j = await fetchJson(url);
            if (!j || j.responseStatus !== 200) throw new Error("Servizio di traduzione non disponibile");
            parts.push(j.responseData.translatedText);
          }
          res = parts.join("\n");
        }
        out.push(res);
      }
      return out.join("\n");
    }
    // Traduce un elenco di righe mantenendo la corrispondenza 1:1
    async function lines(arr, from, to) {
      const result = new Array(arr.length);
      const todo = [];
      arr.forEach((t, i) => {
        if (!t || !t.trim()) { result[i] = t; return; }
        const k = from + to + "|" + t;
        if (cache.has(k)) result[i] = cache.get(k); else todo.push(i);
      });
      if (!todo.length) return result;
      const nt = await getNative(from, to);
      if (nt) {
        engine = "device";
        for (const i of todo) {
          const tr = await withTimeout(nt.translate(arr[i]), 15000);
          result[i] = tr; cache.set(from + to + "|" + arr[i], tr);
        }
      } else {
        engine = "online";
        const joined = todo.map((i) => arr[i]).join("\n");
        const tr = (await online(joined, from, to)).split("\n");
        if (tr.length === todo.length) {
          todo.forEach((i, j) => { result[i] = tr[j]; cache.set(from + to + "|" + arr[i], tr[j]); });
        } else {
          // Se il servizio ha unito o spezzato righe, traduci una riga alla volta
          for (const i of todo) {
            const t1 = await online(arr[i], from, to);
            result[i] = t1; cache.set(from + to + "|" + arr[i], t1);
          }
        }
      }
      persist();
      return result;
    }
    async function text(t, from, to) {
      const ls = t.split("\n");
      return (await lines(ls, from, to)).join("\n");
    }
    return { lines, text, loadCache, getNative, engine: () => engine };
  })();

  /* ------------------------------------------------------------------ */
  /* Interfaccia                                                        */
  /* ------------------------------------------------------------------ */
  const list = $("#list");
  const rowsById = new Map();

  function toast(msg, ms = 3500) {
    const t = $("#toast");
    t.textContent = msg;
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
    state.files.slice().sort((a, b) => a.order - b.order).forEach((f) => {
      const c = el("span", "chip");
      c.append(el("span", "kind", f.kind.toUpperCase()), el("span", null, f.name + " · " + state.slides.filter((s) => s.fileId === f.id).length));
      const x = el("button", null, "✕");
      x.title = "Togli questo file";
      x.setAttribute("aria-label", "Togli " + f.name);
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
    if (s.kind === "pdf") {
      if (s.ratio) thumb.style.aspectRatio = String(s.ratio);
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
    const src = el("span", "src", (f ? f.name : "") + (s.kind === "pdf" ? " · pag. " : " · diapositiva ") + s.index);
    const trTag = el("span", "tr-tag", "tradotto");
    trTag.hidden = true;
    const copy = el("button", "mini", "Copia");
    copy.title = "Copia gli appunti di questa slide";
    copy.onclick = () => {
      navigator.clipboard.writeText(rowPlainText(s)).then(() => toast("Appunti copiati"), () => toast("Copia non riuscita"));
    };
    head.append(badge, src, trTag, copy);
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

  function renderContent(s, r, tr) {
    // tr = versione tradotta {title, items[], speaker[]} oppure null per l'originale
    const d = tr || s;
    const c = r.content;
    c.textContent = "";
    if (d.title) c.append(el("h3", null, d.title));
    if (d.items.length) {
      const ul = el("ul");
      d.items.forEach((it, i) => {
        const li = el("li", (s.items[i].table ? "tbl " : "") + (s.items[i].level ? "l" + s.items[i].level : ""), it.text);
        ul.append(li);
      });
      c.append(ul);
    }
    if (!d.title && !d.items.length) {
      c.append(el("p", "empty-note", s.kind === "pdf"
        ? "Questa slide non contiene testo selezionabile (solo immagini o testo come immagine)."
        : "Questa slide non contiene testo (solo immagini o grafici)."));
    }
    if (d.speaker.length) {
      const sp = el("div", "speaker");
      sp.append(el("b", null, "Note del relatore"));
      d.speaker.forEach((t) => sp.append(el("div", null, t)));
      c.append(sp);
    }
    r.trTag.hidden = !tr;
  }

  function rowPlainText(s) {
    const r = rowsById.get(s.id);
    const tr = r && r.trData && r.shownLang === state.lang ? r.trData : s;
    const out = ["Slide " + s.n + (tr.title ? " — " + tr.title : "")];
    tr.items.forEach((it, i) => out.push("  ".repeat(s.items[i].level) + (s.items[i].table ? "" : "• ") + it.text));
    if (tr.speaker.length) out.push("Note del relatore: " + tr.speaker.join(" "));
    if (s.user && s.user.trim()) out.push("Mie annotazioni: " + s.user.trim());
    return out.join("\n");
  }

  async function translatedSlide(s, lang) {
    const from = s.lang && s.lang !== "unknown" ? s.lang : (lang === "it" ? "en" : "it");
    if (from === lang) return null;
    const arr = [s.title, ...s.items.map((i) => i.text), ...s.speaker];
    const tr = await Translate.lines(arr, from, lang);
    return {
      title: tr[0],
      items: s.items.map((it, i) => ({ text: tr[1 + i] })),
      speaker: tr.slice(1 + s.items.length),
    };
  }

  // Aggiorna una riga nella lingua scelta (solo quando è visibile)
  async function syncLang(s) {
    const r = rowsById.get(s.id);
    if (!r || r.shownLang === state.lang) return;
    const want = state.lang;
    if (want === "orig") { renderContent(s, r, null); r.shownLang = "orig"; r.trData = null; return; }
    try {
      const tr = await translatedSlide(s, want);
      if (state.lang !== want) return;
      r.trData = tr;
      renderContent(s, r, tr);
      r.shownLang = want;
    } catch (e) {
      r.shownLang = null;
      if (!syncLang._warned) { syncLang._warned = true; toast("Traduzione non disponibile: serve Chrome/Edge aggiornato oppure una connessione a internet.", 6000); }
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
      if (s.kind === "pdf" && !r.rendered && state.view === "both") { r.rendered = true; thumbQueue.push(s); pumpThumbs(); }
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

  async function importFiles(files) {
    const prog = $("#progress"), bar = $("#progressBar"), txt = $("#progressText");
    prog.hidden = false;
    const skipped = [];
    let total = 0;
    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      const name = file.name;
      const ext = (name.split(".").pop() || "").toLowerCase();
      const kind = ext === "pdf" ? "pdf" : ext === "pptx" ? "pptx" : null;
      if (!kind) { skipped.push(name + (ext === "ppt" ? " (salvalo come .pptx o PDF)" : "")); continue; }
      txt.textContent = `${name} (${fi + 1}/${files.length})`;
      bar.style.width = "0%";
      try {
        const bytes = await file.arrayBuffer();
        const onPage = (i, n) => { bar.style.width = Math.round((i / n) * 100) + "%"; txt.textContent = `${name} — ${i}/${n} (${fi + 1}/${files.length} file)`; };
        const pages = kind === "pdf" ? await readPdf(file, bytes, onPage) : await readPptx(file, bytes, onPage);
        const fileId = uid();
        const order = state.files.reduce((m, f) => Math.max(m, f.order), 0) + 1;
        const frec = { id: fileId, name, kind, order };
        state.files.push(frec);
        if (kind === "pdf") fileBytes.set(fileId, bytes);
        await DB.put("files", frec);
        if (kind === "pdf") await DB.put("bytes", bytes, fileId);
        const slides = pages.map((p) => {
          const s = { id: uid(), fileId, kind, index: p.index, title: p.title, items: p.items, speaker: p.speaker, ratio: p.ratio, user: "" };
          s.lang = detectLang(slideText(s));
          return s;
        });
        // Lingua prevalente del file per le slide brevi in cui non si capisce
        const votes = { it: 0, en: 0 };
        slides.forEach((s) => { if (s.lang !== "unknown") votes[s.lang]++; });
        const main = votes.it === votes.en ? "unknown" : votes.it > votes.en ? "it" : "en";
        slides.forEach((s) => { if (s.lang === "unknown") s.lang = main; });
        state.slides.push(...slides);
        await DB.putMany("slides", slides);
        appendSlides(slides);
        total += slides.length;
      } catch (e) {
        console.error(e);
        skipped.push(name + (/password/i.test(String(e && e.message)) ? " (protetto da password)" : " (file non leggibile)"));
      }
    }
    prog.hidden = true;
    if (skipped.length) toast("Non caricati: " + skipped.join(", "), 7000);
    else if (total) toast(`Caricate ${total} slide`);
  }

  async function removeFile(fileId) {
    const f = state.files.find((x) => x.id === fileId);
    if (!f || !confirm(`Togliere "${f.name}" e i suoi appunti?`)) return;
    const gone = state.slides.filter((s) => s.fileId === fileId);
    state.slides = state.slides.filter((s) => s.fileId !== fileId);
    state.files = state.files.filter((x) => x.id !== fileId);
    gone.forEach((s) => { const r = rowsById.get(s.id); if (r) { io.unobserve(r.row); r.row.remove(); rowsById.delete(s.id); } DB.del("slides", s.id); });
    DB.del("files", fileId);
    DB.del("bytes", fileId);
    fileBytes.delete(fileId);
    const d = pdfDocs.get(fileId); pdfDocs.delete(fileId); if (d) d.then((x) => x.destroy()).catch(() => {});
    renumber();
    refreshChrome();
  }

  async function clearAll() {
    if (!confirm("Cancellare tutte le slide e tutti gli appunti?")) return;
    state.files = []; state.slides = [];
    pdfDocs.forEach((p) => p.then((x) => x.destroy()).catch(() => {}));
    pdfDocs.clear(); fileBytes.clear();
    await DB.clear("files"); await DB.clear("bytes"); await DB.clear("slides");
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
  function download(name, blob) {
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
        h += `<h2>Slide ${s.n}${d.title ? " — " + esc(d.title) : ""}</h2><p class="s">${esc(f ? f.name : "")} · ${s.index}</p>`;
        if (d.items.length) {
          h += "<ul>";
          d.items.forEach((it, i) => { h += `<li style="margin-left:${s.items[i].level * 18}pt">${esc(it.text)}</li>`; });
          h += "</ul>";
        }
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
      showEngine();
    } catch (e) {
      if (seq !== trSeq) return;
      $("#trOut").textContent = "Traduzione non disponibile. Usa Chrome o Edge aggiornati (traduzione offline) oppure collegati a internet.";
    }
  }
  function showEngine() {
    const e = Translate.engine();
    $("#trEngine").textContent = e === "device" ? "Traduzione eseguita sul computer (funziona anche senza internet)."
      : e === "online" ? "Traduzione tramite internet (questo browser non ha la traduzione integrata)." : "";
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
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") pop.hidden = true; });
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

    $("#langView").addEventListener("change", async (e) => {
      state.lang = e.target.value;
      DB.put("kv", state.lang, "lang");
      syncLang._warned = false;
      if (state.lang !== "orig") Translate.getNative(state.lang === "it" ? "en" : "it", state.lang); // prepara il modello offline
      // Aggiorna subito le slide visibili, le altre quando si scorre
      rowsById.forEach((r) => { io.unobserve(r.row); io.observe(r.row); });
    });

    $("#btnExport").addEventListener("click", (e) => { e.stopPropagation(); $("#exportMenu").hidden = !$("#exportMenu").hidden; });
    document.addEventListener("click", () => { $("#exportMenu").hidden = true; });
    $$("#exportMenu button").forEach((b) => b.addEventListener("click", () => { $("#exportMenu").hidden = true; doExport(b.dataset.export); }));

    $("#btnTranslator").addEventListener("click", () => {
      const d = $("#translator");
      d.hidden = !d.hidden;
      if (!d.hidden) { $("#trIn").focus(); Translate.getNative(trFrom, trTo); }
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

  /* ---------------- Avvio ---------------- */
  async function start() {
    wire();
    try {
      const [files, slides, lang] = await Promise.all([DB.all("files"), DB.all("slides"), DB.get("kv", "lang")]);
      state.files = files.map(({ id, name, kind, order }) => ({ id, name, kind, order }));
      state.slides = slides.filter((s) => state.files.some((f) => f.id === s.fileId));
      if (lang && ["orig", "it", "en"].includes(lang)) { state.lang = lang; $("#langView").value = lang; }
      await Translate.loadCache();
    } catch (e) { warn(e); }
    renderAll();
  }
  start();
})();
