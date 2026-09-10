# Pi2 — reprise du projet

État vérifié le 10 septembre 2026.

## Application

Extension Chromium 127+ et Firefox 140+, version source 0.1.9. L’installation locale Brave vérifiée est en 0.1.9. Interface dark dans la popup uniquement. PAT Notion ou clé d’intégration interne ; pas d’OAuth, de backend ni d’agent branché.

- Les pages de destination se préparent depuis Notion et se choisissent par leur nom depuis le site. Le choix est mémorisé par origine exacte.
- Chaque nouveau retour crée sa propre page Notion : commentaire en titre, URL précise, PNG du composant visible et contexte JSON avec console. Les envois de l’ancienne version déjà commencés terminent leur page existante sans doublon.
- Les brouillons et reprises d’envoi persistent dans IndexedDB. Les réponses réseau perdues à la création et à l’ajout des blocs sont couvertes.
- Ctrl + . démarre/reprend ou met en pause ; sans destination, ouvre Pi2. Command + . est configuré sur Mac. Le bouton affiche le symbole Command et le point.

## Installation locale

Installation Brave actuelle : `gobajcmeijdnlpioioanmlamofhiombo`, dossier `/home/valentin/Downloads/pi2-0.1.5-chrome`. Ctrl + . était sans attribution ; il a été rétabli et relu via l’API du navigateur. Conserver ce chemin pour les mises à jour, ainsi qu’IndexedDB `vals-feedbacks`. L’ancienne installation (`kodmpccblghoanniiflafihdnlbmlceh`, `/home/valentin/.local/share/vals-feedbacks/chrome`) n’est plus celle chargée. Toujours revérifier l’installation active avant de modifier ses fichiers.

## GitHub et releases

Dépôt : https://github.com/ValentinLepiller/Pi2 — branche `main`.

Le commit `452a0d4` ajoute le workflow de release et a été poussé. Publier un tag `vX.Y.Z` depuis un commit contenant ce workflow construit `pi2-X.Y.Z-chrome.zip` et `pi2-X.Y.Z-firefox.zip` et les joint aux Assets. Le lancement manuel produit un artefact conservé 14 jours. Pas de GitHub Packages.

Build manuel GitHub réussi, archive téléchargée et vérifiée : https://github.com/ValentinLepiller/Pi2/actions/runs/34481161883. La version dérivée du tag a aussi été validée localement avec `v9.8.7`. Ce test manuel ne publie pas de release. La livraison réelle se suit dans les exécutions du workflow déclenchées par publication.

## Vérifications et points à reprendre

TypeScript, lint, 8 tests unitaires et 5 parcours Chromium ont été validés au fil des changements. Le test des touches natives sous Xvfb présente une intermittence d’ouverture de popup ; il a réussi au dernier passage isolé. Utiliser X11 forcé, `xvfb-run` et `xdotool`, jamais le bureau actif. La touche Command n’a pas été testée physiquement sur Mac.

La version 0.1.4 ajoute Firefox : API `browser` de WXT, arrière-plan MV3 sans debugger, captures via `captureVisibleTab`, clés en IndexedDB privée. Firefox ne collecte pas la console. Le ZIP non signé se charge temporairement dans `about:debugging` ; la signature Mozilla reste nécessaire pour une installation permanente.

Parcours réel Firefox headless avec Notion simulé : connexion, raccourci, annotation, PNG recadré sans pixels Pi2, refus des commandes privilégiées depuis les pages, export Notion et déconnexion. Les cinq parcours Chromium passent également. Scripts et builds des deux navigateurs sont disponibles. La version 0.1.5 corrige le décalage du sélecteur sur les sites appliquant un zoom CSS à html/body (reproduit sur Galadrim en grand écran). Cadre, éditeur, repères et capture vérifiés sous zoom imbriqué sur Chromium et Firefox ; changement de zoom pendant la saisie couvert sur Chromium. La bordure du raccourci a également été retirée.

La version 0.1.6 capture au clic : image et contexte conservés dans une sélection en attente, validation du commentaire sans nouvelle capture, annulation sans annotation vide. Tests : carrousel simulé, changement de taille/zoom, disparition du composant, Chromium et Firefox. Une installation Brave neuve attribue bien Ctrl + . ; la popup signale une attribution absente et propose sa configuration.

Release : https://github.com/ValentinLepiller/Pi2/releases/tag/v0.1.9. Vérifier `git status` à la reprise.

La version 0.1.7 ajoute le bouton « Mettre à jour » près de la version. Vérification GitHub au clic, ZIP adapté au navigateur et instructions d’installation manuelle, sans Store ni nouvelle permission. Versions comparées numériquement ; build manquant et erreur réseau gérés. Vérifié : 9 tests unitaires, typecheck, lint, builds Chromium/Firefox et accès réel à GitHub depuis les deux extensions en profils isolés ; coupure réseau et reprise sur Chromium. Le ZIP Chromium publié a été installé dans le dossier Brave existant, sans changement d’identifiant ; connexion, destination, association, deux sessions et Ctrl + . conservés. Le bouton a confirmé « Pi2 est à jour » depuis Brave. Sauvegarde des anciens fichiers : `/home/valentin/Downloads/.pi2-update-7poqfF/backup`.

La version 0.1.8 renomme le bouton en « Chercher des mises à jour ». Cette release n’avait pas été installée dans Brave, à la demande de l’utilisateur.

La version 0.1.9 ajoute la capture de toute la zone visible de la page avec cadre vert sur le composant, toujours prise au clic et sans interface Pi2. Les anciennes captures restent intactes. Vérifié : typecheck, lint, 9 tests unitaires, 5 parcours Chromium dont capture sans debugger, parcours Firefox et builds des deux navigateurs. Défilement, cible partiellement visible, zoom, image changeant pendant la saisie et export Notion couverts. Release GitHub et build réussis ; ZIP publié installé dans le même dossier Brave. Connexion, destination, trois associations, dix sessions et Ctrl + . conservés. Sauvegarde avant mise à jour : `/home/valentin/Downloads/.pi2-update-NmuijL/backup`.

Le renommage du libellé du projet dans la barre latérale Codex n’a pas été effectué dans cette tâche. Le dossier de travail a été conservé.
