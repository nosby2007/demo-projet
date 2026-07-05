# LAMYLENOISE — Épicerie africaine à Abu Dhabi

> E-commerce de produits africains de consommation. Livraison express dans tous les Émirats Arabes Unis (Abu Dhabi, Dubai, Sharjah, Ajman, Al Ain, RAK, Fujairah, UAQ).

## ✨ Fonctionnalités

- **Catalogue** : épicerie, boissons, épices, mode wax, beauté karité, cuisine, snacks (800+ produits).
- **Boutique avec filtres** : tri par prix / notes / nouveautés, chips de catégories, recherche par mot-clé.
- **Fiche produit** : galerie + miniatures, sélecteur de quantité, options achat direct ou panier.
- **Panier** : drawer latéral avec gestion quantités, sous-total en **AED**, persistance.
- **Tunnel de commande** : récap, frais auto par émirat, paiement carte / Apple Pay / Tabby / Tamara / COD.
- **Compte client** : tableau de bord, historique commandes, favoris, adresses UAE, profil.
- **Authentification Firebase** : email / mot de passe, profil client par defaut, redirection selon role.
- **Modules RBAC** : vendeur, livreur, client et admin command center.
- **Demandes vendeur/livreur** : formulaire public, validation admin, statut et instructions d'identifiants.
- **Marketplace vendeur** : creation de produits/services, suivi commandes, clients et relances.
- **Livraison livreur** : commandes a recuperer, adresse client et ouverture Google Maps.
- **Commissions** : repartition automatique plateforme 15 %, livreur 10 %, vendeur 75 %.
- **Livraison** : suivi temps réel par n° de commande, réservation de créneaux, zones couvertes UAE.
- **Pages support** : FAQ, blog recettes africaines, contact (WhatsApp / email / téléphone), à propos, mentions légales (CGV, RGPD, cookies), page 404 personnalisée.
- **Hero slider**, ventes flash, trust strip, newsletter.
- **Responsive** : mobile / tablet / desktop.
- **Enterprise readiness** : PWA installable, cache offline, health check JSON, sitemap/robots et headers Firebase de sécurité.
- **Observabilité front** : collecte locale des métriques LCP/CLS via événement `lamylenoise:metric` pour branchement analytics.

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
- Firebase Auth + Realtime Database (`nursehome-7dc3f`)
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
customer.html   # Module client securise par role
seller.html     # Module vendeur securise par role
courier.html    # Module livreur securise par role
admin.html      # Command center admin securise par role
request.html    # Demande vendeur / livreur
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
firebase-config.js   # Configuration Firebase du projet nursehome-7dc3f
marketplace.js       # Services role-based et workflows marketplace
database.rules.json  # Regles RTDB RBAC
firebase.json        # Config Firebase Hosting / Database
app.webmanifest      # Installation PWA et métadonnées application
service-worker.js    # Cache offline de l'app shell
health.json          # Endpoint de santé statique (/health via Firebase)
robots.txt           # Directives SEO crawlers
sitemap.xml          # Sitemap public des pages principales
```

## 🏢 Socle entreprise

- Firebase Hosting applique des headers anti-clickjacking, anti-MIME sniffing, politique de permissions, referrer policy et CSP.
- `/health` expose un statut statique prêt pour uptime monitoring.
- Le service worker met en cache l'app shell critique pour améliorer la résilience réseau.
- Toutes les pages HTML déclarent le manifeste PWA et la couleur de thème.

## 🔐 Firebase / RBAC

Les nouveaux flux utilisent Firebase Auth et Realtime Database :

- `profiles/{uid}` : role `customer`, `seller`, `courier` ou `admin`.
- `roleRequests/{id}` : demandes vendeur/livreur en attente ou approuvees.
- `products/{id}` : produits catalogue et produits vendeur actifs.
- `orders/{id}` : commandes, statut paiement/livraison et repartition 15/10/75.

Important : une app statique cote client ne peut pas creer de comptes Auth pour d'autres utilisateurs de facon totalement securisee. Le command center genere donc le statut et les instructions; pour l'envoi automatique de vrais identifiants, ajouter ensuite une Cloud Function Firebase avec Admin SDK.

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
