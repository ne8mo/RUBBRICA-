  /* ------------------------------------------------------------------ */
  /* Schemi: forme, diramazioni e parole prese dagli appunti o dal testo */
  /* ------------------------------------------------------------------ */
  const Schema = (() => {
    const SVGNS = "http://www.w3.org/2000/svg";
    const COLORS = [
      { name: "Bianco", fill: "#ffffff", stroke: "#5b6475" },
      { name: "Giallo", fill: "#fff3bf", stroke: "#c99a00" },
      { name: "Azzurro", fill: "#dcebff", stroke: "#3b74d9" },
      { name: "Verde", fill: "#ddf5e3", stroke: "#2e9e5b" },
      { name: "Rosa", fill: "#ffe0e6", stroke: "#d2486a" },
      { name: "Viola", fill: "#ece3ff", stroke: "#7a55d6" },
      { name: "Arancio", fill: "#ffe8d1", stroke: "#d9731a" },
    ];
    const SIZES = {
      rect: [190, 64], square: [130, 130], triangle: [190, 140], ellipse: [190, 90], diamond: [200, 120], text: [190, 36],
    };
    const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    const FS = 15, LH = 19;
    const ACCENT = "#2f5bea";

    let schemas = [];
    let cur = null;
    let sel = null;           // { type: "node" | "edge", id }
    let tool = "rect";
    let color = 1;
    let vb = { x: 0, y: 0, w: 1200, h: 800 };
    let undo = [], redo = [];
    let svg, layerE, layerN, layerX, editor, wrap;
    let open = false;
    const mctx = document.createElement("canvas").getContext("2d");

    /* ---------- dati ---------- */
    const byId = (id) => cur.nodes.find((n) => n.id === id);
    function snapshot() { return JSON.stringify({ nodes: cur.nodes, edges: cur.edges }); }
    function mutate(fn) {
      undo.push(snapshot());
      if (undo.length > 80) undo.shift();
      redo = [];
      fn();
      changed();
    }
    function changed() {
      cur.updated = Date.now();
      render();
      DB.put("schemas", cur); // salvataggio immediato: nulla va perso chiudendo la pagina
      updateButtons();
    }
    function restore(json) {
      const d = JSON.parse(json);
      cur.nodes = d.nodes; cur.edges = d.edges;
      if (sel && !(sel.type === "node" ? byId(sel.id) : cur.edges.find((e) => e.id === sel.id))) sel = null;
      changed();
    }
    function doUndo() { if (!undo.length) return; redo.push(snapshot()); restore(undo.pop()); }
    function doRedo() { if (!redo.length) return; undo.push(snapshot()); restore(redo.pop()); }

    /* ---------- testo dentro le forme ---------- */
    function wrapText(text, maxW, bold) {
      mctx.font = (bold ? "700 " : "") + FS + "px " + FONT_FAMILY;
      const out = [];
      for (const para of String(text || "").split("\n")) {
        let line = "";
        for (const word of para.split(/\s+/).filter(Boolean)) {
          const test = line ? line + " " + word : word;
          if (mctx.measureText(test).width <= maxW) { line = test; continue; }
          if (line) out.push(line);
          // parola più lunga dello spazio: spezzala
          let w = word;
          while (mctx.measureText(w).width > maxW && w.length > 1) {
            let k = w.length - 1;
            while (k > 1 && mctx.measureText(w.slice(0, k)).width > maxW) k--;
            out.push(w.slice(0, k));
            w = w.slice(k);
          }
          line = w;
        }
        out.push(line);
      }
      return out;
    }
    // Spazio utile per il testo in ogni forma (in proporzione alla forma)
    const INNER = { rect: [1, 1, 0.5], square: [1, 1, 0.5], text: [1, 1, 0.5], ellipse: [0.72, 0.72, 0.5], diamond: [0.56, 0.56, 0.5], triangle: [0.6, 0.45, 0.68] };
    function layout(n) {
      const [fw, fh, cyf] = INNER[n.shape] || INNER.rect;
      const pad = n.shape === "text" ? 6 : 12;
      // la forma si allarga perché nessuna parola venga spezzata
      mctx.font = (n.bold ? "700 " : "") + FS + "px " + FONT_FAMILY;
      const longest = Math.max(0, ...String(n.text || "").split(/\s+/).map((w) => mctx.measureText(w).width));
      const minW = Math.min(420, Math.ceil((longest + pad * 2 + 4) / fw));
      if (n.w < minW) n.w = minW;
      // nei triangoli e nei rombi il testo lungo sta meglio in una forma più larga che più alta
      if ((n.shape === "triangle" || n.shape === "diamond") && n.text && n.w < 260) {
        const total = mctx.measureText(n.text).width;
        if (total > n.w * fw * 3) n.w = Math.min(320, Math.ceil(Math.sqrt(total * 90)));
      }
      const innerW = Math.max(30, n.w * fw - pad * 2);
      n._lines = wrapText(n.text, innerW, n.bold);
      const textH = n._lines.length * LH;
      const needH = Math.ceil((textH + pad * 2) / fh);
      if (n.h < needH) n.h = needH;
      if (n.shape === "square") { const s = Math.max(n.w, n.h); n.w = n.h = s; }
      n._cy = n.y + n.h * cyf;
    }

    /* ---------- geometria ---------- */
    function outline(n) {
      const { x, y, w, h } = n, cx = x + w / 2, cy = y + h / 2;
      if (n.shape === "ellipse") return Array.from({ length: 36 }, (_, i) => [cx + (w / 2) * Math.cos((i * Math.PI) / 18), cy + (h / 2) * Math.sin((i * Math.PI) / 18)]);
      if (n.shape === "diamond") return [[cx, y], [x + w, cy], [cx, y + h], [x, cy]];
      if (n.shape === "triangle") return [[cx, y], [x + w, y + h], [x, y + h]];
      return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    }
    const center = (n) => (n.shape === "triangle" ? [n.x + n.w / 2, n.y + n.h * 0.62] : [n.x + n.w / 2, n.y + n.h / 2]);
    // Punto in cui la linea dal centro di n verso p esce dalla forma
    function exitPoint(n, p) {
      const c = center(n);
      const poly = outline(n);
      let best = null;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const r = [p[0] - c[0], p[1] - c[1]], s = [b[0] - a[0], b[1] - a[1]];
        const den = r[0] * s[1] - r[1] * s[0];
        if (Math.abs(den) < 1e-9) continue;
        const t = ((a[0] - c[0]) * s[1] - (a[1] - c[1]) * s[0]) / den;
        const u = ((a[0] - c[0]) * r[1] - (a[1] - c[1]) * r[0]) / den;
        if (t >= 0 && u >= -1e-6 && u <= 1 + 1e-6 && (best == null || t < best)) best = t;
      }
      if (best == null) return c;
      return [c[0] + (p[0] - c[0]) * best, c[1] + (p[1] - c[1]) * best];
    }
    function bbox(nodes) {
      if (!nodes.length) return null;
      return {
        x0: Math.min(...nodes.map((n) => n.x)), y0: Math.min(...nodes.map((n) => n.y)),
        x1: Math.max(...nodes.map((n) => n.x + n.w)), y1: Math.max(...nodes.map((n) => n.y + n.h)),
      };
    }

    /* ---------- disegno ---------- */
    const S = (tag, attrs, parent) => {
      const e = document.createElementNS(SVGNS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (parent) parent.append(e);
      return e;
    };
    function drawShape(n, g, selected) {
      const c = COLORS[n.color] || COLORS[0];
      const stroke = selected ? ACCENT : c.stroke;
      const sw = selected ? 3 : n.bold ? 2.5 : 1.6;
      const common = { fill: c.fill, stroke, "stroke-width": sw };
      const { x, y, w, h } = n;
      if (n.shape === "ellipse") S("ellipse", { ...common, cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 }, g);
      else if (n.shape === "diamond" || n.shape === "triangle") S("polygon", { ...common, points: outline(n).map((p) => p.join(",")).join(" ") }, g);
      else if (n.shape === "text") S("rect", { x, y, width: w, height: h, rx: 6, fill: "transparent", stroke: selected ? ACCENT : "none", "stroke-width": 1.5, "stroke-dasharray": "5 4" }, g);
      else S("rect", { ...common, x, y, width: w, height: h, rx: n.shape === "square" ? 4 : 12 }, g);
      const lines = n._lines || [];
      const t = S("text", {
        x: x + w / 2, "text-anchor": "middle", "font-family": FONT_FAMILY, "font-size": FS,
        "font-weight": n.bold ? 700 : 400, fill: "#1c2330",
      }, g);
      const y0 = n._cy - (lines.length * LH) / 2 + LH * 0.75;
      lines.forEach((ln, i) => { const ts = S("tspan", { x: x + w / 2, y: y0 + i * LH }, t); ts.textContent = ln; });
      if (!n.text) {
        const ph = S("text", { x: x + w / 2, y: n._cy + 5, "text-anchor": "middle", "font-family": FONT_FAMILY, "font-size": 13, fill: "#98a2b3" }, g);
        ph.textContent = "doppio clic per scrivere";
        ph.setAttribute("class", "sc-ph");
      }
    }
    function drawEdge(e, parent, selected, decor) {
      const a = byId(e.from), b = byId(e.to);
      if (!a || !b) return;
      const p1 = exitPoint(a, center(b)), p2 = exitPoint(b, center(a));
      const g = S("g", { "data-edge": e.id }, parent);
      if (decor) S("line", { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], stroke: "transparent", "stroke-width": 14, class: "sc-hit" }, g);
      S("line", {
        x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], stroke: selected ? ACCENT : "#5b6475", "stroke-width": selected ? 3 : 2,
        "marker-end": e.arrow ? (selected ? "url(#scArrowSel)" : "url(#scArrow)") : "", "stroke-dasharray": e.dashed ? "6 5" : "",
      }, g);
    }
    function defs(target) {
      const d = S("defs", {}, target);
      for (const [id, col] of [["scArrow", "#5b6475"], ["scArrowSel", ACCENT]]) {
        const m = S("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: "auto-start-reverse" }, d);
        S("path", { d: "M0,0 L10,5 L0,10 z", fill: col }, m);
      }
      return d;
    }
    function render() {
      if (!svg || !cur) return;
      layerE.textContent = ""; layerN.textContent = ""; layerX.textContent = "";
      cur.nodes.forEach(layout);
      cur.edges.forEach((e) => drawEdge(e, layerE, sel && sel.type === "edge" && sel.id === e.id, true));
      for (const n of cur.nodes) {
        const g = S("g", { "data-node": n.id, class: "sc-node" }, layerN);
        drawShape(n, g, sel && sel.type === "node" && sel.id === n.id);
      }
      const n = sel && sel.type === "node" && byId(sel.id);
      if (n) {
        // maniglia per ridimensionare e pulsante "+" per aggiungere un ramo
        S("rect", { x: n.x + n.w - 6, y: n.y + n.h - 6, width: 12, height: 12, rx: 2, fill: "#fff", stroke: ACCENT, "stroke-width": 2, "data-handle": "resize", class: "sc-resize" }, layerX);
        const k = S("g", { "data-handle": "knob", class: "sc-knob" }, layerX);
        S("circle", { cx: n.x + n.w + 18, cy: n.y + n.h / 2, r: 11, fill: ACCENT }, k);
        S("path", { d: `M${n.x + n.w + 12},${n.y + n.h / 2}h12M${n.x + n.w + 18},${n.y + n.h / 2 - 6}v12`, stroke: "#fff", "stroke-width": 2.4, "stroke-linecap": "round" }, k);
      }
      $("#scEmpty").hidden = cur.nodes.length > 0;
    }

    /* ---------- vista (zoom e spostamento) ---------- */
    function applyVB() { svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); }
    function fitAspect() {
      const r = svg.getBoundingClientRect();
      if (!r.width || !r.height) return;
      vb.h = vb.w * (r.height / r.width);
      applyVB();
    }
    function zoom(f, cx, cy) {
      const nw = Math.min(8000, Math.max(200, vb.w / f));
      const k = nw / vb.w;
      if (cx == null) { cx = vb.x + vb.w / 2; cy = vb.y + vb.h / 2; }
      vb.x = cx - (cx - vb.x) * k; vb.y = cy - (cy - vb.y) * k;
      vb.w = nw; vb.h *= k;
      applyVB();
    }
    function fit() {
      const r = svg.getBoundingClientRect();
      const b = bbox(cur.nodes);
      if (!b) { vb = { x: 0, y: 0, w: Math.max(600, r.width), h: 0 }; fitAspect(); return; }
      const m = 60;
      const w = b.x1 - b.x0 + m * 2, h = b.y1 - b.y0 + m * 2;
      const ar = r.height / r.width || 0.66;
      vb.w = Math.max(w, h / ar, Math.min(900, r.width)); vb.h = vb.w * ar;
      vb.x = (b.x0 + b.x1) / 2 - vb.w / 2; vb.y = (b.y0 + b.y1) / 2 - vb.h / 2;
      applyVB();
    }
    function toSvg(ev) {
      const p = svg.createSVGPoint();
      p.x = ev.clientX; p.y = ev.clientY;
      const r = p.matrixTransform(svg.getScreenCTM().inverse());
      return [r.x, r.y];
    }

    /* ---------- aggiunta di forme ---------- */
    function newNode(shape, text, x, y) {
      const [w, h] = SIZES[shape] || SIZES.rect;
      return { id: uid(), shape, text: text || "", x, y, w, h, color: shape === "text" ? 0 : color, bold: false };
    }
    function childPos(parent, shape) {
      const [w, h] = SIZES[shape] || SIZES.rect;
      const kids = cur.edges.filter((e) => e.from === parent.id).map((e) => byId(e.to)).filter(Boolean);
      const x = parent.x + parent.w + 90;
      if (!kids.length) return [x, parent.y + parent.h / 2 - h / 2];
      const low = Math.max(...kids.map((k) => k.y + k.h));
      return [Math.max(x, Math.min(...kids.map((k) => k.x))), low + 24];
    }
    const overlaps = (x, y, w, h) => cur.nodes.some((n) => x < n.x + n.w + 16 && x + w + 16 > n.x && y < n.y + n.h + 16 && y + h + 16 > n.y);
    // Primo posto libero partendo dal centro della vista, scendendo
    function freePos(shape, size) {
      const [w, h] = size || SIZES[shape] || SIZES.rect;
      const x = vb.x + vb.w / 2 - w / 2;
      let y = vb.y + Math.min(vb.h / 2 - h / 2, 60);
      for (let k = 0; k < 400 && overlaps(x, y, w, h); k++) y += 20;
      return [x, y];
    }
    // Dopo aver misurato il testo: se la forma ne copre un'altra, spostala in basso
    function settle(n, keepX) {
      layout(n);
      for (let k = 0; k < 400 && cur.nodes.some((m) => m !== n && n.x < m.x + m.w + 12 && n.x + n.w + 12 > m.x && n.y < m.y + m.h + 12 && n.y + n.h + 12 > m.y); k++) n.y += 20;
    }
    // Aggiunge una forma; se un'altra forma è selezionata diventa un suo ramo
    function addShape(shape, text, at) {
      let created;
      mutate(() => {
        const parent = sel && sel.type === "node" ? byId(sel.id) : null;
        let x, y;
        if (at) { const [w, h] = SIZES[shape] || SIZES.rect; x = at[0] - w / 2; y = at[1] - h / 2; }
        else if (parent) [x, y] = childPos(parent, shape);
        else [x, y] = freePos(shape);
        created = newNode(shape, text, x, y);
        if (!at) settle(created);
        cur.nodes.push(created);
        if (parent) cur.edges.push({ id: uid(), from: parent.id, to: created.id, arrow: true });
      });
      return created;
    }
    // Aggiunge uno o più testi (una forma per riga)
    function addTexts(texts, at, parentId) {
      texts = texts.map((t) => clean(t)).filter(Boolean);
      if (!texts.length) return;
      ensureOpen();
      mutate(() => {
        const parent = parentId ? byId(parentId) : sel && sel.type === "node" ? byId(sel.id) : null;
        let last = null;
        texts.forEach((t, i) => {
          let x, y;
          if (parent) [x, y] = childPos(parent, tool);
          else if (at && i === 0) { const [w, h] = SIZES[tool]; x = at[0] - w / 2; y = at[1] - h / 2; }
          else if (last) { x = last.x; y = last.y + last.h + 20; }
          else [x, y] = freePos(tool);
          const n = newNode(tool, t, x, y);
          settle(n);
          cur.nodes.push(n);
          if (parent) cur.edges.push({ id: uid(), from: parent.id, to: n.id, arrow: true });
          last = n;
        });
        if (!parent && last) sel = { type: "node", id: last.id };
      });
      scrollIntoView();
      toast(texts.length === 1 ? "Aggiunto allo schema" : `Aggiunte ${texts.length} forme allo schema`);
    }
    function scrollIntoView() {
      const n = sel && sel.type === "node" && byId(sel.id);
      const target = n || cur.nodes[cur.nodes.length - 1];
      if (!target) return;
      const inView = target.x >= vb.x && target.y >= vb.y && target.x + target.w <= vb.x + vb.w && target.y + target.h <= vb.y + vb.h;
      if (!inView) fit();
    }
    function connect(a, b) {
      if (a === b || cur.edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a))) return;
      mutate(() => cur.edges.push({ id: uid(), from: a, to: b, arrow: true }));
    }
    function removeSelected() {
      if (!sel) return;
      mutate(() => {
        if (sel.type === "node") {
          cur.nodes = cur.nodes.filter((n) => n.id !== sel.id);
          cur.edges = cur.edges.filter((e) => e.from !== sel.id && e.to !== sel.id);
        } else cur.edges = cur.edges.filter((e) => e.id !== sel.id);
        sel = null;
      });
    }

    /* ---------- bozza dagli appunti (solo parole già presenti) ---------- */
    function treeFromSlide(s) {
      const items = (s.items || []).filter((i) => !i.table && !i.img).concat((s.imgItems || []).filter((i) => !i.img))
        .map((i) => ({ ...i, text: plain(i.text) }));
      const rootText = plain(s.title) || (items.length ? items[0].text : "");
      if (!rootText) return null;
      const root = { text: rootText, kids: [], depth: 0 };
      const stack = [root];
      (s.title ? items : items.slice(1)).forEach((it) => {
        const lvl = Math.min(2, it.level || 0) + 1;
        const node = { text: it.text, kids: [], depth: lvl };
        while (stack.length > lvl) stack.pop();
        (stack[stack.length - 1] || root).kids.push(node);
        stack.push(node);
      });
      // le righe di tabella diventano rami del titolo
      (s.items || []).filter((i) => i.table).forEach((it) => root.kids.push({ text: it.text, kids: [], depth: 1 }));
      return root;
    }
    function placeTree(t, x, y) {
      // misura
      const shapeFor = (d) => (d === 0 ? "rect" : d === 1 ? "rect" : "ellipse");
      const make = (t) => {
        const n = newNode(shapeFor(t.depth), t.text, 0, 0);
        n.w = t.depth === 0 ? 220 : 200;
        n.color = t.depth === 0 ? 2 : t.depth === 1 ? 1 : 3;
        n.bold = t.depth === 0;
        layout(n);
        t.n = n;
        t.kids.forEach(make);
        const kidsH = t.kids.reduce((a, k) => a + k.h, 0) + Math.max(0, t.kids.length - 1) * 18;
        t.h = Math.max(n.h, kidsH);
      };
      make(t);
      const nodes = [], edges = [];
      const put = (t, x, y) => {
        t.n.x = x; t.n.y = y + t.h / 2 - t.n.h / 2;
        nodes.push(t.n);
        let cy = y;
        t.kids.forEach((k) => {
          put(k, x + t.n.w + 80, cy);
          edges.push({ id: uid(), from: t.n.id, to: k.n.id, arrow: true });
          cy += k.h + 18;
        });
      };
      put(t, x, y);
      return { nodes, edges, h: t.h };
    }
    function draftFromSlides(slides) {
      const trees = slides.map(treeFromSlide).filter(Boolean);
      if (!trees.length) { toast("Queste slide non hanno testo da mettere nello schema"); return; }
      ensureOpen();
      mutate(() => {
        const b = bbox(cur.nodes);
        let y = b ? b.y1 + 80 : 40;
        const x = b ? b.x0 : 40;
        for (const t of trees) {
          const r = placeTree(t, x, y);
          cur.nodes.push(...r.nodes);
          cur.edges.push(...r.edges);
          y += r.h + 70;
        }
        sel = null;
      });
      fit();
      toast(trees.length === 1 ? "Bozza creata: modificala come vuoi" : `Bozza creata da ${trees.length} slide`);
    }

    /* ---------- scrittura dentro una forma ---------- */
    // Sposta la vista perché la forma (con il suo pulsante +) sia visibile
    function reveal(n) {
      const m = 50;
      if (n.x - m < vb.x) vb.x = n.x - m;
      else if (n.x + n.w + m > vb.x + vb.w) vb.x = Math.min(n.x - m, n.x + n.w + m - vb.w);
      if (n.y - m < vb.y) vb.y = n.y - m;
      else if (n.y + n.h + m > vb.y + vb.h) vb.y = Math.min(n.y - m, n.y + n.h + m - vb.h);
      applyVB();
    }
    function editNode(id) {
      const n = byId(id);
      if (!n) return;
      sel = { type: "node", id };
      reveal(n);
      render();
      const g = layerN.querySelector(`[data-node="${id}"]`);
      const r = g.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
      const scale = r.width / n.w;
      editor.hidden = false;
      Object.assign(editor.style, {
        left: r.left - wr.left + "px", top: r.top - wr.top + "px", width: Math.max(120, r.width) + "px",
        height: Math.max(40, r.height) + "px", fontSize: Math.max(12, FS * scale) + "px",
      });
      editor.value = n.text;
      editor.dataset.id = id;
      editor.focus();
      editor.select();
    }
    function commitEdit(save) {
      if (editor.hidden) return;
      const id = editor.dataset.id;
      editor.hidden = true;
      const n = byId(id);
      if (save && n && editor.value !== n.text) mutate(() => { n.text = editor.value.trim(); [n.w, n.h] = [Math.max(n.w, (SIZES[n.shape] || SIZES.rect)[0]), (SIZES[n.shape] || SIZES.rect)[1]]; });
      svg.focus({ preventScroll: true });
    }

    /* ---------- interazione col mouse / dito ---------- */
    let drag = null;
    function onDown(ev) {
      if (ev.button > 0) return;
      commitEdit(true);
      const p = toSvg(ev);
      const handle = ev.target.closest("[data-handle]");
      const nodeEl = ev.target.closest("[data-node]");
      const edgeEl = ev.target.closest("[data-edge]");
      svg.setPointerCapture(ev.pointerId);
      if (handle && sel && sel.type === "node") {
        const n = byId(sel.id);
        if (handle.dataset.handle === "resize") drag = { kind: "resize", n, start: p, w: n.w, h: n.h, snap: snapshot() };
        else drag = { kind: "link", n, start: p, temp: S("line", { x1: center(n)[0], y1: center(n)[1], x2: p[0], y2: p[1], stroke: ACCENT, "stroke-width": 2, "stroke-dasharray": "6 4" }, layerX) };
      } else if (nodeEl) {
        const n = byId(nodeEl.dataset.node);
        if (linkFrom && linkFrom !== n.id) { connect(linkFrom, n.id); setLinkMode(null); drag = null; return; }
        sel = { type: "node", id: n.id };
        drag = { kind: "move", n, start: p, x: n.x, y: n.y, snap: snapshot(), moved: false };
        render();
      } else if (edgeEl) {
        sel = { type: "edge", id: edgeEl.dataset.edge };
        drag = null;
        render();
      } else {
        sel = null;
        setLinkMode(null);
        drag = { kind: "pan", cx: ev.clientX, cy: ev.clientY, vx: vb.x, vy: vb.y };
        render();
      }
      updateButtons();
    }
    function onMove(ev) {
      if (!drag) return;
      if (drag.kind === "pan") {
        const k = vb.w / svg.getBoundingClientRect().width;
        vb.x = drag.vx - (ev.clientX - drag.cx) * k;
        vb.y = drag.vy - (ev.clientY - drag.cy) * k;
        applyVB();
        return;
      }
      const p = toSvg(ev);
      const dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
      if (drag.kind === "move") {
        if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
        drag.n.x = drag.x + dx; drag.n.y = drag.y + dy;
        render();
      } else if (drag.kind === "resize") {
        drag.n.w = Math.max(60, drag.w + dx);
        drag.n.h = Math.max(30, drag.h + dy);
        if (drag.n.shape === "square") drag.n.h = drag.n.w;
        render();
      } else if (drag.kind === "link") {
        drag.temp.setAttribute("x2", p[0]); drag.temp.setAttribute("y2", p[1]);
        drag.moved = Math.abs(dx) + Math.abs(dy) > 6;
      }
    }
    function onUp(ev) {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.kind === "move" || d.kind === "resize") {
        if (d.kind === "move" && !d.moved) return;
        undo.push(d.snap); redo = [];
        changed();
      } else if (d.kind === "link") {
        d.temp.remove();
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const target = under && under.closest && under.closest("[data-node]");
        if (target && target.dataset.node !== d.n.id) connect(d.n.id, target.dataset.node);
        else if (!d.moved) { const n = addShape(tool, ""); editNode(n.id); }
        else { const n = addShape(tool, "", toSvg(ev)); editNode(n.id); }
      }
    }
    function onWheel(ev) {
      ev.preventDefault();
      if (ev.ctrlKey || ev.metaKey) {
        const p = toSvg(ev);
        zoom(ev.deltaY < 0 ? 1.12 : 1 / 1.12, p[0], p[1]);
      } else {
        const k = vb.w / svg.getBoundingClientRect().width;
        vb.x += ev.deltaX * k; vb.y += ev.deltaY * k;
        applyVB();
      }
    }
    let linkFrom = null;
    function setLinkMode(id) {
      linkFrom = id;
      $("#scLink").classList.toggle("on", !!id);
      setStatus(id ? "Clicca la forma da collegare (Esc per annullare)" : "");
    }
    function setStatus(t) { $("#scStatus").textContent = t || "Suggerimento: seleziona una forma e premi «+» (o il tasto Tab) per aggiungere un ramo. Trascina parole dagli appunti dentro il foglio."; }

    function onKey(ev) {
      if (!open) return;
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      if (ev.target === editor) {
        if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); commitEdit(true); }
        else if (ev.key === "Escape") { ev.preventDefault(); commitEdit(false); }
        else if (ev.key === "Tab") { ev.preventDefault(); commitEdit(true); const n = addShape(tool, ""); editNode(n.id); }
        return;
      }
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || !$("#viewer").hidden) return;
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && ev.key.toLowerCase() === "z") { ev.preventDefault(); ev.shiftKey ? doRedo() : doUndo(); }
      else if (mod && ev.key.toLowerCase() === "y") { ev.preventDefault(); doRedo(); }
      else if ((ev.key === "Delete" || ev.key === "Backspace") && sel) { ev.preventDefault(); removeSelected(); }
      else if (ev.key === "Escape") { sel = null; setLinkMode(null); render(); updateButtons(); }
      else if (ev.key === "Enter" && sel && sel.type === "node") { ev.preventDefault(); editNode(sel.id); }
      else if (ev.key === "Tab" && sel && sel.type === "node") { ev.preventDefault(); const n = addShape(tool, ""); editNode(n.id); }
    }

    /* ---------- barra strumenti ---------- */
    function updateButtons() {
      const n = sel && sel.type === "node" ? byId(sel.id) : null;
      const e = sel && sel.type === "edge" ? cur.edges.find((x) => x.id === sel.id) : null;
      $("#scDelete").disabled = !sel;
      $("#scLink").disabled = !n;
      $("#scBold").disabled = !n;
      $("#scUndo").disabled = !undo.length;
      $("#scRedo").disabled = !redo.length;
      $("#scEdgeStyle").hidden = !e;
      if (e) $("#scEdgeStyle").value = e.dashed ? "dashed" : e.arrow ? "arrow" : "line";
      $$("#scShapes button").forEach((b) => b.classList.toggle("on", b.dataset.shape === tool));
      $$("#scColors button").forEach((b, i) => b.classList.toggle("on", n ? n.color === i : color === i));
      $("#scShapesLabel").textContent = n ? "Aggiungi un ramo:" : "Aggiungi:";
    }
    function shapeIcon(shape) {
      const p = {
        rect: '<rect x="2" y="6" width="20" height="12" rx="3"/>', square: '<rect x="4" y="4" width="16" height="16" rx="1"/>',
        triangle: '<path d="M12 3 L22 20 L2 20 Z"/>', ellipse: '<ellipse cx="12" cy="12" rx="10" ry="7"/>',
        diamond: '<path d="M12 2 L22 12 L12 22 L2 12 Z"/>', text: '<path d="M5 6h14M12 6v13" stroke-linecap="round"/>',
      }[shape];
      return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">${p}</svg>`;
    }
    const SHAPE_NAMES = { rect: "Rettangolo", square: "Quadrato", triangle: "Triangolo", ellipse: "Cerchio / ovale", diamond: "Rombo", text: "Solo testo" };

    /* ---------- elenco degli schemi ---------- */
    function refreshList() {
      const s = $("#scList");
      s.textContent = "";
      schemas.slice().sort((a, b) => a.created - b.created).forEach((x) => {
        const o = el("option", null, x.name);
        o.value = x.id;
        s.append(o);
      });
      if (cur) s.value = cur.id;
    }
    function select(id) {
      commitEdit(true);
      cur = schemas.find((s) => s.id === id) || schemas[0];
      sel = null; undo = []; redo = [];
      DB.put("kv", cur.id, "schemaCur");
      refreshList();
      render();
      fit();
      updateButtons();
    }
    function create(name) {
      const s = { id: uid(), name: name || "Schema " + (schemas.length + 1), nodes: [], edges: [], created: Date.now(), updated: Date.now() };
      schemas.push(s);
      DB.put("schemas", s);
      select(s.id);
      return s;
    }

    /* ---------- esportazione ---------- */
    function exportSvgString() {
      const b = bbox(cur.nodes);
      if (!b) return null;
      const m = 30;
      const out = document.createElementNS(SVGNS, "svg");
      const w = b.x1 - b.x0 + m * 2, h = b.y1 - b.y0 + m * 2;
      out.setAttribute("xmlns", SVGNS);
      out.setAttribute("viewBox", `${b.x0 - m} ${b.y0 - m} ${w} ${h}`);
      out.setAttribute("width", w); out.setAttribute("height", h);
      defs(out);
      S("rect", { x: b.x0 - m, y: b.y0 - m, width: w, height: h, fill: "#ffffff" }, out);
      const le = S("g", {}, out), ln = S("g", {}, out);
      cur.edges.forEach((e) => drawEdge(e, le, false, false));
      cur.nodes.forEach((n) => { const g = S("g", {}, ln); drawShape(n, g, false); });
      out.querySelectorAll(".sc-ph").forEach((x) => x.remove());
      return { str: new XMLSerializer().serializeToString(out), w, h };
    }
    function toPng() {
      const r = exportSvgString();
      if (!r) return Promise.resolve(null);
      return new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(2, 8000 / Math.max(r.w, r.h));
          const c = document.createElement("canvas");
          c.width = Math.round(r.w * k); c.height = Math.round(r.h * k);
          const ctx = c.getContext("2d");
          ctx.scale(k, k);
          ctx.drawImage(img, 0, 0, r.w, r.h);
          c.toBlob((b) => (b ? res(b) : rej(new Error("png"))), "image/png");
        };
        img.onerror = rej;
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(r.str);
      });
    }
    async function exportPng() {
      const b = await toPng();
      if (!b) { toast("Lo schema è vuoto"); return; }
      download(cur.name + ".png", b);
    }
    async function printSchema() {
      const b = await toPng();
      if (!b) { toast("Lo schema è vuoto"); return; }
      const box = $("#printSchema");
      box.textContent = "";
      box.append(el("h2", null, cur.name));
      const img = new Image();
      img.src = URL.createObjectURL(b);
      await new Promise((r) => { img.onload = r; img.onerror = r; });
      box.append(img);
      document.body.classList.add("printing-schema");
      setTimeout(() => {
        window.print();
        document.body.classList.remove("printing-schema");
        URL.revokeObjectURL(img.src);
      }, 50);
    }

    /* ---------- testo libero ---------- */
    async function importFileText(file) {
      const ext = extOf(file.name);
      const bytes = await file.arrayBuffer();
      let pages;
      setStatus("Lettura di " + file.name + "…");
      try {
        if (ext === "txt" || ext === "md") pages = [{ title: "", items: [{ text: new TextDecoder().decode(bytes) }] }];
        else if (DOC_KINDS[ext]) pages = await READERS[DOC_KINDS[ext]](file, bytes, (i, n) => setStatus(`Lettura di ${file.name}: ${i}/${n}`));
        else if (IMG_EXT.has(ext) || /^image\//.test(file.type)) pages = [await readImage(file, bytes)];
        else { toast("Formato non supportato"); setStatus(""); return; }
      } catch (e) { toast("File non leggibile"); setStatus(""); return; }
      const txt = pages.map((p) => [p.title, ...(p.items || []).map((i) => i.text), ...(p.imgItems || []).map((i) => i.text)].filter(Boolean).join("\n")).filter(Boolean).join("\n\n");
      const ta = $("#scText");
      ta.value = (ta.value.trim() ? ta.value.replace(/\s*$/, "\n\n") : "") + txt;
      DB.put("kv", ta.value, "freetext");
      setStatus("");
      toast("Testo importato: selezionalo e aggiungilo allo schema");
    }
    function addFromFreeText() {
      const ta = $("#scText");
      const t = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      if (!t.trim()) { toast("Seleziona prima delle parole nel testo"); return; }
      addTexts(t.split(/\n+/));
    }

    /* ---------- apertura del pannello ---------- */
    function placePanel() {
      const top = $(".topbar").getBoundingClientRect().bottom;
      $("#schema").style.top = Math.max(0, top) + "px";
    }
    function ensureOpen() {
      if (!open) toggle(true);
      if (!cur) create();
    }
    function toggle(force) {
      open = force != null ? force : !open;
      $("#schema").hidden = !open;
      document.body.classList.toggle("schema-open", open);
      $("#btnSchema").classList.toggle("on", open);
      if (open) {
        placePanel();
        if (!cur) { if (schemas.length) select(schemas[0].id); else create("Schema 1"); }
        requestAnimationFrame(() => { fitAspect(); if (cur && cur.nodes.length) fit(); render(); });
      } else commitEdit(true);
    }

    async function init() {
      svg = $("#scSvg"); wrap = $("#scWrap"); editor = $("#scEditor");
      defs(svg);
      S("rect", { x: -50000, y: -50000, width: 100000, height: 100000, fill: "url(#scGrid)" }, svg);
      const pat = S("pattern", { id: "scGrid", width: 24, height: 24, patternUnits: "userSpaceOnUse" }, svg.querySelector("defs"));
      S("circle", { cx: 1, cy: 1, r: 1, fill: "#d5dae2" }, pat);
      layerE = S("g", {}, svg); layerN = S("g", {}, svg); layerX = S("g", {}, svg);
      svg.addEventListener("pointerdown", onDown);
      svg.addEventListener("pointermove", onMove);
      svg.addEventListener("pointerup", onUp);
      svg.addEventListener("pointercancel", onUp);
      svg.addEventListener("wheel", onWheel, { passive: false });
      svg.addEventListener("dblclick", (ev) => {
        const nodeEl = ev.target.closest("[data-node]");
        if (nodeEl) editNode(nodeEl.dataset.node);
        else { const n = addShape(tool, "", toSvg(ev)); editNode(n.id); }
      });
      // trascinare parole dagli appunti o dal testo libero
      svg.addEventListener("dragover", (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = "copy"; });
      svg.addEventListener("drop", (ev) => {
        ev.preventDefault();
        const t = ev.dataTransfer.getData("text/plain");
        if (!t || !t.trim()) return;
        const under = ev.target.closest && ev.target.closest("[data-node]");
        const n = under && byId(under.dataset.node);
        if (n && !n.text) { mutate(() => { n.text = clean(t); }); return; }   // forma vuota: riempila
        if (n) { addTexts(t.split(/\n+/), null, n.id); return; }             // forma piena: nuovo ramo
        addTexts(t.split(/\n+/), toSvg(ev));                                  // foglio vuoto: nuova forma
      });
      editor.addEventListener("blur", () => commitEdit(true));
      document.addEventListener("keydown", onKey);
      new ResizeObserver(() => { if (open) fitAspect(); }).observe(wrap);
      window.addEventListener("resize", () => { if (open) placePanel(); });

      // strumenti
      const shapes = $("#scShapes");
      Object.keys(SHAPE_NAMES).forEach((k) => {
        const b = el("button", "sc-tool");
        b.innerHTML = shapeIcon(k);
        b.title = SHAPE_NAMES[k] + " — clic per aggiungere (come ramo della forma selezionata)";
        b.setAttribute("aria-label", SHAPE_NAMES[k]);
        b.dataset.shape = k;
        b.onclick = () => { tool = k; const n = addShape(k, ""); editNode(n.id); };
        shapes.append(b);
      });
      const cols = $("#scColors");
      COLORS.forEach((c, i) => {
        const b = el("button", "sc-color");
        b.style.background = c.fill; b.style.borderColor = c.stroke;
        b.title = c.name; b.setAttribute("aria-label", "Colore " + c.name);
        b.onclick = () => {
          color = i;
          const n = sel && sel.type === "node" && byId(sel.id);
          if (n) mutate(() => { n.color = i; }); else updateButtons();
        };
        cols.append(b);
      });
      $("#scLink").onclick = () => { if (sel && sel.type === "node") setLinkMode(linkFrom ? null : sel.id); };
      $("#scBold").onclick = () => { const n = sel && byId(sel.id); if (n) mutate(() => { n.bold = !n.bold; }); };
      $("#scEdgeStyle").onchange = (e) => {
        const ed = sel && cur.edges.find((x) => x.id === sel.id);
        if (ed) mutate(() => { ed.arrow = e.target.value !== "line"; ed.dashed = e.target.value === "dashed"; });
      };
      $("#scDelete").onclick = removeSelected;
      $("#scUndo").onclick = doUndo;
      $("#scRedo").onclick = doRedo;
      $("#scZoomIn").onclick = () => zoom(1.2);
      $("#scZoomOut").onclick = () => zoom(1 / 1.2);
      $("#scFit").onclick = fit;
      $("#scClose").onclick = () => toggle(false);
      $("#btnSchema").onclick = () => toggle();
      $("#scList").onchange = (e) => select(e.target.value);
      $("#scNew").onclick = async () => { const name = await ask("Nome del nuovo schema:", { ok: "Crea", input: "Schema " + (schemas.length + 1) }); if (name != null) create(name.trim() || undefined); };
      $("#scRename").onclick = async () => { const name = await ask("Nuovo nome dello schema:", { ok: "Rinomina", input: cur.name }); if (name && name.trim()) { cur.name = name.trim(); DB.put("schemas", cur); refreshList(); } };
      $("#scDel").onclick = async () => {
        if (!(await ask(`Eliminare lo schema "${cur.name}"?`, { ok: "Elimina", danger: true }))) return;
        DB.del("schemas", cur.id);
        schemas = schemas.filter((s) => s.id !== cur.id);
        cur = null;
        if (schemas.length) select(schemas[0].id); else create("Schema 1");
      };
      $("#scPng").onclick = exportPng;
      $("#scPrint").onclick = printSchema;
      $("#scDraft").onclick = openDraftDialog;
      $("#scTextToggle").onclick = () => {
        const p = $("#scSource");
        p.hidden = !p.hidden;
        $("#scTextToggle").classList.toggle("on", !p.hidden);
        requestAnimationFrame(fitAspect);
      };
      $("#scText").addEventListener("input", (e) => DB.put("kv", e.target.value, "freetext"));
      $("#scAddSel").onclick = addFromFreeText;
      $("#scImport").onclick = () => $("#scFile").click();
      $("#scFile").onchange = async (e) => { for (const f of e.target.files) await importFileText(f); e.target.value = ""; };

      // "+" accanto alle righe degli appunti
      const plus = $("#addLine");
      let hoverEl = null;
      list.addEventListener("mouseover", (ev) => {
        if (!open) return;
        const t = ev.target.closest(".content h3, .content li, .speaker div");
        if (!t || t === hoverEl) return;
        hoverEl = t;
        const r = t.getBoundingClientRect();
        plus.hidden = false;
        plus.style.top = window.scrollY + r.top + Math.min(r.height, 26) / 2 - 12 + "px";
        plus.style.left = window.scrollX + r.left - 30 + "px";
      });
      list.addEventListener("mouseleave", () => { setTimeout(() => { if (!plus.matches(":hover")) { plus.hidden = true; hoverEl = null; } }, 100); });
      plus.addEventListener("click", () => { if (hoverEl) addTexts([hoverEl.textContent]); });

      try {
        schemas = (await DB.all("schemas")) || [];
        $("#scText").value = (await DB.get("kv", "freetext")) || "";
        const last = await DB.get("kv", "schemaCur");
        if (schemas.length) cur = schemas.find((s) => s.id === last) || schemas[0];
      } catch (e) { warn(e); }
      refreshList();
      setStatus("");
      updateButtonsSafe();
    }
    function updateButtonsSafe() { if (cur) updateButtons(); }

    /* ---------- finestra "Bozza dagli appunti" ---------- */
    function openDraftDialog() {
      const all = sortedSlides();
      if (!all.length) { toast("Carica prima delle slide: la bozza usa i loro appunti"); return; }
      const dlg = $("#draftDlg");
      $("#dFrom").max = $("#dTo").max = all.length;
      $("#dFrom").value = 1;
      $("#dTo").value = Math.min(all.length, 1);
      $("#dCount").textContent = all.length;
      dlg.hidden = false;
      $("#dFrom").focus();
    }
    function wireDraft() {
      $("#dCancel").onclick = () => { $("#draftDlg").hidden = true; };
      $("#dOk").onclick = () => {
        const all = sortedSlides();
        let a = Math.max(1, +$("#dFrom").value || 1), b = Math.min(all.length, +$("#dTo").value || a);
        if (b < a) [a, b] = [b, a];
        $("#draftDlg").hidden = true;
        draftFromSlides(all.slice(a - 1, b));
      };
    }

    return {
      init: async () => { await init(); wireDraft(); },
      addTexts,
      draftFromSlides,
      isOpen: () => open,
    };
  })();

