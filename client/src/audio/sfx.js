import { useQuality } from '../store/quality'
import { createMusic } from './music'

/**
 * Sound effects and background music, synthesised with WebAudio: no audio files to
 * download.
 *
 * Browsers only allow audio after a user gesture. The audio engine (AudioContext, echo,
 * noise, music) is built while the game loads (prepareAudio), where it costs nothing
 * anyone sees. It starts suspended; the first tap/click/key resumes it and starts the
 * music, and every sound before that is silently skipped.
 */

const MUTE_KEY = 'se.muted'
/** Master gain at full volume; everything is mixed to sit under this. */
const BASE_GAIN = 0.5

let ctx = null
let master = null
/** Input of the echo the chimes ring out into (see createEcho). */
let echo = null
let noiseBuffer = null
let music = null
let muted = readMuted()
/** Muted for a Boxity ad break, kept apart from the player's own choice. */
let adMuted = false
let masterVolume = 1
let musicVolume = 1
const lastPlayed = new Map()
const muteListeners = new Set()

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

const silent = () => muted || adMuted

function applyMaster() {
  if (master) master.gain.value = silent() ? 0 : BASE_GAIN * masterVolume
}

/**
 * Builds the audio engine, suspended. Call while loading (GameScene does); the first
 * gesture then only has to resume it. Safe to call again.
 */
export function prepareAudio() {
  if (ctx) return
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return
  ctx = new Ctor()
  if (ctx.state === 'running') ctx.suspend()
  master = ctx.createGain()
  applyMaster()
  master.connect(ctx.destination)
  echo = createEcho()
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  music = createMusic(ctx, master, noiseBuffer)
  music.setVolume(musicVolume)
}

/** LOW preset: fewer voices per sound (they're built on the main thread). */
const lite = () => useQuality.getState().level === 'LOW'

let musicStarted = false
function unlock() {
  prepareAudio()
  if (!ctx) return
  if (!musicStarted) {
    musicStarted = true
    music.start()
  }
  if (adMuted) ctx.suspend()
  else if (ctx.state === 'suspended') ctx.resume()
}

function createEcho() {
  const input = ctx.createGain()
  input.gain.value = 0.22
  const delay = ctx.createDelay(1)
  delay.delayTime.value = 0.11
  const damp = ctx.createBiquadFilter()
  damp.type = 'lowpass'
  damp.frequency.value = 3000
  const feedback = ctx.createGain()
  feedback.gain.value = 0.3
  input.connect(delay)
  delay.connect(damp).connect(feedback).connect(delay)
  damp.connect(master)
  return input
}

/** Installs the first-gesture unlock. Call once at startup. */
export function installAudioUnlock() {
  const events = ['pointerdown', 'keydown', 'touchend']
  const handler = () => {
    unlock()
    for (const e of events) window.removeEventListener(e, handler, true)
  }
  for (const e of events) window.addEventListener(e, handler, true)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx?.state === 'suspended' && !adMuted) ctx.resume()
  })
}

export function isMuted() {
  return muted
}

export function setMuted(value) {
  muted = value
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0')
  } catch {
    // Not persisted; fine.
  }
  applyMaster()
  for (const listener of muteListeners) listener(muted)
}

const clampVolume = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1)

export function setMasterVolume(volume) {
  masterVolume = clampVolume(volume)
  applyMaster()
}

export function setMusicVolume(volume) {
  musicVolume = clampVolume(volume)
  music?.setVolume(musicVolume)
}

export function setAdBreakMuted(on) {
  adMuted = Boolean(on)
  applyMaster()
  if (!ctx) return
  if (adMuted) ctx.suspend()
  else if (ctx.state === 'suspended' && document.visibilityState === 'visible') ctx.resume()
}

export function onMutedChange(listener) {
  muteListeners.add(listener)
  return () => muteListeners.delete(listener)
}

function ready(name, minGapMs = 0) {
  if (!ctx || silent() || ctx.state !== 'running') return false
  const now = performance.now()
  if (minGapMs && now - (lastPlayed.get(name) || 0) < minGapMs) return false
  lastPlayed.set(name, now)
  return true
}

/** How early (s) a deferred sound is built before it's due. */
const LEAD = 0.06

/** Runs `build(t)` for a sound due `at` seconds from now, building it just before it's due. */
function whenDue(at, build) {
  const due = ctx.currentTime + at
  if (at <= LEAD) {
    build(due)
    return
  }
  setTimeout(() => {
    if (ctx) build(Math.max(ctx.currentTime, due))
  }, (at - LEAD) * 1000)
}

function tone(freq, opts = {}) {
  whenDue(opts.at ?? 0, (t) => toneAt(freq, t, opts))
}

function toneAt(freq, t, { type = 'sine', duration = 0.12, volume = 0.3, slideTo = null, attack = 0.01, echo: wet = false } = {}) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(volume, t + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  osc.connect(gain).connect(master)
  if (wet) gain.connect(echo)
  osc.start(t)
  osc.stop(t + duration + 0.02)
}

/** A struck bell: the note, a quieter octave and a glassy strike, ringing into the echo. */
function bell(freq, { at = 0, volume = 0.1, decay = 0.4 } = {}) {
  tone(freq, { at, duration: decay, volume, echo: true })
  if (lite()) return
  tone(freq * 2, { at, duration: decay * 0.6, volume: volume * 0.35, echo: true })
  tone(freq * 3.01, { type: 'triangle', at, duration: 0.05, volume: volume * 0.3 })
}

function noise(opts = {}) {
  whenDue(opts.at ?? 0, (t) => noiseAt(t, opts))
}

function noiseAt(t, { duration = 0.3, volume = 0.25, from = 400, to = 2400, q = 1.2 } = {}) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = q
  filter.frequency.setValueAtTime(from, t)
  filter.frequency.exponentialRampToValueAtTime(to, t + duration)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(volume, t + Math.min(0.01, duration * 0.3))
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  src.connect(filter).connect(gain).connect(master)
  src.loop = true
  src.start(t, Math.random() * 0.5)
  src.stop(t + duration + 0.02)
}

// --- The tool turning: a ratchet's clicks, or a drill's whine ------------------------------

let motor = null
let motorSetAt = 0

/** A power tool spinning (`pitch` 0-1 how fast); stopped by toolStop. Not for the hand driver. */
function motorStart(pitch = 0.5) {
  if (!ctx || motor || silent() || ctx.state !== 'running') return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.value = 140 + pitch * 160
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 900 + pitch * 900
  filter.Q.value = 2.2
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.setTargetAtTime(0.03, t, 0.03)
  const wobble = ctx.createOscillator()
  wobble.frequency.value = 23
  const depth = ctx.createGain()
  depth.gain.value = 12
  wobble.connect(depth).connect(osc.frequency)
  osc.connect(filter).connect(gain).connect(master)
  osc.start(t)
  wobble.start(t)
  motor = { osc, gain, wobble, filter }
}

function motorSet(load) {
  if (!motor) return
  const now = performance.now()
  if (now - motorSetAt < 60) return
  motorSetAt = now
  const t = ctx.currentTime
  motor.filter.frequency.setTargetAtTime(900 + load * 1100, t, 0.05)
}

function motorStop() {
  if (!motor) return
  const { osc, gain, wobble } = motor
  motor = null
  const t = ctx.currentTime
  gain.gain.setTargetAtTime(0.0001, t, 0.04)
  osc.stop(t + 0.3)
  wobble.stop(t + 0.3)
}

export const sfx = {
  click() {
    if (ready('click', 40)) tone(660, { type: 'triangle', duration: 0.05, volume: 0.15 })
  },
  /** One click of the screwdriver turning: a tiny metallic tick. */
  tick() {
    if (!ready('tick', 55)) return
    noise({ duration: 0.025, volume: 0.09, from: 4200, to: 2600, q: 4 })
    tone(1800 + Math.random() * 400, { type: 'square', duration: 0.018, volume: 0.02 })
  },
  motorStart,
  motorSet,
  motorStop,
  /** A screw coming free: a bright little "plink" with a squeak. `n` screws at once ring fuller. */
  pop(n = 1) {
    if (!ready('pop', 45)) return
    const base = 900 + Math.random() * 300
    tone(base, { type: 'triangle', duration: 0.09, volume: 0.1, slideTo: base * 1.9 })
    noise({ duration: 0.04, volume: 0.06, from: 3000, to: 6000, q: 3 })
    if (n > 1 && !lite()) bell(1568 + Math.min(n, 30) * 18, { at: 0.03, volume: 0.04, decay: 0.2 })
  },
  /** A gold screw: a rich bell. */
  gold() {
    if (!ready('gold', 120)) return
    bell(1319, { volume: 0.08, decay: 0.45 })
    bell(1976, { at: 0.07, volume: 0.06, decay: 0.4 })
  },
  /** A crystal screw: a sparkling arpeggio. */
  crystal() {
    if (!ready('crystal', 150)) return
    ;[1568, 2093, 2637, 3136].forEach((f, i) => bell(f, { at: i * 0.05, volume: 0.05, decay: 0.35 }))
  },
  /** Bag's full: a dull thump and a low "nope". */
  bagFull() {
    if (!ready('bagFull', 700)) return
    tone(140, { type: 'triangle', duration: 0.18, volume: 0.12, slideTo: 90 })
    tone(220, { type: 'square', at: 0.09, duration: 0.12, volume: 0.03, slideTo: 160 })
  },
  /** Selling: screws pouring into the hopper and a cash register's ring. */
  sell(count = 8) {
    if (!ready('sell', 300)) return
    const n = lite() ? 4 : Math.min(12, 4 + Math.floor(count / 10))
    for (let i = 0; i < n; i += 1) noise({ at: i * 0.035, duration: 0.03, volume: 0.05, from: 3500 + Math.random() * 2000, to: 2500, q: 5 })
    tone(1319, { type: 'square', at: 0.32, duration: 0.07, volume: 0.06 })
    bell(2637, { at: 0.38, volume: 0.07, decay: 0.5 })
  },
  buy() {
    if (!ready('buy')) return
    tone(1047, { type: 'square', duration: 0.07, volume: 0.08 })
    tone(1568, { type: 'square', at: 0.08, duration: 0.16, volume: 0.08 })
  },
  upgrade() {
    if (!ready('upgrade', 80)) return
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, { type: 'square', at: i * 0.05, duration: 0.11, volume: 0.07 }))
  },
  equip() {
    if (!ready('equip', 60)) return
    noise({ duration: 0.06, volume: 0.06, from: 1200, to: 3200, q: 2 })
    tone(880, { type: 'triangle', at: 0.03, duration: 0.06, volume: 0.07 })
  },
  error() {
    if (ready('error', 200)) tone(160, { type: 'sawtooth', duration: 0.18, volume: 0.07, slideTo: 110 })
  },
  /** The last screw out: the door unlocks with a clunk and a fanfare. */
  doorOpen() {
    if (!ready('doorOpen', 500)) return
    music?.duck(true)
    tone(80, { duration: 0.35, volume: 0.2, slideTo: 45 })
    noise({ duration: 0.5, volume: 0.06, from: 200, to: 900, q: 0.8 })
    ;[523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, { type: 'triangle', at: 0.3 + i * 0.08, duration: 0.25, volume: 0.09, echo: true }))
    setTimeout(() => music?.duck(false), 1800)
  },
  /** Through the door: a whoosh. */
  whoosh() {
    if (!ready('whoosh', 300)) return
    noise({ duration: 0.45, volume: 0.1, from: 300, to: 2400, q: 0.7 })
  },
  /** A chapter cleared: the big fanfare and a shower of bells. */
  fanfare() {
    if (!ready('fanfare', 800)) return
    music?.duck(true)
    ;[392, 523, 659, 784].forEach((f, i) => tone(f, { type: 'triangle', at: i * 0.1, duration: 0.25, volume: 0.1, echo: true }))
    for (const f of [523, 659, 784, 1047]) tone(f, { at: 0.45, duration: 1.3, volume: 0.04, attack: 0.05, echo: true })
    for (let i = 0; i < (lite() ? 3 : 8); i += 1) bell(2093 + Math.random() * 1200, { at: 0.5 + i * 0.08, volume: 0.035, decay: 0.25 })
    setTimeout(() => music?.duck(false), 2600)
  },
  /** Crystals or a reward landing. */
  reward() {
    if (!ready('reward', 200)) return
    ;[784, 988, 1175, 1568].forEach((f, i) => tone(f, { type: 'triangle', at: i * 0.07, duration: 0.2, volume: 0.09, echo: true }))
  },
  /** Countdown beeps: 3, 2, 1 ... and GO (`go`). */
  beep(go = false) {
    if (!ready(go ? 'go' : 'beep', 200)) return
    tone(go ? 1047 : 660, { type: 'square', duration: go ? 0.35 : 0.12, volume: 0.08 })
  },
  jump() {
    if (ready('jump', 120)) tone(320, { type: 'triangle', duration: 0.12, volume: 0.06, slideTo: 520 })
  },
  jumpLand() {
    if (ready('jumpLand', 150)) tone(120, { duration: 0.1, volume: 0.1, slideTo: 70 })
  },
}
