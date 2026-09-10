import { useEffect } from 'react';

export const BAR_COUNT = 40;

// 128 -> 64 frequency bins. Small on purpose: this drives 40 chunky bars, not
// a spectrogram, and a bigger FFT would just cost work to average back down.
const FFT_SIZE = 128;
// Music energy lives in the lower bins; the top of the range is near-silent
// for most tracks and would leave a row of dead bars on the right.
const USED_BINS = 48;

// One graph per <audio> element, forever. createMediaElementSource() can only
// be called once per element — a second call throws InvalidStateError — and
// creating it *detaches the element from the default audio output*, routing
// it through this graph instead. That's the part to be careful with: from
// here on, the element's sound reaches the speakers only because
// analyser -> ctx.destination is connected.
//
// The map therefore also remembers failures (a null value), so a second
// attempt doesn't call createMediaElementSource again on an element that's
// already been through it.
const graphs = new WeakMap();

function getGraph(audio) {
  if (graphs.has(audio)) return graphs.get(audio);

  let graph = null;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error('Web Audio non supporté');

    const ctx = new AudioCtx();
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.8;
    try {
      source.connect(analyser);
      analyser.connect(ctx.destination);
      graph = { ctx, analyser, source };
    } catch (err) {
      // The element is already detached from the default output by this
      // point, so leaving it here would mean silence. Wire it straight to the
      // speakers instead: a decorative visualiser must never cost playback.
      source.connect(ctx.destination);
      throw err;
    }
  } catch (err) {
    console.warn('MusicWeb: visualiseur indisponible —', err.message);
    graph = null;
  }

  graphs.set(audio, graph);
  return graph;
}

// Drives the bars inside `containerRef` from live playback, while `enabled`.
//
// Takes both decks (see useAudioDecks.js) and reads whichever one is currently
// audible: during a crossfade the active deck is the incoming track, which is
// what the bars should follow. A graph is built for *each* deck rather than
// only the active one, so a deck doesn't get rerouted through Web Audio in the
// middle of a transition — the reroute is the one moment where a mistake costs
// silence.
//
// It writes each bar's height straight to the DOM rather than returning state:
// this runs at display refresh rate, and pushing 40 values through React 60
// times a second would re-render the whole overlay for a purely decorative
// effect.
//
// Nothing is ever disconnected on cleanup — see getGraph: tearing a graph down
// is what would silence its element, and the source node can't be rebuilt. The
// graphs simply stop being read.
export function useAudioAnalyser(deckRefs, activeRef, containerRef, enabled) {
  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const graphs = deckRefs.map((ref) => (ref.current ? getGraph(ref.current) : null));
    if (graphs.every((g) => !g)) return;
    const ctx = graphs.find(Boolean).ctx;

    // An AudioContext can be suspended by autoplay policy, and audio routed
    // through a suspended context is silent — so every user gesture is a
    // chance to get it running again, not just the one that opened this view.
    const resume = () => {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    };
    resume();
    document.addEventListener('pointerdown', resume);
    document.addEventListener('keydown', resume);

    const bins = new Uint8Array(graphs.find(Boolean).analyser.frequencyBinCount);
    const bars = Array.from(container.children);
    let frame = 0;

    function tick() {
      const graph = graphs[activeRef.current];
      if (!graph) {
        frame = requestAnimationFrame(tick);
        return;
      }
      graph.analyser.getByteFrequencyData(bins);
      for (let i = 0; i < bars.length; i++) {
        // Spread the used bins across the bars, weighted so the low end (where
        // the movement is) gets more of them than the sparse high end.
        const from = Math.floor((i / bars.length) ** 1.6 * USED_BINS);
        const to = Math.max(from + 1, Math.floor(((i + 1) / bars.length) ** 1.6 * USED_BINS));
        let sum = 0;
        for (let b = from; b < to; b++) sum += bins[b];
        const level = sum / (to - from) / 255;
        bars[i].style.height = `${6 + level * 94}%`;
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', resume);
      document.removeEventListener('keydown', resume);
    };
  }, [enabled, deckRefs, activeRef, containerRef]);
}
