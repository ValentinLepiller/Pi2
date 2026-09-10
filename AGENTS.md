# Pi2

Extension Chromium WXT/React/TypeScript. Aucun backend, aucune infrastructure hébergée. Notion est l'unique destination distante.

Usage interne : test, staging et préproduction sans données sensibles. Pas de masquage automatique de console.

Les clés Notion restent dans le stockage local réservé aux contextes de confiance. Aucune clé dans les content scripts, exports de configuration ou journaux. Les associations sont par origine exacte (protocole, hôte et port), plusieurs sites peuvent partager une destination.

Conserver les brouillons et la file d'envoi en IndexedDB jusqu'à confirmation complète de Notion. Tester les erreurs et reprises, pas seulement le succès. Simuler uniquement l'API Notion dans les tests navigateur.

Commandes : `bun run check`, `bun run build`, `bun run test:e2e`, `bun run lint`.

Direction artistique : dark mode uniquement, inspiré de Galadrim (charbon, vert, Jost et Fira Mono, angles droits et séparateurs pointillés). Interface uniquement dans la popup. Sans jeton, afficher Connecter Notion partout, avec lien vers le portail développeur. Champ Jeton Notion accessible sur tout site sans connexion enregistrée. Pages de destination préparées sur Notion. Sur les sites, sélection par nom de page dans « Envoyer les feedbacks à », mémorisée au démarrage des annotations. Aucune page de réglages, aucun guide, historique ou menu Sites associés. Variables partagées dans `src/styles/theme.css`, polices locales sous `public/fonts`.

Nom du produit : Pi2. Conserver l’identifiant IndexedDB `vals-feedbacks` et le chemin d’installation Brave existant pour préserver les données et l’identifiant de l’extension.

Exporter les icônes PNG depuis `public/icon.svg` avec un fond transparent (`magick -background none`) pour éviter les coins blancs.

Raccourci natif Ctrl + . (Command + . sur macOS) : annotations actives → pause, site lié → démarrage/reprise, sinon ouverture de la popup. Ne pas injecter de capteur clavier sur tous les sites. Tester les touches dans un affichage Xvfb isolé.

Captures PNG recadrées sur la partie visible du composant sélectionné, sans encadrement ajouté ni interface Pi2. Masquer le host via un attribut et une règle interne au Shadow DOM, pour éviter les conflits avec `all: initial !important`.

Envoi Notion : une annotation = une page, avec son image et son contexte JSON propre. Dédupliquer chaque annotation lors des reprises.

Livraison : `.github/workflows/release.yml` construit le code du tag publié (`vX.Y.Z`) et joint le ZIP à la release GitHub. Le lancement manuel produit seulement un artefact de test. La version est dérivée du tag dans la CI, sans modifier la version locale. Pas de GitHub Packages.

Reprise du projet : lire `WORKLOG.md` pour l’état vérifié et les changements encore locaux. Avant de recharger Pi2 dans Brave, vérifier qu’aucune annotation ni saisie de formulaire n’est en cours ; conserver le dossier d’installation et les données du navigateur.
