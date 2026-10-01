# Mes Enveloppes : spécification technique

Refonte complète de la v1 (fichier HTML unique ouvert depuis le gestionnaire de fichiers, données
perdues à chaque nouvelle version). Ce document décrit le modèle et les règles ; le code fait foi.
Version de l'appli : `APP_VERSION` dans `js/app.js` (2.6.0 à la date de ce document).

## 1. Architecture

| Fichier | Rôle |
|---|---|
| `index.html`, `css/app.css` | Coquille de l'appli, mobile d'abord (≤ 560 px) |
| `js/dates.js` | Dates en chaînes locales `YYYY-MM-DD` / `YYYY-MM` (jamais `toISOString`, qui décale en UTC) |
| `js/model.js` | **Calculs purs** : soldes, cycles, enveloppes, prélèvements, projets, prévisions, analyse |
| `js/actions.js` | Modifications de l'état (paie, clôture, projets, mouvements, montants réels…) |
| `js/store.js` | `localStorage` (clé `mes-enveloppes:v1`), normalisation, **migrations**, lecture des sauvegardes |
| `js/defaults.js` | État vide + familles et catégories génériques. **Aucune donnée personnelle** |
| `js/app.js` | Interface : vues, feuilles modales, assistant de démarrage, sauvegarde, mises à jour |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA installable et hors ligne |
| `tests/` | `model.test.js` (calculs), `store.test.js` (migrations) — `npm test` |

Hébergement : GitHub Pages (site statique, dépôt public), branche `claude/gracious-faraday-fbcqla`.
Aucune synchronisation : les données restent sur l'appareil ; on change d'appareil par une sauvegarde.

### Service worker et mises à jour

- Stratégie **réseau d'abord** avec `cache: 'no-cache'` pour les fichiers du site (le cache HTTP de
  GitHub Pages retient sinon l'ancienne version 10 min) ; copie en cache pour le hors-ligne.
- L'appli appelle `registration.update()` à chaque retour au premier plan et se recharge une fois au
  `controllerchange` (sauf si une feuille de saisie est ouverte).
- **À chaque version publiée** : incrémenter `APP_VERSION` (`js/app.js`) et `CACHE` (`sw.js`).

## 2. Modèle de données

L'état complet est un seul objet JSON (`app: 'mes-enveloppes'`, `version: 1`). Toute valeur qui change
dans le temps est **datée** : modifier quelque chose n'affecte jamais le passé.

| Clé | Contenu |
|---|---|
| `settings.salaryHistory` | `[{from:'YYYY-MM', amount}]` salaire de base par mois de paie |
| `settings.envelopeHistory` | `[{from:'YYYY-MM-DD', quotidien, plaisirs}]` budget habituel par cycle |
| `settings.paydayEstimateDay` | Jour estimé de la paie : **30** (paie entre le 25 et le 30, on prend le plus tard) |
| `settings.defaultsVersion` | Version des valeurs par défaut déjà appliquées (voir §4) |
| `settings.lastBackupAt` | Horodatage de la dernière sauvegarde (rappel au-delà de 30 jours) |
| `anchors` | Recalages du compte courant `{date, balance, createdAt}` |
| `paies` | Paies réellement reçues `{date, amount, note}` : chacune ouvre un cycle |
| `extras` | Extras prévus sur la paie `{label, month, yearly, year, amount}` (prime, 13ᵉ mois, CET…) |
| `incomes` | Revenus ponctuels |
| `charges` | Prélèvements, voir ci-dessous |
| `expenses` | Dépenses `{date, amount, label, categoryId, envelope:'quotidien'|'plaisirs'|'projet', projectId}` |
| `families`, `categories` | Familles (analyse) et catégories `{name, familyId, envelope}` (enveloppe proposée) |
| `accounts` | Livrets `{name, anchors[]}` |
| `movements` | Virements compte ↔ livret `{direction:'vers'|'depuis', accountId, amount, projectId, kind}` |
| `projects` | Projets `{name, target, due, yearly, accountId, status}` |
| `projectEntries` | Écritures des projets (+ mis de côté / − utilisé), liées éventuellement à un mouvement et à une dépense |
| `cycles[paieId]` | `budget` (budget d'un cycle précis) et `closure` (sort du reste de chaque enveloppe) |

### Prélèvements (`charges`)

```js
{
  label, kind: 'fixe' | 'epargne', familyId, accountId,  // epargne : crédite le livret accountId
  day,                    // jour du mois (ramené au dernier jour pour les mois courts)
  start: 'YYYY-MM', end: 'YYYY-MM' | null, skips: ['YYYY-MM'],
  history: [{ from: 'YYYY-MM', amount }],               // fixe : montant applicable par mois
  variable: true, actuals: { 'YYYY-MM': amount },       // variable : montants réels saisis
  installment: { total, count, amounts?: [..] } | null  // en plusieurs fois (amounts : échéances inégales)
}
```

Dans l'interface, l'épargne apparaît comme une famille (`◎ Épargne`, valeur `__epargne`) ; elle est
stockée en `kind: 'epargne'` et n'entre pas dans l'analyse des dépenses.

## 3. Règles de calcul

- **Cycle** : d'une paie (incluse) à la veille de la suivante. La prochaine paie est estimée au
  `paydayEstimateDay` du mois suivant ; une fois cette date passée sans paie saisie, l'accueil affiche
  « paie attendue » (au lieu du compteur bloqué à « 1 jour » de la v1).
- **Solde du compte** = dernier recalage + paies + revenus − dépenses − prélèvements tombés
  − virements vers les livrets + retraits des livrets, pour tout ce qui est postérieur au recalage (même
  jour : saisi après le recalage). Le solde de départ est le premier recalage : ce qui est daté avant
  (une échéance déjà payée, un prélèvement du début du mois) n'est jamais recompté.
- **Reste à dépenser** = somme des restes positifs des enveloppes Quotidien et Plaisirs du cycle.
- **Enveloppe** : budget = budget du cycle (sinon budget habituel) + report du cycle précédent.
  En fin de cycle, le reste est *reporté* (par défaut, dépassement compris), *mis sur un livret*
  (un mouvement est créé) ou *laissé sur le compte*.
- **Accueil, calcul pas à pas** : sur le compte − prélèvements d'ici la paie estimée − reste à dépenser
  = **ce qu'il restera avant la paie** (négatif : alerte).
- **Prélèvements** :
  - *fixe* : montant de `history` applicable au mois ;
  - *variable* : montant réel du mois s'il est saisi, sinon moyenne des 3 derniers montants réels,
    sinon l'estimation de `history`. Un prélèvement variable passé sans montant réel est rappelé sur
    l'accueil ; les montants estimés sont précédés de « ≈ » ;
  - *en plusieurs fois* : `amounts[i]` si saisi, sinon partage égal où le dernier versement absorbe
    l'arrondi ;
  - mois sautés (`skips`) et fin (`end`) ; un virement automatique (`kind:'epargne'`) crédite son livret.
- **Projets** : l'argent est rangé sur un livret. « Mettre de côté » crée un virement (ou réserve de
  l'argent déjà présent) ; « Utiliser » le rapatrie et enregistre la dépense en enveloppe `projet`,
  sans toucher Quotidien ni Plaisirs. Montant à mettre de côté par paie = reste / paies restantes avant
  l'échéance.
- **Salaire prévu** d'un mois = salaire de base applicable + extras de ce mois. Il pré-remplit la paie
  et alimente les prévisions à 6 mois.
- **Affichage** : familles par ordre alphabétique (`Divers` en dernier), catégories triées dans chaque
  famille. L'ordre stocké n'a pas d'importance.

## 4. Migrations des données existantes

`store.normalize()` complète tout état lu ou restauré. Les valeurs par défaut ajoutées après coup sont
appliquées **une seule fois** grâce à `settings.defaultsVersion` (`DEFAULTS_VERSION` dans
`defaults.js`) ; un élément supprimé ensuite par l'utilisatrice ne revient pas.

| Version | Changement appliqué aux données existantes |
|---|---|
| 2 | Famille *Voyages* (billets, hébergement, location de voiture, visites) |
| 3 | Jour estimé de la paie : 25 → 30 (seulement si la valeur était encore 25) |
| 4 | *Crédits* renommée *Banque* (si pas déjà renommée) ; *Assurances* fusionnée dans Banque (prélèvements et catégories déplacés) ; catégories Crédit, Frais bancaires, Assurances (sauf si une catégorie au nom voisin existe déjà dans la famille) |

Pour une nouvelle migration : incrémenter `DEFAULTS_VERSION`, marquer les nouveaux éléments par défaut
avec `since`, ajouter le traitement dans `addNewDefaults()` et un test dans `tests/store.test.js`.

## 5. Sauvegarde

- Export : le JSON complet de l'état. *Enregistrer dans Téléchargements* produit un `.json` ;
  *Envoyer vers Drive, e-mail…* (Web Share) envoie un `.txt` (`text/plain`), car Chrome sur Android
  refuse de partager un `.json`.
- Import : `.json` ou `.txt`, vérifié (`app`, `version`) puis normalisé et migré.
