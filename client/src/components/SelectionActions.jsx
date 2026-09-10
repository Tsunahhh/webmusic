import { useState } from 'react';
import ContextMenu from './ContextMenu.jsx';

// Bar shown while a multi-selection is active, so bulk actions don't require
// discovering that right-click (or the row's "more" button) applies to the
// whole selection. Same two actions as that menu — this is a second, more
// obvious route to them, not a new capability.
//
// Rendered by every list view that uses useTrackSelection; `ids` is whatever
// that view currently has selected.
export default function SelectionActions({ ids, playlists, onEnqueue, onAddToPlaylist, onClear }) {
  const [menu, setMenu] = useState(null);

  if (ids.length === 0) return null;

  const label = `${ids.length} piste${ids.length > 1 ? 's' : ''} sélectionnée${ids.length > 1 ? 's' : ''}`;

  // Clearing after a bulk action: leaving the bar up over a selection the user
  // has just acted on invites doing it twice by accident.
  function enqueue() {
    onEnqueue(ids);
    onClear();
  }

  function addTo(playlistId) {
    onAddToPlaylist(playlistId, ids);
    onClear();
  }

  return (
    <div className="selection-bar">
      <span className="selection-count">{label}</span>
      <button className="selection-action" onClick={enqueue}>
        Tout ajouter à la file
      </button>
      <button
        className="selection-action"
        disabled={playlists.length === 0}
        title={playlists.length === 0 ? 'Aucune playlist' : undefined}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMenu({ x: rect.left, y: rect.bottom + 4 });
        }}
      >
        Tout ajouter à une playlist
      </button>
      <button className="selection-action ghost" onClick={onClear}>
        Désélectionner
      </button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={playlists.map((p) => ({ label: p.name, onClick: () => addTo(p.id) }))}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
