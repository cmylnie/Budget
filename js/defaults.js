// Données de départ génériques : aucune donnée personnelle ici.
// Tout le reste (solde, paie, prélèvements, livrets, projets) est saisi dans l'appli.

export const APP_ID = 'mes-enveloppes';
export const SCHEMA_VERSION = 1;

export const DEFAULT_FAMILIES = [
  { id: 'alimentation', name: 'Alimentation', icon: '🛒' },
  { id: 'transport', name: 'Transport', icon: '🚗' },
  { id: 'sante', name: 'Santé & soins', icon: '💊' },
  { id: 'maison', name: 'Maison', icon: '🏠' },
  { id: 'sorties', name: 'Sorties', icon: '🍽️' },
  { id: 'loisirs', name: 'Loisirs', icon: '🎨' },
  { id: 'shopping', name: 'Shopping', icon: '👗' },
  { id: 'cadeaux', name: 'Cadeaux', icon: '🎁' },
  { id: 'logement', name: 'Logement & foyer', icon: '🏡' },
  { id: 'assurances', name: 'Assurances', icon: '🛡️' },
  { id: 'abonnements', name: 'Abonnements', icon: '📱' },
  { id: 'credits', name: 'Crédits', icon: '🏦' },
  { id: 'divers', name: 'Divers', icon: '✳️' },
];

const cat = (id, name, familyId, envelope) => ({ id, name, familyId, envelope });

export const DEFAULT_CATEGORIES = [
  cat('courses', 'Courses', 'alimentation', 'quotidien'),
  cat('boulangerie', 'Boulangerie', 'alimentation', 'quotidien'),
  cat('marche', 'Marché, primeur', 'alimentation', 'quotidien'),
  cat('carburant', 'Carburant', 'transport', 'quotidien'),
  cat('peages', 'Péages', 'transport', 'quotidien'),
  cat('parking', 'Parking', 'transport', 'quotidien'),
  cat('transports', 'Transports en commun', 'transport', 'quotidien'),
  cat('entretien-auto', 'Entretien véhicule', 'transport', 'quotidien'),
  cat('pharmacie', 'Pharmacie', 'sante', 'quotidien'),
  cat('medecin', 'Médecin', 'sante', 'quotidien'),
  cat('coiffeur', 'Coiffeur', 'sante', 'quotidien'),
  cat('soins', 'Soins & beauté', 'sante', 'quotidien'),
  cat('menager', 'Produits ménagers', 'maison', 'quotidien'),
  cat('bricolage', 'Bricolage', 'maison', 'quotidien'),
  cat('equipement', 'Équipement maison', 'maison', 'quotidien'),
  cat('restaurant', 'Restaurant', 'sorties', 'plaisirs'),
  cat('cafe', 'Café, bar', 'sorties', 'plaisirs'),
  cat('livraison', 'Livraison repas', 'sorties', 'plaisirs'),
  cat('spectacles', 'Cinéma, spectacles', 'sorties', 'plaisirs'),
  cat('creatif', 'Loisirs créatifs', 'loisirs', 'plaisirs'),
  cat('livres', 'Livres', 'loisirs', 'plaisirs'),
  cat('sport', 'Sport', 'loisirs', 'plaisirs'),
  cat('jeux', 'Jeux', 'loisirs', 'plaisirs'),
  cat('vetements', 'Vêtements', 'shopping', 'plaisirs'),
  cat('accessoires', 'Accessoires', 'shopping', 'plaisirs'),
  cat('high-tech', 'High-tech', 'shopping', 'plaisirs'),
  cat('coup-de-coeur', 'Coup de cœur', 'shopping', 'plaisirs'),
  cat('cadeaux', 'Cadeaux', 'cadeaux', 'plaisirs'),
  cat('autre', 'Autre', 'divers', 'quotidien'),
];

export function emptyState() {
  return {
    app: APP_ID,
    version: SCHEMA_VERSION,
    setupDone: false,
    startDate: null,
    settings: {
      paydayEstimateDay: 25,
      salaryHistory: [],     // [{from:"YYYY-MM", amount}]
      envelopeHistory: [],   // [{from:"YYYY-MM-DD", quotidien, plaisirs}]
      lastBackupAt: null,
    },
    anchors: [],            // recalages du compte courant [{id, date, balance, createdAt}]
    paies: [],              // [{id, date, amount, note, createdAt}]
    extras: [],             // extras prévus [{id, label, month:1-12, year|null, yearly, amount}]
    incomes: [],            // [{id, date, amount, label, createdAt}]
    charges: [],            // voir docs/SPEC.md
    expenses: [],           // [{id, date, amount, label, categoryId, envelope, projectId, createdAt}]
    families: DEFAULT_FAMILIES.map(f => ({ ...f })),
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c })),
    accounts: [],           // livrets [{id, name, anchors:[{date, balance, createdAt}], createdAt}]
    movements: [],          // [{id, date, accountId, direction:'vers'|'depuis', amount, label, projectId, kind, createdAt}]
    projects: [],           // [{id, name, target, due, yearly, accountId, status, createdAt}]
    projectEntries: [],     // [{id, projectId, date, amount(+/-), note, movementId, createdAt}]
    cycles: {},             // par id de paie : {budget:{quotidien?, plaisirs?}, closure:{env:{action, accountId, movementId}}}
  };
}
