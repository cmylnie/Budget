// Persistance locale (localStorage) + sauvegarde/restauration en fichier JSON.
import { APP_ID, SCHEMA_VERSION, DEFAULTS_VERSION, DEFAULT_FAMILIES, DEFAULT_CATEGORIES, emptyState } from './defaults.js';

const KEY = 'mes-enveloppes:v1';

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch (e) {
    console.error('Lecture impossible', e);
    return null;
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('Enregistrement impossible', e);
    return false;
  }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch (e) { /* rien à effacer */ }
}

// Complète un état lu (ou importé) avec les champs apparus dans les versions suivantes.
export function normalize(s) {
  const base = emptyState();
  const out = { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
  for (const k of Object.keys(base)) {
    if (Array.isArray(base[k]) && !Array.isArray(out[k])) out[k] = base[k];
  }
  if (!out.cycles || typeof out.cycles !== 'object') out.cycles = {};
  // Données enregistrées avant l'apparition de ce champ : version 1 des valeurs par défaut.
  out.settings.defaultsVersion = (s.settings && s.settings.defaultsVersion) || 1;
  addNewDefaults(out);
  out.version = SCHEMA_VERSION;
  return out;
}

function addNewDefaults(s) {
  const from = s.settings.defaultsVersion || 1;
  if (from >= DEFAULTS_VERSION) return;
  for (const { since, ...f } of DEFAULT_FAMILIES) {
    if (since > from && !s.families.some(x => x.id === f.id)) {
      // rangée à la même place que dans la liste par défaut (après la famille qui la précède)
      const prev = DEFAULT_FAMILIES[DEFAULT_FAMILIES.findIndex(x => x.id === f.id) - 1];
      const at = prev ? s.families.findIndex(x => x.id === prev.id) : -1;
      s.families.splice(at >= 0 ? at + 1 : s.families.length, 0, f);
    }
  }
  for (const { since, ...c } of DEFAULT_CATEGORIES) {
    if (since > from && !s.categories.some(x => x.id === c.id)) s.categories.push(c);
  }
  // v3 : la paie (entre le 25 et le 30) est estimée au plus tard, pour que les prélèvements du 25 au 29
  // soient comptés avant la paie. L'ancienne valeur par défaut (25) est remplacée.
  if (from < 3 && s.settings.paydayEstimateDay === 25) s.settings.paydayEstimateDay = 30;
  // v4 : « Crédits » devient « Banque » et accueille les assurances (souscrites à la banque).
  if (from < 4) {
    const banque = s.families.find(f => f.id === 'credits');
    if (banque && banque.name === 'Crédits') banque.name = 'Banque';
    const assur = s.families.find(f => f.id === 'assurances');
    if (banque && assur) {
      for (const c of s.charges) if (c.familyId === 'assurances') c.familyId = 'credits';
      for (const c of s.categories) if (c.familyId === 'assurances') c.familyId = 'credits';
      s.families = s.families.filter(f => f.id !== 'assurances');
    }
  }
  s.settings.defaultsVersion = DEFAULTS_VERSION;
}

export function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { throw new Error("Ce fichier n'est pas une sauvegarde lisible."); }
  if (!obj || obj.app !== APP_ID) throw new Error("Ce fichier n'est pas une sauvegarde de Mes Enveloppes.");
  if (typeof obj.version !== 'number' || obj.version > SCHEMA_VERSION) {
    throw new Error('Cette sauvegarde vient d’une version plus récente de l’appli.');
  }
  return normalize(obj);
}

export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) { /* non supporté */ }
  return false;
}
