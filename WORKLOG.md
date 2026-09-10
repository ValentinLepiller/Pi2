# Pi2 — état actuel

Version 0.1.2 installée et activée dans Brave. Identifiant conservé : `kodmpccblghoanniiflafihdnlbmlceh`. Chemin inchangé : `/home/valentin/.local/share/vals-feedbacks/chrome`. Sauvegarde des anciens fichiers dans le sous-dossier `backups` voisin ; données conservées.

Interface dark uniquement dans la popup. Plus de page options, de guide, de menu Sites associés ni d’historique. Sans connexion enregistrée, Connecter Notion ouvre le portail développeur depuis tout site. Saisie du jeton directement dans la popup sur tout site ; préparation des pages depuis Notion et choix de la destination depuis le site. Sur un site lié : annotations et reprise d’un envoi en échec. Textes « Du feedback à l’action », « Un détail à améliorer ? » et adresse sous le titre supprimés.

Annotations, PNG, contexte DOM et console envoyés directement à Notion. IndexedDB conserve brouillons et file. Aucun backend ni agent branché. PAT ou clé d’intégration interne ; pas d’OAuth.

Vérifié : build/zip, TypeScript, lint, 7 tests unitaires et 4 parcours Chromium isolés, avec Notion simulé ; vérification visuelle des popups. Revue simplify : anciennes pages et styles supprimés, dépendance date-fns retirée, connexion nouvellement ajoutée sélectionnée correctement.

Nom du produit et de la tâche : Pi2. Le libellé du projet dans la barre latérale Codex reste à renommer ; aucun déplacement du dossier ni modification directe de l’état interne de Codex effectué.

Correctif de dimensionnement : largeur de document fixée à 420 px, suppression de la contrainte circulaire 100vw. Vraie popup Chromium vérifiée sous Xvfb : 420 × 423 px, aucun débordement horizontal. Régression à viewport initial de 50 px couverte dans le parcours navigateur.

Icônes PNG réexportées avec transparence pour supprimer les quatre coins blancs.

Détection Notion centralisée : notion.com (y compris /p/espace/titre-ID), notion.so et notion.site. Parcours de création de base validé sur notion.com avec API simulée.

Vérification des pages vides corrigée : Notion renvoie HTTP 400 « is a page, not a database », désormais traité comme une page. Les autres erreurs 400 affichent le détail Notion. Régression couverte dans le parcours navigateur. Vérification réelle réussie sur la page Pi2 via le jeton déjà enregistré, sans modification de la page ; aucune base présente à ce stade.

Sélecteur de destination sur les sites : pages configurées affichées par leur nom, choix mémorisé au démarrage. Enrichissement des anciennes destinations par lecture du titre Notion, mis en cache localement. Ligne isolée « Feedbacks » retirée de la configuration. Parcours testé avec sélection, reprise du choix, migration des noms et envoi complet.

Raccourci natif Ctrl + . ajouté : démarrer/reprendre les annotations sur un site lié, mettre en pause immédiatement si elles sont actives, sinon ouvrir Pi2. Chromium minimum 127 pour openPopup. Test de véritables touches via xdotool dans Xvfb avec X11 forcé, API Notion simulée ; vérifie aussi la conservation du brouillon et la reprise après rechargement.

Captures recadrées sur le composant visible avant réduction à 1 600 px. Masquage Pi2 corrigé dans le Shadow DOM. Tests de pixels à densité 2, après défilement et avec composant partiellement hors écran ; capture de secours sans debugger vérifiée via le raccourci natif.

Envois Notion séparés : une nouvelle page par annotation, commentaire en titre, URL précise, capture et JSON propre (console de la session incluse). Reprise persistante par annotation, sans doublons après perte de réponse à la création ou à l’ajout des blocs. Les envois de l’ancienne version déjà commencés terminent leur page existante pour éviter de les dupliquer.
