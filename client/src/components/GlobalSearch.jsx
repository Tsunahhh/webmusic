import { useEffect, useRef, useState } from 'react';
import { IconSearch } from './icons.jsx';
import { useT } from '../i18n.js';

// Cmd/Ctrl+K palette searching across tracks *and* playlists at once —
// unlike Library.jsx's search, which only filters the library list already
// on screen. Re-fetches the library each time it opens rather than the app
// holding a copy at all times, since it's the only place that needs it.
export default function GlobalSearch({ open, onClose, playlists, onPlayTrack, onSelectPlaylist }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    fetch('/api/library')
      .then((res) => res.json())
      .then(setTracks);
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const matchedPlaylists = q ? playlists.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6) : [];
  const matchedTracks = q
    ? tracks.filter((track) => track.title.toLowerCase().includes(q) || track.artist?.toLowerCase().includes(q)).slice(0, 8)
    : [];
  const results = [
    ...matchedPlaylists.map((p) => ({ type: 'playlist', item: p })),
    ...matchedTracks.map((t) => ({ type: 'track', item: t })),
  ];

  function select(result) {
    if (!result) return;
    if (result.type === 'playlist') {
      onSelectPlaylist(result.item.id);
    } else {
      const index = tracks.findIndex((track) => track.id === result.item.id);
      if (index !== -1) onPlayTrack([...tracks.slice(index), ...tracks.slice(0, index)].map((track) => track.id));
    }
    onClose();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      select(results[activeIndex]);
    }
  }

  return (
    <div className="global-search-overlay" onClick={onClose}>
      <div className="global-search-panel" onClick={(e) => e.stopPropagation()}>
        <div className="global-search-input-row">
          <IconSearch />
          <input
            ref={inputRef}
            type="text"
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        {q && results.length === 0 && <p className="empty-hint">{t('search.noResults', { query })}</p>}
        {results.length > 0 && (
          <ul className="global-search-results">
            {results.map((r, i) => (
              <li
                key={`${r.type}-${r.item.id}`}
                className={`global-search-result ${i === activeIndex ? 'active' : ''}`}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => select(r)}
              >
                <span className="global-search-result-type">{r.type === 'track' ? t('search.track') : t('search.playlist')}</span>
                <span className="global-search-result-label">{r.type === 'track' ? r.item.title : r.item.name}</span>
                {r.type === 'track' && r.item.artist && <span className="global-search-result-sub">{r.item.artist}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
