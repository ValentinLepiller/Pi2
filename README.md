# Pi2

Extension Chromium 127+ et Firefox 140+ pour envoyer des annotations, captures PNG, contexte des éléments et console dans Notion. Usage interne : test, staging et préproduction. Aucun serveur.

## Installer

Télécharger `pi2-VERSION-chrome.zip` dans les **Assets** de la [dernière release GitHub](https://github.com/ValentinLepiller/Pi2/releases/latest), puis le décompresser dans un dossier permanent. Dans `chrome://extensions` (ou `brave://extensions`), activer **Mode développeur**, choisir **Charger l’extension non empaquetée**, puis épingler Pi2.

**Firefox** : télécharger `pi2-VERSION-firefox.zip`. Dans `about:debugging#/runtime/this-firefox`, choisir **Charger un module complémentaire temporaire**, puis le ZIP. Ce build non signé reste chargé jusqu’à la fermeture de Firefox ; une installation permanente nécessite une signature Mozilla. La collecte console est disponible uniquement sur Chromium.

Depuis les sources : `bun install` puis `bun run build`. Charger `.output/chrome-mv3`. Pour Firefox : `bun run build:firefox`, puis charger `.output/firefox-mv3/manifest.json`.

## Connecter et annoter

1. Sans jeton enregistré, le lien **Connecter Notion**, sous le bouton de validation, ouvre directement les jetons personnels depuis n’importe quel site. Rouvrir Pi2 sur n’importe quel site et saisir un **jeton personnel Notion** avec la capacité API de Notion, ou une clé d’intégration interne. Pour une intégration interne, partager aussi la page via **••• → Connexions**.
2. Ouvrir la page Notion de destination, puis Pi2. **Vérifier la page**, puis **Créer la base Feedbacks ici** si nécessaire. La page est alors disponible dans la liste des destinations.
3. Sur le site, ouvrir Pi2, choisir une page dans **Envoyer les feedbacks à**, puis **Commencer les annotations**. Ce choix est mémorisé pour le site. Sélectionner un élément, écrire un commentaire, puis **Ajouter**. Les repères permettent de modifier ou supprimer ; **Naviguer** permet d’utiliser le site.
4. **Envoyer** crée une page Notion par retour, avec son commentaire en titre, sa capture et son contexte JSON (console incluse sur Chromium). Les brouillons persistent après rechargement ou redémarrage. En cas d’échec, rouvrir la popup sur le site pour réessayer.

**Ctrl + .** (ou **⌘.** sur Mac) active ou met en pause les annotations sur un site déjà lié. Sinon, il ouvre Pi2. Les annotations ajoutées sont conservées. Le raccourci se personnalise dans `chrome://extensions/shortcuts` (ou `brave://extensions/shortcuts`).

Le jeton se saisit dans la popup sur tout site ; les pages de destination se préparent depuis Notion et se choisissent sur le site. Le jeton reste dans ce profil de navigateur. Les sous-domaines, ports et protocoles sont associés séparément.

Limites : 12 annotations par lot, captures du composant sélectionné, limitées à sa partie visible (1 600 px maximum en largeur), document principal et Shadow DOM ouverts. Console limitée à 1 000 événements ou 1 Mo, sans masquage automatique. Les DevTools peuvent interrompre la collecte. Les reprises automatiques nécessitent que le navigateur soit ouvert et Pi2 chargé.

## Développer

Bun · WXT · React · TypeScript. Stockage local IndexedDB, API Notion depuis le contexte d’arrière-plan. Aucun traitement par agent branché.

```sh
bun run check
bun run lint
bun run build
bun run test:e2e
bun run zip
bun run zip:firefox
```

Installer le navigateur de test avec `bunx playwright install chromium`. Les tests utilisent un profil isolé et une API Notion simulée. Le test du raccourci nécessite aussi `xvfb-run` et `xdotool`. Le parcours Firefox se lance avec `bun run test:firefox` après le build Firefox ; il nécessite Firefox et geckodriver 0.37+ dans le PATH (ou les variables `FIREFOX_BINARY` et `GECKODRIVER`). Il utilise un profil headless temporaire et simule uniquement Notion.

## Publier une version

Après avoir committé et poussé les modifications, créer et publier sur GitHub une release depuis `main` avec un nouveau tag `vX.Y.Z` (ex. `v0.2.0`). Le workflow **Build extension** vérifie le code, construit les ZIP Chromium et Firefox et les ajoute aux Assets de la release. La version de l’extension suit le tag ; aucun secret supplémentaire à configurer. Un brouillon de release ne lance pas le build.

Pour vérifier un build sans publier, lancer **Actions → Build extension → Run workflow**. Les deux ZIP sont disponibles dans les artefacts de cette exécution.
