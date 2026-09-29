import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/model.js';
import * as A from '../js/actions.js';
import { addMonthsYM, dateInMonth, monthDiff } from '../js/dates.js';

function base() {
  const s = A.setupState({
    today: '2026-09-29', balance: 2800, paieDate: '2026-09-27', paieAmount: 2452.04, baseSalary: 2452.04,
    quotidien: 300, plaisirs: 100, accounts: [{ name: 'Livret', balance: 1000 }],
  });
  const livret = s.accounts[0];
  s.charges.push(
    { id: 'orange', label: 'Box', familyId: 'abonnements', kind: 'fixe', accountId: null, day: 5, start: '2026-09', end: null, skips: [], history: [{ from: '2026-09', amount: 15.99 }], installment: null },
    { id: 'pret', label: 'Prêt', familyId: 'credits', kind: 'fixe', accountId: null, day: 10, start: '2026-09', end: null, skips: [], history: [{ from: '2026-09', amount: 343.26 }], installment: null },
    { id: 'auto', label: 'Épargne auto', familyId: 'divers', kind: 'epargne', accountId: livret.id, day: 1, start: '2026-09', end: null, skips: [], history: [{ from: '2026-09', amount: 20 }], installment: null },
  );
  return { s, livret };
}

let n = 0;
const exp = (s, date, amount, envelope, categoryId = 'courses') =>
  s.expenses.push({ id: 'e' + ++n, date, amount, label: '', categoryId, envelope, projectId: null, createdAt: A.stamp() });

test('dates : pas de décalage UTC, mois courts', () => {
  assert.equal(addMonthsYM('2026-12', 1), '2027-01');
  assert.equal(addMonthsYM('2026-01', -1), '2025-12');
  assert.equal(dateInMonth('2027-02', 31), '2027-02-28');
  assert.equal(monthDiff('2026-09', '2027-01'), 4);
});

test('la paie déjà reçue lors du démarrage n’est pas comptée deux fois', () => {
  const { s } = base();
  assert.equal(M.accountBalance(s, '2026-09-29'), 2800);
});

test('solde du compte : prélèvements passés et dépenses retirés', () => {
  const { s } = base();
  exp(s, '2026-09-30', 50, 'quotidien');
  assert.equal(M.accountBalance(s, '2026-09-30'), 2750);
  // 1er oct : épargne auto 20 ; 5 oct : box 15,99 ; 10 oct : prêt 343,26
  assert.equal(M.accountBalance(s, '2026-10-10'), M.r2(2750 - 20 - 15.99 - 343.26));
});

test('tableau de bord : jours avant la paie estimée, prélèvements à venir', () => {
  const { s } = base();
  const d = M.dashboard(s, '2026-09-29');
  assert.equal(d.nextPaie, '2026-10-25');
  assert.equal(d.daysLeft, 26);
  assert.equal(d.overdue, false);
  assert.equal(d.aVenir, M.r2(20 + 15.99 + 343.26));
  assert.equal(d.resteADepenser, 400);
  assert.equal(d.nonAffecte, M.r2(2800 - 379.25 - 400));
});

test('paie en retard : plus de « 1 jour » bloqué, la paie est signalée comme attendue', () => {
  const { s } = base();
  const d = M.dashboard(s, '2026-10-27');
  assert.equal(d.overdue, true);
  assert.equal(d.daysLeft, 0);
});

test('nouvelle paie : nouveau cycle et report du reste des enveloppes', () => {
  const { s } = base();
  exp(s, '2026-10-02', 250, 'quotidien');
  exp(s, '2026-10-03', 120, 'plaisirs');
  const p = A.addPaie(s, { date: '2026-10-26', amount: 2452.04 });
  const cur = M.currentCycle(s, '2026-10-27');
  assert.equal(cur.id, p.id);
  const q = M.envelopeStatus(s, cur, 'quotidien');
  assert.equal(q.carry, 50);
  assert.equal(q.budget, 350);
  const pl = M.envelopeStatus(s, cur, 'plaisirs');
  assert.equal(pl.carry, -20); // dépassement déduit du cycle suivant
});

test('clôture : reste viré sur un livret ou laissé sur le compte', () => {
  const { s, livret } = base();
  exp(s, '2026-10-02', 250, 'quotidien');
  const p = A.addPaie(s, { date: '2026-10-26', amount: 2452.04 });
  const prev = A.previousCycle(s, p.id);
  A.setClosure(s, prev, { quotidien: { action: 'livret', accountId: livret.id }, plaisirs: { action: 'compte' } });
  const cur = M.currentCycle(s, '2026-10-27');
  assert.equal(M.envelopeStatus(s, cur, 'quotidien').carry, 0);
  assert.equal(M.envelopeStatus(s, cur, 'plaisirs').carry, 0);
  assert.equal(M.savingsBalance(s, livret.id, '2026-10-27'), 1000 + 20 + 50);
  // changer d'avis supprime le virement créé
  A.setClosure(s, prev, { quotidien: { action: 'report' }, plaisirs: { action: 'report' } });
  assert.equal(M.savingsBalance(s, livret.id, '2026-10-27'), 1020);
  assert.equal(M.envelopeStatus(s, cur, 'quotidien').carry, 50);
});

test('prélèvements : changement de tarif, mois sauté, fin', () => {
  const { s } = base();
  const pret = s.charges.find(c => c.id === 'pret');
  A.setChargeAmount(pret, '2026-11', 350);
  assert.equal(M.chargeAmountForMonth(pret, '2026-10'), 343.26);
  assert.equal(M.chargeAmountForMonth(pret, '2026-11'), 350);
  A.toggleSkip(pret, '2026-12');
  assert.equal(M.chargeAmountForMonth(pret, '2026-12'), 0);
  assert.equal(M.chargeAmountForMonth(pret, '2027-01'), 350);
  pret.end = '2027-03';
  assert.equal(M.chargeAmountForMonth(pret, '2027-04'), 0);
});

test('paiement en plusieurs fois : le dernier versement absorbe l’arrondi', () => {
  const c = { start: '2026-10', installment: { total: 100, count: 3 }, skips: [], history: [] };
  assert.equal(M.chargeAmountForMonth(c, '2026-10'), 33.33);
  assert.equal(M.chargeAmountForMonth(c, '2026-12'), 33.34);
  assert.equal(M.chargeAmountForMonth(c, '2027-01'), 0);
});

test('salaire variable : extras annuels et ponctuels', () => {
  const { s } = base();
  s.extras.push({ id: 'x1', label: '13e mois', month: 11, year: null, yearly: true, amount: 2400 });
  s.extras.push({ id: 'x2', label: 'CET', month: 12, year: 2026, yearly: false, amount: 300 });
  A.setBaseSalary(s, '2027-05', 2500);
  assert.equal(M.expectedSalary(s, '2026-11').total, 4852.04);
  assert.equal(M.expectedSalary(s, '2026-12').total, 2752.04);
  assert.equal(M.expectedSalary(s, '2027-12').total, 2500);
  assert.equal(M.expectedSalary(s, '2027-11').total, 4900);
});

test('projets : versement sur le livret, réserve, utilisation', () => {
  const { s, livret } = base();
  const proj = { id: 'noel', name: 'Noël', target: 200, due: '2026-12-24', yearly: true, accountId: livret.id, status: 'actif' };
  s.projects.push(proj);
  A.contributeProject(s, proj, { date: '2026-09-29', amount: 50, fromAccount: true });
  assert.equal(M.projectSaved(s, 'noel'), 50);
  assert.equal(M.savingsBalance(s, livret.id, '2026-09-29'), 1050);
  assert.equal(M.reservedOnAccount(s, livret.id), 50);
  assert.equal(M.accountBalance(s, '2026-09-29'), 2750);
  // paies restantes avant le 24 déc. : fin oct. et fin nov. (celle de déc. arrive trop tard)
  assert.equal(M.projectStatus(s, proj, '2026-09-29').perPaie, 75);
  A.useProject(s, proj, { date: '2026-12-10', amount: 50, label: 'Jouets', categoryId: 'cadeaux', bringBack: true, recordExpense: true });
  assert.equal(M.projectSaved(s, 'noel'), 0);
  // l'argent rapatrié puis dépensé ne touche pas l'enveloppe Plaisirs
  const cyc = M.currentCycle(s, '2026-12-10');
  assert.equal(M.envelopeStatus(s, cyc, 'plaisirs').spent, 0);
});

test('recalage : le solde de la banque remplace l’estimation', () => {
  const { s } = base();
  exp(s, '2026-09-29', 30, 'quotidien');
  A.recalerCompte(s, '2026-09-29', 2700);
  assert.equal(M.accountBalance(s, '2026-09-29'), 2700);
  exp(s, '2026-09-29', 10, 'quotidien');
  assert.equal(M.accountBalance(s, '2026-09-29'), 2690);
});

test('analyse : dépenses regroupées par famille, prélèvements en option', () => {
  const { s } = base();
  exp(s, '2026-10-02', 40, 'quotidien', 'courses');
  exp(s, '2026-10-03', 60, 'plaisirs', 'restaurant');
  exp(s, '2026-10-04', 25, 'quotidien', 'boulangerie');
  const without = M.spendingByFamily(s, '2026-09-27', '2026-10-24', false);
  assert.deepEqual(without.map(f => [f.familyId, f.total]), [['alimentation', 65], ['sorties', 60]]);
  const withC = M.spendingByFamily(s, '2026-09-27', '2026-10-24', true);
  assert.equal(withC[0].familyId, 'credits');
  assert.ok(!withC.some(f => f.items.some(i => i.label === 'Épargne auto')));
});

test('prévisions : salaire prévu moins prélèvements et enveloppes', () => {
  const { s } = base();
  const rows = M.forecast(s, '2026-09-29', 2);
  assert.equal(rows[0].month, '2026-10');
  assert.equal(rows[0].fixes, M.r2(15.99 + 343.26));
  assert.equal(rows[0].epargne, 20);
  assert.equal(rows[0].reste, M.r2(2452.04 - 359.25 - 20 - 400));
});
