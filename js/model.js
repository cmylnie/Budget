// Calculs purs : aucune lecture du DOM, aucune date implicite.
// Chaque fonction reçoit l'état et, si besoin, la date du jour ("YYYY-MM-DD").
import { ym, dayOf, addMonthsYM, monthDiff, dateInMonth, addDays, diffDays } from './dates.js';

export const ENVELOPES = ['quotidien', 'plaisirs'];
export const ENVELOPE_NAMES = { quotidien: 'Quotidien', plaisirs: 'Plaisirs', projet: 'Projet' };

export const r2 = n => Math.round(n * 100) / 100;
const sum = (list, f = x => x) => r2(list.reduce((s, x) => s + f(x), 0));

export function byDate(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return (a.createdAt || 0) - (b.createdAt || 0);
}

/* ---------- Points de recalage ---------- */
// Un recalage fixe le solde réel à une date. Tout ce qui est daté avant (ou le même jour
// mais saisi avant le recalage) est considéré comme déjà inclus dans ce solde.

export function latestAnchor(anchors, date) {
  let best = null;
  for (const a of anchors || []) {
    if (a.date > date) continue;
    if (!best || a.date > best.date || (a.date === best.date && a.createdAt > best.createdAt)) best = a;
  }
  return best;
}

function afterAnchor(item, anchor) {
  if (!anchor) return true;
  if (item.date !== anchor.date) return item.date > anchor.date;
  return (item.createdAt || 0) > (anchor.createdAt || 0);
}

/* ---------- Valeurs datées ---------- */

// history : [{from:"YYYY-MM"|"YYYY-MM-DD", ...}] ; renvoie l'entrée applicable à `key`.
export function entryAt(history, key, fallbackFirst = false) {
  let best = null;
  for (const h of history || []) {
    if (h.from <= key && (!best || h.from > best.from)) best = h;
  }
  if (!best && fallbackFirst && history && history.length) {
    best = [...history].sort((a, b) => (a.from < b.from ? -1 : 1))[0];
  }
  return best;
}

/* ---------- Prélèvements ---------- */

// Montants de chaque échéance : saisis (inst.amounts, ex. 4× sans frais aux montants inégaux),
// sinon partage égal où le dernier versement absorbe l'arrondi.
export function installmentAmount(inst, idx) {
  if (inst.amounts && inst.amounts[idx] != null) return inst.amounts[idx];
  const base = Math.floor((inst.total / inst.count) * 100) / 100;
  return idx === inst.count - 1 ? r2(inst.total - base * (inst.count - 1)) : base;
}

export function chargeEndYM(c) {
  if (c.installment) return addMonthsYM(c.start, c.installment.count - 1);
  return c.end || null;
}

// Pourquoi une charge ne tombe pas un mois donné (ou null si elle tombe).
export function chargeSkipReason(c, m) {
  if (m < c.start) return 'pas-commence';
  const end = chargeEndYM(c);
  if (end && m > end) return 'termine';
  if ((c.skips || []).includes(m)) return 'saute';
  return null;
}

export function chargeAmountForMonth(c, m) {
  if (chargeSkipReason(c, m)) return 0;
  if (c.installment) return installmentAmount(c.installment, monthDiff(c.start, m));
  if (c.variable) {
    const real = c.actuals && c.actuals[m];
    return real != null ? real : variableEstimate(c, m);
  }
  const e = entryAt(c.history, m);
  return e ? e.amount : 0;
}

// Montant variable (péage, électricité…) : tant que le montant réel du mois n'est pas saisi, on prend
// la moyenne des 3 derniers montants réels, ou à défaut le montant estimé indiqué.
export function variableEstimate(c, m) {
  const prev = Object.keys(c.actuals || {}).filter(k => k < m && c.actuals[k] != null).sort().slice(-3);
  if (prev.length) return r2(prev.reduce((s, k) => s + c.actuals[k], 0) / prev.length);
  const e = entryAt(c.history, m, true);
  return e ? e.amount : 0;
}

export function isEstimated(c, m) {
  return !!c.variable && !(c.actuals && c.actuals[m] != null);
}

// Occurrences datées des prélèvements entre `from` et `to` inclus.
export function chargeOccurrences(state, from, to, filter) {
  const out = [];
  if (!from || !to || from > to) return out;
  const last = ym(to);
  for (const c of state.charges) {
    if (filter && !filter(c)) continue;
    let m = ym(from) < c.start ? c.start : ym(from);
    while (m <= last) {
      const amount = chargeAmountForMonth(c, m);
      if (amount > 0) {
        const date = dateInMonth(m, c.day || 1);
        if (date >= from && date <= to) out.push({ charge: c, date, amount, month: m });
      }
      m = addMonthsYM(m, 1);
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/* ---------- Compte courant ---------- */

export function accountBalance(state, date) {
  const a = latestAnchor(state.anchors, date);
  let bal = a ? a.balance : 0;
  const counts = x => x.date <= date && afterAnchor(x, a);
  for (const p of state.paies) if (counts(p)) bal += p.amount;
  for (const i of state.incomes) if (counts(i)) bal += i.amount;
  for (const e of state.expenses) if (counts(e)) bal -= e.amount;
  for (const m of state.movements) if (counts(m)) bal += m.direction === 'vers' ? -m.amount : m.amount;
  const from = a ? addDays(a.date, 1) : state.startDate;
  for (const o of chargeOccurrences(state, from, date)) bal -= o.amount;
  return r2(bal);
}

/* ---------- Livrets ---------- */

export function savingsBalance(state, accountId, date) {
  const acc = state.accounts.find(x => x.id === accountId);
  if (!acc) return 0;
  const a = latestAnchor(acc.anchors, date);
  let bal = a ? a.balance : 0;
  for (const m of state.movements) {
    if (m.accountId !== accountId || m.date > date || !afterAnchor(m, a)) continue;
    bal += m.direction === 'vers' ? m.amount : -m.amount;
  }
  const from = a ? addDays(a.date, 1) : state.startDate;
  for (const o of chargeOccurrences(state, from, date, c => c.kind === 'epargne' && c.accountId === accountId)) bal += o.amount;
  return r2(bal);
}

// Historique d'un livret (mouvements saisis + versements automatiques), du plus récent au plus ancien.
export function savingsHistory(state, accountId, date) {
  const acc = state.accounts.find(x => x.id === accountId);
  if (!acc) return [];
  const first = [...(acc.anchors || [])].sort(byDate)[0];
  const from = first ? addDays(first.date, 1) : state.startDate;
  const items = state.movements
    .filter(m => m.accountId === accountId && m.date <= date)
    .map(m => ({ type: 'mouvement', date: m.date, amount: m.direction === 'vers' ? m.amount : -m.amount, label: m.label, ref: m, createdAt: m.createdAt }));
  for (const o of chargeOccurrences(state, from, date, c => c.kind === 'epargne' && c.accountId === accountId)) {
    items.push({ type: 'auto', date: o.date, amount: o.amount, label: o.charge.label, ref: o.charge, createdAt: 0 });
  }
  for (const an of acc.anchors || []) items.push({ type: 'recalage', date: an.date, amount: an.balance, label: 'Solde recalé', createdAt: an.createdAt });
  return items.sort(byDate).reverse();
}

/* ---------- Projets ---------- */

export function projectSaved(state, projectId) {
  return sum(state.projectEntries.filter(e => e.projectId === projectId), e => e.amount);
}

export function reservedOnAccount(state, accountId) {
  return sum(state.projects.filter(p => p.accountId === accountId), p => projectSaved(state, p.id));
}

// Nombre de paies restantes avant l'échéance (au moins 1).
export function paiesUntil(state, today, due) {
  const payDay = state.settings.paydayEstimateDay || 30;
  let n = monthDiff(ym(today), ym(due));
  if (dayOf(due) < payDay) n -= 1;         // la paie du mois de l'échéance arrive trop tard
  if (dayOf(today) < payDay && !paidThisMonth(state, today)) n += 1; // la paie de ce mois-ci est encore à venir
  return Math.max(1, n);
}

function paidThisMonth(state, today) {
  return state.paies.some(p => ym(p.date) === ym(today) && p.date <= today);
}

// Coût réel d'un projet : les dépenses rangées dans ce projet et les prélèvements qui lui sont liés.
// Un paiement en plusieurs fois compte en entier (même les échéances après l'événement) ; un
// prélèvement mensuel lié compte jusqu'à l'échéance du projet (ou aujourd'hui s'il n'y en a pas).
export function projectCost(state, p, today) {
  const items = state.expenses
    .filter(e => e.envelope === 'projet' && e.projectId === p.id)
    .map(e => ({ type: 'depense', date: e.date, amount: e.amount, label: e.label, ref: e }));
  for (const c of state.charges.filter(x => x.projectId === p.id)) {
    const end = chargeEndYM(c);
    const to = end ? dateInMonth(end, 31) : (p.due && p.due > today ? p.due : today);
    for (const o of chargeOccurrences(state, c.start + '-01', to, x => x.id === c.id)) {
      items.push({ type: 'prelevement', date: o.date, amount: o.amount, label: c.label, ref: c, upcoming: o.date > today });
    }
  }
  items.sort(byDate);
  const spent = sum(items.filter(i => !i.upcoming), i => i.amount);
  const upcoming = sum(items.filter(i => i.upcoming), i => i.amount);
  return { items, spent, upcoming, total: r2(spent + upcoming) };
}

// Ce qui est dépensé ou déjà prévu (prélèvements à venir) réduit ce qu'il reste à mettre de côté.
// Dépasser l'objectif n'est pas une erreur : c'est le coût réel de l'événement.
export function projectStatus(state, p, today) {
  const saved = projectSaved(state, p.id);
  const cost = projectCost(state, p, today);
  const remaining = r2(Math.max(0, p.target - cost.total - saved));
  const past = !!p.due && p.due < today;
  const perPaie = remaining > 0 && p.due && !past ? r2(remaining / paiesUntil(state, today, p.due)) : null;
  return {
    saved, spent: cost.spent, upcoming: cost.upcoming, cost: cost.total, items: cost.items,
    remaining, funded: remaining === 0, past, perPaie,
    over: r2(Math.max(0, cost.total - p.target)),
    pct: p.target > 0 ? Math.min(1, (cost.total + saved) / p.target) : 0,
  };
}

/* ---------- Paies et cycles ---------- */
// Un cycle va d'une paie (incluse) à la veille de la suivante. Le cycle en cours n'a pas de fin.

export function cycles(state) {
  const ps = [...state.paies].sort(byDate);
  return ps.map((p, i) => ({ id: p.id, index: i, paie: p, start: p.date, end: ps[i + 1] ? addDays(ps[i + 1].date, -1) : null }));
}

export function currentCycle(state, today) {
  const cs = cycles(state).filter(c => c.start <= today);
  return cs[cs.length - 1] || null;
}

// Date estimée de la paie suivante : le jour habituel (25 par défaut) du mois d'après.
export function expectedNextPaie(state, cycle) {
  const day = state.settings.paydayEstimateDay || 30;
  const m = dayOf(cycle.start) >= 15 ? addMonthsYM(ym(cycle.start), 1) : ym(cycle.start);
  return dateInMonth(m, day);
}

// Salaire attendu pour la paie versée le mois `m` : salaire de base + extras prévus ce mois-là.
export function expectedSalary(state, m) {
  const e = entryAt(state.settings.salaryHistory, m, true);
  const base = e ? e.amount : 0;
  const [y, mo] = m.split('-').map(Number);
  const extras = state.extras.filter(x => x.month === mo && (x.yearly || x.year === y));
  return { base, extras, total: r2(base + sum(extras, x => x.amount)) };
}

/* ---------- Enveloppes ---------- */

export function envelopeDefault(state, date, env) {
  const e = entryAt(state.settings.envelopeHistory, date, true);
  return e ? e[env] || 0 : 0;
}

export function expensesIn(state, from, to, filter) {
  return state.expenses.filter(e => e.date >= from && (!to || e.date <= to) && (!filter || filter(e)));
}

// Calcule toutes les enveloppes du premier cycle jusqu'à `cycle`, pour propager les reports.
export function envelopeStatus(state, cycle, env) {
  const cs = cycles(state);
  let carry = 0;
  let res = null;
  for (let i = 0; i <= cycle.index; i++) {
    const c = cs[i];
    const info = state.cycles[c.id] || {};
    const override = info.budget && info.budget[env];
    const base = override != null ? override : envelopeDefault(state, c.start, env);
    const budget = r2(base + carry);
    const spent = sum(expensesIn(state, c.start, c.end, e => e.envelope === env), e => e.amount);
    const left = r2(budget - spent);
    // Par défaut l'enveloppe repart à zéro à la paie suivante ; le reste n'est reporté que si on le demande.
    const action = (info.closure && info.closure[env] && info.closure[env].action) || 'compte';
    res = { base, carry, budget, spent, left, overridden: override != null, action };
    carry = action === 'report' ? left : 0;
  }
  return res;
}

/* ---------- Tableau de bord ---------- */

export function dashboard(state, today) {
  const cycle = currentCycle(state, today);
  if (!cycle) return null;
  const nextPaie = expectedNextPaie(state, cycle);
  const overdue = today >= nextPaie;
  const daysLeft = Math.max(0, diffDays(today, nextPaie));
  const solde = accountBalance(state, today);
  const upcoming = overdue ? [] : chargeOccurrences(state, addDays(today, 1), addDays(nextPaie, -1));
  const passed = chargeOccurrences(state, cycle.start, today);
  const aVenir = sum(upcoming, o => o.amount);
  const soldePrevu = r2(solde - aVenir);
  const envs = ENVELOPES.map(env => ({ env, ...envelopeStatus(state, cycle, env) }));
  const resteADepenser = sum(envs, e => Math.max(0, e.left));
  const nonAffecte = r2(soldePrevu - resteADepenser);
  return { cycle, nextPaie, overdue, daysLeft, solde, upcoming, passed, aVenir, soldePrevu, envs, resteADepenser, nonAffecte };
}

// Prévisions : pour chacune des n prochaines paies, ce qui resterait après prélèvements et enveloppes.
export function forecast(state, today, n = 6) {
  const cycle = currentCycle(state, today);
  if (!cycle) return [];
  const day = state.settings.paydayEstimateDay || 30;
  const first = ym(expectedNextPaie(state, cycle));
  const rows = [];
  for (let k = 0; k < n; k++) {
    const m = addMonthsYM(first, k);
    const paieDate = dateInMonth(m, day);
    const nextDate = dateInMonth(addMonthsYM(m, 1), day);
    const salary = expectedSalary(state, m);
    const occ = chargeOccurrences(state, paieDate, addDays(nextDate, -1));
    const fixes = sum(occ.filter(o => o.charge.kind !== 'epargne'), o => o.amount);
    const epargne = sum(occ.filter(o => o.charge.kind === 'epargne'), o => o.amount);
    const enveloppes = r2(ENVELOPES.reduce((s, env) => s + envelopeDefault(state, paieDate, env), 0));
    rows.push({ month: m, paieDate, salary, fixes, epargne, enveloppes, reste: r2(salary.total - fixes - epargne - enveloppes) });
  }
  return rows;
}

/* ---------- Analyse ---------- */

export function spendingByFamily(state, from, to, includeCharges) {
  const fams = new Map();
  const bucket = famId => {
    if (!fams.has(famId)) fams.set(famId, { familyId: famId, total: 0, items: new Map() });
    return fams.get(famId);
  };
  const add = (famId, key, label, amount) => {
    const f = bucket(famId);
    f.total += amount;
    const it = f.items.get(key) || { key, label, total: 0 };
    it.total += amount;
    f.items.set(key, it);
  };
  const catById = new Map(state.categories.map(c => [c.id, c]));
  for (const e of expensesIn(state, from, to)) {
    const cat = catById.get(e.categoryId);
    add(cat ? cat.familyId : 'divers', 'cat:' + (cat ? cat.id : 'aucune'), cat ? cat.name : 'Sans catégorie', e.amount);
  }
  if (includeCharges) {
    for (const o of chargeOccurrences(state, from, to, c => c.kind !== 'epargne')) {
      add(o.charge.familyId || 'divers', 'chg:' + o.charge.id, o.charge.label, o.amount);
    }
  }
  const list = [...fams.values()].map(f => ({
    familyId: f.familyId,
    total: r2(f.total),
    items: [...f.items.values()].map(i => ({ ...i, total: r2(i.total) })).sort((a, b) => b.total - a.total),
  }));
  return list.sort((a, b) => b.total - a.total);
}

/* ---------- Bilan d'un cycle ---------- */
// Ce qui est entré, sorti et parti vers les livrets pendant le cycle, l'état des enveloppes, les
// dépenses par famille et les familles en hausse par rapport aux 3 cycles précédents.
export function cycleReport(state, cycle, today) {
  const to = cycle.end || today;
  const inC = x => x.date >= cycle.start && x.date <= to;
  const paies = sum(state.paies.filter(inC), p => p.amount);
  const revenus = sum(state.incomes.filter(inC), i => i.amount);
  const occ = chargeOccurrences(state, cycle.start, to);
  const prelevements = sum(occ.filter(o => o.charge.kind !== 'epargne'), o => o.amount);
  const epargneAuto = sum(occ.filter(o => o.charge.kind === 'epargne'), o => o.amount);
  const epargneManuelle = sum(state.movements.filter(inC), m => (m.direction === 'vers' ? m.amount : -m.amount));
  const exps = expensesIn(state, cycle.start, to);
  const depenses = {
    quotidien: sum(exps.filter(e => e.envelope === 'quotidien'), e => e.amount),
    plaisirs: sum(exps.filter(e => e.envelope === 'plaisirs'), e => e.amount),
    projet: sum(exps.filter(e => e.envelope === 'projet'), e => e.amount),
  };
  const depensesTotal = r2(depenses.quotidien + depenses.plaisirs + depenses.projet);
  const entrees = r2(paies + revenus);
  const epargne = r2(epargneAuto + epargneManuelle);
  const familles = spendingByFamily(state, cycle.start, to, true);

  const prev = cycles(state).slice(Math.max(0, cycle.index - 3), cycle.index);
  const avg = new Map();
  for (const p of prev) {
    for (const f of spendingByFamily(state, p.start, p.end, true)) avg.set(f.familyId, (avg.get(f.familyId) || 0) + f.total / prev.length);
  }
  const hausses = prev.length
    ? familles
      .map(f => ({ familyId: f.familyId, total: f.total, moyenne: r2(avg.get(f.familyId) || 0) }))
      .map(f => ({ ...f, ecart: r2(f.total - f.moyenne) }))
      .filter(f => f.ecart >= 20 && f.total > f.moyenne * 1.2)
      .sort((a, b) => b.ecart - a.ecart)
      .slice(0, 3)
    : [];

  return {
    from: cycle.start, to, enCours: !cycle.end, nbCyclesCompares: prev.length,
    paies, revenus, entrees, prelevements, depenses, depensesTotal, epargne,
    // ce que le compte courant a gagné (+) ou perdu (−) pendant le cycle
    resultat: r2(entrees - prelevements - depensesTotal - epargne),
    enveloppes: ENVELOPES.map(env => ({ env, ...envelopeStatus(state, cycle, env) })),
    familles, hausses,
  };
}
