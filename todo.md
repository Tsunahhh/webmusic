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

Boutons utiles (fait)
- Bouton répéter (off / all / one) dans PlayerBar.jsx — off arrête la boucle de defaultQueue après un passage complet, one répète la piste en cours indéfiniment (playbackState.js `repeat`, WS `repeat`).
- Favoris/like par morceau (cœur sur TrackRow.jsx, colonne `tracks.liked`), avec une playlist virtuelle "Titres likés" en sidebar (LikedView.jsx, GET /api/library/liked).
- "Ajouter à une playlist" dans ContextMenu.jsx — en fait déjà présent depuis la v1 (Library.jsx/PlaylistView.jsx `menuItemsFor`), la description du reste de ce fichier était obsolète.
- Bouton tri (ordre par défaut / titre / artiste / durée) dans Library.jsx et PlaylistView.jsx (client/src/sort.js) — pour une playlist, le tri custom reste l'ordre manuel drag-and-drop existant.
- Renommer une playlist depuis la sidebar (icône crayon, PATCH /api/playlists/:id).
- Minuteur de sommeil dans PlayerBar.jsx — purement client, déclenche le `pause` partagé après le délai choisi.
- Indicateur du nombre d'appareils connectés dans PlayerBar.jsx (wsServer.js compte les sockets WS ouverts et le diffuse à chaque changement d'état).
