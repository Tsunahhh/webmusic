import { IconImage } from './icons.jsx';

// A 2x2 grid of up to 4 track covers, for anything that doesn't have a
// single cover image of its own: a playlist nobody's uploaded art for
// (PlaylistView.jsx), an artist tile (Library.jsx's grid view — an artist
// has no embedded art, just whatever their tracks carry). Falls back to a
// single big placeholder icon when none of the given tracks have art at all.
export default function CoverMosaic({ tracks, className = '' }) {
  const covered = tracks.filter((t) => t.hasCover).slice(0, 4);

  if (covered.length === 0) {
    return (
      <div className={`cover-mosaic placeholder ${className}`}>
        <IconImage />
      </div>
    );
  }

  // A single cover fills the whole tile rather than sitting alone in one
  // quadrant of an otherwise-empty 2x2 grid — looks like a normal cover
  // instead of a mosaic that's mostly blank.
  if (covered.length === 1) {
    return (
      <div className={`cover-mosaic ${className}`}>
        <img src={`/api/tracks/${covered[0].id}/cover`} alt="" style={{ gridColumn: '1 / -1', gridRow: '1 / -1' }} />
      </div>
    );
  }

  return (
    <div className={`cover-mosaic ${className}`}>
      {covered.map((t) => (
        <img key={t.id} src={`/api/tracks/${t.id}/cover`} alt="" />
      ))}
      {Array.from({ length: 4 - covered.length }).map((_, i) => (
        <div key={`empty-${i}`} className="cover-mosaic-empty" />
      ))}
    </div>
  );
}
