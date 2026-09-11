import { useEffect, useMemo, useState } from 'react';
import TrackRow from './TrackRow.jsx';
import ContextMenu from './ContextMenu.jsx';
import SelectionActions from './SelectionActions.jsx';
import CoverMosaic from './CoverMosaic.jsx';
import { useTrackSelection } from '../hooks/useTrackSelection.js';
import { SORT_OPTIONS, sortTracks } from '../sort.js';
import { useT } from '../i18n.js';
import { IconPlay } from './icons.jsx';

// Buckets tracks by a tag field (album/artist), tracks missing the tag land
// in one group labeled `unknownLabel` rather than being dropped — a file
// with no album tag is still a real track, it just can't be usefully
// grouped by name.
function groupTracks(tracks, field, unknownLabel) {
  const map = new Map();
  for (const t of tracks) {
    const key = t[field]?.trim() || unknownLabel;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  }
  return [...map.entries()].map(([key, groupTracks]) => ({ key, tracks: groupTracks })).sort((a, b) => a.key.localeCompare(b.key));
}

// One grid tile for the Albums/Artists overview. Albums use a single cover
// (the first track that has one — real albums usually share the same
// embedded art across every track, so a mosaic of 4 copies of the same
// image would look like a mistake). Artists use a mosaic instead — their
// tracks span whatever different releases they came from, so 4 different
// covers actually reads as a collage, not a duplicate.
function GridTile({ label, sublabel, coverTrack, mosaicTracks, circle, onClick }) {
  return (
    <button className="grid-tile" onClick={onClick}>
      <div className={`grid-tile-cover ${circle ? 'circle' : ''}`}>
        {coverTrack ? <img src={`/api/tracks/${coverTrack.id}/cover`} alt="" /> : <CoverMosaic tracks={mosaicTracks} />}
      </div>
      <span className="grid-tile-label">{label}</span>
      {sublabel && <span className="grid-tile-sublabel">{sublabel}</span>}
    </button>
  );
}

export default function Library({ currentTrackId, isPlaying, onPlay, onEnqueue, playlists, onAddToPlaylist, onToggleLike }) {
  const t = useT();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('custom');
  const [menu, setMenu] = useState(null);
  const [mode, setMode] = useState('list'); // 'list' | 'albums' | 'artists'
  const [activeGroup, setActiveGroup] = useState(null); // { type: 'album'|'artist', key, tracks } | null
  const [groupMenu, setGroupMenu] = useState(null); // playlist picker for the group-wide "add everything"

  useEffect(() => {
    fetch('/api/library')
      .then((res) => res.json())
      .then((data) => {
        setTracks(data);
        setLoading(false);
      });
  }, []);

  // Switching Albums <-> Artists <-> Liste shouldn't leave a stale
  // album/artist detail showing from whichever grid was open before.
  useEffect(() => setActiveGroup(null), [mode]);

  // The "unknown" bucket label is translated, so these have to recompute on a
  // language change too — hence `t` in the dependency lists (it's a stable
  // reference; what changes is the render it's read in).
  const albumGroups = useMemo(() => groupTracks(tracks, 'album', t('library.unknownAlbum')), [tracks, t]);
  const artistGroups = useMemo(() => groupTracks(tracks, 'artist', t('library.unknownArtist')), [tracks, t]);

  // Sort reorders the whole library (what gets played), search only filters
  // what's *shown* — playFrom below always rotates over playbackOrder, not
  // the (possibly search-narrowed) displayed list.
  const sortedTracks = sortTracks(tracks, sortBy);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? sortedTracks.filter((track) => track.title.toLowerCase().includes(q) || track.artist?.toLowerCase().includes(q))
    : sortedTracks;

  // Drilled into one album/artist tile: both what's shown and what plays
  // narrow to just that group (its own sort, no search box there) instead
  // of the whole library.
  const playbackOrder = activeGroup ? sortTracks(activeGroup.tracks, sortBy) : sortedTracks;
  const displayedTracks = activeGroup ? playbackOrder : filtered;

  // Selection operates on whatever's currently visible, so Shift+click range
  // selection matches what's on screen (a search filter, or a drilled-into
  // group).
  const { selectedIds, handleRowClick, dragIdsFor, clearSelection } = useTrackSelection(displayedTracks);

  function playFrom(trackId) {
    const index = playbackOrder.findIndex((track) => track.id === trackId);
    if (index === -1) return;
    onPlay([...playbackOrder.slice(index), ...playbackOrder.slice(0, index)].map((track) => track.id));
  }

  // Wraps the App-level toggleLike (API call + sidebar count) with a local
  // optimistic update of this component's own track copy, so the row's
  // heart icon (driven by track.liked) flips immediately.
  function handleToggleLike(trackId, liked) {
    setTracks((prev) => prev.map((track) => (track.id === trackId ? { ...track, liked: liked ? 1 : 0 } : track)));
    onToggleLike(trackId, liked);
  }

  // Shared by the right-click menu and each row's "more" button (the latter
  // is the only way to reach either action on a touch device — see
  // TrackRow.jsx).
  function menuItemsFor(trackIds) {
    const items = [{ label: t('menu.addToQueue'), onClick: () => onEnqueue(trackIds) }];
    if (playlists.length > 0) {
      items.push({ label: t('menu.addToPlaylist'), header: true });
      for (const p of playlists) {
        items.push({ label: p.name, onClick: () => onAddToPlaylist(p.id, trackIds) });
      }
    }
    return items;
  }

  function openGroup(type, group) {
    setActiveGroup({ type, key: group.key, tracks: group.tracks });
  }

  function renderTrackList(list) {
    return (
      <ul className="track-list">
        {list.map((track, i) => (
          <TrackRow
            key={track.id}
            track={track}
            index={i}
            active={track.id === currentTrackId}
            isPlaying={isPlaying}
            selected={selectedIds.has(track.id)}
            dragIds={dragIdsFor(track.id)}
            onSelect={(e) => handleRowClick(track, i, e, playFrom)}
            onOpenMenu={(e, ids) => setMenu({ x: e.clientX, y: e.clientY, trackIds: ids })}
            onToggleLike={handleToggleLike}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="view">
      {activeGroup ? (
        <>
          <button className="grid-back" onClick={() => setActiveGroup(null)}>
            ← {activeGroup.type === 'album' ? t('library.modeAlbums') : t('library.modeArtists')}
          </button>
          <div className="playlist-header">
            {activeGroup.tracks.find((track) => track.hasCover) ? (
              <img
                className="playlist-cover"
                src={`/api/tracks/${activeGroup.tracks.find((track) => track.hasCover).id}/cover`}
                alt=""
              />
            ) : (
              <CoverMosaic tracks={activeGroup.tracks} className="playlist-cover" />
            )}
            <div>
              <span className="eyebrow">{activeGroup.type === 'album' ? t('library.album') : t('library.artist')}</span>
              <h1>{activeGroup.key}</h1>
              <span className="track-count-label">{t('common.trackCount', { count: activeGroup.tracks.length })}</span>
            </div>
          </div>
          <div className="group-actions">
            <button className="play-button-large" onClick={() => onPlay(playbackOrder.map((track) => track.id))}>
              <IconPlay /> {t('common.play')}
            </button>
            {/* Acts on the whole album/artist, independently of any row
                selection — "everything" here means the group, not the
                selection. */}
            <button
              className="selection-action"
              onClick={() => onEnqueue(playbackOrder.map((track) => track.id))}
            >
              {t('library.addAllToQueue')}
            </button>
            <button
              className="selection-action"
              disabled={playlists.length === 0}
              title={playlists.length === 0 ? t('common.noPlaylist') : undefined}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setGroupMenu({ x: rect.left, y: rect.bottom + 4 });
              }}
            >
              {t('library.addAllToPlaylist')}
            </button>
          </div>
          {renderTrackList(playbackOrder)}
        </>
      ) : (
        <>
          <div className="view-header-row">
            <h1>{t('library.title')}</h1>
            <div className="mode-switch">
              <button className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}>
                {t('library.modeList')}
              </button>
              <button className={mode === 'albums' ? 'active' : ''} onClick={() => setMode('albums')}>
                {t('library.modeAlbums')}
              </button>
              <button className={mode === 'artists' ? 'active' : ''} onClick={() => setMode('artists')}>
                {t('library.modeArtists')}
              </button>
            </div>
          </div>

          {loading ? (
            <ul className="track-list">
              {Array.from({ length: 8 }).map((_, i) => (
                <li key={i} className="track-row skeleton-row" />
              ))}
            </ul>
          ) : tracks.length === 0 ? (
            <p className="empty-hint">{t('library.empty')}</p>
          ) : mode === 'list' ? (
            <>
              <div className="library-toolbar">
                <input
                  className="search-input"
                  type="search"
                  placeholder={t('library.searchPlaceholder')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <label className="sort-row">
                  {t('common.sortBy')}
                  <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {t(o.labelKey)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {filtered.length === 0 ? (
                <p className="empty-hint">{t('library.noResults', { query })}</p>
              ) : (
                renderTrackList(filtered)
              )}
            </>
          ) : (
            <div className="tracks-grid">
              {(mode === 'albums' ? albumGroups : artistGroups).map((g) => (
                <GridTile
                  key={g.key}
                  label={g.key}
                  sublabel={mode === 'albums' ? g.tracks[0]?.artist : t('common.trackCount', { count: g.tracks.length })}
                  coverTrack={mode === 'albums' ? g.tracks.find((track) => track.hasCover) : null}
                  mosaicTracks={g.tracks}
                  circle={mode === 'artists'}
                  onClick={() => openGroup(mode === 'albums' ? 'album' : 'artist', g)}
                />
              ))}
            </div>
          )}
        </>
      )}
      <SelectionActions
        ids={Array.from(selectedIds)}
        playlists={playlists}
        onEnqueue={onEnqueue}
        onAddToPlaylist={onAddToPlaylist}
        onClear={clearSelection}
      />
      {groupMenu && (
        <ContextMenu
          x={groupMenu.x}
          y={groupMenu.y}
          items={playlists.map((p) => ({
            label: p.name,
            onClick: () => onAddToPlaylist(p.id, playbackOrder.map((track) => track.id)),
          }))}
          onClose={() => setGroupMenu(null)}
        />
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItemsFor(menu.trackIds)} onClose={() => setMenu(null)} />}
    </div>
  );
}
