# LAMYLENOISE — Épicerie africaine à Abu Dhabi

> E-commerce de produits africains de consommation. Livraison express dans tous les Émirats Arabes Unis (Abu Dhabi, Dubai, Sharjah, Ajman, Al Ain, RAK, Fujairah, UAQ).

## ✨ Fonctionnalités

- **Catalogue** : épicerie, boissons, épices, mode wax, beauté karité, cuisine, snacks (800+ produits).
- **Boutique avec filtres** : tri par prix / notes / nouveautés, chips de catégories, recherche par mot-clé.
- **Fiche produit** : galerie + miniatures, sélecteur de quantité, options achat direct ou panier.
- **Panier** : drawer latéral avec gestion quantités, sous-total en **AED**, persistance.
- **Tunnel de commande** : récap, frais auto par émirat, paiement carte / Apple Pay / Tabby / Tamara / COD.
- **Compte client** : tableau de bord, historique commandes, favoris, adresses UAE, profil.
- **Authentification** : pages login / register avec validation.
- **Livraison** : suivi temps réel par n° de commande, réservation de créneaux, zones couvertes UAE.
- **Pages support** : FAQ, blog recettes africaines, contact (WhatsApp / email / téléphone), à propos, mentions légales (CGV, RGPD, cookies), page 404 personnalisée.
- **Hero slider**, ventes flash, trust strip, newsletter.
- **Responsive** : mobile / tablet / desktop.

## 🚚 Zones de livraison

| Zone | Délai | Frais |
|---|---|---|
| Abu Dhabi | 24h | dès 0 AED |
| Dubai | 24h | dès 15 AED |
| Sharjah / Ajman | 24-48h | dès 20-25 AED |
| Al Ain | 48h | dès 30 AED |
| RAK / Fujairah / UAQ | 48-72h | dès 35 AED |

**Livraison OFFERTE** dans tout l'UAE pour toute commande ≥ 150 AED.

## 🛠 Stack

- HTML5 sémantique
- CSS3 (custom properties, mobile-first)
- Vanilla JS modulaire (zero dépendance)
- [Lucide Icons](https://lucide.dev/) via CDN
- [Google Fonts — Inter](https://fonts.google.com/specimen/Inter)

## 🚀 Lancer en local

Ouvrir `index.html` dans un navigateur, ou servir le dossier :

```powershell
python -m http.server 8000
# puis http://localhost:8000
```

## 📁 Structure

```
index.html      # Accueil : hero, flash deals, grille produits, réservation livraison
shop.html       # Catalogue complet avec filtres et tri
product.html    # Fiche produit détaillée (?id=N)
checkout.html   # Tunnel de commande
account.html    # Compte client (tableau de bord, commandes, favoris, adresses)
login.html      # Connexion
register.html   # Inscription
delivery.html   # Zones, réservation de créneau, suivi de commande
about.html      # À propos, équipe, histoire, devenir vendeur/livreur
contact.html    # Formulaire et coordonnées
faq.html        # Foire aux questions
blog.html       # Recettes & traditions africaines
legal.html      # CGV, RGPD, cookies, mentions
404.html        # Page d'erreur

style.css       # Design tokens + tous les composants
app.js          # Modules JS (Layout, Cart, Products, Shop, ProductDetail,
                #            Checkout, Account, Auth, Contact, Delivery…)
```

## 🧩 Architecture JS

`app.js` suit un pattern modulaire :

```js
const ModuleName = {
  init() { /* … */ },
};
```

`Layout.mount()` injecte le chrome partagé (topbar, header, nav, footer, panier drawer) sur les pages opt-in via `<body data-shell="full">`. L'accueil (`index.html`) conserve son markup inline ; les autres pages héritent du chrome injecté.

## 🌍 Langue & devise

- Interface en **français** (`lang="fr"`).
- Prix formatés en **AED** via `Intl.NumberFormat('fr-FR')`.

## 📜 Licence

© 2026 LAMYLENOISE FZ-LLC — Tous droits réservés.
