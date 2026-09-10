Confort utilisateur
- UI optimiste : réagir visuellement au clic play/pause avant la confirmation WS, pour éliminer la sensation de délai.
- Panneau d'aide raccourcis clavier (?) — étendre l'espace déjà géré dans App.jsx avec flèches (seek ±5s), N (next), M (mute).
- Distinguer visuellement "toi" vs "un autre appareil" qui vient de changer la lecture — vu que n'importe quel client peut tout contrôler sans notion d'hôte, un petit toast "Quelqu'un a changé de piste" évite la confusion.
- Bouton "Annuler" dans le toast après une suppression (playlist, morceau retiré) plutôt qu'une suppression définitive immédiate.
- Recherche globale (Ctrl/Cmd+K) couvrant morceaux + playlists, pas seulement le filtre local de Library.jsx.
- Message de reconnexion plus explicite qu'un simple point de couleur (connection-dot) en cas de perte WS prolongée.

Design
- Vue Albums/Artistes en grille de pochettes (déjà proposée) — transforme la bibliothèque en expérience visuelle plutôt qu'une liste de texte.
- Vue "Lecture en cours" plein écran (déjà proposée), avec fond flou basé sur la cover.
- Mosaïque de 4 pochettes en aperçu de playlist quand aucune cover n'est uploadée, au lieu du placeholder générique actuel.
- Sidebar avec sections repliables (Bibliothèque / Playlists / File d'attente) si le nombre de playlists grandit — actuellement tout est à plat.
- Couleur d'accent personnalisable (--accent est du vert Spotify #1db954) — un sélecteur de thème pour se démarquer visuellement du clone.

Boutons utiles
- Bouton répéter (repeat one / off) — actuellement il n'y a que le shuffle, la boucle infinie de defaultQueue n'a pas d'"off".
- Bouton favoris/like par morceau (cœur sur TrackRow.jsx), avec une playlist virtuelle "Titres likés" auto-générée en sidebar.
- "Ajouter à une playlist" directement dans ContextMenu.jsx — aujourd'hui il n'y a que "Ajouter à la file", et ajouter à une playlist n'est possible qu'en drag-and-drop (inutilisable sur mobile/tactile).
- Bouton tri (titre / artiste / date d'ajout / durée) dans Library.jsx et PlaylistView.jsx — l'ordre est fixe aujourd'hui.
- Bouton renommer une playlist — actuellement seulement créer/supprimer.
- Bouton minuteur de sommeil (sleep timer) — pratique pour un système de diffusion partagé en soirée.
- Indicateur/bouton "qui écoute" — afficher le nombre d'appareils connectés (déjà calculable côté serveur via le nombre de sockets WS ouverts).
