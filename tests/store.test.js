import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../js/store.js';
import { emptyState } from '../js/defaults.js';

test('les nouvelles familles par défaut sont ajoutées une seule fois aux données existantes', () => {
  const old = emptyState();
  delete old.settings.defaultsVersion; // données de la première version
  old.families = old.families.filter(f => f.id !== 'voyages');
  old.categories = old.categories.filter(c => c.familyId !== 'voyages');
  const s = normalize(old);
  assert.equal(s.families[s.families.findIndex(f => f.id === 'cadeaux') + 1].id, 'voyages');
  assert.equal(s.categories.filter(c => c.familyId === 'voyages').length, 4);
  assert.ok(!s.families.some(f => 'since' in f));
  // supprimée ensuite par l'utilisatrice : elle ne revient pas
  s.families = s.families.filter(f => f.id !== 'voyages');
  assert.ok(!normalize(s).families.some(f => f.id === 'voyages'));
});

test('ancienne estimation de paie au 25 remplacée par le 30', () => {
  const old = emptyState();
  delete old.settings.defaultsVersion;
  old.settings.paydayEstimateDay = 25;
  assert.equal(normalize(old).settings.paydayEstimateDay, 30);
  const chosen = emptyState();
  chosen.settings.paydayEstimateDay = 27;
  assert.equal(normalize(chosen).settings.paydayEstimateDay, 27);
});

test('« Crédits » devient « Banque » et absorbe les assurances', () => {
  const old = emptyState();
  old.settings.defaultsVersion = 3;
  const banque = old.families.find(f => f.id === 'credits');
  banque.name = 'Crédits';
  old.families.push({ id: 'assurances', name: 'Assurances', icon: '🛡️' });
  old.categories = old.categories.filter(c => c.familyId !== 'credits');
  old.charges.push({ id: 'a', label: 'Assurance auto', familyId: 'assurances' }, { id: 'p', label: 'Prêt', familyId: 'credits' });
  const s = normalize(old);
  assert.equal(s.families.find(f => f.id === 'credits').name, 'Banque');
  assert.ok(!s.families.some(f => f.id === 'assurances'));
  assert.deepEqual(s.charges.map(c => c.familyId), ['credits', 'credits']);
  assert.deepEqual(s.categories.filter(c => c.familyId === 'credits').map(c => c.name), ['Crédit', 'Frais bancaires', 'Assurances']);
});

test('Banque déjà renommée et catégories ajoutées à la main : pas de doublon', () => {
  const old = emptyState();
  old.settings.defaultsVersion = 3;
  old.families.find(f => f.id === 'credits').name = 'Banque';
  old.families.push({ id: 'assurances', name: 'Assurances', icon: '🛡️' });
  old.categories = old.categories.filter(c => c.familyId !== 'credits');
  old.categories.push(
    { id: 'u1', name: 'Assurances', familyId: 'credits', envelope: 'quotidien' },
    { id: 'u2', name: 'Crédits', familyId: 'credits', envelope: 'quotidien' },
    { id: 'u3', name: 'Frais bancaire', familyId: 'credits', envelope: 'quotidien' },
  );
  old.charges.push({ id: 'a', label: 'Assurance auto', familyId: 'assurances' });
  const s = normalize(old);
  assert.deepEqual(s.categories.filter(c => c.familyId === 'credits').map(c => c.id), ['u1', 'u2', 'u3']);
  assert.ok(!s.families.some(f => f.id === 'assurances'));
  assert.equal(s.charges[0].familyId, 'credits');
});

test('report validé auparavant par défaut : retiré une fois (enveloppes à zéro)', () => {
  const old = emptyState();
  old.settings.defaultsVersion = 4;
  old.cycles = { p1: { closure: { quotidien: { action: 'report' }, plaisirs: { action: 'livret', accountId: 'a', movementId: 'm' } } } };
  const s = normalize(old);
  assert.equal(s.cycles.p1.closure.quotidien.action, 'compte');
  assert.equal(s.cycles.p1.closure.plaisirs.action, 'livret');
  // un report choisi ensuite est conservé
  s.cycles.p1.closure.quotidien.action = 'report';
  assert.equal(normalize(s).cycles.p1.closure.quotidien.action, 'report');
});

test('ancienne dépense de projet qui réduisait l’argent de côté : écriture retirée, virements gardés', () => {
  const old = emptyState();
  old.settings.defaultsVersion = 5;
  old.projectEntries = [
    { id: 'e1', projectId: 'p', amount: 200, movementId: 'm1', expenseId: null },
    { id: 'e2', projectId: 'p', amount: -50, movementId: null, expenseId: 'x' },
    { id: 'e3', projectId: 'p', amount: -30, movementId: 'm2', expenseId: 'y' },
  ];
  assert.deepEqual(normalize(old).projectEntries.map(e => e.id), ['e1', 'e3']);
});

test('Cantine ajoutée à la liste de base, sans doublon avec une catégorie créée à la main', () => {
  const old = emptyState();
  old.settings.defaultsVersion = 6;
  old.categories = old.categories.filter(c => c.id !== 'cantine');
  assert.ok(normalize(JSON.parse(JSON.stringify(old))).categories.some(c => c.id === 'cantine' && c.envelope === 'quotidien'));
  old.categories.push({ id: 'u9', name: 'Cantine', familyId: 'alimentation', envelope: 'quotidien' });
  assert.equal(normalize(old).categories.filter(c => /cantine/i.test(c.name)).length, 1);
});
