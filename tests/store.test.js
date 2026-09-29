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
