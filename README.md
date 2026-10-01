# Mes Enveloppes

Application de budget pour téléphone, **d'une paie à l'autre** : ce qu'il reste à dépenser, ce qu'il y a
sur le compte, ce qu'il restera avant la paie, les prélèvements à venir, les livrets et les projets.

- S'installe sur l'écran d'accueil comme une vraie appli et fonctionne **hors connexion**.
- Les données restent **uniquement sur le téléphone** (aucun compte, aucun serveur). Aucune donnée
  personnelle n'est dans le code.
- Les mises à jour arrivent toutes seules : plus de fichier à retélécharger, plus de données perdues.

Adresse de l'appli : **https://cmylnie.github.io/Budget/** (attention au **B** majuscule).

## Installer sur le téléphone

1. Ouvre l'adresse dans **Chrome**.
2. Menu **⋮** → **Installer l'application** (ou *Ajouter à l'écran d'accueil*).
3. L'icône « Enveloppes » apparaît. Au premier lancement, un assistant demande le solde du compte, la
   dernière paie, le budget des enveloppes et les livrets (2 minutes).

## Comment l'appli raisonne

- **Un cycle = d'une paie à la suivante.** La paie arrive entre le 25 et le 30 : tant qu'elle n'est pas
  saisie, elle est estimée **au 30** (au plus tard, par prudence). Le nouveau cycle commence le jour où
  tu touches **Ma paie est arrivée**.
- **L'accueil** affiche le *reste à dépenser* (enveloppes), ce qu'il y a *sur le compte* aujourd'hui, et
  le calcul pas à pas : sur le compte − prélèvements à venir − reste des enveloppes = **ce qu'il te
  restera avant la paie**.
- **Deux enveloppes** : *Quotidien* (courses, carburant, péages, pharmacie, coiffeur…) et *Plaisirs*
  (restos, sorties, shopping, loisirs…). À chaque paie, le reste est reporté, mis sur un livret ou laissé
  sur le compte, au choix.
- **Les projets** (mariage, Noël, voiture…) ont un montant à atteindre ; leur argent est rangé sur un
  livret. Les dépenses payées avec ne touchent pas les enveloppes.
- **Rien ne réécrit le passé** : un changement de tarif, d'enveloppe ou de salaire s'applique à partir
  d'une date.
- **Le solde de départ** (ou un recalage) sert de repère : ce qui est daté avant est considéré comme
  déjà passé et n'est jamais compté deux fois.

## Au quotidien

| Je veux… | Où |
|---|---|
| Ajouter une dépense | Bouton **+** (montant, catégorie, c'est tout) |
| Ajouter un revenu ou un mouvement d'épargne | Bouton **+** → onglet *Revenu* ou *Épargne* |
| Enregistrer ma paie | Accueil → **Ma paie est arrivée** (montant exact et date réelle) |
| Corriger le solde avec celui de la banque | Accueil → **Recaler avec ma banque** |
| Changer le budget d'une enveloppe pour ce cycle seulement | Toucher l'enveloppe sur l'accueil |
| Changer le budget habituel des enveloppes | ⚙ Réglages → Budget des enveloppes |
| Noter une augmentation, un 13ᵉ mois, une prime, un CET / CCF | ⚙ Réglages → Paie / Extras prévus |
| Voir mon poste de dépense le plus cher | Onglet **Analyse** (par famille, détail au toucher) |
| Revoir un cycle passé | Onglet **Journal** (flèches ‹ ›) |
| Ajouter une famille ou une catégorie | ⚙ Réglages → Catégories de dépenses |

### Prélèvements (onglet Prélèv.)

| Cas | Comment le saisir |
|---|---|
| Montant fixe (box, prêt…) | Type **Fixe**. Nouveau tarif : modifier le montant « à partir de » tel mois |
| Montant qui change chaque mois (Bip&Go, électricité…) | Type **Variable** : une estimation, puis le montant réel une fois prélevé (l'accueil le rappelle). L'estimation devient la moyenne des 3 derniers montants réels |
| Paiement en plusieurs fois (4× sans frais…) | Type **En plusieurs fois** : total, nombre, première échéance. Échéances inégales : remplir celles qu'on connaît, le reste est partagé |
| Virement automatique vers un livret | Famille **◎ Épargne** puis le livret (créé sur place s'il n'existe pas) |
| Mois sans prélèvement (Navigo en août) | Le prélèvement → **Sauter un mois** |
| Contrat qui s'arrête | Le prélèvement → **Dernier mois** (mieux que supprimer : le passé reste juste) |

Les familles et catégories sont classées par ordre alphabétique, *Divers* en dernier. La famille
**Banque** regroupe crédits, frais bancaires et assurances ; **Voyages** regroupe billets, hébergement,
location de voiture, visites.

### Un projet comme un voyage ou un mariage

1. Les paiements à dates fixes (billets en 4×) → un **prélèvement en plusieurs fois**.
2. Le reste (location de voiture, cadeaux, argent sur place…) → un **projet** sur le livret, avec une
   date. **Mettre de côté** à chaque paie, puis **Utiliser** au moment de payer.
3. Pendant le voyage : bouton **+** avec l'enveloppe **Projet**. On peut baisser le budget Quotidien de
   ce cycle-là.
4. Au retour : **Clôturer** le projet ; l'argent restant redevient libre sur le livret.

## Sauvegarde et changement de téléphone

- ⚙ Réglages → **Sauvegarder** → **Envoyer vers Drive, e-mail…** (le fichier part en `.txt`, seul format
  que Chrome sur Android accepte de partager) ou **Enregistrer dans Téléchargements** (`.json`).
  L'appli rappelle de sauvegarder si la dernière sauvegarde date de plus d'un mois.
- Nouveau téléphone : ouvrir l'adresse dans Chrome, installer l'appli, puis **J'ai une sauvegarde à
  restaurer** au premier écran (ou ⚙ Réglages → **Restaurer**) et choisir le fichier, `.txt` ou `.json`.

## Mises à jour

Elles s'installent seules : l'appli vérifie à chaque retour s'il y a une nouvelle version et se recharge.
Si rien ne change, fermer complètement l'appli (applis récentes → balayer) puis la rouvrir. Le numéro de
version est affiché en bas de ⚙ Réglages ; l'historique est dans [`docs/CHANGELOG.md`](docs/CHANGELOG.md).

## Mise en ligne (déjà faite)

Site statique publié par **GitHub Pages** depuis la branche `claude/gracious-faraday-fbcqla`, dossier
racine (Settings → Pages). Le dépôt est public : avec un compte GitHub gratuit, Pages ne publie que les
dépôts publics, et le code ne contient aucune donnée personnelle. Chaque envoi sur la branche republie
le site en 1 à 2 minutes.

## Pour le développement

Aucune dépendance, aucune compilation : HTML, CSS et JavaScript (modules ES).

```sh
npm test          # tests du moteur de calcul et des migrations (Node 18+)
npm run serve     # http://localhost:8080
```

Le fonctionnement détaillé (modèle de données, règles de calcul, migrations) est décrit dans
[`docs/SPEC.md`](docs/SPEC.md). Repères pour les prochaines sessions : [`CLAUDE.md`](CLAUDE.md).
