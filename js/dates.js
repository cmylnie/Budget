// Dates manipulées en chaînes locales "YYYY-MM-DD" / mois "YYYY-MM".
// Jamais de toISOString() : il convertit en UTC et décale d'un jour en France.

export const pad = n => String(n).padStart(2, '0');

export function iso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}

export function todayISO(now = new Date()) {
  return iso(now);
}

export const ym = s => s.slice(0, 7);
export const dayOf = s => Number(s.slice(8, 10));

export function addMonthsYM(ymStr, n) {
  let [y, m] = ymStr.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  y = Math.floor(idx / 12);
  m = idx - y * 12 + 1;
  return `${y}-${pad(m)}`;
}

// Nombre de mois de a vers b (b − a).
export function monthDiff(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

export function daysInMonth(ymStr) {
  const [y, m] = ymStr.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// Jour `day` du mois, ramené au dernier jour si le mois est plus court (31 → 30 ou 28).
export function dateInMonth(ymStr, day) {
  return `${ymStr}-${pad(Math.min(day, daysInMonth(ymStr)))}`;
}

export function addDays(s, n) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

// Nombre de jours de a vers b (b − a).
export function diffDays(a, b) {
  return Math.round((parse(b) - parse(a)) / 86400000);
}

export const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function labelMonth(ymStr) {
  const [y, m] = ymStr.split('-').map(Number);
  return `${MOIS[m - 1]} ${y}`;
}

export function labelDay(s, withYear = false) {
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${MOIS_COURT[m - 1]}${withYear ? ' ' + y : ''}`;
}

export function labelDayLong(s) {
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${MOIS[m - 1]} ${y}`;
}
