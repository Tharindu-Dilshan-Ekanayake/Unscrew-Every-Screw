import { create } from 'zustand'

/**
 * Graphics quality presets. Every visual feature reads its settings from here rather
 * than deciding for itself, so dropping a preset reliably sheds load everywhere.
 *
 * LOW is the baseline everyone starts on: no realtime shadows, no particles, no
 * post-processing, native resolution and textures capped at 512px - but with the cheap
 * things that make it look nearly as good as MEDIUM (antialiasing, shiny screws, flying
 * screws, rounder screw heads where the room can afford them, far fog).
 */
export const QUALITY_LEVELS = ['LOW', 'MEDIUM', 'HIGH']

export const PRESETS = {
  LOW: {
    dpr: 1,
    // MSAA at native resolution: cheap (especially on phones' tiled GPUs) and the biggest
    // single step towards MEDIUM's look. If FPS still falls, resolution steps down (RENDER_SCALES).
    antialias: true,
    /** 'blob' = fake contact shadows only; 'realtime' = shadow-mapped sun (lobby only). */
    shadows: 'blob',
    shadowMapSize: 0,
    particles: false,
    viewDistance: 200,
    fogNear: 90,
    /**
     * Sides on a screw head: the biggest triangle cost in a room (x ~1,200 screws). The
     * most a room uses - big rooms take fewer to stay in budget (ScrewField).
     */
    screwSegments: 10,
    /** Most triangles all of a room's screw heads may take (the screen's budget is 100k on LOW). */
    screwTriangles: 70_000,
    /** Screws flying into the bag and into the hopper (sparks need `particles` too). */
    screwFx: true,
    /** Max side of any generated texture. */
    maxTexture: 512,
    /**
     * Other players in the lobby: drawn this far away, the nearest `remoteAvatars` within
     * `remoteAvatarDistance` as their real Boxity avatar (anyone else as a blocky figure).
     */
    remoteDrawDistance: 120,
    remoteAvatars: 5,
    remoteAvatarDistance: 60,
    remoteNameDistance: 40,
  },
  MEDIUM: {
    dpr: 1.25,
    antialias: true,
    shadows: 'blob',
    shadowMapSize: 0,
    particles: true,
    viewDistance: 260,
    fogNear: 100,
    screwSegments: 12,
    screwTriangles: 160_000,
    screwFx: true,
    maxTexture: 1024,
    remoteDrawDistance: 150,
    remoteAvatars: 9,
    remoteAvatarDistance: 150,
    remoteNameDistance: 55,
  },
  HIGH: {
    dpr: 1.5,
    antialias: true,
    shadows: 'realtime',
    shadowMapSize: 1024,
    particles: true,
    viewDistance: 360,
    fogNear: 140,
    screwSegments: 16,
    screwTriangles: 240_000,
    screwFx: true,
    maxTexture: 1024,
    remoteDrawDistance: 150,
    remoteAvatars: 9,
    remoteAvatarDistance: 150,
    remoteNameDistance: 70,
  },
}

const STORAGE_KEY = 'se.quality'

/**
 * Resolution steps, as a fraction of the preset's pixel ratio. Below LOW, a weak PC or
 * phone still under 45 FPS renders fewer pixels: the scene is the same, only softer.
 * Shading every pixel is what an integrated GPU runs out of first, so this is the
 * biggest single saving there is.
 */
export const RENDER_SCALES = [1, 0.85, 0.7, 0.6]

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua)) return true
  // iPadOS reports itself as a Mac; touch points give it away.
  return navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)
}

function readSaved() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return QUALITY_LEVELS.includes(saved) ? saved : null
  } catch {
    return null
  }
}

/**
 * Everyone starts on LOW - which looks nearly as good as MEDIUM - and can raise it in
 * Settings; a level picked there is remembered on this device. Below 45 FPS the
 * resolution steps down by itself (`degrade`).
 */
export const DEFAULT_LEVEL = 'LOW'

const initialLevel = readSaved() || DEFAULT_LEVEL

export const useQuality = create((set, get) => ({
  level: initialLevel,
  /** True when the player picked the level by hand; auto-drop then stays out of it. */
  manual: readSaved() !== null,
  isMobile: isMobileDevice(),
  /** Antialiasing can't change without recreating the WebGL context (see `rebuild`). */
  antialias: PRESETS[initialLevel].antialias,
  settings: PRESETS[initialLevel],
  /**
   * Bumped when the player picks a new level by hand: the 3D view is rebuilt from
   * scratch, so things set when it's made (antialiasing, screw detail) take the new
   * level at once.
   */
  rebuild: 0,
  /** Index into RENDER_SCALES: how far resolution has been dropped to keep FPS up. */
  renderStep: 0,

  setLevel: (level, manual = true) => {
    if (!QUALITY_LEVELS.includes(level)) return
    if (manual) {
      try {
        localStorage.setItem(STORAGE_KEY, level)
      } catch {
        // Private mode: the choice just won't persist.
      }
    }
    const changed = level !== get().level
    set((s) => ({
      level,
      manual,
      settings: PRESETS[level],
      ...(manual && changed ? { antialias: PRESETS[level].antialias, rebuild: s.rebuild + 1 } : {}),
    }))
  },

  /**
   * Called by the performance monitor when FPS stays under budget: drops a preset if it
   * can (not one the player picked by hand), and once on LOW (or a hand-picked level),
   * renders at a lower resolution instead, a step at a time.
   */
  degrade: () => {
    const { level, manual, renderStep } = get()
    const index = QUALITY_LEVELS.indexOf(level)
    if (!manual && index > 0) {
      const next = QUALITY_LEVELS[index - 1]
      console.info(`[quality] FPS under budget, dropping ${level} -> ${next}`)
      set({ level: next, settings: PRESETS[next] })
      return
    }
    if (renderStep + 1 < RENDER_SCALES.length) {
      console.info(`[quality] FPS under budget, rendering at ${RENDER_SCALES[renderStep + 1] * 100}%`)
      set({ renderStep: renderStep + 1 })
    }
  },

  /** Called when FPS has plenty of headroom again: resolution comes back a step. */
  recover: () => {
    const { renderStep } = get()
    if (renderStep > 0) set({ renderStep: renderStep - 1 })
  },
}))

/** Non-reactive read, safe inside useFrame. */
export const getQuality = () => useQuality.getState().settings
