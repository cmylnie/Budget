# Repères pour travailler sur ce dépôt

- Appli de budget personnelle en français (PWA statique, sans dépendance ni build), publiée par GitHub
  Pages depuis la branche `claude/gracious-faraday-fbcqla`. Utilisée sur un téléphone Android (Chrome).
- Lire `docs/SPEC.md` (modèle, règles de calcul, migrations) avant de modifier les calculs.
- **Aucune donnée personnelle dans le code** (dépôt public) : montants, noms de livrets, prélèvements
  sont saisis dans l'appli.
- Calculs purs dans `js/model.js`, modifications d'état dans `js/actions.js`, interface dans `js/app.js`.
  Dates en chaînes locales via `js/dates.js` (jamais `toISOString`).
- Ne jamais réécrire le passé : toute valeur qui évolue est datée (`history`, `from`…).
- Changer les données existantes (nouvelles familles, valeurs par défaut) = migration dans
  `store.addNewDefaults()` avec `DEFAULTS_VERSION`, plus un test dans `tests/store.test.js`.
- Avant de publier : `npm test`, vérifier l'interface dans Chromium (Playwright, viewport 390×844),
  incrémenter `APP_VERSION` (`js/app.js`) et `CACHE` (`sw.js`), compléter `docs/CHANGELOG.md`.
- Textes de l'interface : tutoiement, phrases courtes, vocabulaire non technique.
