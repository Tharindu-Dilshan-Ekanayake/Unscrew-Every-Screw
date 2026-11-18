import { STYLE } from '../materials'

/**
 * Each chapter's look. Surfaces use the toy material's procedural patterns (no texture
 * downloads): planks, wallpaper, diamond plate, tiles.
 */
export const THEMES = {
  workshop: {
    background: '#1c130b',
    floor: '#a8743f',
    floorStyle: STYLE.PARQUET,
    wall: '#ead9b6',
    wallStyle: STYLE.PAPER,
    ceiling: '#f2e7d2',
    trim: '#6b4428',
    beam: '#8a5a32',
    accent: '#ffb02e',
    lamp: '#fff4d6',
    screw: '#f0cf78',
    hemiSky: '#fff1dc',
    hemiGround: '#8a6038',
    hemi: 2.1,
    sun: '#ffe2b0',
    sunIntensity: 1.3,
    corridor: '#3a2a1a',
  },
  boiler: {
    background: '#120c0a',
    floor: '#5d636b',
    floorStyle: STYLE.PLATE,
    wall: '#9c4a34',
    wallStyle: STYLE.PLATE,
    ceiling: '#3a3d44',
    trim: '#2a2d33',
    beam: '#4a4f57',
    accent: '#ff7a1a',
    lamp: '#ffc77a',
    screw: '#cfd6de',
    hemiSky: '#ffd2a8',
    hemiGround: '#3a2a24',
    hemi: 2.0,
    sun: '#ffb070',
    sunIntensity: 1.35,
    corridor: '#1d1512',
  },
  lab: {
    background: '#0c1418',
    floor: '#dfe8ef',
    floorStyle: STYLE.TILES,
    wall: '#f4f8fb',
    wallStyle: STYLE.TILES,
    ceiling: '#ffffff',
    trim: '#1fa3d6',
    beam: '#c9d6e0',
    accent: '#22e0c0',
    lamp: '#e8fbff',
    screw: '#eef3f8',
    hemiSky: '#eaf6ff',
    hemiGround: '#9fb2c2',
    hemi: 2.2,
    sun: '#ffffff',
    sunIntensity: 1.2,
    corridor: '#16242c',
  },
}

export const themeOf = (chapter) => THEMES[chapter?.theme] || THEMES.workshop

/**
 * Each room of a chapter in its own light: the walls, the lamps and the accents change
 * from room to room (the chapter's look underneath), so no two rooms feel the same.
 */
const ROOM_LOOKS = {
  workshop: [
    {},
    { wall: '#c99a62', wallStyle: STYLE.PARQUET, beam: '#7a4a28', lamp: '#ffe6b8' },
    { wall: '#d9c7a1', accent: '#2fa8ff', lamp: '#fff4d6' },
    { wall: '#b98a5a', wallStyle: STYLE.PARQUET, ceiling: '#a8743f', lamp: '#ffd59a', hemiSky: '#ffd9a8', sun: '#ffc27a' },
    { wall: '#f0e2c0', accent: '#ff5a4a', trim: '#4a2e18', lamp: '#fffbe8', sunIntensity: 1.45 },
  ],
  boiler: [
    {},
    { wall: '#7a3a2a', accent: '#ffd23a' },
    { wall: '#5d636b', floor: '#3a3f47', accent: '#2fe0ff', lamp: '#bff4ff', hemiSky: '#cfe4ff', sun: '#bcd6ff' },
    { wall: '#a8502e', accent: '#ff4a1a', lamp: '#ffb070', hemiSky: '#ffb27a', sun: '#ff8a4a', sunIntensity: 1.55, pillar: '#5a2a1e' },
    { wall: '#3a3f4a', accent: '#ffd23a', lamp: '#ffe9b0', pillar: '#2a2d33', background: '#080606' },
  ],
  lab: [
    {},
    { wall: '#e6f4ff', trim: '#8b5cff', accent: '#b88bff' },
    { wall: '#d6f6ff', floor: '#cfe8f4', trim: '#5fe6ff', lamp: '#bff4ff', screw: '#e6fbff', hemiSky: '#cfefff', sun: '#d6f6ff' },
    { wall: '#2a3340', wallStyle: STYLE.TILES, floor: '#3a4656', ceiling: '#1e252f', trim: '#5dff7a', accent: '#5dff7a', lamp: '#d6ffe0', pillar: '#1e252f', hemiSky: '#b8ffd0', hemiGround: '#203040', background: '#05080a' },
    { wall: '#f4f8fb', trim: '#ff5a4a', accent: '#ff5a4a', lamp: '#fff0ea', hemiSky: '#ffe6e0', sunIntensity: 1.35 },
  ],
}

/** The look of room `roomIndex` of a chapter. */
export function roomTheme(chapter, roomIndex) {
  const id = chapter?.theme || 'workshop'
  return { ...themeOf(chapter), ...(ROOM_LOOKS[id]?.[roomIndex] || {}) }
}
