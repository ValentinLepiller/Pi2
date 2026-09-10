# Pi2 — reprise du projet

État vérifié le 10 septembre 2026.

## Application

Extension Chromium 127+ et Firefox 140+, version source 0.1.5. La dernière installation locale dans Brave reste en version 0.1.2. Interface dark dans la popup uniquement. PAT Notion ou clé d’intégration interne ; pas d’OAuth, de backend ni d’agent branché.

- Les pages de destination se préparent depuis Notion et se choisissent par leur nom depuis le site. Le choix est mémorisé par origine exacte.
- Chaque nouveau retour crée sa propre page Notion : commentaire en titre, URL précise, PNG du composant visible et contexte JSON avec console. Les envois de l’ancienne version déjà commencés terminent leur page existante sans doublon.
- Les brouillons et reprises d’envoi persistent dans IndexedDB. Les réponses réseau perdues à la création et à l’ajout des blocs sont couvertes.
- Ctrl + . démarre/reprend ou met en pause ; sans destination, ouvre Pi2. Command + . est configuré sur Mac. Le bouton affiche le symbole Command et le point.

## Installation locale

Conserver l’identifiant `kodmpccblghoanniiflafihdnlbmlceh`, IndexedDB `vals-feedbacks` et le dossier `/home/valentin/.local/share/vals-feedbacks/chrome`. Les sauvegardes des fichiers sont dans le dossier `backups` voisin. Ne pas déplacer le projet ni réinstaller l’extension sous un autre chemin pour un simple renommage.

## GitHub et releases

Dépôt : https://github.com/ValentinLepiller/Pi2 — branche `main`.

Le commit `452a0d4` ajoute le workflow de release et a été poussé. Publier un tag `vX.Y.Z` depuis un commit contenant ce workflow construit `pi2-X.Y.Z-chrome.zip` et `pi2-X.Y.Z-firefox.zip` et les joint aux Assets. Le lancement manuel produit un artefact conservé 14 jours. Pas de GitHub Packages.

Build manuel GitHub réussi, archive téléchargée et vérifiée : https://github.com/ValentinLepiller/Pi2/actions/runs/34481161883. La version dérivée du tag a aussi été validée localement avec `v9.8.7`. Ce test manuel ne publie pas de release. La livraison réelle se suit dans les exécutions du workflow déclenchées par publication.

## Vérifications et points à reprendre

TypeScript, lint, 8 tests unitaires et 5 parcours Chromium ont été validés au fil des changements. Le test des touches natives sous Xvfb présente une intermittence d’ouverture de popup ; il a réussi au dernier passage isolé. Utiliser X11 forcé, `xvfb-run` et `xdotool`, jamais le bureau actif. La touche Command n’a pas été testée physiquement sur Mac.

La version 0.1.4 ajoute Firefox : API `browser` de WXT, arrière-plan MV3 sans debugger, captures via `captureVisibleTab`, clés en IndexedDB privée. Firefox ne collecte pas la console. Le ZIP non signé se charge temporairement dans `about:debugging` ; la signature Mozilla reste nécessaire pour une installation permanente.

Parcours réel Firefox headless avec Notion simulé : connexion, raccourci, annotation, PNG recadré sans pixels Pi2, refus des commandes privilégiées depuis les pages, export Notion et déconnexion. Les cinq parcours Chromium passent également. Scripts et builds des deux navigateurs sont disponibles. La version 0.1.5 corrige le décalage du sélecteur sur les sites appliquant un zoom CSS à html/body (reproduit sur Galadrim en grand écran). Cadre, éditeur, repères et capture vérifiés sous zoom imbriqué sur Chromium et Firefox ; changement de zoom pendant la saisie couvert sur Chromium. La bordure du raccourci a également été retirée.

Release : https://github.com/ValentinLepiller/Pi2/releases/tag/v0.1.5. Vérifier `git status` à la reprise.

Le renommage du libellé du projet dans la barre latérale Codex n’a pas été effectué dans cette tâche. Le dossier de travail a été conservé.
