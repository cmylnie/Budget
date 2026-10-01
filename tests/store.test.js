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
