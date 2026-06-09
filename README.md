# BaobabMart — Épicerie africaine à Abu Dhabi

> E-commerce de produits africains de consommation. Livraison express dans tous les Émirats Arabes Unis (Abu Dhabi, Dubai, Sharjah, Ajman, Al Ain, RAK, Fujairah, UAQ).

## ✨ Fonctionnalités

- **Catalogue** : épicerie, boissons, épices, mode wax, beauté karité, cuisine, snacks.
- **Panier** : drawer latéral avec gestion quantités, sous-total en **AED**.
- **Recherche** : suggestions live (attiéké, karité, bissap, wax…).
- **Filtres** : catégorie, prix (0–1500 AED), évaluations, options livraison UAE.
- **Réservation de livraison** : formulaire complet (émirat, quartier, créneau horaire, mode de paiement Tabby/Tamara/COD/Apple Pay).
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
index.html   # Markup + sections (hero, produits, livraison, footer)
style.css    # Design tokens + composants
app.js       # Modules JS (Cart, Products, Hero, Search, Delivery…)
```
