# Mes Enveloppes

Application de budget pour téléphone, **d'une paie à l'autre** : ce qu'il reste à dépenser, ce qu'il y a
sur le compte, les prélèvements à venir, les livrets et les projets.

- Fonctionne **hors connexion**, s'installe sur l'écran d'accueil comme une vraie appli.
- Les données restent **uniquement sur le téléphone** (aucun compte, aucun serveur). Aucune donnée
  personnelle n'est dans le code.
- Les mises à jour arrivent toutes seules : il n'y a plus de fichier à retélécharger, donc plus de
  données perdues.

## Mettre l'appli en ligne (une seule fois)

L'appli est un site statique publié par **GitHub Pages**. Avec un compte GitHub gratuit, Pages ne
publie que les dépôts **publics** : le code ne contient aucune donnée personnelle, tes chiffres restent
dans ton téléphone.

1. Sur GitHub : dépôt → **Settings** → **General** → tout en bas, *Change repository visibility* →
   **Public**.
2. **Settings** → **Pages** → *Source* : **Deploy from a branch**, choisis la branche qui contient
   l'appli (la branche principale du dépôt), dossier `/ (root)` → **Save**.
3. Une à deux minutes plus tard, l'adresse s'affiche en haut de la page Pages, du type
   `https://cmylnie.github.io/Budget/`.

## Installer sur le téléphone

1. Ouvre l'adresse dans **Chrome**.
2. Menu **⋮** → **Installer l'application** (ou *Ajouter à l'écran d'accueil*).
3. L'icône « Enveloppes » apparaît : plus besoin du gestionnaire de fichiers.

## Au quotidien

| Je veux… | Où |
|---|---|
| Ajouter une dépense | Bouton **+** (montant, catégorie, c'est tout) |
| Enregistrer ma paie | Accueil → **Ma paie est arrivée** (montant exact et date réelle) |
| Corriger le solde avec celui de la banque | Accueil → **Recaler avec ma banque** |
| Changer le budget d'une enveloppe pour ce cycle seulement | Toucher l'enveloppe sur l'accueil |
| Changer le budget habituel des enveloppes | ⚙ Réglages → Budget des enveloppes |
| Noter une augmentation, un 13ᵉ mois, une prime, un CET… | ⚙ Réglages → Paie / Extras prévus |
| Sauter un prélèvement un mois (ex. Navigo en août) | Prélèvements → le prélèvement → *Sauter un mois* |
| Voir mon poste de dépense le plus cher | Onglet **Analyse** |
| Mettre de côté pour un projet | Épargne → le projet → **Mettre de côté** |

## Changer de téléphone

1. Ancien téléphone : ⚙ Réglages → **Sauvegarder** → **Envoyer vers Drive, e-mail…** (le fichier part en
   `.txt`, seul format que Chrome accepte de partager ; `.json` et `.txt` se restaurent tous les deux).
2. Nouveau téléphone : ouvre l'adresse de l'appli dans Chrome et installe-la.
3. Au premier écran : **J'ai une sauvegarde à restaurer** (ou ⚙ Réglages → **Restaurer**) et choisis
   le fichier.

L'appli rappelle de faire une sauvegarde si la dernière date de plus d'un mois.

## Pour le développement

Aucune dépendance, aucune compilation : HTML, CSS et JavaScript (modules ES).

```sh
npm test          # tests du moteur de calcul (Node 18+)
npm run serve     # http://localhost:8080
```

Le fonctionnement détaillé (modèle de données, règles de calcul) est décrit dans
[`docs/SPEC.md`](docs/SPEC.md).
