// Modifications de l'état. Chaque fonction modifie `state` en place ; l'interface enregistre ensuite.
import { emptyState } from './defaults.js';
import { ym, addMonthsYM } from './dates.js';
import { cycles, envelopeStatus, ENVELOPES, r2 } from './model.js';

let counter = 0;
export function uid() {
  counter = (counter + 1) % 1296;
  return Date.now().toString(36) + counter.toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 5);
}

// Horodatage strictement croissant : deux saisies dans la même milliseconde restent ordonnées.
let last = 0;
export function stamp() {
  const t = Date.now();
  last = t > last ? t : last + 1;
  return last;
}

// Premier lancement. La paie déjà reçue est saisie *avant* le recalage : elle est donc comprise
// dans le solde indiqué et n'est pas ajoutée une seconde fois.
export function setupState({ today, balance, paieDate, paieAmount, baseSalary, quotidien, plaisirs, accounts }) {
  const s = emptyState();
  const t = stamp();
  s.setupDone = true;
  s.startDate = today;
  s.paies.push({ id: uid(), date: paieDate, amount: paieAmount, note: '', createdAt: t - 2 });
  s.anchors.push({ id: uid(), date: today, balance, createdAt: t });
  s.settings.salaryHistory.push({ from: ym(paieDate), amount: baseSalary });
  s.settings.envelopeHistory.push({ from: paieDate, quotidien, plaisirs });
  for (const a of accounts) {
    s.accounts.push({ id: uid(), name: a.name, anchors: [{ date: today, balance: a.balance, createdAt: t }], createdAt: t });
  }
  return s;
}

export function recalerCompte(state, date, balance) {
  state.anchors.push({ id: uid(), date, balance, createdAt: stamp() });
}

export function recalerLivret(state, accountId, date, balance) {
  const acc = state.accounts.find(a => a.id === accountId);
  acc.anchors.push({ date, balance, createdAt: stamp() });
}

export function addPaie(state, { date, amount, note }) {
  const p = { id: uid(), date, amount, note: note || '', createdAt: stamp() };
  state.paies.push(p);
  return p;
}

// Cycle qui se termine juste avant la paie `paieId` (null si c'est la première).
export function previousCycle(state, paieId) {
  const cs = cycles(state);
  const i = cs.findIndex(c => c.id === paieId);
  return i > 0 ? cs[i - 1] : null;
}

// Ce qu'il reste dans chaque enveloppe à la fin du cycle.
export function leftovers(state, cycle) {
  return ENVELOPES.map(env => ({ env, left: envelopeStatus(state, cycle, env).left }));
}

// choices : {quotidien:{action:'report'|'livret'|'compte', accountId}, ...}
export function setClosure(state, cycle, choices) {
  const info = state.cycles[cycle.id] || (state.cycles[cycle.id] = {});
  const old = info.closure || {};
  for (const env of Object.keys(old)) {
    if (old[env].movementId) state.movements = state.movements.filter(m => m.id !== old[env].movementId);
  }
  info.closure = {};
  const next = cycles(state)[cycle.index + 1];
  for (const env of ENVELOPES) {
    const ch = choices[env] || { action: 'report' };
    const entry = { action: ch.action };
    if (ch.action === 'livret' && ch.accountId) {
      const left = envelopeStatus(state, cycle, env).left;
      if (left > 0) {
        const mv = {
          id: uid(), date: next ? next.start : cycle.end, accountId: ch.accountId, direction: 'vers', amount: left,
          label: `Reste ${env === 'quotidien' ? 'Quotidien' : 'Plaisirs'}`, projectId: null, kind: 'cloture', createdAt: stamp(),
        };
        state.movements.push(mv);
        entry.accountId = ch.accountId;
        entry.movementId = mv.id;
      }
    }
    info.closure[env] = entry;
  }
}

export function setCycleBudget(state, cycleId, env, amount) {
  const info = state.cycles[cycleId] || (state.cycles[cycleId] = {});
  info.budget = info.budget || {};
  if (amount == null) delete info.budget[env];
  else info.budget[env] = amount;
}

// Nouveau montant par défaut des enveloppes, à partir du cycle `fromDate` (le passé n'est pas modifié).
export function setEnvelopeDefaults(state, fromDate, values) {
  const h = state.settings.envelopeHistory;
  const same = h.find(x => x.from === fromDate);
  if (same) Object.assign(same, values);
  else h.push({ from: fromDate, ...values });
  h.sort((a, b) => (a.from < b.from ? -1 : 1));
}

export function setBaseSalary(state, fromYM, amount) {
  const h = state.settings.salaryHistory;
  const same = h.find(x => x.from === fromYM);
  if (same) same.amount = amount;
  else h.push({ from: fromYM, amount });
  h.sort((a, b) => (a.from < b.from ? -1 : 1));
}

/* ---------- Prélèvements ---------- */

// Nouveau montant à partir du mois `fromYM` ; même mois = correction du montant existant.
export function setChargeAmount(charge, fromYM, amount) {
  const same = charge.history.find(h => h.from === fromYM);
  if (same) same.amount = amount;
  else charge.history.push({ from: fromYM, amount });
  charge.history.sort((a, b) => (a.from < b.from ? -1 : 1));
  if (fromYM < charge.start) charge.start = fromYM;
}

// Montant réellement prélevé un mois donné (null pour revenir à l'estimation).
export function setChargeActual(charge, m, amount) {
  charge.actuals = charge.actuals || {};
  if (amount == null) delete charge.actuals[m];
  else charge.actuals[m] = amount;
}

export function toggleSkip(charge, m) {
  charge.skips = charge.skips || [];
  if (charge.skips.includes(m)) charge.skips = charge.skips.filter(x => x !== m);
  else charge.skips.push(m);
  charge.skips.sort();
}

/* ---------- Projets ---------- */

// Mettre de l'argent de côté pour un projet. fromAccount=true : virement depuis le compte courant.
export function contributeProject(state, project, { date, amount, fromAccount }) {
  let movementId = null;
  if (fromAccount) {
    const mv = { id: uid(), date, accountId: project.accountId, direction: 'vers', amount, label: project.name, projectId: project.id, kind: 'projet', createdAt: stamp() };
    state.movements.push(mv);
    movementId = mv.id;
  }
  state.projectEntries.push({ id: uid(), projectId: project.id, date, amount, note: fromAccount ? 'Versement' : 'Affecté depuis le livret', movementId, expenseId: null, createdAt: stamp() });
}

// Utiliser l'argent d'un projet : on le retire du projet, on le rapatrie éventuellement sur le compte
// et on enregistre la dépense (hors enveloppes Quotidien/Plaisirs).
export function useProject(state, project, { date, amount, label, categoryId, bringBack, recordExpense }) {
  let movementId = null;
  if (bringBack) {
    const mv = { id: uid(), date, accountId: project.accountId, direction: 'depuis', amount, label: project.name, projectId: project.id, kind: 'projet', createdAt: stamp() };
    state.movements.push(mv);
    movementId = mv.id;
  }
  let expenseId = null;
  if (recordExpense) {
    const e = { id: uid(), date, amount, label: label || project.name, categoryId, envelope: 'projet', projectId: project.id, createdAt: stamp() };
    state.expenses.push(e);
    expenseId = e.id;
  }
  state.projectEntries.push({ id: uid(), projectId: project.id, date, amount: -amount, note: label || 'Utilisé', movementId, expenseId, createdAt: stamp() });
}

// Une dépense rangée dans « Projet » puise dans l'argent du projet : on garde l'écriture du projet
// (et l'éventuel rapatriement depuis le livret) alignée sur la dépense.
export function syncProjectExpense(state, expense) {
  const entry = state.projectEntries.find(x => x.expenseId === expense.id);
  if (expense.envelope !== 'projet' || !expense.projectId) {
    if (entry) deleteProjectEntry(state, entry.id, { keepExpense: true });
    return;
  }
  if (entry && entry.projectId !== expense.projectId) {
    deleteProjectEntry(state, entry.id, { keepExpense: true });
    return syncProjectExpense(state, expense);
  }
  if (entry) {
    entry.amount = -expense.amount;
    entry.date = expense.date;
    const mv = entry.movementId && state.movements.find(m => m.id === entry.movementId);
    if (mv) { mv.amount = expense.amount; mv.date = expense.date; }
  } else {
    state.projectEntries.push({ id: uid(), projectId: expense.projectId, date: expense.date, amount: -expense.amount, note: expense.label || 'Dépense', movementId: null, expenseId: expense.id, createdAt: stamp() });
  }
}

export function deleteExpense(state, expenseId) {
  const entry = state.projectEntries.find(x => x.expenseId === expenseId);
  if (entry) deleteProjectEntry(state, entry.id);
  state.expenses = state.expenses.filter(e => e.id !== expenseId);
}

export function renewProject(project) {
  if (!project.due) return;
  const [y, m, d] = project.due.split('-').map(Number);
  project.due = `${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Clôturer un projet libère l'argent qui lui restait (il reste sur le livret, sans affectation).
export function closeProject(state, project, date, saved) {
  if (saved > 0) {
    state.projectEntries.push({ id: uid(), projectId: project.id, date, amount: -r2(saved), note: 'Libéré à la clôture', movementId: null, expenseId: null, createdAt: stamp() });
  }
  project.status = 'clos';
}

// Supprimer une écriture de projet supprime aussi le virement et la dépense qui en découlaient.
export function deleteProjectEntry(state, entryId, { keepExpense = false } = {}) {
  const e = state.projectEntries.find(x => x.id === entryId);
  if (!e) return;
  if (e.movementId) state.movements = state.movements.filter(m => m.id !== e.movementId);
  if (e.expenseId && !keepExpense) state.expenses = state.expenses.filter(x => x.id !== e.expenseId);
  state.projectEntries = state.projectEntries.filter(x => x.id !== entryId);
}

// Mouvement manuel vers/depuis un livret, éventuellement pour un projet.
export function saveMovement(state, existing, data) {
  let mv = existing;
  if (mv) Object.assign(mv, data);
  else {
    mv = { id: uid(), kind: 'manuel', createdAt: stamp(), ...data };
    state.movements.push(mv);
  }
  state.projectEntries = state.projectEntries.filter(x => x.movementId !== mv.id);
  if (mv.projectId) {
    const signed = mv.direction === 'vers' ? mv.amount : -mv.amount;
    state.projectEntries.push({ id: uid(), projectId: mv.projectId, date: mv.date, amount: signed, note: mv.label || (signed > 0 ? 'Versement' : 'Retrait'), movementId: mv.id, expenseId: null, createdAt: stamp() });
  }
  return mv;
}

export function deleteMovement(state, movementId) {
  state.movements = state.movements.filter(m => m.id !== movementId);
  state.projectEntries = state.projectEntries.filter(x => x.movementId !== movementId);
}

// Supprimer une paie fusionne son cycle avec le précédent : la clôture de celui-ci n'a plus lieu d'être.
export function deletePaie(state, paieId) {
  const prev = previousCycle(state, paieId);
  if (prev) setClosure(state, prev, {});
  if (prev && state.cycles[prev.id]) delete state.cycles[prev.id].closure;
  delete state.cycles[paieId];
  state.paies = state.paies.filter(p => p.id !== paieId);
}

export const monthsAhead = (fromYM, n) => Array.from({ length: n }, (_, i) => addMonthsYM(fromYM, i));
