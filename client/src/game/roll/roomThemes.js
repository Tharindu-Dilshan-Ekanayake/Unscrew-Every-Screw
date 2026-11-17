import { Color } from 'three'

import { WORLD_ZONES } from '@shared/balance'
import { mulberry32 } from '@shared/rng'

import { STYLE } from '../materials'
import { FLOORS_ABOVE_GROUND, HOLE_HALF, ROOM_HALF } from './dropPath'

/**
 * The hotel's rooms: twenty themes, each a little furniture layout made of boxes, built
 * fresh for every floor from a seed (so a floor looks the same every drop, and for every
 * player). Whatever stands under the phone's path - the bed, the coffee table, the
 * bathtub - is flagged `smash` and bursts as the phone comes through.
 *
 * Coordinates are the room's own: its middle at (0, 0), x east, z north-negative, `y` the
 * height above the floor a box's bottom sits at. The room's inside runs out to IN either
 * way. The camera looks down from just south of the middle, so the north wall (-z) is the
 * one in view: that's where TVs, mirrors and paintings go.
 */

const IN = ROOM_HALF - 0.2

/** Floors cycle through the twenty themes three times: classic, deluxe, then the secret basement. */
export const THEME_ORDER = ['pool', 'lounge', 'bedroom', 'bathroom', 'kitchen', 'dining', 'library', 'gym', 'arcade', 'cinema', 'spa', 'ballroom', 'office', 'music', 'kids', 'garden', 'laundry', 'aquarium', 'art', 'vault']

const WOOD = '#c98f52'
const DARK_WOOD = '#8a5a32'
const WHITE = '#f4f7fb'
const STEEL = '#c9d2de'
const BLACK = '#22252b'
const GOLD = '#ffc21a'
const LEAF = '#4fd93a'
const LEAF_DARK = '#2fae4a'
const POT = '#e8743a'

class RoomBuilder {
  constructor(rand) {
    this.rand = rand
    this.boxes = []
  }

  box(x, z, w, h, d, color, y = 0, style = STYLE.SMOOTH) {
    this.boxes.push({ x, y, z, w, h, d, color, style, smash: false })
    return this
  }

  /** Against a wall: `side` 'n' | 's' | 'e' | 'w', `at` along it, `d` deep out of it. */
  wall(side, at, w, h, d, color, y = 0, style = STYLE.SMOOTH) {
    if (side === 'n') return this.box(at, -IN + d / 2, w, h, d, color, y, style)
    if (side === 's') return this.box(at, IN - d / 2, w, h, d, color, y, style)
    if (side === 'e') return this.box(IN - d / 2, at, d, h, w, color, y, style)
    return this.box(-IN + d / 2, at, d, h, w, color, y, style)
  }

  pick(list) {
    return list[Math.floor(this.rand() * list.length) % list.length]
  }
}

// --- Furniture ------------------------------------------------------------------------

function rug(b, x, z, w, d, color, edge = WHITE) {
  b.box(x, z, w + 0.3, 0.03, d + 0.3, edge)
  b.box(x, z, w, 0.06, d, color)
}

function table(b, x, z, w, d, h, color, legs = DARK_WOOD) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(x + sx * (w / 2 - 0.2), z + sz * (d / 2 - 0.2), 0.22, h - 0.15, 0.22, legs)
  b.box(x, z, w, 0.18, d, color, h - 0.18)
}

/** A sofa facing `facing` ('n' faces north: its back is to the south). */
function sofa(b, x, z, facing, color, length = 4) {
  const along = facing === 'n' || facing === 's'
  const w = along ? length : 1.5
  const d = along ? 1.5 : length
  b.box(x, z, w, 0.8, d, color)
  const back = { n: [0, 0.55], s: [0, -0.55], e: [-0.55, 0], w: [0.55, 0] }[facing]
  b.box(x + back[0], z + back[1], along ? length : 0.4, 1.0, along ? 0.4 : length, color, 0.8)
  const arm = along ? [[-length / 2 + 0.2, 0], [length / 2 - 0.2, 0]] : [[0, -length / 2 + 0.2], [0, length / 2 - 0.2]]
  for (const [ax, az] of arm) b.box(x + ax, z + az, along ? 0.4 : 1.5, 0.6, along ? 1.5 : 0.4, color, 0.8)
}

function chair(b, x, z, color, facing = 'n') {
  b.box(x, z, 0.9, 0.7, 0.9, color)
  const off = { n: [0, 0.35], s: [0, -0.35], e: [-0.35, 0], w: [0.35, 0] }[facing]
  b.box(x + off[0], z + off[1], facing === 'n' || facing === 's' ? 0.9 : 0.2, 1.0, facing === 'n' || facing === 's' ? 0.2 : 0.9, color, 0.7)
}

function lamp(b, x, z, shade = '#ffe9a8', height = 2.6) {
  b.box(x, z, 0.6, 0.12, 0.6, BLACK)
  b.box(x, z, 0.12, height, 0.12, STEEL, 0.12)
  b.box(x, z, 0.9, 0.7, 0.9, shade, height, STYLE.GLOW)
}

function plant(b, x, z, size = 1) {
  b.box(x, z, 0.8 * size, 0.7 * size, 0.8 * size, POT)
  b.box(x, z, 1.2 * size, 1.1 * size, 1.2 * size, LEAF, 0.7 * size)
  b.box(x, z, 0.8 * size, 0.8 * size, 0.8 * size, LEAF_DARK, 1.6 * size)
}

/** A bookshelf against a wall, its shelves filled with coloured books. */
function bookshelf(b, side, at, width, color = DARK_WOOD) {
  b.wall(side, at, width, 4.4, 1, color)
  const books = ['#ff5a5a', '#4f86ff', '#ffd21f', '#5fdc4a', '#a465ff', '#ff9a2e', '#3fd6e8']
  for (let shelf = 0; shelf < 3; shelf += 1) {
    let u = -width / 2 + 0.3
    while (u < width / 2 - 0.4) {
      const bw = 0.25 + b.rand() * 0.25
      const bh = 0.8 + b.rand() * 0.4
      b.wall(side, at + u + bw / 2, bw, bh, 1.08, b.pick(books), 0.4 + shelf * 1.35)
      u += bw + 0.05
    }
  }
}

function tv(b, side, at, width = 6, frame = BLACK, screen = '#5fd6ff') {
  b.wall(side, at, width, 3.4, 0.25, frame, 3.2)
  b.wall(side, at, width - 0.4, 3.0, 0.32, screen, 3.4, STYLE.GLOW)
}

function painting(b, side, at, w, h, color, y = 3.6) {
  b.wall(side, at, w + 0.3, h + 0.3, 0.16, GOLD, y - 0.15)
  b.wall(side, at, w, h, 0.22, color, y, STYLE.GLOW)
}

/**
 * Tall windows down the outside walls (`sides`), the city's light coming in: a white
 * frame and sill, glazing bars, and curtains drawn back either side under a valance in
 * the room's trim colour.
 */
function windows(b, sides, curtain, color = '#bff6ff') {
  for (const side of sides) {
    for (const at of [-6, 0, 6]) {
      b.wall(side, at, 4.2, 4.8, 0.08, WHITE, 2.9)
      b.wall(side, at, 3.6, 4.2, 0.12, color, 3.2, STYLE.GLOW)
      b.wall(side, at, 0.16, 4.2, 0.18, WHITE, 3.2)
      b.wall(side, at, 3.6, 0.16, 0.18, WHITE, 5.0)
      b.wall(side, at, 4.6, 0.22, 0.32, WHITE, 2.72)
      for (const s of [-1, 1]) b.wall(side, at + s * 2.35, 0.7, 5.4, 0.26, curtain, 2.3)
      b.wall(side, at, 5.4, 0.6, 0.34, curtain, 7.7)
    }
  }
}

/** Where a door can go: against a wall, clear of everything already standing there. */
const DOOR_SPOTS = [['n', -7.6], ['n', 7.6], ['w', 7], ['e', 7], ['w', -7], ['e', -7], ['s', -7], ['s', 7]]

function doorFits(b, side, at) {
  const half = 1.9
  for (const box of b.boxes) {
    // Rugs lie flat: a door opens over them.
    if (box.h < 0.1) continue
    if (side === 'n' && box.z - box.d / 2 < -IN + 1.6 && Math.abs(box.x - at) < box.w / 2 + half) return false
    if (side === 's' && box.z + box.d / 2 > IN - 1.6 && Math.abs(box.x - at) < box.w / 2 + half) return false
    if (side === 'w' && box.x - box.w / 2 < -IN + 1.6 && Math.abs(box.z - at) < box.d / 2 + half) return false
    if (side === 'e' && box.x + box.w / 2 > IN - 1.6 && Math.abs(box.z - at) < box.d / 2 + half) return false
  }
  return true
}

/**
 * A hotel-room door on the first free wall spot (`sides` allowed): a frame, a panelled
 * door, a brass handle and the room's number plate glowing above.
 */
function door(b, sides, color, frame) {
  const spot = DOOR_SPOTS.find(([side, at]) => sides.includes(side) && doorFits(b, side, at))
  if (!spot) return
  const [side, at] = spot
  const panel = mix(color, '#ffffff', 0.18)
  b.wall(side, at, 3.0, 6.3, 0.16, frame)
  b.wall(side, at, 2.5, 5.9, 0.24, color)
  b.wall(side, at, 1.8, 2.2, 0.3, panel, 0.6)
  b.wall(side, at, 1.8, 2.2, 0.3, panel, 3.3)
  b.wall(side, at + 0.85, 0.2, 0.2, 0.44, GOLD, 2.9)
  b.wall(side, at, 1.1, 0.5, 0.22, GOLD, 6.6, STYLE.GLOW)
}

// --- The twenty rooms -------------------------------------------------------------------

/** Each theme: wall colour, floor checker (two colours), trim, the colours its name shows in, and its furniture. */
export const ROOM_THEMES = {
  pool: {
    wall: '#bfeaff', floor: ['#ffffff', '#cfefff'], trim: '#2fc6ff', name: ['#e0faff', '#7fe2ff', '#2f8ff2'],
    build(b) {
      // The pool fills the middle: tiled rim, bright water, a floating duck right under the phone.
      b.box(0, 1, 14, 0.5, 11, '#f4fbff')
      b.box(0, 1, 13, 0.56, 10, '#3fd6ff', 0, STYLE.WATER)
      b.box(0, 0, 2.2, 0.9, 2.2, '#ffd21f', 0.4)
      b.box(0.5, -0.6, 1.1, 0.9, 1.1, '#ffd21f', 1.1)
      b.box(1.2, -0.6, 0.5, 0.25, 0.4, '#ff8a1f', 1.4)
      for (const x of [-7.5, -3, 3, 7.5]) {
        b.box(x, 8.3, 1.4, 0.4, 3, WHITE)
        b.box(x, 9.4, 1.4, 0.8, 0.5, '#ff6f8a', 0.4)
      }
      b.box(-9, -8.5, 2, 3.6, 0.3, WHITE)
      b.box(-9, -8, 2, 0.3, 3, '#ff5a7a', 3.4)
      plant(b, 9.3, -9.3)
      plant(b, -9.3, 9.3)
    },
  },
  lounge: {
    wall: '#ffd9b0', floor: ['#e8c48a', '#d9ae6a'], trim: '#ff8a5a', name: ['#fff3d6', '#ffb86b', '#ff6f3a'],
    build(b) {
      rug(b, 0, 0.5, 9, 7, '#ff6f61')
      table(b, 0, 0.5, 3.4, 2.2, 1.0, '#ffd21f')
      b.box(0.6, 0.4, 0.6, 0.6, 0.6, '#ffffff', 1.0)
      sofa(b, 0, 5, 'n', '#2fc6ff', 6)
      sofa(b, -5.5, 0.5, 'e', '#2fc6ff', 4.5)
      chair(b, 5.5, 0.5, '#ff5a7a', 'w')
      tv(b, 'n', 0)
      b.wall('n', 0, 7, 1.4, 1.2, DARK_WOOD)
      lamp(b, -8.8, 6.5)
      lamp(b, 8.8, -8.8)
      plant(b, 9, 8.8)
      bookshelf(b, 'e', -5, 6)
    },
  },
  bedroom: {
    wall: '#e6d4ff', floor: ['#ffd0e8', '#ffb8dc'], trim: '#c35cff', name: ['#fff0fb', '#ffb8e8', '#c35cff'],
    build(b) {
      // A big bed right in the middle, its headboard to the north.
      b.box(0, -0.5, 6, 1.0, 8, '#ffffff')
      b.box(0, -0.2, 6.2, 0.7, 7.4, '#8a4cff', 1.0)
      b.box(-1.5, -3.6, 2.2, 0.5, 1.2, '#ffffff', 1.7)
      b.box(1.5, -3.6, 2.2, 0.5, 1.2, '#ffffff', 1.7)
      b.box(0, -4.6, 6.6, 3.4, 0.5, '#5a2a9a')
      for (const x of [-4.4, 4.4]) {
        b.box(x, -3.8, 1.6, 1.3, 1.6, WHITE)
        lamp(b, x, -3.8, '#ffe9a8', 0.6)
      }
      rug(b, 0, 5.5, 8, 3.5, '#ff9cd6')
      b.wall('w', 4, 5, 6, 1.6, WHITE)
      b.wall('e', -4, 3, 1.6, 1.4, '#ffd21f')
      painting(b, 'n', -7.5, 2.5, 2, '#7fe2ff')
      plant(b, 9, 9)
    },
  },
  bathroom: {
    wall: '#cfefff', floor: ['#ffffff', '#9fe0d8'], trim: '#3fd6e8', name: ['#e0fff8', '#7ff0e0', '#1fb8a0'],
    build(b) {
      // The bathtub in the middle, full of bubbles.
      b.box(0, 0, 4, 1.4, 7, '#ffffff')
      b.box(0, 0, 3.4, 1.42, 6.4, '#5fd6ff', 0, STYLE.WATER)
      for (const [x, z] of [[-0.8, -1.5], [0.6, 0.4], [-0.4, 1.8], [0.9, -2.4]]) b.box(x, z, 1.2, 0.8, 1.2, '#ffffff', 1.3)
      b.box(0, -3.8, 0.3, 1.6, 0.3, STEEL, 1.2)
      // Sinks under a long mirror, a toilet, towels.
      b.wall('n', 0, 12, 2.4, 2, WHITE)
      for (const x of [-3, 3]) b.wall('n', x, 2.2, 0.3, 1.6, '#5fd6ff', 2.4)
      b.wall('n', 0, 11, 3, 0.2, '#e8f8ff', 3.6, STYLE.GLOW)
      b.box(8.4, 7, 1.6, 1.4, 2, WHITE)
      b.box(8.4, 8.4, 1.6, 2.4, 0.8, WHITE)
      b.wall('w', -3, 3, 0.2, 0.4, '#ff8fd0', 3.5)
      b.wall('w', -3, 2.6, 2, 0.15, '#ff8fd0', 1.5)
      plant(b, -9, 9)
    },
  },
  kitchen: {
    wall: '#fff3c8', floor: ['#ffffff', '#ff8a8a'], trim: '#ff5a5a', name: ['#fff0e0', '#ff9a7a', '#e83a3a'],
    build(b) {
      // The island in the middle, with a fruit bowl and a cake.
      b.box(0, 0, 7, 2.2, 3.4, WHITE)
      b.box(0, 0, 7.4, 0.25, 3.8, '#3f4a5f', 2.2)
      b.box(-1.5, 0, 1.6, 0.5, 1.6, '#ff5a5a', 2.45)
      b.box(1.5, 0.2, 1.8, 1.0, 1.8, '#ffb8dc', 2.45)
      b.box(1.5, 0.2, 1.9, 0.25, 1.9, '#ffffff', 3.45)
      for (const x of [-2.5, 0, 2.5]) chair(b, x, 3.2, '#ffd21f', 'n')
      // Counters, stove and fridge round the walls.
      b.wall('n', -2, 14, 2.2, 2, WHITE)
      b.wall('n', -2, 14.2, 0.25, 2.2, '#3f4a5f', 2.2)
      b.wall('n', 2, 2.4, 0.15, 1.6, BLACK, 2.45)
      b.wall('n', -5, 12, 2, 1.2, '#ff8a8a', 4.6)
      b.wall('e', -6, 3, 6, 2.2, STEEL)
      b.wall('e', -6, 0.2, 5.8, 2.24, '#9aa6bd')
      b.wall('w', 2, 6, 2.2, 2, WHITE)
      plant(b, 9, 9, 0.8)
    },
  },
  dining: {
    wall: '#ffe0d0', floor: ['#c98f52', '#b07a40'], trim: GOLD, name: ['#fff6d6', '#ffd84a', '#d68a10'],
    build(b) {
      // A long table down the middle, laid for a feast.
      table(b, 0, 0, 4, 12, 1.5, '#ffffff', DARK_WOOD)
      for (let z = -4.5; z <= 4.5; z += 3) {
        chair(b, -3, z, '#c8323c', 'e')
        chair(b, 3, z, '#c8323c', 'w')
        b.box(-1, z, 0.9, 0.12, 0.9, '#ffffff', 1.5)
        b.box(1, z, 0.9, 0.12, 0.9, '#ffffff', 1.5)
      }
      b.box(0, 0, 1.4, 1.0, 1.4, '#ff9a2e', 1.5)
      b.box(0, -3, 0.5, 1.4, 0.5, GOLD, 1.5)
      b.box(0, 3, 0.5, 1.4, 0.5, GOLD, 1.5)
      // A chandelier hanging over the middle.
      b.box(0, 0, 0.15, 3, 0.15, GOLD, 8.2)
      b.box(0, 0, 3, 0.4, 3, GOLD, 7.8)
      for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) b.box(x, z, 0.5, 0.7, 0.5, '#fff6c8', 8.2, STYLE.GLOW)
      painting(b, 'n', 0, 6, 3, '#ff9a6a')
      plant(b, -9, -9)
      plant(b, 9, -9)
    },
  },
  library: {
    wall: '#e8dcc8', floor: ['#8a5a32', '#7a4a28'], trim: '#5fdc4a', name: ['#f0ffd6', '#9be86a', '#3a9a2a'],
    build(b) {
      bookshelf(b, 'n', -4.5, 8)
      bookshelf(b, 'n', 4.5, 8)
      bookshelf(b, 'w', -2, 12)
      bookshelf(b, 'e', -2, 12)
      // A reading table in the middle with open books and a green lamp.
      rug(b, 0, 1, 9, 9, '#2f6f3a', '#ffd21f')
      table(b, 0, 0.5, 4.4, 3, 1.4, WOOD)
      b.box(-0.8, 0.4, 1.4, 0.2, 1.0, '#ffffff', 1.4)
      b.box(1, 0.6, 1.0, 0.5, 1.2, '#ff5a5a', 1.4)
      b.box(0.4, -0.5, 0.3, 1.0, 0.3, STEEL, 1.4)
      b.box(0.4, -0.5, 1.0, 0.4, 0.6, '#3ad456', 2.4, STYLE.GLOW)
      chair(b, 0, 3, '#ff9a2e', 'n')
      chair(b, 0, -2, '#ff9a2e', 's')
      chair(b, 6, 7, '#c8323c', 'n')
      lamp(b, 8, 8.5)
    },
  },
  gym: {
    wall: '#d6e4ff', floor: ['#3a3f4a', '#2f343f'], trim: '#ff5a5a', name: ['#e0f0ff', '#7fb8ff', '#3a6bff'],
    build(b) {
      rug(b, 0, 0, 10, 10, '#4f86ff', '#ffffff')
      // A weights bench in the middle, the barbell racked over it.
      b.box(0, 0, 1.2, 1.1, 4.4, '#1f2a5c')
      b.box(0, -2.4, 3.6, 2.6, 0.3, STEEL)
      b.box(0, -2.4, 5, 0.18, 0.18, STEEL, 2.6)
      for (const x of [-2.3, 2.3]) b.box(x, -2.4, 0.3, 1.4, 1.4, '#ff5a5a', 1.9)
      // Treadmills along the north wall, a dumbbell rack, a punching bag.
      for (const x of [-6, 0, 6]) {
        b.wall('n', x, 2.4, 0.5, 4.4, BLACK)
        b.wall('n', x, 2.4, 1.6, 0.4, '#5a6a7f', 0.5)
        b.wall('n', x, 1.2, 0.5, 0.3, '#5fd6ff', 2.1, STYLE.GLOW)
      }
      b.wall('e', 3, 6, 1.0, 1.4, '#3a3f4a')
      for (let z = 0.8; z <= 5.2; z += 1.1) b.wall('e', z, 0.5, 0.5, 1.6, '#ff5a5a', 1.0)
      b.box(-8, 7, 0.15, 3, 0.15, STEEL, 6)
      b.box(-8, 7, 1.4, 3.4, 1.4, '#c8323c', 2.4)
      b.wall('s', 0, 18, 0.12, 0.12, '#5fd6ff', 1.2, STYLE.GLOW)
    },
  },
  arcade: {
    wall: '#2a1f4a', floor: ['#3a2a6a', '#2a1f4a'], trim: '#ff5fd2', name: ['#ffd6f4', '#ff7ad9', '#a43aff'],
    build(b) {
      // An air hockey table in the middle, glowing.
      table(b, 0, 0, 4, 6.4, 1.6, '#1d1f22', '#ff5fd2')
      b.box(0, 0, 3.4, 0.06, 5.8, '#5fd6ff', 1.6, STYLE.GLOW)
      b.box(0, -2.2, 0.8, 0.3, 0.8, '#ff3b3b', 1.66)
      b.box(0, 2.2, 0.8, 0.3, 0.8, '#ffd21f', 1.66)
      // Arcade cabinets round the walls, screens lit.
      const glow = ['#5fd6ff', '#ff7ad9', '#ffd21f', '#7dff4a']
      for (let i = 0; i < 4; i += 1) {
        const at = -7.5 + i * 5
        b.wall('n', at, 2.2, 4.2, 2, i % 2 ? '#3f6bff' : '#c35cff')
        b.wall('n', at, 1.6, 1.4, 2.1, glow[i], 2.2, STYLE.GLOW)
        b.wall('n', at, 2.4, 0.5, 2.4, '#ffd21f', 4.2, STYLE.GLOW)
      }
      for (const z of [-3, 3]) {
        b.wall('w', z, 2.2, 4.2, 2, '#ff5a5a')
        b.wall('w', z, 1.6, 1.4, 2.1, '#7dff4a', 2.2, STYLE.GLOW)
      }
      b.box(7, 6, 3, 1.2, 3, '#ff9a2e')
      b.box(7, 6, 2.6, 0.08, 2.6, '#ffffff', 1.2, STYLE.GLOW)
      b.wall('s', 0, 20, 0.15, 0.15, '#ff5fd2', 0.3, STYLE.GLOW)
    },
  },
  cinema: {
    wall: '#3a1418', floor: ['#7a1a24', '#5a121a'], trim: '#ffd21f', name: ['#ffe0e0', '#ff7a7a', '#c0103a'],
    build(b) {
      // The big screen to the north, rows of red seats facing it, popcorn in the middle.
      b.wall('n', 0, 18, 7.2, 0.3, '#1d1f22', 1.8)
      b.wall('n', 0, 17, 6.4, 0.4, '#e8f4ff', 2.2, STYLE.GLOW)
      for (let row = 0; row < 3; row += 1) {
        const z = 3 + row * 2.6
        for (let x = -8; x <= 8; x += 2) if (Math.abs(x) > 1) chair(b, x, z, '#e83a4a', 'n')
        b.box(0, z + 1.1, 18, 0.3 + row * 0.3, 0.8, '#5a121a')
      }
      // A popcorn cart right under the phone.
      b.box(0, -1, 2.4, 1.8, 2.4, '#ff3b3b')
      b.box(0, -1, 2.6, 0.3, 2.6, '#ffffff', 1.8)
      b.box(0, -1, 2, 1.6, 2, '#fff6c8', 2.1, STYLE.GLOW)
      b.box(0, -1, 2.8, 0.4, 2.8, '#ff3b3b', 3.7)
      for (const x of [-9, 9]) b.wall('n', x, 1.2, 6, 1.2, '#1d1f22')
    },
  },
  spa: {
    wall: '#d8f5e8', floor: ['#f4fbf6', '#cfeedd'], trim: '#5fe0b0', name: ['#e0fff4', '#7ff0c8', '#1fa880'],
    build(b) {
      // A round hot tub in the middle.
      b.box(0, 0, 6, 1.4, 6, '#c9a87a')
      b.box(0, 0, 5, 1.42, 5, '#7ff0e0', 0, STYLE.WATER)
      b.box(-0.8, 0.4, 0.9, 0.5, 0.9, '#ffffff', 1.3)
      b.box(1, -1, 0.7, 0.4, 0.7, '#ffffff', 1.3)
      // Massage tables, candles and towels, bamboo in the corners.
      for (const x of [-6.5, 6.5]) {
        b.box(x, 6, 2.2, 1.6, 5, WHITE)
        b.box(x, 3.8, 1.4, 0.4, 0.8, '#ffffff', 1.6)
      }
      for (const [x, z] of [[-9.5, -9.5], [9.5, -9.5], [-9.5, 9.5], [9.5, 9.5]]) {
        b.box(x, z, 1.2, 0.4, 1.2, '#8a6a3a')
        for (const dx of [-0.3, 0.3]) b.box(x + dx, z, 0.25, 6, 0.25, '#9fd36a', 0.4)
      }
      for (let x = -5; x <= 5; x += 2.5) b.box(x, -8.8, 0.4, 0.6, 0.4, '#fff6c8', 0, STYLE.GLOW)
      b.wall('n', 0, 10, 2.4, 0.3, '#5fe0b0', 3.4, STYLE.GLOW)
    },
  },
  ballroom: {
    wall: '#fff3f8', floor: ['#ffffff', '#ffd6ec'], trim: GOLD, name: ['#fff6c8', '#ffd84a', '#ff9a12'],
    build(b) {
      // A grand piano in the middle of the dance floor, a crystal chandelier over it.
      b.box(0, 0, 4.4, 1.6, 3.6, '#1d1f22', 0.8)
      for (const [x, z] of [[-1.8, -1.4], [1.8, -1.4], [0, 1.4]]) b.box(x, z, 0.3, 0.8, 0.3, '#1d1f22')
      b.box(0, -1.9, 4.4, 0.3, 0.8, WHITE, 2.2)
      b.box(0.6, 0.4, 3.2, 1.8, 0.15, '#1d1f22', 2.4, STYLE.SMOOTH)
      chair(b, 0, -3.4, '#1d1f22', 's')
      b.box(0, 0, 0.15, 2.6, 0.15, GOLD, 8.6)
      b.box(0, 0, 3.6, 0.5, 3.6, '#e8f8ff', 8.2, STYLE.GLOW)
      b.box(0, 0, 2.2, 1.0, 2.2, '#e8f8ff', 7.2, STYLE.GLOW)
      for (const x of [-9, -4.5, 4.5, 9]) {
        b.wall('n', x, 1, 7, 1, '#ffd6ec')
        b.wall('n', x, 1.4, 0.6, 1.4, GOLD, 7)
      }
      for (const z of [-5, 0, 5]) {
        table(b, -8, z, 2, 2, 1.4, '#ffffff', GOLD)
        table(b, 8, z, 2, 2, 1.4, '#ffffff', GOLD)
      }
    },
  },
  office: {
    wall: '#e8edf6', floor: ['#b7c0cf', '#a7b1c2'], trim: '#3f6bff', name: ['#e0ecff', '#7faaff', '#2f5fd8'],
    build(b) {
      // A meeting table in the middle with laptops; desks round it.
      table(b, 0, 0, 4, 7, 1.5, '#ffffff', STEEL)
      for (const z of [-2, 0.5, 3]) {
        b.box(-1, z, 1.1, 0.08, 0.8, '#3a4256', 1.5)
        b.box(-1, z - 0.35, 1.1, 0.7, 0.08, '#5fd6ff', 1.58, STYLE.GLOW)
        chair(b, -2.6, z, '#1d1f22', 'e')
        chair(b, 2.6, z, '#1d1f22', 'w')
      }
      for (const x of [-7.5, 7.5]) {
        for (const z of [-6, 0, 6]) {
          table(b, x, z, 3, 2, 1.5, WOOD, STEEL)
          b.box(x, z - 0.6, 1.6, 1.0, 0.15, '#1d1f22', 1.5)
          b.box(x, z - 0.52, 1.4, 0.8, 0.12, '#7fe2ff', 1.6, STYLE.GLOW)
        }
      }
      b.wall('n', 0, 8, 3.2, 0.2, '#ffffff', 2.6, STYLE.GLOW)
      plant(b, 9.3, 9.3)
      plant(b, -9.3, 9.3)
    },
  },
  music: {
    wall: '#1f2a5c', floor: ['#3a2a1a', '#2a1f14'], trim: '#ffd21f', name: ['#fff6c8', '#ffd21f', '#ff6a1f'],
    build(b) {
      // A drum kit in the middle.
      rug(b, 0, 0, 7, 6, '#c8323c', '#1d1f22')
      b.box(0, 0.8, 2.2, 2.2, 1.4, '#ff3b3b')
      b.box(0, 0.8, 1.8, 1.8, 1.45, '#ffffff', 0.2)
      for (const [x, z, h] of [[-1.8, -0.5, 1.4], [1.8, -0.5, 1.4], [-1, -1.6, 1.8], [1, -1.6, 1.8]]) {
        b.box(x, z, 1.1, 0.7, 1.1, '#ff3b3b', h)
        b.box(x, z, 0.12, h, 0.12, STEEL)
      }
      for (const x of [-2.8, 2.8]) {
        b.box(x, 0.6, 0.1, 3, 0.1, STEEL)
        b.box(x, 0.6, 1.4, 0.06, 1.4, GOLD, 3)
      }
      // Amps, guitars on stands, a keyboard.
      for (const x of [-7, 7]) {
        b.wall('n', x, 3, 4, 2, '#1d1f22')
        b.wall('n', x, 2.4, 2.4, 2.1, '#3a3f4a', 0.8)
      }
      for (const [x, color] of [[-4.5, '#ff9a2e'], [4.5, '#5fd6ff']]) {
        b.box(x, -6, 1.1, 1.8, 0.4, color, 0.3)
        b.box(x, -6, 0.25, 2.4, 0.2, DARK_WOOD, 2.1)
      }
      b.box(6, 6, 4, 0.4, 1.2, '#1d1f22', 1.6)
      b.box(6, 6, 3.8, 0.1, 0.6, WHITE, 2.0)
      b.box(6, 6, 0.3, 1.6, 0.3, STEEL)
      b.wall('s', 0, 18, 0.2, 0.2, '#ffd21f', 0.2, STYLE.GLOW)
    },
  },
  kids: {
    wall: '#fff6a8', floor: ['#7dff6a', '#5fe0ff'], trim: '#ff5a5a', name: ['#fff6c8', '#ffb36b', '#ff5a7a'],
    build(b) {
      // A ball pit in the middle, full of coloured balls.
      b.box(0, 0, 7, 1.2, 7, '#3f6bff')
      b.box(0, 0, 6.2, 1.1, 6.2, '#ffffff')
      const colors = ['#ff3b3b', '#ffd21f', '#4ef05a', '#2fc6ff', '#b15cff', '#ff8fd0']
      for (let i = 0; i < 28; i += 1) {
        const x = (b.rand() - 0.5) * 5.6
        const z = (b.rand() - 0.5) * 5.6
        b.box(x, z, 0.7, 0.7, 0.7, colors[i % colors.length], 0.7 + b.rand() * 0.6)
      }
      // A slide, building blocks, a teddy.
      b.box(-7, -6, 3, 4.4, 3, '#ff5a5a')
      b.box(-7, -2.6, 2, 0.5, 5, '#ffd21f', 1.8)
      for (let i = 0; i < 6; i += 1) b.box(6 + (i % 3) * 1.3, 6 + Math.floor(i / 3) * 1.3, 1.1, 1.1, 1.1, colors[i], (i % 2) * 1.1)
      b.box(7, -6, 2, 2, 1.6, '#c98f52')
      b.box(7, -6, 1.6, 1.4, 1.4, '#c98f52', 2)
      b.wall('n', 0, 6, 0.8, 0.3, '#ff8fd0', 5, STYLE.GLOW)
    },
  },
  garden: {
    wall: '#dff8d0', floor: ['#5fdc4a', '#4fc63a'], trim: '#ffd21f', name: ['#f0ffd6', '#7dff6a', '#2fae4a'],
    build(b) {
      // A fountain in the middle.
      b.box(0, 0, 6.4, 1.0, 6.4, '#e8edf6')
      b.box(0, 0, 5.6, 1.02, 5.6, '#3fd6ff', 0, STYLE.WATER)
      b.box(0, 0, 1.2, 3.0, 1.2, '#e8edf6')
      b.box(0, 0, 2.6, 0.4, 2.6, '#e8edf6', 3)
      b.box(0, 0, 0.6, 1.4, 0.6, '#9fe8ff', 3.4, STYLE.WATER)
      // Trees in planters, flower beds and benches.
      for (const [x, z] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) {
        b.box(x, z, 2.4, 1.0, 2.4, '#c98f52')
        b.box(x, z, 0.5, 3, 0.5, DARK_WOOD, 1)
        b.box(x, z, 3, 2.6, 3, LEAF, 3.4)
        b.box(x, z, 2, 1.4, 2, LEAF_DARK, 6)
      }
      const flowers = ['#ff5a7a', '#ffd21f', '#ffffff', '#b15cff']
      for (let i = 0; i < 10; i += 1) b.box(-4 + i * 0.9, -8.8, 0.6, 0.8, 0.6, flowers[i % 4], 0.2)
      for (const z of [-3.5, 3.5]) b.box(7.8, z, 1.4, 0.8, 3.4, WOOD)
    },
  },
  laundry: {
    wall: '#e0f0ff', floor: ['#ffffff', '#c8d8f0'], trim: '#5fd6ff', name: ['#e8f8ff', '#9fd8ff', '#3f8af0'],
    build(b) {
      // A mountain of laundry in the middle.
      const cloth = ['#ff8fd0', '#5fd6ff', '#ffd21f', '#ffffff', '#7dff6a', '#b15cff']
      b.box(0, 0, 3.4, 1.6, 3.4, '#c98f52')
      for (let i = 0; i < 12; i += 1) {
        const x = (b.rand() - 0.5) * 3.6
        const z = (b.rand() - 0.5) * 3.6
        b.box(x, z, 1.4 + b.rand(), 0.5, 1.2 + b.rand(), cloth[i % cloth.length], 1.4 + (i % 4) * 0.45)
      }
      // Washing machines down both side walls.
      for (const side of ['w', 'e']) {
        for (const at of [-7, -3.5, 0, 3.5, 7]) {
          b.wall(side, at, 3, 3, 2.6, WHITE)
          b.wall(side, at, 1.8, 1.8, 2.7, '#5fd6ff', 0.6, STYLE.GLOW)
        }
      }
      for (let x = -6; x <= 6; x += 3) {
        b.box(x, -8.5, 0.1, 0.1, 0.1, WHITE, 6)
        b.box(x, -8.5, 2, 1.8, 0.1, cloth[(x + 6) % cloth.length], 4.2)
      }
      b.box(0, -8.5, 16, 0.08, 0.08, WHITE, 6)
    },
  },
  aquarium: {
    wall: '#0f3a6a', floor: ['#1a5a8a', '#14487a'], trim: '#3fd6ff', name: ['#bff6ff', '#3fd8ff', '#1f6fd0'],
    build(b) {
      // A round tank in the middle, with fish.
      b.box(0, 0, 5, 0.8, 5, '#1d1f22')
      b.box(0, 0, 4.6, 4.2, 4.6, '#3fd8ff', 0.8, STYLE.WATER)
      for (const [x, z, y, c] of [[-1, 0.8, 2, '#ff9a2e'], [1, -0.6, 3, '#ffd21f'], [0.2, 1.4, 4, '#ff5a7a']]) b.box(x, z, 0.9, 0.5, 0.4, c, 0.8 + y)
      // Huge tanks along the walls.
      for (const side of ['n', 'w', 'e']) {
        b.wall(side, 0, 18, 6, 1.6, '#3fb8ff', 0.6, STYLE.WATER)
        b.wall(side, 0, 18, 0.6, 1.8, '#1d1f22')
        b.wall(side, -5, 1.6, 0.8, 1.7, '#ff9a2e', 3)
        b.wall(side, 4, 1.2, 0.6, 1.7, '#ffffff', 4.2)
      }
      for (const x of [-4, 4]) b.box(x, 6, 1.4, 0.8, 4, '#1d1f22')
    },
  },
  art: {
    wall: '#ffffff', floor: ['#e8edf6', '#d8dee8'], trim: '#ff5a7a', name: ['#ffe8f0', '#ff9ab8', '#ff3b6b'],
    build(b) {
      // A sculpture on a pedestal in the middle.
      b.box(0, 0, 2.4, 1.6, 2.4, WHITE)
      b.box(0, 0, 1.4, 1.4, 1.4, '#ff5a7a', 1.6)
      b.box(0.4, 0.2, 1.0, 1.0, 1.0, '#ffd21f', 3.0)
      b.box(-0.3, -0.2, 0.7, 0.7, 0.7, '#2fc6ff', 4.0)
      // Paintings round the walls, benches, a velvet rope.
      const art = ['#ff9a6a', '#7fe2ff', '#c39bff', '#9be86a', '#ffd84a']
      for (let i = 0; i < 3; i += 1) painting(b, 'n', -6 + i * 6, 3.6, 2.6, art[i])
      for (let i = 0; i < 2; i += 1) {
        painting(b, 'w', -3 + i * 6, 3, 2.4, art[i + 3])
        painting(b, 'e', -3 + i * 6, 3, 2.4, art[(i + 2) % 5])
      }
      for (const z of [5, 8]) b.box(0, z, 5, 0.9, 1.4, '#3a3f4a')
      for (const x of [-3, 3]) b.box(x, -3, 0.2, 1.6, 0.2, GOLD)
      b.box(0, -3, 6, 0.12, 0.12, '#c8323c', 1.3)
    },
  },
  vault: {
    wall: '#5a5f69', floor: ['#3a3f4a', '#2f343f'], trim: GOLD, name: ['#fff6c8', '#ffd21f', '#ff9a12'],
    build(b) {
      // Stacked gold bars in the middle.
      for (let layer = 0; layer < 4; layer += 1) {
        for (let i = 0; i < 4 - layer; i += 1) {
          for (const z of [-0.8, 0.8]) b.box(-((3 - layer) * 0.65) + i * 1.3, z, 1.2, 0.55, 1.4, GOLD, layer * 0.55, STYLE.GLOW)
        }
      }
      // Safe-deposit boxes on every wall, a round vault door to the north, piles of coins.
      for (const side of ['w', 'e']) {
        for (let row = 0; row < 4; row += 1) for (let at = -8; at <= 8; at += 2) b.wall(side, at, 1.8, 1.0, 0.8, STEEL, 0.4 + row * 1.1)
      }
      b.wall('n', 0, 6, 6, 0.6, '#9aa6bd', 1)
      b.wall('n', 0, 4.4, 4.4, 0.8, '#c9d2de', 1.8)
      b.wall('n', 0, 1.2, 1.2, 1.0, GOLD, 3.4, STYLE.GLOW)
      for (const [x, z] of [[-6, 6], [6, 6], [-5, -5], [5, -4]]) {
        b.box(x, z, 2.2, 0.6, 2.2, GOLD, 0, STYLE.GLOW)
        b.box(x, z, 1.4, 0.5, 1.4, GOLD, 0.6, STYLE.GLOW)
      }
    },
  },
}
// Each theme knows its own name (paletteFor picks the floor by it).
for (const [id, theme] of Object.entries(ROOM_THEMES)) theme.id = id

// --- Palettes by world and wing -----------------------------------------------------------

const _a = new Color()
const _b = new Color()
const mix = (a, b, t) => `#${_a.set(a).lerp(_b.set(b), t).getHexString()}`

/**
 * How a theme's walls and floors are tinted on a floor: the hotel's classic floors as
 * they are, its deluxe floors washed with cream and trimmed in gold, its secret basement
 * dark with neon trim. At Palm Beach the Beach Resort tints everything sandy and turquoise.
 */
/** Themes with tiled floors; every other room has parquet. */
const TILED = new Set(['pool', 'bathroom', 'kitchen', 'spa', 'laundry', 'aquarium', 'vault'])

function paletteFor(theme, world, floor) {
  const wing = Math.min(2, Math.floor(floor / 20))
  let wall = theme.wall
  let floorA = theme.floor[0]
  let floorB = theme.floor[1]
  let trim = theme.trim
  if (world === 1) {
    wall = mix(wall, '#fbeed0', 0.45)
    floorA = mix(floorA, '#f2dca0', 0.35)
    floorB = mix(floorB, '#ead196', 0.35)
    trim = mix(trim, '#16b8c4', 0.5)
  }
  if (wing === 1) {
    wall = mix(wall, '#fff3c8', 0.3)
    trim = GOLD
  } else if (wing === 2) {
    wall = mix(wall, '#1a1530', 0.62)
    floorA = mix(floorA, '#1a1530', 0.5)
    floorB = mix(floorB, '#1a1530', 0.58)
  }
  // The panelling along the bottom of the walls: the wall colour, deeper.
  const wainscot = mix(wall, wing === 2 ? '#0c0a18' : '#6a4a2a', wing === 2 ? 0.45 : 0.32)
  const floorStyle = TILED.has(theme.id) ? STYLE.TILES : STYLE.PARQUET
  // Its chair rail, and the raised panels in it.
  const rail = mix(wainscot, '#ffffff', 0.5)
  const raised = mix(wainscot, '#ffffff', 0.12)
  return { wall, floorA, floorB, trim, trimGlow: wing !== 0, wainscot, rail, raised, floorStyle }
}

const layouts = new Map()

const clampIn = (v, lim) => Math.min(lim, Math.max(-lim, v))

/**
 * What smashed box `box` leaves behind: a few chunks of it in its own colour (every other
 * one a shade darker, the broken faces), each with where it starts (inside the box, as it
 * bursts), where it comes to rest - lying on the floor, tumbled, thrown out away from the
 * phone's path and clear of the hole it punches - and how it ends up turned. Water (a pool,
 * a bath) spills as flat puddles and a rug tears into flat pieces instead.
 */
function makeRubble(box, r, out) {
  const water = box.style === STYLE.WATER
  const flat = water || box.h <= 0.12
  // Big furniture breaks into more pieces, never into slabs: each piece a chunk you could carry.
  const n = water ? 3 : Math.min(7, Math.max(2, Math.round((box.w * box.d) / 1.2) + 1))
  const cap = water ? 3 : 1.3
  const cx = box.x
  const cz = box.z
  // Thrown out away from the phone's path (straight down the middle of the room).
  let ox = cx
  let oz = cz
  const len = Math.hypot(ox, oz)
  if (len < 0.3) {
    const a = r() * Math.PI * 2
    ox = Math.cos(a)
    oz = Math.sin(a)
  } else {
    ox /= len
    oz /= len
  }
  const dark = mix(box.color, '#000000', 0.22)
  for (let i = 0; i < n; i += 1) {
    const w = Math.min(cap, Math.max(0.14, box.w * (0.3 + r() * 0.35)))
    const d = Math.min(cap, Math.max(0.14, box.d * (0.3 + r() * 0.35)))
    const h = flat ? 0.05 : Math.min(0.55, Math.max(0.1, Math.min(box.h, 1.1) * (0.3 + r() * 0.3)))
    const a = r() * Math.PI * 2
    const spread = 0.5 + r() * 1.5
    let x = cx + ox * spread + Math.cos(a) * (box.w * 0.3 + 0.25)
    let z = cz + oz * spread + Math.sin(a) * (box.d * 0.3 + 0.25)
    // Well clear of the hole: the floor there is gone once the phone goes on through, and
    // the camera comes down through it after the phone.
    const lim = HOLE_HALF + 2.0 + Math.max(w, d) / 2
    if (Math.abs(x) < lim && Math.abs(z) < lim) {
      if (Math.abs(x) > Math.abs(z)) x = Math.sign(x || 1) * lim
      else z = Math.sign(z || 1) * lim
    }
    x = clampIn(x, IN - 0.3 - w / 2)
    z = clampIn(z, IN - 0.3 - d / 2)
    out.push({
      x,
      y: h / 2 + 0.02 + (i % 3) * 0.004,
      z,
      w,
      h,
      d,
      color: water || i % 2 === 0 ? box.color : dark,
      style: water ? STYLE.WATER : box.style === STYLE.GLOW ? STYLE.GLOW : STYLE.SMOOTH,
      rotX: flat ? 0 : (r() - 0.5) * 0.8,
      rotY: r() * Math.PI * 2,
      rotZ: flat ? 0 : (r() - 0.5) * 0.8,
      // Water spills where it lands (a puddle spreading out, never flying); a torn rug
      // slides out low; everything else is thrown.
      fromX: water ? x : cx + (r() - 0.5) * box.w * 0.5,
      fromY: water ? h / 2 + 0.02 : box.y + box.h * (0.3 + r() * 0.5),
      fromZ: water ? z : cz + (r() - 0.5) * box.d * 0.5,
      arc: water ? 0 : flat ? 0.15 : 1,
      spill: water,
    })
  }
}

/**
 * Floor `floor`'s room in `world`: its palette and boxes (room coordinates; see the top of
 * this file), every box under the phone's path flagged `smash`, and `rubble`: what those
 * break into (makeRubble). Built once and kept.
 */
export function roomLayout(world, floor) {
  const key = world * 1000 + floor
  let layout = layouts.get(key)
  if (layout) return layout
  const zone = (WORLD_ZONES[world] ?? WORLD_ZONES[0])[floor]
  const theme = ROOM_THEMES[zone?.theme] ?? ROOM_THEMES.lounge
  const b = new RoomBuilder(mulberry32(key * 7919 + 13))
  theme.build(b)
  const aboveGround = floor < FLOORS_ABOVE_GROUND
  // A door first (where the furniture leaves room), then the windows, which don't move.
  door(b, aboveGround ? ['n', 's'] : ['n', 'w', 'e', 's'], theme.door ?? DARK_WOOD, WHITE)
  if (aboveGround) windows(b, ['w', 'e'], theme.trim)
  const reach = HOLE_HALF - 0.2
  const r = mulberry32(key * 131 + 7)
  const rubble = []
  for (const box of b.boxes) {
    box.smash = Math.abs(box.x) - box.w / 2 < reach && Math.abs(box.z) - box.d / 2 < reach && box.y < 8
    if (box.smash) makeRubble(box, r, rubble)
  }
  layout = { palette: paletteFor(theme, world, floor), boxes: b.boxes, rubble, theme }
  layouts.set(key, layout)
  return layout
}

/** The colours floor `index`'s name shows in on the HUD, as a CSS gradient. */
export function floorNameGradient(world, index) {
  const zone = (WORLD_ZONES[world] ?? WORLD_ZONES[0])[index]
  const [a, b, c] = (ROOM_THEMES[zone?.theme] ?? ROOM_THEMES.lounge).name
  return `linear-gradient(180deg, ${a} 0%, ${b} 45%, ${c} 100%)`
}
