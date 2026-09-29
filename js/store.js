// Persistance locale (localStorage) + sauvegarde/restauration en fichier JSON.
import { APP_ID, SCHEMA_VERSION, emptyState } from './defaults.js';

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
  out.version = SCHEMA_VERSION;
  return out;
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
