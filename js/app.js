import * as M from './model.js';
import * as A from './actions.js';
import * as S from './store.js';
import { todayISO, ym, addDays, addMonthsYM, labelDay, labelDayLong, labelMonth, MOIS, MOIS_COURT, daysInMonth } from './dates.js';

const APP_VERSION = '2.6.1';

let state = S.load();
let view = 'accueil';
let journalIndex = null;       // index du cycle affiché dans le Journal (null = cycle en cours)
let journalFilter = 'tout';
let anaPeriod = 'cycle';
let anaCharges = false;
const anaOpen = new Set();
let installPrompt = null;

const $ = s => document.querySelector(s);
const T = () => todayISO();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur = n => fmt(n) + ' €';
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + eur(Math.abs(n));
const bigEur = n => {
  const [i, c] = fmt(n).split(',');
  return `${i}<span class="cents">,${c} €</span>`;
};
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

function parseAmount(v) {
  const t = String(v ?? '').replace(/[\s  €]/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
const amountValue = n => (n == null || n === '' ? '' : Number.isInteger(Number(n)) ? String(n) : Number(n).toFixed(2).replace('.', ','));

const famById = id => state.families.find(f => f.id === id);
const catById = id => state.categories.find(c => c.id === id);
const accById = id => state.accounts.find(a => a.id === id);
const projById = id => state.projects.find(p => p.id === id);
const envName = e => M.ENVELOPE_NAMES[e] || e;

/* ================= Enregistrement, annulation ================= */

function commit() {
  if (!S.save(state)) toast('⚠️ Enregistrement impossible : la mémoire du navigateur est pleine ou bloquée.');
  render();
}

// Exécute une suppression en proposant « Annuler » pendant quelques secondes.
function withUndo(message, mutate) {
  const snapshot = JSON.stringify(state);
  mutate();
  commit();
  toast(message, () => { state = S.normalize(JSON.parse(snapshot)); commit(); });
}

let toastTimer = null;
function toast(message, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(message)}</span>${undo ? '<button type="button">Annuler</button>' : ''}`;
  el.classList.remove('hide');
  if (undo) el.querySelector('button').onclick = () => { el.classList.add('hide'); undo(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hide'), undo ? 6000 : 3000);
}

/* ================= Feuilles modales ================= */
// Le bouton « retour » d'Android ferme la feuille au lieu de quitter l'appli.

let sheetOpen = false;
function openSheet(html, mount) {
  const sheet = $('#sheet');
  sheet.innerHTML = html;
  $('#overlay').classList.add('open');
  if (!sheetOpen) { history.pushState({ sheet: true }, ''); sheetOpen = true; }
  sheet.scrollTop = 0;
  if (mount) mount(sheet);
}
function hideSheet() {
  sheetOpen = false;
  $('#overlay').classList.remove('open');
  $('#sheet').innerHTML = '';
}
function closeSheet() {
  if (!sheetOpen) return;
  hideSheet();
  if (history.state && history.state.sheet) history.back();
}
window.addEventListener('popstate', () => { if (sheetOpen) hideSheet(); });
$('#overlay').addEventListener('click', e => { if (e.target.id === 'overlay') closeSheet(); });

function bindForm(root, onSubmit) {
  const form = root.querySelector('form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const err = form.querySelector('.error');
    if (err) err.textContent = '';
    try { onSubmit(form); } catch (ex) { if (err) err.textContent = ex.message; else toast(ex.message); }
  });
  const cancel = form.querySelector('[data-cancel]');
  if (cancel) cancel.onclick = () => closeSheet();
  return form;
}
const fv = (form, name) => { const el = form.elements[name]; return el ? el.value.trim() : ''; };
const need = (cond, msg) => { if (!cond) throw new Error(msg); };

const buttons = (submitLabel = 'Enregistrer', extra = '') => `
  <p class="error"></p>
  <div class="btn-row">${extra || '<button type="button" class="btn btn-secondary" data-cancel>Annuler</button>'}<button class="btn btn-primary">${submitLabel}</button></div>`;

const dateField = (name, value, label = 'Date') => `
  <div class="field"><label>${label}</label>
    <div class="row2"><input type="date" name="${name}" value="${value}" required></div>
    <div class="chips" style="padding:8px 0 0">
      <button type="button" class="chip" data-setdate="${name}" data-v="${T()}">Aujourd'hui</button>
      <button type="button" class="chip" data-setdate="${name}" data-v="${addDays(T(), -1)}">Hier</button>
    </div></div>`;

function bindDateChips(root) {
  root.querySelectorAll('[data-setdate]').forEach(b => {
    b.onclick = () => { root.querySelector(`[name="${b.dataset.setdate}"]`).value = b.dataset.v; };
  });
}

const accountOptions = selected => state.accounts.map(a => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
// Ordre d'affichage : alphabétique, « Divers » toujours en dernier.
const byName = (a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
const sortedFamilies = () => [...state.families].sort((a, b) => (a.id === 'divers') - (b.id === 'divers') || byName(a, b));
const catsOf = famId => state.categories.filter(c => c.familyId === famId).sort(byName);
const familyOptions = selected => sortedFamilies().map(f => `<option value="${f.id}" ${f.id === selected ? 'selected' : ''}>${f.icon} ${esc(f.name)}</option>`).join('');
const monthOptions = selected => MOIS.map((m, i) => `<option value="${i + 1}" ${i + 1 === selected ? 'selected' : ''}>${m}</option>`).join('');
const defaultAccountId = () => (state.accounts.find(a => /casden/i.test(a.name)) || state.accounts[0] || {}).id || null;

/* ================= Rendu général ================= */

const TITLES = { accueil: 'Mes Enveloppes', journal: 'Journal', analyse: 'Analyse', prelevements: 'Prélèvements', epargne: 'Épargne', reglages: 'Réglages' };

function render() {
  const setup = state && state.setupDone;
  $('#tabbar').classList.toggle('hide', !setup);
  $('#settingsBtn').classList.toggle('hide', !setup);
  const d = new Date();
  $('#todayLabel').textContent = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  if (!setup) { $('#fab').classList.add('hide'); $('#pageTitle').textContent = 'Mes Enveloppes'; renderWizard(); return; }
  $('#pageTitle').textContent = TITLES[view];
  document.querySelectorAll('#tabbar .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === view));
  $('#fab').classList.toggle('hide', !['accueil', 'journal', 'analyse'].includes(view));
  const html = { accueil: viewAccueil, journal: viewJournal, analyse: viewAnalyse, prelevements: viewPrelevements, epargne: viewEpargne, reglages: viewReglages }[view]();
  $('#view').innerHTML = html;
  if (view === 'reglages') mountReglages($('#view'));
}

function go(v) {
  view = v;
  if (v === 'journal') journalIndex = null;
  window.scrollTo(0, 0);
  render();
}

document.querySelectorAll('#tabbar .tab').forEach(b => { b.onclick = () => go(b.dataset.tab); });
$('#settingsBtn').onclick = () => go('reglages');
$('#fab').onclick = () => sheetExpense(null);

// Toutes les zones cliquables portent data-act="action" (et éventuellement data-id).
const ACTIONS = {};
function dispatch(ev) {
  const el = ev.target.closest('[data-act]');
  if (!el || !ACTIONS[el.dataset.act]) return;
  ev.preventDefault();
  ACTIONS[el.dataset.act](el.dataset.id, el);
}
$('#view').addEventListener('click', dispatch);
$('#sheet').addEventListener('click', dispatch);

/* ================= Accueil ================= */

function needsBackupReminder() {
  const last = state.settings.lastBackupAt;
  const age = last ? (Date.now() - last) / 86400000 : (Date.now() - new Date(state.startDate).getTime()) / 86400000;
  return age > (last ? 30 : 3);
}

function viewAccueil() {
  const d = M.dashboard(state, T());
  let h = '';
  if (d.overdue) {
    h += `<div class="banner warn"><span>Ta paie était attendue vers le <b>${labelDay(d.nextPaie)}</b> : enregistre-la dès qu'elle arrive sur ton compte.</span><button class="btn btn-primary" data-act="paie">Ma paie est arrivée</button></div>`;
  }
  const toConfirm = d.passed.find(o => M.isEstimated(o.charge, o.month));
  if (toConfirm) {
    h += `<div class="banner info"><span>${esc(toConfirm.charge.label)} a été prélevé le ${labelDay(toConfirm.date)} : indique le montant réel (estimé à ${eur(toConfirm.amount)}).</span><button class="btn btn-secondary" data-act="chgreal" data-id="${toConfirm.charge.id}" data-m="${toConfirm.month}">Saisir</button></div>`;
  }
  if (needsBackupReminder()) {
    h += `<div class="banner info"><span>💾 Pense à sauvegarder tes données (utile en cas de changement de téléphone).</span><button class="btn btn-secondary" data-act="backup">Sauvegarder</button></div>`;
  }
  const sub = d.overdue ? 'en attendant ta paie' : `${plural(d.daysLeft, 'jour')} avant la paie<br>(estimée au ${labelDay(d.nextPaie)})`;
  h += `<div class="hero">
    <div class="hero-card main"><p class="lbl">Reste à dépenser</p><p class="big">${bigEur(d.resteADepenser)}</p><p class="sub">${sub}</p></div>
    <div class="hero-card"><p class="lbl">Sur le compte</p><p class="big ${d.solde < 0 ? 'neg' : ''}">${bigEur(d.solde)}</p><p class="sub">estimé aujourd'hui</p><button class="link" data-act="recaler">Recaler avec ma banque</button></div>
  </div>`;
  h += `<div class="card summary">
    <div class="row"><span>Sur le compte aujourd'hui</span><b>${eur(d.solde)}</b></div>
    <div class="row"><span>− Prélèvements à venir d'ici la paie</span><b class="neg">−${eur(d.aVenir)}</b></div>
    <div class="row"><span>− Reste à dépenser (enveloppes)</span><b class="neg">−${eur(d.resteADepenser)}</b></div>
    <div class="row"><span><b style="font-family:inherit">= Il te restera avant la paie</b></span><b class="${d.nonAffecte < 0 ? 'neg' : 'pos'}" style="font-size:16px">${eur(d.nonAffecte)}</b></div>
    <p class="small muted" style="margin:6px 0 0">Si tu dépenses tout le budget de tes enveloppes. Cet argent peut aller vers l'épargne ou un projet.</p>
  </div>`;
  if (d.nonAffecte < 0) {
    h += `<div class="banner alert"><span>Tes enveloppes dépassent de <b>${eur(-d.nonAffecte)}</b> ce qui restera sur ton compte. Réduis un budget, ou recale ton solde s'il n'est plus juste.</span></div>`;
  }

  h += `<p class="section-title">Enveloppes · depuis la paie du ${labelDay(d.cycle.start)}${d.overdue ? '' : '<button class="link" data-act="paie">Ma paie est arrivée</button>'}</p><div class="section stack">`;
  for (const e of d.envs) h += envelopeCard(e, d.daysLeft);
  h += '</div>';

  const recent = M.expensesIn(state, d.cycle.start, null).sort(M.byDate).reverse().slice(0, 5);
  h += `<p class="section-title">Dernières dépenses${recent.length ? '<button class="link" data-act="go" data-id="journal">Tout voir</button>' : ''}</p>`;
  h += `<div class="section"><div class="card list" style="padding:2px 14px">${recent.length ? recent.map(expenseItem).join('') : '<p class="empty">Aucune dépense depuis la paie. Touche + pour en ajouter une.</p>'}</div></div>`;

  if (d.upcoming.length) {
    h += `<p class="section-title">Prochains prélèvements<button class="link" data-act="go" data-id="prelevements">Tout voir</button></p>`;
    h += `<div class="section"><div class="card list" style="padding:2px 14px">${d.upcoming.slice(0, 5).map(o => `
      <div class="item" data-act="charge" data-id="${o.charge.id}"><div class="ico">${o.charge.kind === 'epargne' ? '◎' : (famById(o.charge.familyId) || {}).icon || '↧'}</div>
      <div class="main"><p class="t">${esc(o.charge.label)}</p><p class="s">le ${labelDay(o.date)}${M.isEstimated(o.charge, o.month) ? ' · estimé' : ''}</p></div><span class="amt">${M.isEstimated(o.charge, o.month) ? '≈ ' : ''}−${eur(o.amount)}</span></div>`).join('')}</div></div>`;
  }

  const fc = M.forecast(state, T(), 6);
  h += `<p class="section-title">Les prochains mois</p><div class="section"><details class="card fold"><summary><b>Voir les prévisions</b> <span class="muted small">· salaire prévu − prélèvements − enveloppes</span></summary>
    <table class="fc" style="margin-top:10px"><thead><tr><th>Paie de</th><th>Salaire</th><th>Prélèv.</th><th>Enveloppes</th><th>Reste</th></tr></thead><tbody>
    ${fc.map(r => `<tr><td>${MOIS_COURT[Number(r.month.slice(5)) - 1]} ${r.month.slice(2, 4)}${r.salary.extras.length ? ' ✦' : ''}</td><td>${fmt(r.salary.total)}</td><td>−${fmt(r.fixes + r.epargne)}</td><td>−${fmt(r.enveloppes)}</td><td class="${r.reste < 0 ? 'neg' : 'pos'}">${fmt(r.reste)}</td></tr>`).join('')}
    </tbody></table>
    <p class="hint small muted" style="margin:8px 0 0">✦ mois avec un extra prévu (prime, 13ᵉ mois…). Le reste peut aller vers l'épargne ou tes projets. Les montants se règlent dans ⚙ Réglages.</p></details></div>`;
  return h;
}

function envelopeCard(e, daysLeft) {
  const pct = e.budget > 0 ? Math.max(0, e.left) / e.budget : 0;
  const cls = pct > 0.4 ? '' : pct > 0.15 ? 'mid' : 'low';
  const perDay = e.left > 0 && daysLeft > 0 ? e.left / daysLeft : null;
  const carry = e.carry ? ` · report ${signed(e.carry)}` : '';
  return `<div class="card env" data-act="envelope" data-id="${e.env}">
    <div class="env-top"><p class="env-name">${envName(e.env)}</p><span class="env-left ${e.left < 0 ? 'neg' : ''}">${eur(e.left)}</span></div>
    <div class="track"><div class="fill ${cls}" style="width:${Math.round(pct * 100)}%"></div></div>
    <div class="env-meta"><span>${eur(e.spent)} dépensés sur ${eur(e.budget)}${carry}</span><span>${perDay ? '≈ ' + eur(perDay) + '/jour' : e.left < 0 ? 'Dépassé' : ''}</span></div>
  </div>`;
}

function expenseItem(e) {
  const cat = catById(e.categoryId);
  const fam = cat && famById(cat.familyId);
  const where = e.envelope === 'projet' ? `Projet ${esc((projById(e.projectId) || {}).name || '')}` : envName(e.envelope);
  return `<div class="item" data-act="expense" data-id="${e.id}"><div class="ico">${fam ? fam.icon : '✳️'}</div>
    <div class="main"><p class="t">${esc(e.label || (cat ? cat.name : 'Dépense'))}</p><p class="s">${cat ? esc(cat.name) + ' · ' : ''}${where} · ${labelDay(e.date)}</p></div>
    <span class="amt neg">−${eur(e.amount)}</span></div>`;
}

ACTIONS.go = id => go(id);
ACTIONS.paie = () => sheetPaie(null);
ACTIONS.recaler = () => sheetRecaler(null);
ACTIONS.backup = () => sheetBackup();
ACTIONS.envelope = env => sheetEnvelope(env);
ACTIONS.expense = id => sheetExpense(state.expenses.find(e => e.id === id));

/* ================= Journal ================= */

function cycleLabel(c) {
  return c.end ? `Du ${labelDay(c.start)} au ${labelDay(c.end, true)}` : `Depuis le ${labelDay(c.start, true)}`;
}

function viewJournal() {
  const cs = M.cycles(state);
  const cur = M.currentCycle(state, T());
  const idx = journalIndex ?? cur.index;
  const c = cs[idx];
  const to = c.end || '9999-12-31';
  const inC = x => x.date >= c.start && x.date <= to;
  const occEnd = c.end && c.end < T() ? c.end : T();
  const entries = [];
  const f = journalFilter;
  if (f === 'tout' || f === 'depenses') for (const e of state.expenses.filter(inC)) entries.push({ date: e.date, createdAt: e.createdAt, html: expenseItem(e) });
  if (f === 'tout' || f === 'revenus') {
    for (const p of state.paies.filter(inC)) entries.push({ date: p.date, createdAt: p.createdAt, html: `<div class="item" data-act="editpaie" data-id="${p.id}"><div class="ico">💶</div><div class="main"><p class="t">Paie</p><p class="s">${esc(p.note || 'Salaire')} · ${labelDay(p.date)}</p></div><span class="amt pos">+${eur(p.amount)}</span></div>` });
    for (const i of state.incomes.filter(inC)) entries.push({ date: i.date, createdAt: i.createdAt, html: `<div class="item" data-act="income" data-id="${i.id}"><div class="ico">↥</div><div class="main"><p class="t">${esc(i.label)}</p><p class="s">Revenu · ${labelDay(i.date)}</p></div><span class="amt pos">+${eur(i.amount)}</span></div>` });
  }
  if (f === 'tout' || f === 'epargne') {
    for (const m of state.movements.filter(inC)) entries.push({ date: m.date, createdAt: m.createdAt, html: movementItem(m) });
  }
  if (f === 'tout' || f === 'prelevements') {
    for (const o of M.chargeOccurrences(state, c.start, occEnd)) {
      entries.push({ date: o.date, createdAt: 0, html: `<div class="item" data-act="charge" data-id="${o.charge.id}"><div class="ico">${o.charge.kind === 'epargne' ? '◎' : (famById(o.charge.familyId) || {}).icon || '↧'}</div><div class="main"><p class="t">${esc(o.charge.label)}</p><p class="s">Prélèvement${o.charge.kind === 'epargne' ? ' vers ' + esc((accById(o.charge.accountId) || {}).name || 'livret') : ''} · ${labelDay(o.date)}</p></div><span class="amt">${M.isEstimated(o.charge, o.month) ? '≈ ' : ''}−${eur(o.amount)}</span></div>` });
    }
  }
  entries.sort(M.byDate).reverse();

  const spent = M.expensesIn(state, c.start, c.end).reduce((s, e) => s + e.amount, 0);
  const chg = M.chargeOccurrences(state, c.start, occEnd).reduce((s, o) => s + o.amount, 0);
  const inc = state.paies.filter(inC).concat(state.incomes.filter(inC)).reduce((s, x) => s + x.amount, 0);

  let h = `<div class="pager"><button data-act="jprev" ${idx === 0 ? 'disabled' : ''} aria-label="Cycle précédent">‹</button>
    <div class="lab"><b>${idx === cur.index ? 'Cycle en cours' : 'Cycle de paie'}</b><span>${cycleLabel(c)}</span></div>
    <button data-act="jnext" ${idx >= cs.length - 1 ? 'disabled' : ''} aria-label="Cycle suivant">›</button></div>`;
  h += `<div class="section" style="margin-top:12px"><div class="card split">
    <div><b class="pos">+${fmt(inc)}</b><span>Entrées</span></div><div><b class="neg">−${fmt(spent)}</b><span>Dépenses</span></div><div><b>−${fmt(chg)}</b><span>Prélèvements</span></div></div></div>`;
  if (c.end) h += closureSummary(c);
  h += `<div class="chips">${[['tout', 'Tout'], ['depenses', 'Dépenses'], ['revenus', 'Revenus'], ['epargne', 'Épargne'], ['prelevements', 'Prélèvements']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-act="jfilter" data-id="${k}">${l}</button>`).join('')}</div>`;
  h += `<p class="section-title">Opérations<span><button class="link" data-act="income">+ Revenu</button></span></p>`;
  if (!entries.length) return h + '<div class="section"><p class="empty">Rien pour ce cycle.</p></div>';
  let lastDate = null;
  h += '<div class="section"><div class="list">';
  for (const e of entries) {
    if (e.date !== lastDate) { h += `<div class="day-head">${labelDayLong(e.date)}</div>`; lastDate = e.date; }
    h += e.html;
  }
  return h + '</div></div>';
}

function movementItem(m) {
  const acc = accById(m.accountId);
  const proj = m.projectId && projById(m.projectId);
  const vers = m.direction === 'vers';
  return `<div class="item" data-act="movement" data-id="${m.id}"><div class="ico">◎</div>
    <div class="main"><p class="t">${esc(m.label || (vers ? 'Vers ' : 'Depuis ') + (acc ? acc.name : 'livret'))}</p>
    <p class="s">${vers ? 'Vers' : 'Depuis'} ${esc(acc ? acc.name : 'livret')}${proj ? ' · ' + esc(proj.name) : ''} · ${labelDay(m.date)}</p></div>
    <span class="amt ${vers ? '' : 'pos'}">${vers ? '−' : '+'}${eur(m.amount)}</span></div>`;
}

const CLOSURE_LABEL = { report: 'reporté', livret: 'mis sur le livret', compte: 'laissé sur le compte' };
function closureSummary(c) {
  const parts = A.leftovers(state, c).map(({ env, left }) => {
    const info = ((state.cycles[c.id] || {}).closure || {})[env] || { action: 'report' };
    const acc = info.accountId && accById(info.accountId);
    const act = left === 0 ? 'soldé' : left < 0 && info.action === 'report' ? 'déduit du cycle suivant' : info.action === 'livret' && acc ? 'mis sur ' + esc(acc.name) : CLOSURE_LABEL[info.action];
    return `<div class="row"><span>${envName(env)} : <b class="${left < 0 ? 'neg' : ''}">${signed(left)}</b></span><span class="muted">${act}</span></div>`;
  }).join('');
  return `<div class="section" style="margin-top:10px"><div class="card summary" style="margin:0">
    <div class="row"><b style="font-family:inherit">Reste en fin de cycle</b><button class="link" data-act="closure" data-id="${c.id}">Modifier</button></div>${parts}</div></div>`;
}

ACTIONS.jprev = () => { const cur = M.currentCycle(state, T()); journalIndex = Math.max(0, (journalIndex ?? cur.index) - 1); render(); };
ACTIONS.jnext = () => { const cur = M.currentCycle(state, T()); journalIndex = Math.min(M.cycles(state).length - 1, (journalIndex ?? cur.index) + 1); render(); };
ACTIONS.jfilter = k => { journalFilter = k; render(); };
ACTIONS.editpaie = id => sheetPaie(state.paies.find(p => p.id === id));
ACTIONS.income = id => sheetIncome(id ? state.incomes.find(i => i.id === id) : null);
ACTIONS.movement = id => sheetMovement(state.movements.find(m => m.id === id));
ACTIONS.closure = id => sheetClosure(M.cycles(state).find(c => c.id === id), false);

/* ================= Analyse ================= */

function analysePeriod() {
  const cs = M.cycles(state);
  const cur = M.currentCycle(state, T());
  const t = T();
  switch (anaPeriod) {
    case 'prev': {
      const p = cs[cur.index - 1];
      return p ? { from: p.start, to: p.end, label: cycleLabel(p) } : { from: cur.start, to: t, label: cycleLabel(cur) };
    }
    case '3c': { const p = cs[Math.max(0, cur.index - 2)]; return { from: p.start, to: t, label: `Depuis le ${labelDay(p.start, true)}` }; }
    case '12m': { const from = addMonthsYM(ym(t), -11) + '-01'; return { from, to: t, label: `Depuis le ${labelDay(from, true)}` }; }
    default: return { from: cur.start, to: t, label: cycleLabel(cur) };
  }
}

function viewAnalyse() {
  const p = analysePeriod();
  const data = M.spendingByFamily(state, p.from, p.to, anaCharges);
  const total = data.reduce((s, f) => s + f.total, 0);
  const max = data.length ? data[0].total : 0;
  const exps = M.expensesIn(state, p.from, p.to);
  const byEnv = env => exps.filter(e => e.envelope === env).reduce((s, e) => s + e.amount, 0);
  let h = `<div class="chips">${[['cycle', 'Ce cycle'], ['prev', 'Cycle précédent'], ['3c', '3 derniers cycles'], ['12m', '12 mois']].map(([k, l]) => `<button class="chip ${anaPeriod === k ? 'on' : ''}" data-act="aperiod" data-id="${k}">${l}</button>`).join('')}</div>`;
  h += `<div class="section" style="margin-top:12px"><label class="check"><input type="checkbox" data-act="acharges" ${anaCharges ? 'checked' : ''}> Inclure les prélèvements (abonnements, assurances, crédits…)</label></div>`;
  h += `<div class="section"><div class="card"><p class="muted small" style="margin:0">${p.label}</p>
    <p style="font-family:var(--serif);font-size:28px;font-weight:700;margin:4px 0 12px">${eur(total)}</p>
    <div class="split"><div><b>${fmt(byEnv('quotidien'))}</b><span>Quotidien</span></div><div><b>${fmt(byEnv('plaisirs'))}</b><span>Plaisirs</span></div><div><b>${fmt(byEnv('projet'))}</b><span>Projets</span></div></div></div></div>`;
  h += `<p class="section-title">Par famille · du plus cher au moins cher</p>`;
  if (!data.length) return h + '<div class="section"><p class="empty">Aucune dépense sur cette période.</p></div>';
  h += '<div class="section"><div class="card bars">';
  for (const f of data) {
    const fam = famById(f.familyId) || { name: 'Divers', icon: '✳️' };
    const open = anaOpen.has(f.familyId);
    const share = total > 0 ? Math.round((f.total / total) * 100) : 0;
    h += `<div class="bar-row" data-act="afam" data-id="${f.familyId}" aria-expanded="${open}">
      <div class="bar-head"><span class="n">${fam.icon} ${esc(fam.name)}</span><span class="num">${eur(f.total)} <span class="muted small">${share} %</span></span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${max ? (f.total / max) * 100 : 0}%"></div></div></div>`;
    if (open) h += `<div class="bar-sub">${f.items.map(i => `<div class="r"><span>${esc(i.label)}</span><span class="num">${eur(i.total)}</span></div>`).join('')}</div>`;
  }
  return h + '</div><p class="muted small" style="margin:8px 2px">Touche une famille pour voir le détail par catégorie.</p></div>';
}

ACTIONS.aperiod = k => { anaPeriod = k; render(); };
ACTIONS.acharges = (_, el) => { anaCharges = !anaCharges; render(); };
ACTIONS.afam = id => { anaOpen.has(id) ? anaOpen.delete(id) : anaOpen.add(id); render(); };

/* ================= Prélèvements ================= */

function chargeWindow() {
  const d = M.dashboard(state, T());
  const end = d.overdue ? `${ym(T())}-${String(daysInMonth(ym(T()))).padStart(2, '0')}` : addDays(d.nextPaie, -1);
  return { from: d.cycle.start, to: end, d };
}

function chargeStatus(c, win) {
  const occ = M.chargeOccurrences(state, win.from, win.to, x => x.id === c.id)[0];
  if (occ) {
    const inst = c.installment ? ` · échéance ${M.chargeOccurrences(state, c.start + '-01', occ.date, x => x.id === c.id).length}/${c.installment.count}` : '';
    const est = M.isEstimated(c, occ.month);
    const ask = est && occ.date <= T() ? ` · <button class="link" data-act="chgreal" data-id="${c.id}" data-m="${occ.month}">montant réel ?</button>` : est ? ' · estimé' : '';
    return occ.date <= T()
      ? { amount: occ.amount, est, text: `<span class="badge ok">✓ prélevé</span> le ${labelDay(occ.date)}${inst}${ask}` }
      : { amount: occ.amount, est, text: `<span class="badge gold">à venir</span> le ${labelDay(occ.date)}${inst}${ask}` };
  }
  const m = ym(win.to);
  const reason = M.chargeSkipReason(c, m) || M.chargeSkipReason(c, ym(win.from));
  const next = M.chargeOccurrences(state, addDays(win.to, 1), addDays(win.to, 400), x => x.id === c.id)[0];
  const txt = { saute: 'Sauté ce mois-ci', 'pas-commence': `Commence en ${labelMonth(c.start)}`, termine: 'Terminé' }[reason]
    || (next ? `Prochain le ${labelDay(next.date)}, après la paie` : `Le ${c.day || 1} du mois`);
  return { amount: next ? next.amount : 0, est: next ? M.isEstimated(c, next.month) : false, text: `<span class="badge">${txt}</span>`, dim: true };
}

function viewPrelevements() {
  const win = chargeWindow();
  const occ = M.chargeOccurrences(state, win.from, win.to);
  const deja = occ.filter(o => o.date <= T()).reduce((s, o) => s + o.amount, 0);
  const reste = occ.filter(o => o.date > T()).reduce((s, o) => s + o.amount, 0);
  const m = ym(T());
  const shownMonth = ym(win.to);
  const active = state.charges.filter(c => { const e = M.chargeEndYM(c); return !e || e >= m; }).sort((a, b) => (a.day || 1) - (b.day || 1));
  const ended = state.charges.filter(c => { const e = M.chargeEndYM(c); return e && e < m; });
  const monthly = active.reduce((s, c) => s + M.chargeAmountForMonth(c, shownMonth), 0);

  let h = `<div class="section" style="margin-top:14px"><div class="card summary" style="margin:0">
    <div class="row"><span>Total mensuel (${MOIS[Number(shownMonth.slice(5)) - 1]})</span><b>${eur(monthly)}</b></div>
    <div class="row"><span>Déjà prélevé depuis la paie</span><b>${eur(deja)}</b></div>
    <div class="row"><span>Reste à venir d'ici la paie</span><b class="neg">${eur(reste)}</b></div></div></div>`;
  h += `<p class="section-title">Mes prélèvements<button class="link" data-act="charge">+ Ajouter</button></p>`;
  if (!active.length) {
    h += `<div class="section"><div class="card"><p class="empty">Aucun prélèvement pour l'instant.<br>Ajoute tes abonnements, assurances, crédits, virements automatiques vers tes livrets…</p><button class="btn btn-primary" data-act="charge">Ajouter un prélèvement</button></div></div>`;
  } else {
    h += '<div class="section"><div class="card list" style="padding:2px 14px">';
    for (const c of active) {
      const st = chargeStatus(c, win);
      const fam = famById(c.familyId);
      const kind = c.kind === 'epargne' ? `Épargne → ${esc((accById(c.accountId) || {}).name || 'livret')}` : fam ? esc(fam.name) : 'Charge';
      h += `<div class="item ${st.dim ? 'dim' : ''}" data-act="charge" data-id="${c.id}">
        <div class="ico">${c.kind === 'epargne' ? '◎' : fam ? fam.icon : '↧'}</div>
        <div class="main"><p class="t">${esc(c.label)}${c.installment ? '<span class="badge gold">' + c.installment.count + '×</span>' : ''}${c.variable ? '<span class="badge">variable</span>' : ''}</p><p class="s">${kind} · ${st.text}</p></div>
        <span class="amt ${c.kind === 'epargne' ? 'pos' : ''}">${st.est ? '≈ ' : ''}${eur(st.amount)}</span></div>`;
    }
    h += '</div></div>';
  }
  if (ended.length) {
    h += `<div class="section" style="margin-top:14px"><details class="card fold"><summary class="muted">Terminés (${ended.length})</summary><div class="list" style="margin-top:6px">
      ${ended.map(c => `<div class="item dim" data-act="charge" data-id="${c.id}"><div class="ico">↧</div><div class="main"><p class="t">${esc(c.label)}</p><p class="s">Dernier prélèvement : ${labelMonth(M.chargeEndYM(c))}</p></div></div>`).join('')}</div></details></div>`;
  }
  return h;
}

ACTIONS.charge = id => sheetCharge(id ? state.charges.find(c => c.id === id) : null);

/* ================= Épargne ================= */

function viewEpargne() {
  const t = T();
  const total = state.accounts.reduce((s, a) => s + M.savingsBalance(state, a.id, t), 0);
  let h = `<div class="section" style="margin-top:14px"><div class="card"><p class="muted small" style="margin:0">Total de mes livrets</p><p style="font-family:var(--serif);font-size:30px;font-weight:700;margin:4px 0 0">${bigEur(total)}</p></div></div>`;
  h += `<p class="section-title">Livrets<button class="link" data-act="account">+ Ajouter</button></p><div class="section stack">`;
  if (!state.accounts.length) h += '<div class="card"><p class="empty">Ajoute tes livrets pour suivre leur solde.</p></div>';
  for (const a of state.accounts) {
    const bal = M.savingsBalance(state, a.id, t);
    const res = M.reservedOnAccount(state, a.id);
    h += `<div class="card"><div class="env-top" data-act="account" data-id="${a.id}" style="cursor:pointer"><p class="env-name">${esc(a.name)}</p><span class="env-left">${eur(bal)}</span></div>
      ${res ? `<p class="small muted" style="margin:4px 0 0">dont ${eur(res)} réservés aux projets · ${eur(bal - res)} libres</p>` : ''}
      <div class="btns" style="margin-top:10px"><button class="btn btn-secondary" data-act="newmove" data-id="${a.id}">Mouvement</button><button class="btn btn-secondary" data-act="recalerlivret" data-id="${a.id}">Recaler le solde</button></div></div>`;
  }
  h += '</div>';

  const active = state.projects.filter(p => p.status !== 'clos');
  const closed = state.projects.filter(p => p.status === 'clos');
  const sts = active.map(p => ({ p, st: M.projectStatus(state, p, t) }));
  const toSave = sts.reduce((s, x) => s + (x.st.perPaie || 0), 0);
  h += `<p class="section-title">Projets<button class="link" data-act="project">+ Ajouter</button></p>`;
  if (active.length) h += `<div class="section" style="margin-bottom:8px"><div class="card summary" style="margin:0"><div class="row"><span>À mettre de côté à chaque paie (indicatif)</span><b>${eur(toSave)}</b></div></div></div>`;
  h += '<div class="section stack">';
  if (!active.length) h += `<div class="card"><p class="empty">Un projet, c'est un montant à atteindre : Noël, anniversaires, entretien de la voiture, mariage…</p><button class="btn btn-primary" data-act="project">Créer un projet</button></div>`;
  for (const { p, st } of sts) h += projectCard(p, st);
  h += '</div>';
  if (closed.length) {
    h += `<div class="section" style="margin-top:14px"><details class="card fold"><summary class="muted">Projets clôturés (${closed.length})</summary><div class="list" style="margin-top:6px">
      ${closed.map(p => `<div class="item dim" data-act="project" data-id="${p.id}"><div class="main"><p class="t">${esc(p.name)}</p><p class="s">Objectif ${eur(p.target)}</p></div></div>`).join('')}</div></details></div>`;
  }
  return h;
}

function projectCard(p, st) {
  const acc = accById(p.accountId);
  let need;
  if (st.reached) need = `<p class="need ok">✓ Objectif atteint</p>`;
  else if (st.overdue) need = `<p class="need bad">Échéance passée · il manquait ${eur(st.remaining)}</p>`;
  else if (st.perPaie != null) need = `<p class="need">≈ ${eur(st.perPaie)} à mettre de côté à chaque paie</p>`;
  else need = `<p class="need" style="color:var(--ink-soft)">Sans échéance · il reste ${eur(st.remaining)}</p>`;
  const color = st.reached ? '' : st.overdue ? 'low' : 'mid';
  const renew = p.yearly && p.due && p.due < T();
  return `<div class="card goal">
    <div class="top" data-act="project" data-id="${p.id}"><div><p class="name">${esc(p.name)}${p.yearly ? '<span class="badge ok">chaque année</span>' : ''}</p>
      <p class="due">${p.due ? 'Pour le ' + labelDayLong(p.due) : 'Sans échéance'}${acc ? ' · ' + esc(acc.name) : ''}</p></div>
      <div style="text-align:right"><div class="num" style="font-weight:600">${eur(st.saved)}</div><div class="small muted num">sur ${eur(p.target)}</div></div></div>
    <div class="track"><div class="fill ${color}" style="width:${Math.round(st.pct * 100)}%"></div></div>
    ${need}
    <div class="btns">${renew ? `<button class="btn btn-primary" data-act="renew" data-id="${p.id}">↻ Renouveler</button>` : ''}<button class="btn btn-secondary" data-act="contrib" data-id="${p.id}">Mettre de côté</button><button class="btn btn-secondary" data-act="useproj" data-id="${p.id}" ${st.saved > 0 ? '' : 'disabled'}>Utiliser</button></div>
  </div>`;
}

ACTIONS.account = id => sheetAccount(id ? accById(id) : null);
ACTIONS.newmove = id => sheetMovement(null, { accountId: id });
ACTIONS.recalerlivret = id => sheetRecaler(id);
ACTIONS.project = id => sheetProject(id ? projById(id) : null);
ACTIONS.contrib = id => sheetContrib(projById(id));
ACTIONS.useproj = id => sheetUseProject(projById(id));
ACTIONS.renew = id => { A.renewProject(projById(id)); commit(); toast('Projet renouvelé pour l’année prochaine.'); };

/* ================= Réglages ================= */

function viewReglages() {
  const t = T();
  const cur = M.currentCycle(state, t);
  const sal = M.entryAt(state.settings.salaryHistory, ym(t), true);
  const env = M.entryAt(state.settings.envelopeHistory, cur.start, true) || {};
  const last = state.settings.lastBackupAt;
  let h = `<p class="section-title">Paie</p><div class="section"><div class="card">
    <form id="salaryForm">
      <div class="row2"><div class="field"><label>Salaire de base (net)</label><input name="amount" inputmode="decimal" value="${amountValue(sal ? sal.amount : '')}"></div>
      <div class="field"><label>À partir de la paie de</label><input type="month" name="from" value="${ym(t)}"></div></div>
      <p class="hint small muted" style="margin:-6px 0 12px">Pour une augmentation, indique le mois de la première paie concernée : les mois passés ne changent pas.</p>
      <button class="btn btn-secondary">Enregistrer le salaire</button>
    </form>
    ${state.settings.salaryHistory.length > 1 ? `<div class="list" style="margin-top:8px">${[...state.settings.salaryHistory].reverse().map(x => `<div class="item" style="cursor:default"><div class="main"><p class="s">Depuis ${labelMonth(x.from)}</p></div><span class="amt">${eur(x.amount)}</span></div>`).join('')}</div>` : ''}
    <div class="field" style="margin-top:16px"><label>Jour estimé de la paie</label><input type="number" id="payDay" min="1" max="31" value="${state.settings.paydayEstimateDay}">
    <p class="hint">Indique le jour où ta paie arrive au plus tard (par exemple le 30 si elle tombe entre le 25 et le 30). Par prudence, les prélèvements d'avant ce jour sont comptés avant la paie. Le vrai cycle commence le jour où tu enregistres ta paie.</p></div>
  </div></div>`;

  h += `<p class="section-title">Extras prévus sur la paie<button class="link" data-act="extra">+ Ajouter</button></p><div class="section"><div class="card">
    <p class="small muted" style="margin:0 0 6px">Prime de participation, 13ᵉ mois, paiement de jours CET ou CCF… Ils servent aux prévisions et pré-remplissent le montant de la paie.</p>
    <div class="list">${state.extras.length ? state.extras.map(x => `<div class="item" data-act="extra" data-id="${x.id}"><div class="main"><p class="t">${esc(x.label)}</p><p class="s">${x.yearly ? 'Chaque année en ' + MOIS[x.month - 1] : labelMonth(`${x.year}-${String(x.month).padStart(2, '0')}`)}</p></div><span class="amt pos">+${eur(x.amount)}</span></div>`).join('') : '<p class="empty">Aucun extra prévu.</p>'}</div>
  </div></div>`;

  h += `<p class="section-title">Budget des enveloppes</p><div class="section"><div class="card"><form id="envForm">
    <div class="row2"><div class="field"><label>Quotidien</label><input name="quotidien" inputmode="decimal" value="${amountValue(env.quotidien)}"></div>
    <div class="field"><label>Plaisirs</label><input name="plaisirs" inputmode="decimal" value="${amountValue(env.plaisirs)}"></div></div>
    <p class="hint small muted" style="margin:-6px 0 12px">Montant par cycle de paie. S'applique à partir du cycle en cours (paie du ${labelDay(cur.start)}). Pour un seul cycle différent, touche l'enveloppe depuis l'accueil.</p>
    <button class="btn btn-secondary">Enregistrer les montants</button></form></div></div>`;

  h += `<p class="section-title">Catégories de dépenses<span><button class="link" data-act="family">+ Famille</button> · <button class="link" data-act="category">+ Catégorie</button></span></p><div class="section"><div class="card">`;
  for (const f of sortedFamilies()) {
    const cats = catsOf(f.id);
    h += `<div class="bar-row" style="cursor:default;padding:6px 0"><div class="bar-head"><span class="n">${f.icon} ${esc(f.name)}</span><button class="link" data-act="family" data-id="${f.id}">Modifier</button></div>
      <div class="chips" style="padding:6px 0 0">${cats.map(c => `<button class="chip" data-act="category" data-id="${c.id}">${esc(c.name)} <span class="muted small">· ${envName(c.envelope)}</span></button>`).join('') || '<span class="small muted">Aucune catégorie (utilisée pour les prélèvements)</span>'}</div></div>`;
  }
  h += '</div></div>';

  h += `<p class="section-title">Sauvegarde</p><div class="section"><div class="card">
    <p style="margin:0 0 10px">Dernière sauvegarde : <b>${last ? labelDayLong(todayISO(new Date(last))) : 'jamais'}</b></p>
    <div class="btns"><button class="btn btn-primary" data-act="backup">Sauvegarder</button><button class="btn btn-secondary" data-act="restore">Restaurer</button></div>
    <input type="file" id="restoreFile" accept="application/json,.json,text/plain,.txt" class="hide">
    <details class="fold" style="margin-top:14px"><summary class="link">Changer de téléphone : comment faire ?</summary>
      <ol class="small" style="line-height:1.6;padding-left:18px;margin:8px 0 0">
        <li>Sur l'ancien téléphone : <b>Sauvegarder</b>, puis envoie-toi le fichier (Drive, e-mail, WhatsApp…).</li>
        <li>Sur le nouveau : ouvre l'adresse de l'appli dans Chrome et installe-la (menu ⋮ → <i>Installer l'application</i>).</li>
        <li>Réglages → <b>Restaurer</b>, et choisis le fichier. Tout est revenu.</li>
      </ol></details>
  </div></div>`;

  h += `<p class="section-title">Application</p><div class="section"><div class="card">
    ${installPrompt ? '<button class="btn btn-primary" data-act="install" style="margin-bottom:10px">Installer sur l’écran d’accueil</button>' : ''}
    <p class="small muted" style="margin:0 0 12px">Version ${APP_VERSION} · données enregistrées uniquement sur cet appareil.</p>
    <button class="btn btn-danger" data-act="reset">Tout effacer et recommencer</button></div></div>`;
  return h;
}

function mountReglages(root) {
  bindForm(root.querySelector('#salaryForm').parentElement, form => {
    const amount = parseAmount(fv(form, 'amount'));
    need(amount > 0, 'Indique un montant.');
    A.setBaseSalary(state, fv(form, 'from') || ym(T()), amount);
    commit(); toast('Salaire enregistré.');
  });
  bindForm(root.querySelector('#envForm').parentElement, form => {
    const q = parseAmount(fv(form, 'quotidien')), p = parseAmount(fv(form, 'plaisirs'));
    need(q != null && q >= 0 && p != null && p >= 0, 'Indique les deux montants.');
    A.setEnvelopeDefaults(state, M.currentCycle(state, T()).start, { quotidien: q, plaisirs: p });
    commit(); toast('Budget des enveloppes enregistré.');
  });
  root.querySelector('#payDay').onchange = e => {
    const v = parseInt(e.target.value, 10);
    if (v >= 1 && v <= 31) { state.settings.paydayEstimateDay = v; commit(); toast('Jour de paie enregistré.'); }
  };
  root.querySelector('#restoreFile').onchange = e => restoreFromFile(e.target.files[0]);
}

ACTIONS.extra = id => sheetExtra(id ? state.extras.find(x => x.id === id) : null);
ACTIONS.family = id => sheetFamily(id ? famById(id) : null);
ACTIONS.category = id => sheetCategory(id ? catById(id) : null);
ACTIONS.restore = () => { const i = document.getElementById('restoreFile') || document.getElementById('wizRestore'); i.value = ''; i.click(); };
ACTIONS.install = async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; render(); };
ACTIONS.reset = () => {
  if (!confirm('Effacer toutes les données de cet appareil ? Pense à sauvegarder avant.')) return;
  if (!confirm('Dernière confirmation : tout effacer ?')) return;
  S.clear(); state = null; view = 'accueil'; render();
};

/* ================= Feuilles : dépenses, revenus, paie ================= */

function categoryChips(selected) {
  const since = addDays(T(), -90);
  const counts = new Map();
  for (const e of state.expenses) if (e.date >= since && e.categoryId) counts.set(e.categoryId, (counts.get(e.categoryId) || 0) + 1);
  const frequent = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => catById(id)).filter(Boolean);
  const chip = c => `<button type="button" class="chip ${c.id === selected ? 'on' : ''}" data-cat="${c.id}">${esc(c.name)}</button>`;
  let h = '<div class="cat-grid">';
  if (frequent.length) h += `<p class="fam">Fréquentes</p><div class="chips">${frequent.map(chip).join('')}</div>`;
  for (const f of sortedFamilies()) {
    const cats = catsOf(f.id);
    if (cats.length) h += `<p class="fam">${f.icon} ${esc(f.name)}</p><div class="chips">${cats.map(chip).join('')}</div>`;
  }
  return h + '</div>';
}

function sheetExpense(e) {
  const isNew = !e;
  const data = e || { amount: null, label: '', categoryId: null, envelope: 'quotidien', projectId: null, date: T() };
  const projects = state.projects.filter(p => p.status !== 'clos' || p.id === data.projectId);
  openSheet(`<form>
    ${isNew ? `<div class="seg"><label><input type="radio" name="kind" checked> Dépense</label><label data-act="switchincome"><input type="radio" name="kind"> Revenu</label><label data-act="switchmove"><input type="radio" name="kind"> Épargne</label></div>` : '<h2>Modifier la dépense</h2>'}
    <div class="field amount"><input name="amount" inputmode="decimal" placeholder="0,00 €" value="${amountValue(data.amount)}" autocomplete="off" aria-label="Montant"></div>
    <div class="field"><label>Catégorie</label>${categoryChips(data.categoryId)}<input type="hidden" name="categoryId" value="${data.categoryId || ''}"></div>
    <div class="field"><label>Enveloppe</label><div class="seg" style="margin:0">
      ${['quotidien', 'plaisirs', 'projet'].map(k => `<label><input type="radio" name="envelope" value="${k}" ${data.envelope === k ? 'checked' : ''} ${k === 'projet' && !projects.length ? 'disabled' : ''}> ${envName(k)}</label>`).join('')}</div></div>
    <div class="field ${data.envelope === 'projet' ? '' : 'hide'}" id="projField"><label>Projet</label><select name="projectId">${projects.map(p => `<option value="${p.id}" ${p.id === data.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <p class="hint">La dépense est prise sur l'argent mis de côté pour ce projet, pas sur tes enveloppes.</p></div>
    <div class="field"><label>Détail (facultatif)</label><input name="label" value="${esc(data.label)}" placeholder="Ex : Carrefour, essence…" autocomplete="off"></div>
    ${dateField('date', data.date)}
    ${buttons(isNew ? 'Ajouter' : 'Enregistrer', isNew ? '' : '<button type="button" class="btn btn-danger" data-act="delexpense" data-id="' + e.id + '">Supprimer</button>')}
  </form>`, root => {
    bindDateChips(root);
    let envTouched = !isNew;
    const form = root.querySelector('form');
    const syncProj = () => root.querySelector('#projField').classList.toggle('hide', form.elements.envelope.value !== 'projet');
    root.querySelectorAll('[data-cat]').forEach(b => {
      b.onclick = () => {
        root.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('on', x.dataset.cat === b.dataset.cat));
        form.elements.categoryId.value = b.dataset.cat;
        const cat = catById(b.dataset.cat);
        if (!envTouched && cat) { form.querySelector(`input[name="envelope"][value="${cat.envelope}"]`).checked = true; syncProj(); }
      };
    });
    form.querySelectorAll('input[name="envelope"]').forEach(r => { r.onchange = () => { envTouched = true; syncProj(); }; });
    bindForm(root, f => {
      const amount = parseAmount(fv(f, 'amount'));
      need(amount > 0, 'Indique un montant.');
      const categoryId = fv(f, 'categoryId') || null;
      need(categoryId, 'Choisis une catégorie.');
      const envelope = f.elements.envelope.value;
      const values = { amount, categoryId, envelope, projectId: envelope === 'projet' ? fv(f, 'projectId') : null, label: fv(f, 'label'), date: fv(f, 'date') || T() };
      let exp = e;
      if (exp) Object.assign(exp, values);
      else { exp = { id: A.uid(), createdAt: A.stamp(), ...values }; state.expenses.push(exp); }
      A.syncProjectExpense(state, exp);
      closeSheet(); commit(); toast(isNew ? 'Dépense ajoutée.' : 'Dépense modifiée.');
    });
    if (isNew) setTimeout(() => form.elements.amount.focus(), 60);
  });
}
ACTIONS.switchincome = () => sheetIncome(null);
ACTIONS.switchmove = () => sheetMovement(null);
ACTIONS.delexpense = id => { closeSheet(); withUndo('Dépense supprimée.', () => A.deleteExpense(state, id)); };

function sheetIncome(inc) {
  const isNew = !inc;
  const data = inc || { label: '', amount: null, date: T() };
  openSheet(`<form>
    ${isNew ? `<div class="seg"><label data-act="switchexpense"><input type="radio" name="kind"> Dépense</label><label><input type="radio" name="kind" checked> Revenu</label><label data-act="switchmove"><input type="radio" name="kind"> Épargne</label></div>` : '<h2>Modifier le revenu</h2>'}
    ${isNew ? `<button type="button" class="btn btn-secondary" data-act="paie" style="margin-bottom:14px">💶 C'est ma paie</button>` : ''}
    <div class="field amount"><input name="amount" inputmode="decimal" placeholder="0,00 €" value="${amountValue(data.amount)}" aria-label="Montant"></div>
    <div class="field"><label>Origine</label><input name="label" value="${esc(data.label)}" placeholder="Ex : remboursement Sécu, vente Vinted…"></div>
    ${dateField('date', data.date)}
    ${buttons(isNew ? 'Ajouter' : 'Enregistrer', isNew ? '' : '<button type="button" class="btn btn-danger" data-act="delincome" data-id="' + inc.id + '">Supprimer</button>')}
  </form>`, root => {
    bindDateChips(root);
    bindForm(root, f => {
      const amount = parseAmount(fv(f, 'amount'));
      need(amount > 0, 'Indique un montant.');
      need(fv(f, 'label'), "Indique l'origine.");
      const values = { amount, label: fv(f, 'label'), date: fv(f, 'date') || T() };
      if (inc) Object.assign(inc, values);
      else state.incomes.push({ id: A.uid(), createdAt: A.stamp(), ...values });
      closeSheet(); commit(); toast('Revenu enregistré.');
    });
  });
}
ACTIONS.switchexpense = () => sheetExpense(null);
ACTIONS.delincome = id => { closeSheet(); withUndo('Revenu supprimé.', () => { state.incomes = state.incomes.filter(i => i.id !== id); }); };

function sheetPaie(p) {
  const isNew = !p;
  const date = p ? p.date : T();
  const exp = M.expectedSalary(state, ym(date));
  const isFirst = p && M.cycles(state)[0].id === p.id;
  openSheet(`<form><h2>${isNew ? 'Ma paie est arrivée' : 'Modifier la paie'}</h2>
    ${isNew ? '<p class="intro">Un nouveau cycle commence : tes enveloppes repartent à zéro (avec le report éventuel).</p>' : ''}
    <div class="field amount"><input name="amount" inputmode="decimal" value="${amountValue(p ? p.amount : exp.total)}" aria-label="Montant reçu"></div>
    <p class="hint small muted" style="margin:-8px 0 14px;text-align:center">Prévu : ${eur(exp.base)} de base${exp.extras.map(x => ' + ' + esc(x.label) + ' ' + eur(x.amount)).join('')}. Corrige avec le montant exact reçu.</p>
    ${dateField('date', date, 'Arrivée sur le compte le')}
    <div class="field"><label>Note (facultatif)</label><input name="note" value="${esc(p ? p.note : exp.extras.map(x => x.label).join(', '))}" placeholder="Ex : avec 13ᵉ mois"></div>
    ${buttons(isNew ? 'Enregistrer ma paie' : 'Enregistrer', isNew || isFirst ? '' : '<button type="button" class="btn btn-danger" data-act="delpaie" data-id="' + p.id + '">Supprimer</button>')}
  </form>`, root => {
    bindDateChips(root);
    bindForm(root, f => {
      const amount = parseAmount(fv(f, 'amount'));
      need(amount > 0, 'Indique le montant reçu.');
      const d = fv(f, 'date') || T();
      need(d >= state.startDate || !isNew, 'La paie ne peut pas être antérieure au début du suivi.');
      if (p) {
        Object.assign(p, { amount, date: d, note: fv(f, 'note') });
        closeSheet(); commit(); toast('Paie modifiée.');
        return;
      }
      const cur = M.currentCycle(state, d);
      need(!cur || cur.start !== d, 'Une paie est déjà enregistrée à cette date.');
      const np = A.addPaie(state, { date: d, amount, note: fv(f, 'note') });
      S.save(state);
      const prev = A.previousCycle(state, np.id);
      if (prev && A.leftovers(state, prev).some(x => x.left !== 0)) { sheetClosure(prev, true); render(); }
      else { closeSheet(); commit(); toast('Paie enregistrée : nouveau cycle !'); }
    });
  });
}
ACTIONS.delpaie = id => { closeSheet(); withUndo('Paie supprimée.', () => A.deletePaie(state, id)); };

function sheetClosure(c, afterPaie) {
  const lefts = A.leftovers(state, c);
  const closure = (state.cycles[c.id] || {}).closure || {};
  const hasAcc = state.accounts.length > 0;
  const blocks = lefts.map(({ env, left }) => {
    const cur = closure[env] || { action: 'report' };
    if (left === 0) return `<div class="card" style="margin-bottom:10px"><b>${envName(env)}</b> · <span class="muted">tout a été dépensé, pile !</span></div>`;
    const opts = left > 0
      ? [['report', 'Reporter'], ...(hasAcc ? [['livret', 'Sur un livret']] : []), ['compte', 'Laisser']]
      : [['report', 'Déduire du prochain'], ['compte', 'Ne pas reporter']];
    return `<div class="card" style="margin-bottom:10px"><div class="env-top"><b>${envName(env)}</b><span class="env-left ${left < 0 ? 'neg' : 'pos'}">${signed(left)}</span></div>
      <div class="seg" style="margin:10px 0 0">${opts.map(([k, l]) => `<label><input type="radio" name="${env}" value="${k}" ${cur.action === k ? 'checked' : ''}> ${l}</label>`).join('')}</div>
      ${left > 0 && hasAcc ? `<div class="field ${cur.action === 'livret' ? '' : 'hide'}" data-accfor="${env}" style="margin:10px 0 0"><select name="${env}Acc">${accountOptions(cur.accountId || defaultAccountId())}</select></div>` : ''}</div>`;
  }).join('');
  openSheet(`<form><h2>${afterPaie ? 'Nouveau cycle 🎉' : 'Reste en fin de cycle'}</h2>
    <p class="intro">${afterPaie ? 'Paie enregistrée. ' : ''}Que faire de ce qui reste dans tes enveloppes du cycle ${cycleLabel(c).toLowerCase()} ?<br><b>Reporter</b> l'ajoute au budget du nouveau cycle, <b>Laisser</b> le garde simplement sur ton compte.</p>
    ${blocks}${buttons('Valider', afterPaie ? '<button type="button" class="btn btn-secondary" data-cancel>Plus tard (reporter)</button>' : '')}</form>`, root => {
    const form = root.querySelector('form');
    form.querySelectorAll('input[type="radio"]').forEach(r => {
      r.onchange = () => { const box = root.querySelector(`[data-accfor="${r.name}"]`); if (box) box.classList.toggle('hide', r.value !== 'livret'); };
    });
    form.querySelector('[data-cancel]').onclick = () => { closeSheet(); commit(); };
    bindForm(root, f => {
      const choices = {};
      for (const { env } of lefts) {
        const r = f.elements[env];
        choices[env] = r ? { action: r.value, accountId: f.elements[env + 'Acc'] ? f.elements[env + 'Acc'].value : null } : { action: 'report' };
      }
      A.setClosure(state, c, choices);
      closeSheet(); commit(); toast('C’est noté !');
    });
  });
}

function sheetEnvelope(env) {
  const cyc = M.currentCycle(state, T());
  const st = M.envelopeStatus(state, cyc, env);
  const def = M.envelopeDefault(state, cyc.start, env);
  const exps = M.expensesIn(state, cyc.start, null, e => e.envelope === env).sort(M.byDate).reverse();
  openSheet(`<form><h2>${envName(env)}</h2>
    <div class="card summary" style="margin:0 0 14px">
      <div class="row"><span>Budget du cycle</span><b>${eur(st.base)}</b></div>
      ${st.carry ? `<div class="row"><span>Report du cycle précédent</span><b class="${st.carry < 0 ? 'neg' : 'pos'}">${signed(st.carry)}</b></div>` : ''}
      <div class="row"><span>Dépensé</span><b class="neg">−${eur(st.spent)}</b></div>
      <div class="row"><span>Reste</span><b class="${st.left < 0 ? 'neg' : ''}">${eur(st.left)}</b></div></div>
    <div class="field"><label>Budget pour ce cycle seulement</label><input name="budget" inputmode="decimal" value="${amountValue(st.base)}">
      <p class="hint">Montant habituel : ${eur(def)} (modifiable dans ⚙ Réglages).</p></div>
    ${buttons('Enregistrer', st.overridden ? '<button type="button" class="btn btn-secondary" data-act="envreset" data-id="' + env + '">Montant habituel</button>' : '')}
    <p class="section-title" style="margin:20px 0 6px">Dépenses du cycle</p>
    <div class="list">${exps.length ? exps.map(expenseItem).join('') : '<p class="empty">Aucune dépense.</p>'}</div>
  </form>`, root => {
    bindForm(root, f => {
      const v = parseAmount(fv(f, 'budget'));
      need(v != null && v >= 0, 'Indique un montant.');
      A.setCycleBudget(state, cyc.id, env, v === def ? null : v);
      closeSheet(); commit(); toast('Budget du cycle modifié.');
    });
  });
}
ACTIONS.envreset = env => { A.setCycleBudget(state, M.currentCycle(state, T()).id, env, null); closeSheet(); commit(); };

function sheetRecaler(accountId) {
  const acc = accountId && accById(accountId);
  const est = acc ? M.savingsBalance(state, acc.id, T()) : M.accountBalance(state, T());
  openSheet(`<form><h2>Recaler ${acc ? esc(acc.name) : 'mon compte'}</h2>
    <p class="intro">Tape le solde affiché par ta banque aujourd'hui. L'appli repart de ce montant : tout ce qui est daté d'avant est considéré comme déjà passé.${acc ? ' Pratique pour les intérêts.' : ''}</p>
    <p class="small">Estimation actuelle : <b class="num">${eur(est)}</b></p>
    <div class="field amount"><input name="balance" inputmode="decimal" placeholder="0,00 €" aria-label="Solde réel"></div>
    <p class="small muted" id="gap" style="text-align:center;min-height:1.2em"></p>
    ${buttons('Recaler')}</form>`, root => {
    const input = root.querySelector('[name="balance"]');
    input.oninput = () => {
      const v = parseAmount(input.value);
      root.querySelector('#gap').textContent = v == null ? '' : `Écart avec l'estimation : ${signed(M.r2(v - est))}`;
    };
    bindForm(root, f => {
      const v = parseAmount(fv(f, 'balance'));
      need(v != null, 'Indique le solde.');
      if (acc) A.recalerLivret(state, acc.id, T(), v);
      else A.recalerCompte(state, T(), v);
      closeSheet(); commit(); toast('Solde recalé.');
    });
    setTimeout(() => input.focus(), 60);
  });
}

/* ================= Feuilles : prélèvements ================= */

function sheetCharge(c) {
  const isNew = !c;
  const m = ym(T());
  const data = c || { label: '', kind: 'fixe', familyId: '', accountId: defaultAccountId(), day: null, start: m, end: null, skips: [], history: [], installment: null };
  const inst = !!data.installment;
  const variable = !inst && !!data.variable;
  const curEntry = c && !inst ? M.entryAt(c.history, m < c.start ? c.start : m, true) : null;
  const cur = curEntry ? curEntry.amount : null;
  const realMonths = c && variable ? A.monthsAhead(addMonthsYM(m, -5) < c.start ? c.start : addMonthsYM(m, -5), 7).filter(x => x <= addMonthsYM(m, 1) && x >= ym(state.startDate) && !M.chargeSkipReason(c, x)) : [];
  const next12 = A.monthsAhead(m, 12);
  openSheet(`<form><h2>${isNew ? 'Nouveau prélèvement' : 'Modifier le prélèvement'}</h2>
    <div class="field"><label>Nom</label><input name="label" value="${esc(data.label)}" placeholder="Ex : box internet, assurance auto…"></div>
    <div class="field"><label>Famille</label><select name="familyId">${data.familyId || data.kind === 'epargne' ? '' : '<option value="">— Choisir —</option>'}<option value="__epargne" ${data.kind === 'epargne' ? 'selected' : ''}>◎ Épargne (virement vers un livret)</option>${familyOptions(data.kind === 'epargne' ? '' : data.familyId)}</select><p class="hint">Sert à l’analyse : abonnements, banque (crédits, assurances, frais), logement… L'épargne n'est pas comptée comme une dépense.</p></div>
    <div class="field hide" id="accField"><label>Livret</label><select name="accountId">${accountOptions(data.accountId)}<option value="__new">+ Nouveau livret…</option></select></div>
    <div class="row2 hide" id="newAccField"><div class="field"><label>Nom du livret</label><input name="newAccName" placeholder="Ex : Livret A"></div><div class="field"><label>Solde actuel</label><input name="newAccBal" inputmode="decimal" placeholder="0,00"></div></div>
    <div class="seg"><label><input type="radio" name="mode" value="mensuel" ${inst || variable ? '' : 'checked'}> Fixe</label><label><input type="radio" name="mode" value="variable" ${variable ? 'checked' : ''}> Variable</label><label><input type="radio" name="mode" value="inst" ${inst ? 'checked' : ''}> En plusieurs fois</label></div>
    <p class="hint small muted hide" id="varHint" style="margin:-6px 0 12px">Pour un montant qui change chaque mois (badge télépéage, électricité…). Indique une estimation ; une fois prélevé, tu saisis le montant réel. Dès que tu as des montants réels, l'estimation devient la moyenne des 3 derniers.</p>
    <div id="mensuel" class="${inst ? 'hide' : ''}">
      <div class="row2"><div class="field"><label id="amountLabel">${variable ? 'Montant estimé' : 'Montant'}</label><input name="amount" inputmode="decimal" value="${amountValue(cur)}"></div>
      <div class="field"><label>${isNew ? 'Premier mois' : 'À partir de'}</label><input type="month" name="from" value="${isNew ? m : (m < data.start ? data.start : m)}"></div></div>
      ${realMonths.length ? `<div class="field"><label>Montants réels prélevés</label>${realMonths.map(x => `<div class="row2" style="align-items:center;margin-bottom:6px"><span style="flex:0 0 42%;text-transform:capitalize">${labelMonth(x)}</span><input name="real_${x}" inputmode="decimal" placeholder="≈ ${fmt(M.variableEstimate(c, x))}" value="${amountValue(c.actuals && c.actuals[x])}" style="padding:9px 12px;border:1px solid var(--line-strong);border-radius:10px;font-size:16px;background:var(--white)"></div>`).join('')}<p class="hint">Laisse vide un mois pas encore connu : l'estimation est utilisée.</p></div>` : ''}
      ${isNew ? '<p class="hint small muted" style="margin:-6px 0 12px">Laisse le mois en cours : un prélèvement déjà passé avant ton solde de départ n’est pas compté une deuxième fois.</p>' : ''}
      ${!isNew && !inst && !variable ? '<p class="hint small muted" style="margin:-6px 0 12px">Nouveau tarif ? Indique le mois où il commence : les mois d’avant gardent l’ancien montant.</p>' : ''}
      ${!isNew && data.history.length > 1 ? `<div class="list" style="margin:-4px 0 12px">${[...data.history].reverse().map(x => `<div class="item" style="cursor:default;padding:6px 0"><div class="main"><p class="s">Depuis ${labelMonth(x.from)}</p></div><span class="amt">${eur(x.amount)}</span></div>`).join('')}</div>` : ''}
      <div class="field"><label>Dernier mois (facultatif)</label><input type="month" name="end" value="${data.end || ''}"><p class="hint">Pour un contrat qui s'arrête. Laisse vide sinon.</p></div>
    </div>
    <div id="inst" class="${inst ? '' : 'hide'}">
      <div class="row2"><div class="field"><label>Montant total</label><input name="total" inputmode="decimal" value="${amountValue(inst ? data.installment.total : '')}"></div>
      <div class="field"><label>Nombre de fois</label><input type="number" name="count" min="2" max="48" value="${inst ? data.installment.count : 4}"></div></div>
      <div class="field"><label>Première échéance</label><input type="month" name="instStart" value="${data.start}"><p class="hint">Une échéance déjà payée avant ton solde de départ n'est pas recomptée : tu peux la saisir pour garder le compte juste (2/4, 3/4…).</p></div>
      <div class="field"><label>Montant de chaque échéance</label><div id="echList"></div><p class="hint">Les échéances ont des montants différents ? Remplis celles que tu connais, le reste du total est partagé entre les autres.</p></div>
      <p class="small pos" id="instPreview" style="margin:-4px 0 12px"></p>
    </div>
    <div class="field"><label>Jour du prélèvement</label><input type="number" name="day" min="1" max="31" value="${data.day || ''}" placeholder="Ex : 5"></div>
    ${!isNew && !inst ? `<div class="field"><label>Sauter un mois (ex : Navigo en août)</label><div class="chips" style="padding:0">${next12.map(x => `<button type="button" class="chip ${(data.skips || []).includes(x) ? 'on' : ''}" data-skip="${x}">${MOIS_COURT[Number(x.slice(5)) - 1]} ${x.slice(2, 4)}</button>`).join('')}</div><p class="hint">Les mois en foncé ne seront pas prélevés.</p></div>` : ''}
    ${buttons('Enregistrer', isNew ? '' : '<button type="button" class="btn btn-danger" data-act="delcharge" data-id="' + c.id + '">Supprimer</button>')}
  </form>`, root => {
    const form = root.querySelector('form');
    const skips = new Set(data.skips || []);
    // Échéances : valeurs saisies (texte) ; les cases vides se partagent le reste du total.
    const ech = inst && data.installment.amounts ? data.installment.amounts.map(amountValue) : [];
    let echKey = '';
    const echSplit = () => {
      const n = parseInt(fv(form, 'count'), 10) || 0;
      const total = parseAmount(fv(form, 'total')) || 0;
      const vals = Array.from({ length: n }, (_, i) => parseAmount(ech[i]));
      const free = vals.map((v, i) => (v == null ? i : -1)).filter(i => i >= 0);
      const rest = M.r2(total - vals.reduce((s, v) => s + (v || 0), 0));
      const each = free.length ? Math.floor((rest / free.length) * 100) / 100 : 0;
      free.forEach((i, k) => { vals[i] = k === free.length - 1 ? M.r2(rest - each * (free.length - 1)) : each; });
      return { n, total, vals, rest, custom: free.length < n };
    };
    const renderEch = () => {
      const n = Math.min(48, parseInt(fv(form, 'count'), 10) || 0);
      const start = fv(form, 'instStart') || m;
      const key = n + '|' + start;
      if (key !== echKey) {
        echKey = key;
        root.querySelector('#echList').innerHTML = Array.from({ length: n }, (_, i) => {
          const mo = addMonthsYM(start, i);
          return `<div class="row2" style="align-items:center;margin-bottom:6px"><span style="flex:0 0 42%">${i + 1}. ${MOIS_COURT[Number(mo.slice(5)) - 1]} ${mo.slice(0, 4)}</span><input data-ech="${i}" inputmode="decimal" value="${esc(ech[i] || '')}" style="padding:9px 12px;border:1px solid var(--line-strong);border-radius:10px;font-size:16px;background:var(--white)"></div>`;
        }).join('');
        root.querySelectorAll('[data-ech]').forEach(inp => { inp.oninput = () => { ech[Number(inp.dataset.ech)] = inp.value; showSplit(); }; });
      }
      showSplit();
    };
    const showSplit = () => {
      const { vals, rest, custom } = echSplit();
      root.querySelectorAll('[data-ech]').forEach(inp => { inp.placeholder = fmt(vals[Number(inp.dataset.ech)] || 0); });
      root.querySelector('#instPreview').textContent = !vals.length ? '' : rest < 0 ? '⚠️ Les échéances saisies dépassent le total.'
        : custom ? `Échéances : ${vals.map(v => fmt(v)).join(' · ')} €` : `Soit ${plural(vals.length, 'échéance')} de ${eur(vals[0])}`;
    };
    const sync = () => {
      const ep = form.elements.familyId.value === '__epargne';
      const newAcc = ep && (!state.accounts.length || form.elements.accountId.value === '__new');
      root.querySelector('#accField').classList.toggle('hide', !ep || !state.accounts.length);
      root.querySelector('#newAccField').classList.toggle('hide', !newAcc);
      const isInst = form.elements.mode.value === 'inst';
      const isVar = form.elements.mode.value === 'variable';
      root.querySelector('#varHint').classList.toggle('hide', !isVar);
      root.querySelector('#amountLabel').textContent = isVar ? 'Montant estimé' : 'Montant';
      root.querySelector('#mensuel').classList.toggle('hide', isInst);
      root.querySelector('#inst').classList.toggle('hide', !isInst);
      if (isInst) renderEch();
    };
    form.addEventListener('change', sync);
    form.addEventListener('input', sync);
    sync();
    root.querySelectorAll('[data-skip]').forEach(b => { b.onclick = () => { const x = b.dataset.skip; skips.has(x) ? skips.delete(x) : skips.add(x); b.classList.toggle('on'); }; });
    bindForm(root, f => {
      const label = fv(f, 'label');
      need(label, 'Indique un nom.');
      const day = parseInt(fv(f, 'day'), 10);
      need(day >= 1 && day <= 31, 'Indique le jour du prélèvement (1 à 31).');
      need(fv(f, 'familyId'), 'Choisis une famille.');
      let pendingAccount = null;
      const kind = fv(f, 'familyId') === '__epargne' ? 'epargne' : 'fixe';
      let accountId = kind === 'epargne' ? fv(f, 'accountId') : null;
      if (kind === 'epargne' && (!state.accounts.length || accountId === '__new')) {
        const name = fv(f, 'newAccName');
        need(name, 'Indique le nom du livret.');
        const bal = parseAmount(fv(f, 'newAccBal')) || 0;
        accountId = A.uid();
        pendingAccount = { id: accountId, name, anchors: [{ date: T(), balance: bal, createdAt: A.stamp() }], createdAt: A.stamp() };
      }
      const common = { label, kind, day, familyId: kind === 'epargne' ? 'divers' : fv(f, 'familyId'), accountId };
      const target = c || { id: A.uid(), createdAt: A.stamp(), skips: [], history: [] };
      Object.assign(target, common);
      if (f.elements.mode.value === 'inst') {
        const total = parseAmount(fv(f, 'total')), count = parseInt(fv(f, 'count'), 10);
        need(total > 0 && count >= 2, 'Indique le montant total et le nombre de fois (2 minimum).');
        const split = echSplit();
        need(split.rest >= 0, 'Les échéances saisies dépassent le montant total.');
        need(split.custom ? split.vals.every(v => v >= 0) : true, 'Vérifie le montant des échéances.');
        const installment = { total, count };
        if (split.custom) installment.amounts = split.vals;
        Object.assign(target, { installment, start: fv(f, 'instStart') || m, end: null, history: [], skips: [], variable: false });
      } else {
        const amount = parseAmount(fv(f, 'amount'));
        need(amount > 0, 'Indique le montant.');
        const from = fv(f, 'from') || m;
        if (isNew || target.installment) Object.assign(target, { installment: null, start: from, history: [{ from, amount }] });
        else if ((M.entryAt(target.history, from, true) || {}).amount !== amount) A.setChargeAmount(target, from, amount);
        target.variable = f.elements.mode.value === 'variable';
        for (const x of realMonths) {
          const el = f.elements['real_' + x];
          if (el) A.setChargeActual(target, x, parseAmount(el.value));
        }
        const end = fv(f, 'end') || null;
        need(!end || end >= target.start, 'Le dernier mois doit être après le premier.');
        target.end = end;
        target.skips = [...skips].sort();
      }
      if (pendingAccount) state.accounts.push(pendingAccount);
      if (isNew) state.charges.push(target);
      closeSheet(); commit(); toast('Prélèvement enregistré.');
    });
  });
}
function sheetChargeReal(c, month) {
  const est = M.variableEstimate(c, month);
  openSheet(`<form><h2>${esc(c.label)}</h2>
    <p class="intro">Montant réellement prélevé en ${labelMonth(month)} (estimé à ${eur(est)}).</p>
    <div class="field amount"><input name="amount" inputmode="decimal" placeholder="${fmt(est)}" value="${amountValue(c.actuals && c.actuals[month])}" aria-label="Montant réel"></div>
    ${buttons('Enregistrer')}</form>`, root => {
    bindForm(root, f => {
      const v = parseAmount(fv(f, 'amount'));
      need(v != null && v >= 0, 'Indique le montant prélevé.');
      A.setChargeActual(c, month, v);
      closeSheet(); commit(); toast('Montant réel enregistré.');
    });
    setTimeout(() => root.querySelector('[name="amount"]').focus(), 60);
  });
}
ACTIONS.chgreal = (id, el) => sheetChargeReal(state.charges.find(c => c.id === id), el.dataset.m);

ACTIONS.delcharge = id => {
  if (!confirm("Supprimer ce prélèvement de tout l'historique ?\n\nS'il s'arrête simplement, indique plutôt un « dernier mois » : les mois passés resteront justes.")) return;
  closeSheet();
  withUndo('Prélèvement supprimé.', () => { state.charges = state.charges.filter(c => c.id !== id); });
};

/* ================= Feuilles : épargne et projets ================= */

function sheetMovement(mv, preset = {}) {
  if (!state.accounts.length) { toast("Ajoute d'abord un livret dans l'onglet Épargne."); return; }
  if (mv && mv.kind === 'cloture') {
    const cid = Object.keys(state.cycles).find(k => Object.values((state.cycles[k] || {}).closure || {}).some(x => x.movementId === mv.id));
    const c = M.cycles(state).find(x => x.id === cid);
    if (c) return sheetClosure(c, false);
  }
  const isNew = !mv;
  const data = mv || { direction: 'vers', accountId: preset.accountId || defaultAccountId(), amount: null, date: T(), label: '', projectId: null };
  const projects = state.projects.filter(p => p.status !== 'clos' || p.id === data.projectId);
  openSheet(`<form>
    ${isNew && !preset.accountId ? `<div class="seg"><label data-act="switchexpense"><input type="radio" name="kind"> Dépense</label><label data-act="switchincome"><input type="radio" name="kind"> Revenu</label><label><input type="radio" name="kind" checked> Épargne</label></div>` : `<h2>${isNew ? 'Mouvement d’épargne' : 'Modifier le mouvement'}</h2>`}
    <div class="seg"><label><input type="radio" name="direction" value="vers" ${data.direction === 'vers' ? 'checked' : ''}> Compte → livret</label><label><input type="radio" name="direction" value="depuis" ${data.direction === 'depuis' ? 'checked' : ''}> Livret → compte</label></div>
    <div class="field amount"><input name="amount" inputmode="decimal" placeholder="0,00 €" value="${amountValue(data.amount)}" aria-label="Montant"></div>
    <div class="field"><label>Livret</label><select name="accountId">${accountOptions(data.accountId)}</select></div>
    ${projects.length ? `<div class="field"><label>Pour un projet (facultatif)</label><select name="projectId"><option value="">— Aucun —</option>${projects.map(p => `<option value="${p.id}" ${p.id === data.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>` : ''}
    <div class="field"><label>Note (facultatif)</label><input name="label" value="${esc(data.label)}"></div>
    ${dateField('date', data.date)}
    ${buttons(isNew ? 'Ajouter' : 'Enregistrer', isNew ? '' : '<button type="button" class="btn btn-danger" data-act="delmove" data-id="' + mv.id + '">Supprimer</button>')}
  </form>`, root => {
    bindDateChips(root);
    bindForm(root, f => {
      const amount = parseAmount(fv(f, 'amount'));
      need(amount > 0, 'Indique un montant.');
      const projectId = fv(f, 'projectId') || null;
      const accountId = fv(f, 'accountId');
      if (projectId) need(projById(projectId).accountId === accountId, `Ce projet est rangé sur ${accById(projById(projectId).accountId).name} : choisis ce livret.`);
      A.saveMovement(state, mv, { direction: f.elements.direction.value, accountId, amount, date: fv(f, 'date') || T(), label: fv(f, 'label'), projectId });
      closeSheet(); commit(); toast('Mouvement enregistré.');
    });
  });
}
ACTIONS.delmove = id => { closeSheet(); withUndo('Mouvement supprimé.', () => A.deleteMovement(state, id)); };

function sheetAccount(a) {
  const isNew = !a;
  const hist = a ? M.savingsHistory(state, a.id, T()).slice(0, 40) : [];
  const used = a && (state.movements.some(m => m.accountId === a.id) || state.charges.some(c => c.accountId === a.id) || state.projects.some(p => p.accountId === a.id));
  openSheet(`<form><h2>${isNew ? 'Nouveau livret' : esc(a.name)}</h2>
    <div class="field"><label>Nom</label><input name="name" value="${esc(a ? a.name : '')}" placeholder="Ex : Livret A, LDDS…"></div>
    ${isNew ? '<div class="field"><label>Solde actuel</label><input name="balance" inputmode="decimal" placeholder="0,00"></div>' : ''}
    ${buttons('Enregistrer', isNew ? '' : used ? '' : '<button type="button" class="btn btn-danger" data-act="delaccount" data-id="' + a.id + '">Supprimer</button>')}
    ${a ? `<p class="section-title" style="margin:20px 0 6px">Historique</p><div class="list">${hist.map(x => `<div class="item" ${x.type === 'mouvement' ? `data-act="movement" data-id="${x.ref.id}"` : x.type === 'auto' ? `data-act="charge" data-id="${x.ref.id}"` : 'style="cursor:default"'}>
      <div class="main"><p class="t">${esc(x.label || (x.amount > 0 ? 'Versement' : 'Retrait'))}</p><p class="s">${x.type === 'auto' ? 'Virement automatique · ' : x.type === 'recalage' ? 'Recalage · ' : ''}${labelDay(x.date, true)}</p></div>
      <span class="amt ${x.type === 'recalage' ? '' : x.amount > 0 ? 'pos' : 'neg'}">${x.type === 'recalage' ? '= ' + eur(x.amount) : signed(x.amount)}</span></div>`).join('')}</div>` : ''}
  </form>`, root => {
    bindForm(root, f => {
      const name = fv(f, 'name');
      need(name, 'Indique un nom.');
      if (a) a.name = name;
      else {
        const bal = parseAmount(fv(f, 'balance')) || 0;
        state.accounts.push({ id: A.uid(), name, anchors: [{ date: T(), balance: bal, createdAt: A.stamp() }], createdAt: A.stamp() });
      }
      closeSheet(); commit(); toast('Livret enregistré.');
    });
  });
}
ACTIONS.delaccount = id => { closeSheet(); withUndo('Livret supprimé.', () => { state.accounts = state.accounts.filter(a => a.id !== id); }); };

function sheetProject(p) {
  const isNew = !p;
  if (isNew && !state.accounts.length) { toast("Ajoute d'abord le livret où tu mets l'argent de tes projets."); return; }
  const data = p || { name: '', target: null, due: '', yearly: false, accountId: defaultAccountId() };
  const entries = p ? state.projectEntries.filter(e => e.projectId === p.id).sort(M.byDate).reverse() : [];
  const saved = p ? M.projectSaved(state, p.id) : 0;
  const closed = p && p.status === 'clos';
  openSheet(`<form><h2>${isNew ? 'Nouveau projet' : esc(p.name)}</h2>
    <div class="field"><label>Nom</label><input name="name" value="${esc(data.name)}" placeholder="Ex : Cadeaux de Noël"></div>
    <div class="row2"><div class="field"><label>Montant à atteindre</label><input name="target" inputmode="decimal" value="${amountValue(data.target)}"></div>
    <div class="field"><label>Pour le (facultatif)</label><input type="date" name="due" value="${data.due || ''}"></div></div>
    <label class="check"><input type="checkbox" name="yearly" ${data.yearly ? 'checked' : ''}> Revient chaque année (anniversaire, Noël, entretien…)</label>
    <div class="field"><label>Argent rangé sur</label><select name="accountId" ${p && entries.length ? 'disabled' : ''}>${accountOptions(data.accountId)}</select></div>
    ${buttons('Enregistrer')}
    ${p ? `<div class="btns" style="margin-top:10px">${closed ? '<button type="button" class="btn btn-secondary" data-act="reopenproj" data-id="' + p.id + '">Réactiver</button>' : '<button type="button" class="btn btn-secondary" data-act="closeproj" data-id="' + p.id + '">Clôturer</button>'}<button type="button" class="btn btn-danger" data-act="delproj" data-id="${p.id}">Supprimer</button></div>
      <p class="section-title" style="margin:20px 0 6px">Historique · ${eur(saved)} de côté</p>
      <div class="list">${entries.length ? entries.map(e => `<div class="item" style="cursor:default"><div class="main"><p class="t">${esc(e.note)}</p><p class="s">${labelDay(e.date, true)}</p></div><span class="amt ${e.amount > 0 ? 'pos' : 'neg'}">${signed(e.amount)}</span><button type="button" class="link" data-act="delentry" data-id="${e.id}" aria-label="Supprimer">✕</button></div>`).join('') : '<p class="empty">Rien de mis de côté pour l’instant.</p>'}</div>` : ''}
  </form>`, root => {
    bindForm(root, f => {
      const name = fv(f, 'name');
      const target = parseAmount(fv(f, 'target'));
      need(name, 'Indique un nom.');
      need(target > 0, 'Indique le montant à atteindre.');
      const values = { name, target, due: fv(f, 'due') || null, yearly: f.elements.yearly.checked };
      if (!f.elements.accountId.disabled) values.accountId = fv(f, 'accountId');
      if (p) Object.assign(p, values);
      else state.projects.push({ id: A.uid(), status: 'actif', createdAt: A.stamp(), ...values });
      closeSheet(); commit(); toast('Projet enregistré.');
    });
  });
}
ACTIONS.closeproj = id => {
  const p = projById(id);
  const saved = M.projectSaved(state, id);
  if (saved > 0 && !confirm(`Il reste ${eur(saved)} de côté pour ce projet. En le clôturant, cet argent reste sur le livret mais n'est plus réservé. Continuer ?`)) return;
  closeSheet(); withUndo('Projet clôturé.', () => A.closeProject(state, p, T(), saved));
};
ACTIONS.reopenproj = id => { projById(id).status = 'actif'; closeSheet(); commit(); };
ACTIONS.delproj = id => {
  if (!confirm('Supprimer ce projet ? Les virements déjà faits restent sur le livret.')) return;
  closeSheet();
  withUndo('Projet supprimé.', () => {
    state.projects = state.projects.filter(p => p.id !== id);
    state.projectEntries = state.projectEntries.filter(e => e.projectId !== id);
    for (const m of state.movements) if (m.projectId === id) m.projectId = null;
    for (const e of state.expenses) if (e.projectId === id) { e.projectId = null; e.envelope = 'plaisirs'; }
  });
};
ACTIONS.delentry = id => {
  const e = state.projectEntries.find(x => x.id === id);
  const p = projById(e.projectId);
  const extra = e.movementId || e.expenseId ? ' (le virement ou la dépense liée sera aussi supprimé)' : '';
  if (!confirm('Supprimer cette ligne' + extra + ' ?')) return;
  A.deleteProjectEntry(state, id);
  commit(); sheetProject(p);
};

function sheetContrib(p) {
  const st = M.projectStatus(state, p, T());
  const acc = accById(p.accountId);
  openSheet(`<form><h2>Mettre de côté · ${esc(p.name)}</h2>
    <p class="intro">Déjà ${eur(st.saved)} sur ${eur(p.target)}.</p>
    <div class="field amount"><input name="amount" inputmode="decimal" value="${amountValue(st.perPaie || (st.remaining || null))}" aria-label="Montant"></div>
    <div class="seg"><label><input type="radio" name="how" value="virement" checked> Je fais le virement</label><label><input type="radio" name="how" value="affecter"> Déjà sur le livret</label></div>
    <p class="hint small muted" style="margin:-6px 0 14px">« Je fais le virement » : l'argent passe de ton compte à ${esc(acc ? acc.name : 'ton livret')}. « Déjà sur le livret » : tu réserves de l'argent qui y est déjà.</p>
    ${dateField('date', T())}
    ${buttons('Valider')}</form>`, root => {
    bindDateChips(root);
    bindForm(root, f => {
      const amount = parseAmount(fv(f, 'amount'));
      need(amount > 0, 'Indique un montant.');
      const fromAccount = f.elements.how.value === 'virement';
      if (!fromAccount) {
        const free = M.savingsBalance(state, p.accountId, T()) - M.reservedOnAccount(state, p.accountId);
        need(amount <= M.r2(free), `Il n'y a que ${eur(free)} de libre sur ce livret.`);
      }
      A.contributeProject(state, p, { date: fv(f, 'date') || T(), amount, fromAccount });
      closeSheet(); commit(); toast('Mis de côté !');
    });
  });
}

function sheetUseProject(p) {
  const saved = M.projectSaved(state, p.id);
  const cats = state.categories;
  const defCat = (cats.find(c => c.id === 'cadeaux') || cats[0]).id;
  openSheet(`<form><h2>Utiliser · ${esc(p.name)}</h2>
    <p class="intro">${eur(saved)} de côté pour ce projet.</p>
    <div class="field amount"><input name="amount" inputmode="decimal" value="${amountValue(saved)}" aria-label="Montant"></div>
    <div class="field"><label>Pour quoi ?</label><input name="label" placeholder="Ex : cadeau, réparation…"></div>
    <div class="field"><label>Catégorie</label><select name="categoryId">${sortedFamilies().map(f => { const cs = catsOf(f.id); return cs.length ? `<optgroup label="${esc(f.name)}">${cs.map(c => `<option value="${c.id}" ${c.id === defCat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>` : ''; }).join('')}</select></div>
    ${dateField('date', T())}
    <label class="check"><input type="checkbox" name="bringBack" checked> Je rapatrie cet argent du livret vers mon compte</label>
    <label class="check"><input type="checkbox" name="record" checked> Enregistrer la dépense (hors enveloppes Quotidien et Plaisirs)</label>
    ${buttons('Valider')}</form>`, root => {
    bindDateChips(root);
    bindForm(root, f => {
      const amount = parseAmount(fv(f, 'amount'));
      need(amount > 0, 'Indique un montant.');
      need(amount <= saved, `Il n'y a que ${eur(saved)} de côté.`);
      A.useProject(state, p, { date: fv(f, 'date') || T(), amount, label: fv(f, 'label'), categoryId: fv(f, 'categoryId'), bringBack: f.elements.bringBack.checked, recordExpense: f.elements.record.checked });
      closeSheet(); commit(); toast('C’est noté.');
    });
  });
}

/* ================= Feuilles : réglages ================= */

function sheetExtra(x) {
  const isNew = !x;
  const y = Number(T().slice(0, 4));
  const data = x || { label: '', month: 11, year: y, yearly: true, amount: null };
  openSheet(`<form><h2>${isNew ? 'Extra prévu' : 'Modifier l’extra'}</h2>
    <div class="field"><label>Nom</label><input name="label" value="${esc(data.label)}" placeholder="Ex : 13ᵉ mois, prime de participation, CET…"></div>
    <div class="field amount"><input name="amount" inputmode="decimal" placeholder="0,00 €" value="${amountValue(data.amount)}" aria-label="Montant estimé"></div>
    <div class="row2"><div class="field"><label>Sur la paie de</label><select name="month">${monthOptions(data.month)}</select></div>
    <div class="field" id="yearField"><label>Année</label><input type="number" name="year" value="${data.year || y}"></div></div>
    <label class="check"><input type="checkbox" name="yearly" ${data.yearly ? 'checked' : ''}> Revient chaque année</label>
    ${buttons('Enregistrer', isNew ? '' : '<button type="button" class="btn btn-danger" data-act="delextra" data-id="' + x.id + '">Supprimer</button>')}</form>`, root => {
    const form = root.querySelector('form');
    const sync = () => root.querySelector('#yearField').classList.toggle('hide', form.elements.yearly.checked);
    form.elements.yearly.onchange = sync; sync();
    bindForm(root, f => {
      const amount = parseAmount(fv(f, 'amount'));
      need(fv(f, 'label'), 'Indique un nom.');
      need(amount > 0, 'Indique un montant estimé.');
      const yearly = f.elements.yearly.checked;
      const values = { label: fv(f, 'label'), amount, month: Number(fv(f, 'month')), yearly, year: yearly ? null : Number(fv(f, 'year')) };
      if (x) Object.assign(x, values); else state.extras.push({ id: A.uid(), ...values });
      closeSheet(); commit(); toast('Extra enregistré.');
    });
  });
}
ACTIONS.delextra = id => { closeSheet(); withUndo('Extra supprimé.', () => { state.extras = state.extras.filter(x => x.id !== id); }); };

function sheetFamily(f) {
  const isNew = !f;
  const used = f && (state.categories.some(c => c.familyId === f.id) || state.charges.some(c => c.familyId === f.id));
  openSheet(`<form><h2>${isNew ? 'Nouvelle famille' : 'Modifier la famille'}</h2>
    <div class="row2"><div class="field" style="flex:0 0 80px"><label>Icône</label><input name="icon" value="${esc(f ? f.icon : '📦')}" maxlength="4" style="text-align:center"></div>
    <div class="field"><label>Nom</label><input name="name" value="${esc(f ? f.name : '')}" placeholder="Ex : Animaux"></div></div>
    ${buttons('Enregistrer', isNew || used ? '' : '<button type="button" class="btn btn-danger" data-act="delfamily" data-id="' + f.id + '">Supprimer</button>')}
    ${used ? '<p class="hint small muted">Une famille utilisée ne peut pas être supprimée : déplace d’abord ses catégories et prélèvements.</p>' : ''}</form>`, root => {
    bindForm(root, form => {
      const name = fv(form, 'name');
      need(name, 'Indique un nom.');
      const icon = fv(form, 'icon') || '📦';
      if (f) Object.assign(f, { name, icon }); else state.families.push({ id: A.uid(), name, icon });
      closeSheet(); commit();
    });
  });
}
ACTIONS.delfamily = id => { closeSheet(); withUndo('Famille supprimée.', () => { state.families = state.families.filter(f => f.id !== id); }); };

function sheetCategory(c) {
  const isNew = !c;
  const data = c || { name: '', familyId: sortedFamilies()[0].id, envelope: 'quotidien' };
  const uses = c ? state.expenses.filter(e => e.categoryId === c.id).length : 0;
  openSheet(`<form><h2>${isNew ? 'Nouvelle catégorie' : 'Modifier la catégorie'}</h2>
    <div class="field"><label>Nom</label><input name="name" value="${esc(data.name)}"></div>
    <div class="field"><label>Famille</label><select name="familyId">${familyOptions(data.familyId)}</select></div>
    <div class="field"><label>Enveloppe par défaut</label><div class="seg" style="margin:0">${M.ENVELOPES.map(k => `<label><input type="radio" name="envelope" value="${k}" ${data.envelope === k ? 'checked' : ''}> ${envName(k)}</label>`).join('')}</div>
    <p class="hint">Proposée automatiquement quand tu choisis cette catégorie ; tu peux toujours changer au moment de la dépense.</p></div>
    ${buttons('Enregistrer', isNew ? '' : '<button type="button" class="btn btn-danger" data-act="delcategory" data-id="' + c.id + '">Supprimer</button>')}
    ${uses ? `<p class="hint small muted">${plural(uses, 'dépense')} dans cette catégorie : en la supprimant, elles passeront dans « Autre ».</p>` : ''}</form>`, root => {
    bindForm(root, f => {
      const name = fv(f, 'name');
      need(name, 'Indique un nom.');
      const values = { name, familyId: fv(f, 'familyId'), envelope: f.elements.envelope.value };
      if (c) Object.assign(c, values); else state.categories.push({ id: A.uid(), ...values });
      closeSheet(); commit();
    });
  });
}
ACTIONS.delcategory = id => {
  closeSheet();
  withUndo('Catégorie supprimée.', () => {
    if (!state.categories.some(c => c.id === 'autre')) state.categories.push({ id: 'autre', name: 'Autre', familyId: 'divers', envelope: 'quotidien' });
    if (id === 'autre') return;
    for (const e of state.expenses) if (e.categoryId === id) e.categoryId = 'autre';
    state.categories = state.categories.filter(c => c.id !== id);
  });
};

/* ================= Sauvegarde ================= */

// Chrome sur Android refuse de partager un .json : pour l'envoi (Drive, e-mail…), la même sauvegarde
// part en .txt, un type qu'il accepte. La restauration lit les deux.
function backupFile(forShare = false) {
  const name = `mes-enveloppes-${T()}.${forShare ? 'txt' : 'json'}`;
  return new File([JSON.stringify(state, null, 1)], name, { type: forShare ? 'text/plain' : 'application/json' });
}

function sheetBackup() {
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [backupFile(true)] }));
  openSheet(`<div><h2>Sauvegarder mes données</h2>
    <p class="intro">Un petit fichier qui contient tout ton budget. Garde-le en lieu sûr (Google Drive, e-mail…) : il permet de tout retrouver sur un nouveau téléphone.</p>
    ${canShare ? '<button class="btn btn-primary" data-act="doshare" style="margin-bottom:10px">Envoyer vers Drive, e-mail…</button>' : ''}
    <button class="btn ${canShare ? 'btn-secondary' : 'btn-primary'}" data-act="dodownload">Enregistrer dans Téléchargements</button>
    <div class="btn-row"><button class="btn btn-secondary" data-act="closesheet">Fermer</button></div></div>`);
}
function markBackup() { state.settings.lastBackupAt = Date.now(); S.save(state); }
ACTIONS.closesheet = () => closeSheet();
ACTIONS.doshare = async () => {
  try {
    await navigator.share({ files: [backupFile(true)] });
    markBackup(); closeSheet(); render(); toast('Sauvegarde envoyée.');
  } catch (e) { if (e.name !== 'AbortError') toast('Partage impossible, utilise « Enregistrer dans Téléchargements ».'); }
};
ACTIONS.dodownload = () => {
  const file = backupFile();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  markBackup(); closeSheet(); render(); toast('Fichier enregistré dans Téléchargements.');
};

async function restoreFromFile(file) {
  if (!file) return;
  try {
    const next = S.parseBackup(await file.text());
    if (state && state.setupDone && !confirm('Remplacer toutes les données de cet appareil par celles de la sauvegarde ?')) return;
    state = next;
    state.settings.lastBackupAt = state.settings.lastBackupAt || Date.now();
    view = 'accueil';
    commit();
    toast('Sauvegarde restaurée.');
  } catch (e) {
    alert(e.message);
  }
}

/* ================= Assistant de démarrage ================= */

let wiz = null;

function renderWizard() {
  if (!wiz) wiz = { step: 0, balance: '', paieDate: '', paieAmount: '', baseSalary: '', quotidien: '', plaisirs: '', accounts: [{ name: '', balance: '' }] };
  const steps = 5;
  const w = wiz;
  const head = n => `<p class="steps">Étape ${n} sur ${steps}</p>`;
  let h = '<div class="wizard"><form id="wizForm">';
  if (w.step === 0) {
    h += `<h2>Bienvenue 👋</h2>
      <p class="lead">Mes Enveloppes suit ton budget <b>d'une paie à l'autre</b> : ce qu'il te reste à dépenser, ce qu'il y a sur ton compte, tes livrets et tes projets.<br><br>
      Quelques questions pour démarrer (2 minutes). Tu auras besoin du <b>solde de ton compte</b> et de celui de <b>tes livrets</b>.</p>
      <button class="btn btn-primary">Commencer</button>
      <button type="button" class="btn btn-secondary" data-act="restore" style="margin-top:10px">J'ai une sauvegarde à restaurer</button>
      <input type="file" id="wizRestore" accept="application/json,.json,text/plain,.txt" class="hide">`;
  } else if (w.step === 1) {
    h += `${head(1)}<h2>Ton compte courant</h2><p class="lead">Quel est le solde affiché par ta banque aujourd'hui ?</p>
      <div class="field amount"><input name="balance" inputmode="decimal" placeholder="0,00 €" value="${esc(w.balance)}"></div>`;
  } else if (w.step === 2) {
    h += `${head(2)}<h2>Ta dernière paie</h2><p class="lead">Elle marque le début du cycle en cours. Elle est déjà comprise dans le solde que tu viens d'indiquer.</p>
      <div class="field"><label>Arrivée le</label><input type="date" name="paieDate" value="${esc(w.paieDate)}" max="${T()}"></div>
      <div class="field"><label>Montant reçu</label><input name="paieAmount" inputmode="decimal" value="${esc(w.paieAmount)}"></div>
      <div class="field"><label>Salaire habituel, hors primes</label><input name="baseSalary" inputmode="decimal" value="${esc(w.baseSalary)}" placeholder="Si différent du montant reçu"><p class="hint">Sert aux prévisions. Les primes et le 13ᵉ mois se règlent ensuite dans les réglages.</p></div>`;
  } else if (w.step === 3) {
    h += `${head(3)}<h2>Tes enveloppes</h2><p class="lead">Combien veux-tu t'accorder <b>par cycle de paie</b> ?<br>
      <b>Quotidien</b> : courses, carburant, péages, pharmacie, coiffeur…<br><b>Plaisirs</b> : restos, sorties, shopping, loisirs…<br>Tu pourras ajuster à tout moment.</p>
      <div class="row2"><div class="field"><label>Quotidien</label><input name="quotidien" inputmode="decimal" value="${esc(w.quotidien)}"></div>
      <div class="field"><label>Plaisirs</label><input name="plaisirs" inputmode="decimal" value="${esc(w.plaisirs)}"></div></div>`;
  } else if (w.step === 4) {
    h += `${head(4)}<h2>Tes livrets</h2><p class="lead">Nom et solde actuel de chaque livret. Tu pourras en ajouter plus tard.</p>
      ${w.accounts.map((a, i) => `<div class="row2"><div class="field"><label>Nom</label><input name="accName${i}" value="${esc(a.name)}" placeholder="Ex : Livret A"></div>
      <div class="field"><label>Solde</label><input name="accBal${i}" inputmode="decimal" value="${esc(a.balance)}" placeholder="0,00"></div></div>`).join('')}
      <button type="button" class="link" data-act="wizaddacc">+ Ajouter un livret</button>`;
  } else {
    h += `${head(5)}<h2>C'est prêt ✅</h2><p class="lead">Dernière étape conseillée : ajoute tes <b>prélèvements</b> (abonnements, assurances, crédits, virements automatiques vers tes livrets).<br><br>
      Ensuite, pour chaque dépense, touche le bouton <b>+</b>. Et quand ta paie arrive, touche <b>« Ma paie est arrivée »</b>.</p>`;
  }
  if (w.step > 0) {
    h += `<p class="error"></p><div class="btn-row"><button type="button" class="btn btn-secondary" data-act="wizback">Retour</button><button class="btn btn-primary">${w.step === 5 ? 'Ajouter mes prélèvements' : 'Continuer'}</button></div>`;
  }
  h += '</form></div>';
  $('#view').innerHTML = h;
  const form = $('#wizForm');
  const restore = $('#wizRestore');
  if (restore) restore.onchange = e => restoreFromFile(e.target.files[0]);
  form.onsubmit = e => {
    e.preventDefault();
    try { wizardNext(form); } catch (ex) { form.querySelector('.error').textContent = ex.message; }
  };
}

function wizardCollect(form) {
  const w = wiz;
  const get = n => (form.elements[n] ? form.elements[n].value.trim() : undefined);
  if (w.step === 1) w.balance = get('balance');
  if (w.step === 2) { w.paieDate = get('paieDate'); w.paieAmount = get('paieAmount'); w.baseSalary = get('baseSalary'); }
  if (w.step === 3) { w.quotidien = get('quotidien'); w.plaisirs = get('plaisirs'); }
  if (w.step === 4) w.accounts = w.accounts.map((a, i) => ({ name: get('accName' + i), balance: get('accBal' + i) }));
}

function wizardNext(form) {
  const w = wiz;
  wizardCollect(form);
  if (w.step === 1) need(parseAmount(w.balance) != null, 'Indique le solde (0 si besoin, avec un « - » s’il est négatif).');
  if (w.step === 2) {
    need(w.paieDate && w.paieDate <= T(), 'Indique la date de ta dernière paie.');
    need(parseAmount(w.paieAmount) > 0, 'Indique le montant reçu.');
  }
  if (w.step === 3) need(parseAmount(w.quotidien) >= 0 && parseAmount(w.plaisirs) >= 0 && w.quotidien !== '' && w.plaisirs !== '', 'Indique les deux montants (0 si besoin).');
  if (w.step === 4) for (const a of w.accounts) if (a.name) need(parseAmount(a.balance || '0') != null, `Solde de ${a.name} illisible.`);
  if (w.step === 5) {
    state = A.setupState({
      today: T(),
      balance: parseAmount(w.balance),
      paieDate: w.paieDate,
      paieAmount: parseAmount(w.paieAmount),
      baseSalary: parseAmount(w.baseSalary) || parseAmount(w.paieAmount),
      quotidien: parseAmount(w.quotidien),
      plaisirs: parseAmount(w.plaisirs),
      accounts: w.accounts.filter(a => a.name).map(a => ({ name: a.name, balance: parseAmount(a.balance || '0') })),
    });
    wiz = null;
    view = 'prelevements';
    commit();
    S.requestPersistence();
    return;
  }
  w.step++;
  renderWizard();
  window.scrollTo(0, 0);
}
ACTIONS.wizback = () => { wizardCollect($('#wizForm')); wiz.step--; renderWizard(); };
ACTIONS.wizaddacc = () => { wizardCollect($('#wizForm')); wiz.accounts.push({ name: '', balance: '' }); renderWizard(); };

/* ================= Démarrage ================= */

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (view === 'reglages') render(); });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    // L'appli installée reste souvent ouverte en arrière-plan : on cherche une mise à jour à chaque retour.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => { /* hors ligne ou non supporté : l'appli marche quand même */ });
  // Nouvelle version installée : on recharge une fois pour l'utiliser (sauf si une saisie est en cours).
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !navigator.serviceWorker.controller) return;
    reloading = true;
    if (sheetOpen) toast('Nouvelle version disponible : elle sera utilisée à la prochaine ouverture.');
    else location.reload();
  });
}

// Au retour sur l'appli (le lendemain par exemple), on recalcule avec la date du jour.
document.addEventListener('visibilitychange', () => { if (!document.hidden && !sheetOpen) render(); });

if (state && state.setupDone) S.requestPersistence();
render();
