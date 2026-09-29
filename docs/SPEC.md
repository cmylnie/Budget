# Mes Enveloppes : spécification technique (v2)

Refonte complète de la v1 (fichier HTML unique ouvert depuis le gestionnaire de fichiers). Ce document
décrit le modèle et les règles de calcul ; le code fait foi.

## 1. Architecture

| Fichier | Rôle |
|---|---|
| `index.html`, `css/app.css` | Coquille de l'appli, mobile d'abord (≤ 560 px) |
| `js/dates.js` | Dates en chaînes locales `YYYY-MM-DD` / `YYYY-MM` (jamais `toISOString`, qui décale en UTC) |
| `js/model.js` | **Calculs purs** : soldes, cycles, enveloppes, prévisions, analyse. Testés dans `tests/` |
| `js/actions.js` | Modifications de l'état (paie, clôture, projets, mouvements…) |
| `js/store.js` | `localStorage` (clé `mes-enveloppes:v1`), normalisation, lecture des sauvegardes |
| `js/defaults.js` | État vide + familles et catégories génériques. **Aucune donnée personnelle** |
| `js/app.js` | Interface : vues, feuilles modales, assistant de démarrage, sauvegarde |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA installable, hors ligne (réseau d'abord, cache en secours) |

Hébergement : GitHub Pages (site statique). Aucune synchronisation : les données restent sur
l'appareil, et on passe d'un appareil à l'autre par une sauvegarde JSON (export/import).

## 2. Modèle de données

L'état complet est un seul objet JSON (`app: 'mes-enveloppes'`, `version: 1`). Toute valeur qui change
dans le temps est **datée** : modifier quelque chose n'affecte jamais le passé.

| Clé | Contenu |
|---|---|
| `settings.salaryHistory` | `[{from:'YYYY-MM', amount}]` salaire de base par mois de paie |
| `settings.envelopeHistory` | `[{from:'YYYY-MM-DD', quotidien, plaisirs}]` budget habituel par cycle |
| `settings.paydayEstimateDay` | Jour estimé de la paie (25 par défaut, par prudence) |
| `anchors` | Recalages du compte courant `{date, balance, createdAt}` |
| `paies` | Paies réellement reçues `{date, amount, note}` : chacune ouvre un cycle |
| `extras` | Extras prévus sur la paie `{label, month, yearly, year, amount}` (prime, 13ᵉ mois, CET…) |
| `incomes` | Revenus ponctuels |
| `charges` | Prélèvements `{label, kind:'fixe'|'epargne', familyId, accountId, day, start, end, skips[], history[{from, amount}], installment:{total,count}|null}` |
| `expenses` | Dépenses `{date, amount, label, categoryId, envelope:'quotidien'|'plaisirs'|'projet', projectId}` |
| `families`, `categories` | Familles (analyse) et catégories (avec enveloppe par défaut) |
| `accounts` | Livrets `{name, anchors[]}` |
| `movements` | Virements compte ↔ livret `{direction:'vers'|'depuis', accountId, amount, projectId, kind}` |
| `projects` | Projets `{name, target, due, yearly, accountId, status}` |
| `projectEntries` | Écritures des projets (+ mis de côté / − utilisé), liées éventuellement à un mouvement et à une dépense |
| `cycles[paieId]` | `budget` (budget d'un cycle précis) et `closure` (sort du reste de chaque enveloppe) |

## 3. Règles de calcul

- **Cycle** : d'une paie (incluse) à la veille de la suivante. La prochaine paie est *estimée* au
  `paydayEstimateDay` du mois suivant ; une fois cette date passée sans paie saisie, l'accueil affiche
  « paie attendue » (au lieu du compteur bloqué à « 1 jour » de la v1).
- **Solde du compte** = dernier recalage + paies + revenus − dépenses − prélèvements tombés
  − virements vers les livrets + retraits des livrets, pour tout ce qui est postérieur au recalage (même
  jour : saisi après le recalage).
- **Reste à dépenser** = somme des restes positifs des enveloppes Quotidien et Plaisirs du cycle.
- **Enveloppe** : budget = budget du cycle (sinon budget habituel) + report du cycle précédent.
  En fin de cycle, le reste est *reporté* (par défaut, dépassement compris), *mis sur un livret*
  (un mouvement est créé) ou *laissé sur le compte*.
- **Solde prévu avant la paie** = solde − prélèvements d'ici la paie estimée ;
  **hors enveloppes** = solde prévu − reste à dépenser (négatif : alerte).
- **Prélèvements** : montant daté par mois (`history`), mois sautés (`skips`), fin (`end`), ou
  paiement en N fois (le dernier versement absorbe l'arrondi), ou montant **variable** (`variable:true`,
  `actuals:{'YYYY-MM': montant réel}`) : sans montant réel saisi, on prend la moyenne des 3 derniers
  montants réels, sinon l'estimation de `history`. Un virement automatique
  (`kind:'epargne'`) crédite son livret.
- **Projets** : l'argent est rangé sur un livret. « Mettre de côté » crée un virement (ou réserve de
  l'argent déjà présent) ; « Utiliser » le rapatrie et enregistre la dépense en enveloppe `projet`,
  sans toucher Quotidien ni Plaisirs. Montant à mettre de côté par paie = reste / paies restantes avant
  l'échéance.
- **Salaire prévu** d'un mois = salaire de base applicable + extras de ce mois. Il pré-remplit la paie
  et alimente les prévisions à 6 mois.
