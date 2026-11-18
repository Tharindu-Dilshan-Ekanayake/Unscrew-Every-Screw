/**
 * Background music, made live with WebAudio like the sound effects: a mellow, cosy
 * workshop groove - a soft kick and a brushed shaker, a round bass, warm electric-piano
 * chords over Fmaj7 - Em7 - Dm7 - Cmaj7 and a lazy little vibraphone tune - kept quiet
 * under the satisfying clicks of the screws.
 *
 * Notes are scheduled a little ahead on the audio clock by a timer (the usual
 * look-ahead scheduler), never from the render loop.
 */

const BPM = 86
const EIGHTH = 60 / BPM / 2
const LOOKAHEAD_S = 0.35
const TICK_MS = 100

/** One chord per bar, as MIDI notes: bass root, then the piano's four voices. */
const BARS = [
  { root: 41, chord: [57, 60, 64, 69] }, // Fmaj7
  { root: 40, chord: [55, 59, 62, 67] }, // Em7
  { root: 38, chord: [53, 57, 60, 65] }, // Dm7
  { root: 36, chord: [55, 59, 64, 67] }, // Cmaj7
]
/** The tune: [eighth within the 32-eighth loop, MIDI note, eighths long]. */
const TUNE = [
  [2, 76, 2],
  [5, 74, 1],
  [6, 72, 2],
  [10, 71, 2],
  [13, 72, 1],
  [14, 74, 2],
  [18, 77, 3],
  [22, 76, 1],
  [23, 74, 1],
  [26, 72, 2],
  [29, 71, 1],
  [30, 67, 2],
]

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12)

export function createMusic(ctx, destination, noiseBuffer) {
  const out = ctx.createGain()
  out.gain.value = 0
  out.connect(destination)
  // A low-pass over everything keeps it warm and out of the effects' way.
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 2600
  tone.connect(out)

  let step = 0
  let nextAt = 0
  let timer = null
  const level = { base: 0.55, ducked: 1, volume: 1 }

  function note(midi, t, { type = 'sine', length = 0.3, volume = 0.05, attack = 0.01, cutoff = 0, detune = 0 } = {}) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq(midi)
    osc.detune.value = detune
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(volume, t + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
    if (cutoff) {
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = cutoff
      osc.connect(filter).connect(gain).connect(tone)
    } else {
      osc.connect(gain).connect(tone)
    }
    osc.start(t)
    osc.stop(t + length + 0.05)
  }

  /** Filtered noise: the shaker. */
  function hiss(t, { frequency = 6000, q = 1, volume = 0.01, length = 0.05 } = {}) {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = frequency
    filter.Q.value = q
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(volume, t + length * 0.4)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
    src.connect(filter).connect(gain).connect(tone)
    src.start(t, Math.random() * 0.5)
    src.stop(t + length + 0.01)
  }

  /** A soft, round kick. */
  function kick(t, volume = 0.11) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.setValueAtTime(110, t)
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14)
    gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26)
    osc.connect(gain).connect(tone)
    osc.start(t)
    osc.stop(t + 0.28)
  }

  /** Everything that sounds on eighth `step` (of a 4-bar, 32-eighth loop) at time t. */
  function play(t) {
    const inBar = step % 8
    const barIndex = Math.floor(step / 8) % BARS.length
    const bar = BARS[barIndex]
    // Lazy swing: off-beats land a touch late.
    const swing = inBar % 2 ? EIGHTH * 0.16 : 0
    if (inBar === 0 || inBar === 5) kick(t)
    if (inBar === 4) hiss(t, { frequency: 2200, q: 0.7, volume: 0.02, length: 0.12 })
    hiss(t + swing, { volume: inBar % 2 ? 0.006 : 0.004, length: 0.045 })
    // Bass: root on the one, the fifth pushed in before the next bar.
    if (inBar === 0) note(bar.root, t, { type: 'triangle', length: EIGHTH * 3.6, volume: 0.085, attack: 0.02 })
    if (inBar === 6) note(bar.root + 7, t + swing, { type: 'triangle', length: EIGHTH * 1.6, volume: 0.06, attack: 0.02 })
    // Electric piano: the chord on the one, a softer echo on the and-of-three.
    if (inBar === 0 || inBar === 5) {
      const soft = inBar === 5 ? 0.55 : 1
      for (const n of bar.chord) {
        note(n, t + swing, { type: 'sine', length: EIGHTH * 5, volume: 0.016 * soft, attack: 0.015 })
        note(n + 12, t + swing, { type: 'triangle', length: EIGHTH * 1.2, volume: 0.004 * soft, attack: 0.005, cutoff: 3000 })
      }
    }
    // The vibraphone tune, every other time round.
    if (Math.floor(step / 32) % 2 === 1) {
      for (const [at, midi, length] of TUNE) {
        if (at === step % 32) {
          note(midi, t + swing, { type: 'sine', length: EIGHTH * length * 1.6, volume: 0.022, attack: 0.008 })
          note(midi + 24, t + swing, { type: 'sine', length: 0.12, volume: 0.003, attack: 0.003 })
        }
      }
    }
  }

  function schedule() {
    nextAt = Math.max(nextAt, ctx.currentTime + 0.05)
    while (nextAt < ctx.currentTime + LOOKAHEAD_S) {
      play(nextAt)
      nextAt += EIGHTH
      step = (step + 1) % 64
    }
  }

  const applyLevel = (seconds) => out.gain.setTargetAtTime(level.base * level.ducked * level.volume, ctx.currentTime, seconds)

  return {
    start() {
      if (timer) return
      nextAt = ctx.currentTime + 0.1
      timer = setInterval(schedule, TICK_MS)
      schedule()
      applyLevel(1.5)
    },
    /** Quieter while something else should be heard (a fanfare). */
    duck(on) {
      level.ducked = on ? 0.4 : 1
      applyLevel(0.3)
    },
    /** The player's music volume, 0..1 (Boxity's music_volume setting). */
    setVolume(volume) {
      level.volume = Math.min(1, Math.max(0, Number(volume) || 0))
      if (timer) applyLevel(0.15)
    },
  }
}
