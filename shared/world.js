/**
 * Lobby layout: every gameplay-relevant position and trigger area.
 *
 * Shared by the client (which renders it) and the server (which validates positions
 * against it), so the two can never disagree about where the play pads are.
 *
 * Units are metres (the avatar is 1.8 tall). +X is east, -Z is north. Rects are
 * `{ minX, maxX, minZ, maxZ }` on the ground plane.
 *
 * The lobby is the yard of a toy screw factory: you spawn at the south end and a straight,
 * clear path runs north to the SOLO pad and, past it, the team sections (2 or 4 players)
 * in front of the factory; the Perks workbench stands to the west, the Skins paint shop
 * to the east.
 */

export const SPAWN = { x: 0, z: 17 }

/** The walkable yard. */
export const PLAZA = { minX: -30, maxX: 30, minZ: -27, maxZ: 28 }

/** The factory front (north), with a goods elevator in the middle. */
export const FACTORY = { minX: -16, maxX: 16, minZ: -40, maxZ: -26, height: 13 }
/** The (shut) goods elevator in the factory front, and the apron in front of it. */
export const ELEVATOR = { minX: -3.4, maxX: 3.4, minZ: -26, maxZ: -20.5 }

/**
 * The play pads. SOLO, the big one at the end of the main path: step on, pick a chapter,
 * go. Behind it on the PLAY PLAZA, a TEAM section for each chapter (the Workshop west,
 * the Boiler Room in the middle, the Lab east), each with a pad seating 2 players and one
 * seating 4: whoever stands on one takes a seat, and once every seat is taken that
 * chapter's run starts by itself (shared/pads.js). Flat discs: nothing to walk round.
 */
export const SOLO_PAD = { id: 'solo', size: 1, x: 0, z: -8.6, radius: 3.4 }
/** The team sections, one per chapter: `x`, each section's middle. */
export const PAD_SECTIONS = [
  { chapter: 'workshop', x: -15 },
  { chapter: 'boiler', x: 0 },
  { chapter: 'lab', x: 15 },
]
/** The row the team pads stand in. */
const PAD_ROW_Z = -18.6
/** A section's pads, left to right: where each stands from the section's middle, and its size. */
const SECTION_PADS = [
  { size: 2, dx: -2.9, radius: 1.7 },
  { size: 4, dx: 3.2, radius: 2.2 },
]
export const TEAM_PADS = PAD_SECTIONS.flatMap((section) =>
  SECTION_PADS.map((p) => ({ id: `${section.chapter}-${p.size}`, chapter: section.chapter, size: p.size, x: section.x + p.dx, z: PAD_ROW_Z, radius: p.radius })),
)
export const PLAY_PADS = [SOLO_PAD, ...TEAM_PADS]
/** The paved plaza the team sections stand on. */
export const PLAY_PLAZA = { minX: -23, maxX: 23, minZ: -23.6, maxZ: -14.2 }

/** How far behind a team pad its board stands. */
export const padSignZ = (p) => p.z - p.radius - 0.55
/** The two posts holding up a team pad's board: `[x, z]` each. */
export const padPosts = (p) => {
  const dx = p.radius + 0.1
  const z = padSignZ(p)
  return [
    [p.x - dx, z],
    [p.x + dx, z],
  ]
}

/** Where each team section's banner (the chapter's name) stands, over its pads' boards. */
export const SECTION_SIGN_Z = -22.6
/** A team section's width (its pads' plinths, with a little to spare): `{ minX, maxX }`. */
export function sectionSpan(chapter) {
  const pads = TEAM_PADS.filter((p) => p.chapter === chapter)
  return { minX: Math.min(...pads.map((p) => p.x - p.radius - 0.7)), maxX: Math.max(...pads.map((p) => p.x + p.radius + 0.7)) }
}

/** Stations you walk up to: their panel opens while you stand in the circle. */
export const STATIONS = [
  { id: 'perks', x: -19, z: -6, radius: 3.6, yaw: Math.PI / 2 },
  { id: 'skins', x: 19, z: -6, radius: 3.6, yaw: -Math.PI / 2 },
  { id: 'quests', x: -12, z: 21, radius: 2.8, yaw: Math.PI * 0.85 },
]

/** The paved crossroads in the middle of the yard, where the paths to the stations meet the main path. Flat: nothing to walk round. */
export const CROSSROADS = { x: 0, z: -2 }

/** Leaderboards along the yard's sides, facing in. */
export const LEADERBOARDS = [
  { id: 'screws', x: -27.5, z: 10, yaw: Math.PI / 2 },
  { id: 'rooms', x: 27.5, z: 10, yaw: -Math.PI / 2 },
]

/** Conveyor belts either side of the elevator, crates riding them into the factory. */
export const BELTS = [
  { minX: -15.6, maxX: -4.2, z: -24.6 },
  { minX: 4.2, maxX: 15.6, z: -24.6 },
]

/** Benches along the path from the spawn: `yaw` turns the seat (built facing +X) to face the path. */
export const BENCHES = [
  { x: -4.7, z: 8, yaw: 0 },
  { x: -4.7, z: 13.5, yaw: 0 },
  { x: 4.7, z: 8, yaw: Math.PI },
  { x: 4.7, z: 13.5, yaw: Math.PI },
]

/** Raised grass beds with a tree in each: `[x, z, size]`. */
export const PLANTERS = [
  [-16, 9, 3.2],
  [16, 9, 3.2],
]

/** Picnic tables under parasols: `[x, z]` (each about 2.6 m across with its stools). */
export const PICNICS = [
  [-21, 15.5],
  [21, 15.5],
  [13, 21],
]

/** Stacks of crates in the yard's corners: `[x, z, size]`. */
export const CRATES = [
  [-27.6, -24.4, 1.4],
  [-26, -25.4, 1],
  [-28.4, -22.8, 0.9],
  [27.6, -24.6, 1.3],
  [26, -25.6, 1],
  [26.2, 21, 1.2],
  [-26.2, 21, 1.1],
]

/** Solid things: you walk round them. */
export const STATIC_COLLIDERS = [
  // The factory (its elevator doors are shut).
  { minX: FACTORY.minX, maxX: FACTORY.maxX, minZ: FACTORY.minZ, maxZ: FACTORY.maxZ },
  // The posts holding up the team pads' boards, and the sections' banners.
  ...TEAM_PADS.flatMap((p) => padPosts(p).map(([x, z]) => ({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25 }))),
  ...PAD_SECTIONS.flatMap(({ chapter }) => {
    const { minX, maxX } = sectionSpan(chapter)
    return [minX, maxX].map((x) => ({ minX: x - 0.3, maxX: x + 0.3, minZ: SECTION_SIGN_Z - 0.3, maxZ: SECTION_SIGN_Z + 0.3 }))
  }),
  // The conveyor belts and their machines.
  ...BELTS.map((b) => ({ minX: b.minX, maxX: b.maxX, minZ: b.z - 0.8, maxZ: b.z + 0.8 })),
  // Benches and crates.
  ...BENCHES.map((b) => ({ minX: b.x - 0.4, maxX: b.x + 0.4, minZ: b.z - 1, maxZ: b.z + 1 })),
  ...CRATES.map(([x, z, s]) => ({ minX: x - s / 2, maxX: x + s / 2, minZ: z - s / 2, maxZ: z + s / 2 })),
  // Planters and picnic tables.
  ...PLANTERS.map(([x, z, s]) => ({ minX: x - s / 2, maxX: x + s / 2, minZ: z - s / 2, maxZ: z + s / 2 })),
  ...PICNICS.map(([x, z]) => ({ minX: x - 1.3, maxX: x + 1.3, minZ: z - 1.3, maxZ: z + 1.3 })),
  // The stations' counters, on their far side.
  { minX: -24.5, maxX: -22, minZ: -10, maxZ: -2 },
  { minX: 22, maxX: 24.5, minZ: -10, maxZ: -2 },
  // Leaderboards and their posts.
  { minX: -28.6, maxX: -27, minZ: 5.6, maxZ: 14.4 },
  { minX: 27, maxX: 28.6, minZ: 5.6, maxZ: 14.4 },
]

export const inRect = (r, x, z, margin = 0) =>
  x >= r.minX - margin && x <= r.maxX + margin && z >= r.minZ - margin && z <= r.maxZ + margin

/** The play pad (its id) you stand on, or null. */
export function playPadAt(x, z, margin = 0) {
  for (const p of PLAY_PADS) if (Math.hypot(x - p.x, z - p.z) <= p.radius + margin) return p.id
  return null
}

/** A play pad by id, or null. */
export const padById = (id) => PLAY_PADS.find((p) => p.id === id) || null

/** The station (its id) whose circle you stand in, or null. */
export function stationAt(x, z, margin = 0) {
  for (const s of STATIONS) if (Math.hypot(x - s.x, z - s.z) <= s.radius + margin) return s.id
  return null
}

/** The lobby is flat. */
export const groundHeightAt = () => 0

/** Keeps a point on walkable ground. Writes into `out`. */
export function clampToWalkable(x, z, out = { x: 0, z: 0 }) {
  out.x = Math.min(PLAZA.maxX, Math.max(PLAZA.minX, x))
  out.z = Math.min(PLAZA.maxZ, Math.max(PLAZA.minZ, z))
  return out
}

/** Fastest anyone can legitimately move (m/s), with jumping; the server checks against it. */
export const MAX_MOVE_SPEED = 14
