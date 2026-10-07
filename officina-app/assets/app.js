// app.js — l'interfaccia dell'Officina: missioni, editor, anteprima, verifiche.

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const KEY = 'officina:v1';
const TAB_NAMES = { html: 'HTML', css: 'CSS', js: 'JS' };
const GROUPS = { guidata: 'Percorso guidato', zero: 'Sfide da zero', libero: 'Laboratorio' };

// ───────────── Stato salvato
let S;
try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
if (!S || typeof S !== 'object') S = { current: 'm01', missions: {}, welcomed: false };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

const byId = (id) => MISSIONI.find((m) => m.id === id) || MISSIONI[0];
function startCode(m) {
  const code = { html: '', css: '', js: '', ...m.start };
  const prev = m.startFrom && S.missions[m.startFrom];
  if (prev) for (const k of Object.keys(prev.code)) if (prev.code[k] && prev.code[k].trim()) code[k] = prev.code[k];
  return code;
}
function ms(m) {
  if (!S.missions[m.id]) S.missions[m.id] = { code: startCode(m), done: [], step: 0, hints: {}, manual: {} };
  return S.missions[m.id];
}
const isComplete = (m) => m.steps.length > 0 && S.missions[m.id] && S.missions[m.id].done.length >= m.steps.length;

let mission = byId(S.current);
let tab = mission.tabs[0];
let viewStep = null; // passo aperto (null = quello corrente)
let running = false;

// ───────────── Sidebar
function renderSidebar() {
  const nav = $('#sidebar');
  let html = '';
  for (const g of Object.keys(GROUPS)) {
    html += `<h3>${GROUPS[g]}</h3><ul>`;
    MISSIONI.filter((m) => m.group === g).forEach((m) => {
      const st = S.missions[m.id];
      const done = st ? st.done.length : 0;
      const badge = !m.steps.length ? '' : isComplete(m) ? '<span class="ok">✓</span>' : `<span class="count">${done}/${m.steps.length}</span>`;
      const n = g === 'guidata' ? `${MISSIONI.indexOf(m) + 1}. ` : '';
      html += `<li><button data-id="${m.id}" class="${m.id === mission.id ? 'active' : ''}">
        <span class="em">${m.emoji}</span><span class="t">${n}${esc(m.title)}</span>${badge}</button></li>`;
    });
    html += '</ul>';
  }
  nav.innerHTML = html;
  nav.querySelectorAll('button[data-id]').forEach((b) => b.addEventListener('click', () => {
    openMission(b.dataset.id);
    document.body.classList.remove('nav-open');
  }));

  let tot = 0, fatti = 0;
  MISSIONI.forEach((m) => { tot += m.steps.length; fatti += S.missions[m.id] ? Math.min(S.missions[m.id].done.length, m.steps.length) : 0; });
  const pct = tot ? Math.round((fatti / tot) * 100) : 0;
  $('#overall-fill').style.width = pct + '%';
  $('#overall-text').textContent = pct + '%';
}

// ───────────── Pannello missione
function renderMission() {
  const st = ms(mission);
  const box = $('#mission');
  const label = { guidata: 'Missione guidata', zero: 'Sfida da zero', libero: 'Laboratorio libero' }[mission.group];
  let html = `<div class="m-head"><span class="tag ${mission.group}">${label}</span>
    <h2>${mission.emoji} ${esc(mission.title)}</h2><p>${esc(mission.intro)}</p></div>`;

  if (mission.free) html += `<div class="free">${mission.free}</div>`;

  if (isComplete(mission)) {
    const next = MISSIONI[MISSIONI.indexOf(mission) + 1];
    html += `<div class="complete">🎉 <strong>Missione completata!</strong>
      ${mission.skills.length ? `<p>Ora sai:</p><ul>${mission.skills.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      ${next ? `<button class="primary" id="btn-next-mission">Prossima: ${next.emoji} ${esc(next.title)} →</button>` : ''}</div>`;
  }

  const current = Math.min(st.done.length, mission.steps.length - 1);
  const open = viewStep === null ? current : viewStep;
  html += '<ol class="steps">';
  mission.steps.forEach((s, i) => {
    const done = st.done.includes(i);
    const locked = i > st.done.length;
    const cls = done ? 'done' : locked ? 'locked' : 'current';
    const icon = done ? '✓' : locked ? '🔒' : i + 1;
    html += `<li class="step ${cls} ${i === open ? 'open' : ''}">
      <button class="step-title" data-step="${i}" ${locked ? 'disabled' : ''}><span class="n">${icon}</span>${esc(s.title)}</button>`;
    if (i === open && !locked) html += stepBody(s, i, st);
    html += '</li>';
  });
  html += '</ol>';
  box.innerHTML = html;
  box.scrollTop = 0;

  box.querySelectorAll('.step-title').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.step);
    viewStep = i === open ? -1 : i;
    renderMission();
  }));
  const nm = $('#btn-next-mission');
  if (nm) nm.addEventListener('click', () => openMission(MISSIONI[MISSIONI.indexOf(mission) + 1].id));
  const hb = $('#btn-hint');
  if (hb) hb.addEventListener('click', () => {
    const i = Number(hb.dataset.step);
    st.hints[i] = (st.hints[i] || 0) + 1;
    save(); renderMission();
  });
  box.querySelectorAll('.manual input').forEach((cb) => cb.addEventListener('change', () => {
    st.manual[cb.dataset.key] = cb.checked; save();
  }));
  const vb = $('#btn-verify');
  if (vb) vb.addEventListener('click', () => verify(Number(vb.dataset.step)));
}

function stepBody(s, i, st) {
  let h = `<div class="step-body"><div class="task">${s.task}</div>`;
  if (s.example) h += `<div class="example"><div class="ex-label">Esempio su un altro caso — adattalo, non copiarlo</div><pre>${esc(s.example)}</pre></div>`;
  const manual = s.checks.every((c) => c.manual);
  if (manual) {
    h += '<div class="manual">' + s.checks.map((c, k) => {
      const key = `${i}-${k}`;
      return `<label><input type="checkbox" data-key="${key}" ${st.manual[key] ? 'checked' : ''}> ${esc(c.t)}</label>`;
    }).join('') + '</div>';
  }
  const shown = st.hints[i] || 0;
  if (s.hints && s.hints.length) {
    h += '<div class="hints">';
    s.hints.slice(0, shown).forEach((t, k) => { h += `<p class="hint">💡 ${k + 1}. ${esc(t)}</p>`; });
    if (shown < s.hints.length) h += `<button class="ghost small" id="btn-hint" data-step="${i}">💡 Suggerimento (${shown + 1}/${s.hints.length})</button>`;
    h += '</div>';
  }
  h += `<button class="primary verify" id="btn-verify" data-step="${i}">${manual ? '✔ Fatto' : '✔ Verifica'}</button>`;
  h += `<ul class="results" id="results"></ul>`;
  if (!manual) h += `<p class="checklist muted">Controlli: ${s.checks.map((c) => esc(c.t)).join(' · ')}</p>`;
  return h + '</div>';
}

// ───────────── Verifica
async function verify(i) {
  if (running) return;
  const st = ms(mission);
  const step = mission.steps[i];
  const out = $('#results');
  const btn = $('#btn-verify');

  if (step.checks.every((c) => c.manual)) {
    const missing = step.checks.filter((c, k) => !st.manual[`${i}-${k}`]);
    out.innerHTML = missing.length
      ? missing.map((c) => `<li class="fail">✗ ${esc(c.t)}</li>`).join('')
      : '';
    if (!missing.length) passStep(i);
    return;
  }

  running = true;
  btn.disabled = true; btn.textContent = '⏳ Sto provando la tua app…';
  out.innerHTML = '';
  const code = st.code;
  const results = await Engine.runChecks($('#test-host'), code, step.checks,
    { prefix: 'labtest:', test: true, setup: mission.setup },
    (r) => {
      out.insertAdjacentHTML('beforeend', `<li class="${r.pass ? 'pass' : 'fail'}">${r.pass ? '✓' : '✗'} ${esc(r.t)}${r.msg ? `<div class="why">${esc(r.msg)}</div>` : ''}</li>`);
      out.lastElementChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  running = false;
  btn.disabled = false; btn.textContent = '✔ Verifica';
  if (results.every((r) => r.pass)) passStep(i);
}

function passStep(i) {
  const st = ms(mission);
  if (!st.done.includes(i)) st.done.push(i);
  st.done.sort((a, b) => a - b);
  save();
  const last = i === mission.steps.length - 1;
  viewStep = null;
  toast(last ? '🏆 Missione completata!' : '✅ Passo superato! Avanti col prossimo.');
  renderSidebar();
  renderMission();
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

// ───────────── Editor
const ta = $('#code');
const gutter = $('#gutter');

function renderTabs() {
  $('#tabs').innerHTML = mission.tabs.map((t) => `<button data-tab="${t}" class="${t === tab ? 'active' : ''}">${TAB_NAMES[t]}</button>`).join('');
  $('#tabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; loadEditor(); }));
}
function loadEditor() {
  renderTabs();
  ta.value = ms(mission).code[tab] || '';
  ta.placeholder = { html: '<!-- HTML: la struttura della pagina -->', css: '/* CSS: lo stile */', js: '// JavaScript: il comportamento' }[tab];
  updateGutter();
  ta.scrollTop = 0;
}
function updateGutter() {
  const n = ta.value.split('\n').length;
  let s = '';
  for (let i = 1; i <= n; i++) s += i + '\n';
  gutter.textContent = s;
  gutter.scrollTop = ta.scrollTop;
}

let saveTimer, runTimer;
ta.addEventListener('input', () => {
  ms(mission).code[tab] = ta.value;
  updateGutter();
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 300);
  if ($('#auto-run').checked) { clearTimeout(runTimer); runTimer = setTimeout(runPreview, 800); }
});
ta.addEventListener('scroll', () => { gutter.scrollTop = ta.scrollTop; });

function insert(text) {
  ta.focus();
  if (!document.execCommand('insertText', false, text)) ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
  ta.dispatchEvent(new Event('input'));
}
ta.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    insert('  ');
  } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    runPreview();
  } else if (e.key === 'Enter' && !e.shiftKey) {
    // Mantiene il rientro della riga precedente (e lo aumenta dopo { o un tag aperto).
    const before = ta.value.slice(0, ta.selectionStart);
    const line = before.slice(before.lastIndexOf('\n') + 1);
    let indent = line.match(/^\s*/)[0];
    if (/[{[(]\s*$/.test(line) || (/<([a-z][a-z0-9]*)[^>]*>\s*$/i.test(line) && !/<\/|\/>|<(br|img|input|meta|link|hr)\b/i.test(line.slice(line.lastIndexOf('<'))))) indent += '  ';
    e.preventDefault();
    insert('\n' + indent);
  }
});

// ───────────── Anteprima e console
const consoleBox = $('#console');
function logLine(kind, text) {
  const div = document.createElement('div');
  div.className = 'line ' + kind;
  div.textContent = (kind === 'error' ? '⛔ ' : kind === 'warn' ? '⚠️ ' : '› ') + text;
  consoleBox.append(div);
  if (kind === 'error') {
    const tip = Engine.explain(text);
    if (tip) {
      const t = document.createElement('div');
      t.className = 'line tip'; t.textContent = '💡 ' + tip;
      consoleBox.append(t);
    }
  }
  consoleBox.scrollTop = consoleBox.scrollHeight;
}
window.addEventListener('message', (e) => {
  const frame = $('#preview-host iframe');
  if (!frame || e.source !== frame.contentWindow || !e.data || !e.data.__lab) return;
  logLine(e.data.kind, e.data.text);
});
function runPreview() {
  consoleBox.innerHTML = '';
  Engine.render($('#preview-host'), ms(mission).code, { prefix: `lab:${mission.id}:`, setup: mission.setup });
}

// ───────────── Navigazione
function openMission(id) {
  mission = byId(id);
  S.current = mission.id; save();
  tab = mission.tabs[0];
  viewStep = null;
  renderSidebar(); renderMission(); loadEditor(); runPreview();
}

$('#btn-run').addEventListener('click', runPreview);
$('#btn-clear').addEventListener('click', () => { consoleBox.innerHTML = ''; });
$('#btn-menu').addEventListener('click', () => document.body.classList.toggle('nav-open'));
$('#btn-guida').addEventListener('click', () => $('#guida').showModal());
$('#btn-reset').addEventListener('click', () => {
  if (!confirm(`Ricominciare "${mission.title}" da capo? Il codice e i progressi di questa missione verranno cancellati.`)) return;
  delete S.missions[mission.id];
  Engine.clearStorage(`lab:${mission.id}:`);
  save(); openMission(mission.id);
});
$('#btn-export').addEventListener('click', () => {
  const html = Engine.build(ms(mission).code, { bare: true });
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${mission.id}-${mission.title.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

openMission(mission.id);
if (!S.welcomed) { $('#guida').showModal(); S.welcomed = true; save(); }
