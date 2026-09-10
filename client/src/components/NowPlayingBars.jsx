// Small animated equalizer indicator shown in place of the track index for
// whichever row is currently playing — freezes mid-bar when paused instead
// of animating, so it still reads as "this one" without implying motion.
export default function NowPlayingBars({ paused }) {
  return (
    <span className={`now-playing-bars ${paused ? 'paused' : ''}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}
