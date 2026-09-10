import { useState } from 'react';

// Multi-selection for a track list (library or a single playlist), shared
// between Library.jsx and PlaylistView.jsx. Mirrors common file-manager
// conventions: a plain click plays the track and collapses the selection;
// Ctrl/Cmd+click toggles one track in/out without playing; Shift+click
// selects the contiguous range from the last click. Dragging a selected row
// carries the whole selection (see dragIdsFor); dragging an unselected row
// carries just that one track.
export function useTrackSelection(tracks) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [anchorIndex, setAnchorIndex] = useState(null);

  function handleRowClick(track, index, event, onPlay) {
    if (event.shiftKey) {
      const start = anchorIndex ?? index;
      const [from, to] = [start, index].sort((a, b) => a - b);
      setSelectedIds(new Set(tracks.slice(from, to + 1).map((t) => t.id)));
      if (anchorIndex === null) setAnchorIndex(index);
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(track.id)) next.delete(track.id);
        else next.add(track.id);
        return next;
      });
      setAnchorIndex(index);
      return;
    }

    setSelectedIds(new Set());
    setAnchorIndex(index);
    onPlay(track.id);
  }

  function dragIdsFor(trackId) {
    return selectedIds.has(trackId) && selectedIds.size > 1 ? Array.from(selectedIds) : [trackId];
  }

  return { selectedIds, handleRowClick, dragIdsFor };
}
