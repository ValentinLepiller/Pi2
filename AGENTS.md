# Pi2

Extension Chromium/Firefox WXT/React/TypeScript. Aucun backend, aucune infrastructure hébergée. Notion est l'unique destination distante.

Usage interne : test, staging et préproduction sans données sensibles. Pas de masquage automatique de console.

Les clés Notion restent dans le stockage local réservé aux contextes de confiance sur Chromium et en IndexedDB sur l’origine de l’extension (`pi2-private`) sur Firefox, qui ne supporte pas `storage.local.setAccessLevel`. Aucune clé dans les content scripts, exports de configuration ou journaux. Les associations sont par origine exacte (protocole, hôte et port), plusieurs sites peuvent partager une destination.

Conserver les brouillons et la file d'envoi en IndexedDB jusqu'à confirmation complète de Notion. Tester les erreurs et reprises, pas seulement le succès. Simuler uniquement l'API Notion dans les tests navigateur.

Commandes : `bun run check`, `bun run build`, `bun run test:e2e`, `bun run lint`. Firefox : `bun run build:firefox`, `bun run test:firefox` (Firefox + geckodriver 0.37+).

Direction artistique : dark mode uniquement, inspiré de Galadrim (charbon, vert, Jost et Fira Mono, angles droits et séparateurs pointillés). Interface uniquement dans la popup. Sans jeton, afficher Connecter Notion partout, avec lien vers le portail développeur. Champ Jeton Notion accessible sur tout site sans connexion enregistrée. Pages de destination préparées sur Notion. Sur les sites, sélection par nom de page dans « Envoyer les feedbacks à », mémorisée au démarrage des annotations. Aucune page de réglages, aucun guide, historique ou menu Sites associés. Variables partagées dans `src/styles/theme.css`, polices locales sous `public/fonts`.

Nom du produit : Pi2. Conserver l’identifiant IndexedDB `vals-feedbacks` et le chemin d’installation Brave existant pour préserver les données et l’identifiant de l’extension.

Exporter les icônes PNG depuis `public/icon.svg` avec un fond transparent (`magick -background none`) pour éviter les coins blancs.

Raccourci natif Ctrl + . (Command + . sur macOS) : annotations actives → pause, site lié → démarrage/reprise, sinon ouverture de la popup. Ne pas injecter de capteur clavier sur tous les sites. Tester les touches dans un affichage Xvfb isolé.

L’overlay doit neutraliser le zoom CSS de ses ancêtres : les coordonnées `getBoundingClientRect()` incluent déjà ce zoom. Garder le cadre, le commentaire et les repères alignés après un changement de zoom du site.

Capturer l’image et le contexte dès le clic de sélection, avant la saisie. La validation ajoute le commentaire à cette capture conservée, sans recapturer ni relire le DOM. Une capture annulée ne crée aucun retour.

Captures PNG recadrées sur la partie visible du composant sélectionné, sans encadrement ajouté ni interface Pi2. Masquer le host via un attribut et une règle interne au Shadow DOM, pour éviter les conflits avec `all: initial !important`.

Envoi Notion : une annotation = une page, avec son image et son contexte JSON propre. Dédupliquer chaque annotation lors des reprises.

Livraison : `.github/workflows/release.yml` construit le code du tag publié (`vX.Y.Z`) et joint les ZIP Chromium et Firefox à la release GitHub. Firefox 140+ : build non signé pour chargement temporaire, sans collecte console. Une installation permanente nécessite la signature Mozilla. Le lancement manuel produit seulement un artefact de test. La version est dérivée du tag dans la CI, sans modifier la version locale. Pas de GitHub Packages.

Reprise du projet : lire `WORKLOG.md` pour l’état vérifié et les changements encore locaux. Avant de recharger Pi2 dans Brave, vérifier qu’aucune annotation ni saisie de formulaire n’est en cours ; conserver le dossier d’installation et les données du navigateur.
