# PrixCompare — webapp

🏋🏻‍♀️LiveDemo: https://nyxover.github.io/prixcompare/

Application web locale pour enregistrer des achats (produit, magasin, prix) et comparer les prix entre magasins.
Fonctionne **entièrement dans le navigateur**, sans serveur : les données sont stockées dans le `localStorage`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Interface (onglets, formulaires, tableaux) |
| `app.js` | Logique de l'application (données, rendu, import/export) |
| `run.sh` | Petit script pour lancer un serveur local |

## Démarrage

### Option 1 — Serveur local (recommandé)

Un serveur local évite les restrictions du navigateur sur les fichiers `file://` (notamment l'accès caméra pour le scan).

```sh
sh run.sh
```

Ou manuellement avec Python / Node :

```sh
python -m http.server 8000
# puis ouvrir http://localhost:8000
```

### Option 2 — Ouverture directe

Ouvrir simplement `index.html` dans un navigateur. Le scan caméra peut ne pas fonctionner dans ce mode.

---

## Utilisation

### 1. Ajouter un achat (onglet « Ajouter »)

Choisir un mode dans la liste déroulante :

- **Manuel** — saisie classique : nom, code-barres (facultatif), prix unitaire, quantité, magasin, date, photo (facultatif). Cliquer sur **Enregistrer**.
- **Scan code-barres** — cliquer sur **Activer caméra**, viser le code-barres. Le champ code-barres se remplit automatiquement lorsque le navigateur supporte `BarcodeDetector` (Chrome/Edge). Sinon, saisir le code à la main. Renseigner nom, prix, magasin puis **Enregistrer**.
- **Photo produit** — choisir une photo, l'associer à un nom et un prix, puis **Associer & enregistrer**.

> Les champs **Nom** et **Prix** sont obligatoires. Le magasin vaut « Inconnu » par défaut, et la date du jour est utilisée si aucune date n'est saisie.
>
> Un produit existant est réutilisé (par code-barres, ou par nom sans tenir compte des accents/majuscules) plutôt que dupliqué.

### 2. Consulter les produits (onglet « Produits »)

Affiche chaque produit avec sa photo, le dernier magasin, le nombre d'achats et le dernier prix.

### 3. Historique (onglet « Historique »)

Liste tous les achats, triés du plus récent au plus ancien : date, produit, magasin, prix, quantité et total.

### 4. Comparer les prix (onglet « Comparer »)

Sélectionner un produit : la liste affiche, par magasin, le prix le plus bas, la date du dernier achat et le nombre d'achats. Le magasin le moins cher est signalé.

### 5. Réglages (onglet « Réglages »)

Thème clair/sombre via le bouton 🌙/☀️ en haut à droite.

---

## Export / Import des données

Tout se passe dans l'onglet **Réglages**.

### Exporter

- **Exporter CSV** — un fichier `prixcompare_export_AAAA-MM-JJ.csv` (colonnes : `date, product_name, barcode, store, price, quantity, total_price, category, note, has_image`).
- **Exporter JSON** — un fichier `prixcompare_export_AAAA-MM-JJ.json` contenant les produits **et** les achats (sauvegarde complète, idéale pour réimporter sans perte).

### Importer

1. Choisir le **mode d'import** :
   - **Fusionner** (recommandé) — ajoute les données aux données existantes, sans rien effacer. Les doublons sont ignorés.
   - **Remplacer** — efface les données actuelles avant l'import.
2. Cliquer sur **Importer CSV** ou **Importer JSON**, puis sélectionner le fichier.
3. Un message confirme le nombre de produits et d'achats importés (et, pour le CSV, les lignes ignorées).

#### Format CSV attendu

En-tête facultatif (les noms de colonnes sont reconnus, accents/espaces ignorés) :

```
date,product_name,barcode,store,price,quantity,category,note
2026-01-01,Lait demi-écrémé,1234567890123,Carrefour,1.25,2,,promo
```

- Colonnes minimales requises : **`product_name`** et **`price`**.
- Le séparateur est détecté automatiquement : `,` ou `;`.
- Sans ligne d'en-tête, l'ordre de l'export est supposé : `date, product_name, barcode, store, price, quantity, total_price, category, note`.
- Les guillemets `"` sont supportés (y compris `""` pour un guillemet littéral), et les prix avec virgule (`1,25`) sont acceptés.

#### Format JSON attendu

```json
{
  "version": "1.0.0",
  "products": [ { "id": "...", "name": "Lait", "barcode": "1234567890123", "category": null, "image_path": null } ],
  "purchases": [ { "id": "...", "product_id": "...", "store": "Carrefour", "price": 1.25, "quantity": 2, "date": "2026-01-01", "note": null } ]
}
```

L'import JSON peut aussi être utilisé comme **sauvegarde/restauration** : le mode **Remplacer** avec un export JSON complet restaure l'état exact.

### Règles de fusion (mode « Fusionner »)

- **Produits** : réutilisés s'ils ont le même code-barres, sinon le même nom (normalisé : minuscules, accents retirés). Les champs manquants (code-barres, catégorie, photo) sont complétés.
- **Achats** : un achat est considéré comme doublon — et donc ignoré — s'il a le même produit, magasin, date, prix et quantité.

---

## Sauvegarde des données

Les données vivent dans le `localStorage` du navigateur. Elles sont donc liées à ce navigateur et à ce domaine :

- Vider le cache / les données du site **efface** la base.
- Changer de navigateur ou d'ordinateur ne transfère pas les données.

**Bonne pratique : exporter régulièrement en JSON** (onglet Réglages) et conserver ce fichier comme sauvegarde.

---

## Déploiement sur GitHub Pages

Le site étant 100 % statique, GitHub Pages le publie **directement depuis la branche `main`** (aucune compilation ni exécution de workflow nécessaire).

### Mise en place (une seule fois)

1. Pousser le projet sur GitHub :
   ```sh
   git remote add origin https://github.com/<utilisateur>/<depot>.git
   git push -u origin main
   ```
2. Dans le dépôt : **Settings → Pages → Build and deployment → Source** :
   - **Source** : `Deploy from a branch`
   - **Branch** : `main`, dossier `/ (root)`
   - Cliquer sur **Save**

### Par la suite

Chaque `push` sur la branche `main` met le site à jour automatiquement.

Le site est alors accessible à l'adresse :

```
https://<utilisateur>.github.io/<depot>/
```

> À savoir : le site est servi en **HTTPS**, donc la caméra du scan fonctionne. Les données restent locales au navigateur de chaque visiteur (`localStorage`) — rien n'est envoyé sur le serveur.
>
> Pour un dépôt **privé**, la publication GitHub Pages nécessite un compte GitHub Pro/Team. Avec un dépôt **public**, c'est gratuit.

---

## Notes techniques

- Application 100 % client, Vanilla JS, aucune dépendance.
- Base stockée sous la clé `localStorage` : `prixcompare_db_v1`.
- Thème mémorisé sous la clé : `pc_theme`.
- Le scan utilise l'API `BarcodeDetector` quand elle est disponible ; sinon la saisie manuelle reste possible.
