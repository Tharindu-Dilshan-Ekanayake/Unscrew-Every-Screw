import { Vector3 } from 'three'

import { DROP_AIR, DROP_ROOF, DROP_SETTLE, ROLL_LAUNCH, ZONES } from '@shared/balance'
import { zoneIndexAt } from '@shared/logic'
import { DROP_SPOT } from '@shared/world'

/**
 * Geometry and timeline of a drop. Pure maths and allocation-free, so the frame loop can
 * call it freely - for your own drop, and for anything replaying one from the same numbers.
 *
 * The lobby is a mountain top at y = 0. North of its cliff edge, far below, stands the
 * hotel: its glass roof at ROOF_Y, then FLOORS rooms stacked FLOOR_H apart, the first
 * FLOORS_ABOVE_GROUND above the city's streets (GROUND_Y) and the rest underground.
 * The phone leaves your hand at the edge, arcs out and plunges onto the middle of the
 * roof, then smashes straight down through floor after floor until it stops on the floor
 * the authority said.
 */

/** Where the hotel stands (its middle), and its glass roof. */
export const HOTEL = { x: 0, z: -98 }
export const ROOF_Y = -66
/** Storey height, and the floor slabs' thickness. */
export const FLOOR_H = 12
export const SLAB = 0.8
/** Half the inside width of a room (they're square), and of the outside walls. */
export const ROOM_HALF = 11
export const SHELL_HALF = 12.6
/** Half the width of the hole a phone punches through a slab. */
export const HOLE_HALF = 2.8
/** The glass skylight in the roof: half its width. */
export const SKYLIGHT_HALF = 5
export const FLOORS = ZONES.length
export const FLOORS_ABOVE_GROUND = 10
export const GROUND_Y = ROOF_Y - FLOORS_ABOVE_GROUND * FLOOR_H

/** Top of floor `i`'s floor (what stands in the room stands on this). */
export const floorY = (i) => ROOF_Y - (i + 1) * FLOOR_H
/** Underside of floor `i`'s ceiling: the slab of the floor above, or the glass roof. */
export const ceilingY = (i) => (i <= 0 ? ROOF_Y : floorY(i - 1) - SLAB)

/** How big the phone is in the drop (it's a toy world: about the size of an armchair). */
export const PHONE_SCALE = 2.6
/** Lying flat, the phone's middle is this far up (half its thickness, and the camera bump). */
export const PHONE_LIE = 0.1 * PHONE_SCALE

/** Seconds into a drop it leaves your hand, and hits the glass roof. */
export const T_RELEASE = ROLL_LAUNCH
export const T_ROOF = ROLL_LAUNCH + DROP_AIR

/** Where the phone leaves your hand: at the edge, up and a little ahead of you. */
export const RELEASE_POINT = new Vector3(DROP_SPOT.x + 0.35, 2.1, DROP_SPOT.z - 0.9)
/** It's tossed up this fast as it leaves your hand (m/s). */
const TOSS_UP = 7
/**
 * End over end on the way down, at a steady rate (nothing torques it in the air): whole
 * turns, so it comes down flat with its screen up.
 */
const TUMBLE_TURNS = 3
/** Air drag on its forward speed: how much it has slowed by the roof (0 none). */
const AIR_DRAG = 1.1
/** Its yaw as it hits the roof (the air's sway ends here); the hotel picks up from it. */
const ROOF_YAW = Math.sin(5) * 0.5

/*
 * Inside the hotel the phone really falls: from the glass it accelerates under gravity
 * down each room, smashes straight through the next slab the moment it reaches it -
 * losing half its speed - and accelerates again: a speed sawtooth, not a smooth glide.
 * Shallow drops fall at GRAVITY_MIN; deeper ones faster, so the whole fall fits the time
 * the authority gave (rollDuration). Between slabs it flutters like any flat thing
 * falling: rocking up to one side and back, so it meets the next slab flat, its spin
 * kicked by every hit. It lands, hops, rattles still, and the drop is over (`settleAt`).
 */
/** The weakest gravity in the hotel (m/s^2): a toy world, a little stronger than real. */
const GRAVITY_MIN = 22
/** How much of its speed the phone keeps through a slab. */
const SLAB_KEEP = 0.5
/** Its speed just through the glass roof, in units where gravity is 1 (as v = sqrt(2h)). */
const ROOF_SPEED = Math.sqrt(2 * 3)
/** Bouncing once it stops: gravity, the first hop's height range, and how much each hop keeps. */
const BOUNCE_G = 50
const BOUNCE_MIN = 0.22
const BOUNCE_MAX = 0.9
const BOUNCE_KEEP = 0.42 * 0.42
const BOUNCES = 4
/** The rattle on its edge after the hops, before it lies still (s). */
const RATTLE = 0.45
/** Lying still this long after the rattle before the result shows (s). */
const STILL = 0.25

const clamp01 = (x) => Math.min(1, Math.max(0, x))
/** A repeatable random number in [0, 1) for drop `seed`, slot `n`. */
const rand = (seed, n) => {
  const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453
  return x - Math.floor(x)
}
/** How fast (rad/s) and which way it spins down room `j`: every hit sends it a new way. */
const spinOf = (seed, j) => (rand(seed, j) < 0.5 ? -1 : 1) * (1.2 + 3.2 * rand(seed, j + 100))
/** Length (m) of fall `j` of a drop stopping on floor `end`: the roof or a slab to the next slab, or (the last) to lying on the floor. */
const fallLength = (j, end) => (j === end ? FLOOR_H - PHONE_LIE : FLOOR_H)

/** The floor a drop to `distance` stops on. */
export const landingFloor = (distance) => zoneIndexAt(distance)

/**
 * The height at which the depth counter reads each knot: the roof reads DROP_ROOF, the
 * floor of room i reads the top of room i+1, and where the phone stops reads `distance`.
 * Between knots it's linear, so it ticks steadily down through each room.
 */
export function meterAtY(y, distance, end = landingFloor(distance)) {
  if (y >= ROOF_Y) return 0
  // Which room the phone is in (its height between this room's floor and the one above).
  for (let i = 0; i <= end; i += 1) {
    const top = i === 0 ? ROOF_Y : floorY(i - 1)
    const bottom = i === end ? floorY(end) + PHONE_LIE : floorY(i)
    if (y >= bottom || i === end) {
      const from = ZONES[i].start
      const to = i === end ? distance : ZONES[i + 1].start
      const f = clamp01((top - y) / Math.max(0.01, top - bottom))
      return from + (to - from) * f
    }
  }
  return distance
}

/** The inverse: the height at which the counter reads `meter` (for trophies along the way). */
export function yAtMeter(meter, distance, end = landingFloor(distance)) {
  if (meter <= ZONES[0].start) return ROOF_Y
  for (let i = 0; i <= end; i += 1) {
    const from = ZONES[i].start
    const to = i === end ? distance : ZONES[i + 1].start
    if (meter <= to || i === end) {
      const top = i === 0 ? ROOF_Y : floorY(i - 1)
      const bottom = i === end ? floorY(end) + PHONE_LIE : floorY(i)
      const f = clamp01((meter - from) / Math.max(0.01, to - from))
      return top + (bottom - top) * f
    }
  }
  return floorY(end)
}

/** A fresh state for dropState to write into. */
export const createDropState = () => ({
  /** 'throw' (still in your hand) | 'air' | 'tower' | 'settle' | 'stopped' */
  phase: 'throw',
  /** 0-1 through the throw's swing. */
  throwT: 0,
  /** The phone's middle. */
  position: new Vector3(),
  /** End-over-end tumble (about its width), spin about the vertical, and a resting tilt. */
  tumble: 0,
  yaw: 0,
  tilt: 0,
  /** What the depth counter reads. */
  meter: 0,
  /** Falling speed (m/s, downwards positive). */
  speed: 0,
  /** The room the phone is in: -1 above the roof. */
  floor: -1,
  /** The floor it will stop on. */
  end: 0,
  /** Slabs smashed so far (the glass roof not counted), and whether the roof is broken. */
  slabs: 0,
  roofBroken: false,
  /** True once it has stopped on its floor (bouncing, then still). */
  landed: false,
  /** Hops completed after stopping (each a softer thud). */
  bounces: 0,
  /** Seconds into the drop when it has stopped bouncing and lies still: the drop is over. */
  settleAt: 0,
  /** Still in your hand. */
  inHand: true,
  /** Never true in a drop: kept for the template's effects that ask. */
  crashed: false,
  airborne: false,
  size: PHONE_SCALE,
})

/**
 * Everything about a drop `elapsed` seconds in. `drop` is `{ distance, duration }`
 * (duration from the authority: rollDuration). Writes into `out` (createDropState).
 */
export function dropState(elapsed, drop, out) {
  const end = landingFloor(drop.distance)
  const landY = floorY(end) + PHONE_LIE
  const towerTime = Math.max(0.3, drop.duration - T_ROOF - DROP_SETTLE)
  out.end = end
  out.crashed = false
  out.tilt = 0
  out.bounces = 0
  out.settleAt = drop.duration
  if (elapsed < T_RELEASE) {
    // Wound up and swung: the avatar holds it (Player draws it in the hand).
    out.phase = 'throw'
    out.throwT = clamp01(elapsed / T_RELEASE)
    out.inHand = true
    out.position.copy(RELEASE_POINT)
    out.tumble = 0
    out.yaw = 0
    out.meter = 0
    out.speed = 0
    out.floor = -1
    out.slabs = 0
    out.roofBroken = false
    out.landed = false
    out.airborne = false
    return out
  }
  out.throwT = 1
  out.inHand = false
  if (elapsed < T_ROOF) {
    // Through the sky: a real throw's arc - tossed up and out over the edge, gravity
    // pulling it down onto the roof's middle, its forward speed bled off a little by the
    // air, tumbling end over end at a steady rate.
    const t = elapsed - T_RELEASE
    const u = t / DROP_AIR
    const y0 = RELEASE_POINT.y
    const g = (2 * (y0 + TOSS_UP * DROP_AIR - ROOF_Y)) / (DROP_AIR * DROP_AIR)
    const y = y0 + TOSS_UP * t - 0.5 * g * t * t
    const h = (1 - Math.exp(-AIR_DRAG * u)) / (1 - Math.exp(-AIR_DRAG))
    out.position.set(RELEASE_POINT.x + (HOTEL.x - RELEASE_POINT.x) * h, y, RELEASE_POINT.z + (HOTEL.z - RELEASE_POINT.z) * h)
    out.phase = 'air'
    out.speed = Math.max(0, g * t - TOSS_UP)
    out.tumble = Math.PI * 2 * TUMBLE_TURNS * u
    out.yaw = Math.sin(u * 5) * 0.5
    // A wobble about its length too, gone by the time it meets the glass.
    out.tilt = 0.35 * Math.sin(u * Math.PI * 3) * (1 - u)
    out.meter = DROP_ROOF * clamp01((y0 - y) / (y0 - ROOF_Y))
    out.floor = -1
    out.slabs = 0
    out.roofBroken = false
    out.landed = false
    out.airborne = true
    return out
  }
  out.airborne = false
  out.tumble = 0

  // The fall through the hotel at gravity 1 first: how long it takes (unit) ...
  let unit = 0
  let v = ROOF_SPEED
  let vLand = v
  for (let j = 0; j <= end; j += 1) {
    const vOut = Math.sqrt(v * v + 2 * fallLength(j, end))
    unit += vOut - v
    vLand = vOut
    v = vOut * SLAB_KEEP
  }
  // ... then the gravity that fits it into the time given (times go as 1/sqrt(g)), never
  // weaker than GRAVITY_MIN. A shallow drop simply lands sooner.
  const g = Math.max(GRAVITY_MIN, (unit / towerTime) ** 2)
  const rootG = Math.sqrt(g)
  const tLand = T_ROOF + unit / rootG
  out.roofBroken = true
  const seed = drop.distance

  // The hops once it lands (how high the first goes depends on how fast it hit), fitted
  // into most of the time left: when they and the rattle are done, the drop is over.
  const first = Math.min(BOUNCE_MAX, Math.max(BOUNCE_MIN, vLand * rootG * 0.011))
  let hopsTime = 0
  for (let k = 0, hk = first; k < BOUNCES; k += 1, hk *= BOUNCE_KEEP) hopsTime += 2 * Math.sqrt((2 * hk) / BOUNCE_G)
  const pace = Math.max(1, hopsTime / Math.max(0.2, (drop.duration - tLand) * 0.8))
  out.settleAt = Math.min(drop.duration, tLand + hopsTime / pace + RATTLE + STILL)

  if (elapsed < tLand) {
    out.phase = 'tower'
    out.landed = false
    let tau = elapsed - T_ROOF
    let yaw = ROOF_YAW
    let depth = 0
    v = ROOF_SPEED * rootG
    for (let j = 0; j <= end; j += 1) {
      const vOut = Math.sqrt(v * v + 2 * g * fallLength(j, end))
      const span = (vOut - v) / g
      const spin = spinOf(seed, j)
      if (tau < span || j === end) {
        // Falling free down room j: faster and faster, until it smashes through the next slab.
        const t = Math.min(tau, span)
        depth = j * FLOOR_H + v * t + 0.5 * g * t * t
        out.speed = v + g * t
        out.yaw = yaw + spin * t
        // Fluttering: rocked up to one side and back, flat again as it meets the slab.
        const calm = Math.min(1, span / 0.3)
        const u = t / span
        out.tumble = (rand(seed, j + 200) < 0.5 ? -1 : 1) * (0.25 + 0.6 * rand(seed, j + 300)) * calm * Math.sin(Math.PI * u)
        out.tilt = (0.12 + 0.25 * rand(seed, j + 400)) * calm * Math.sin(Math.PI * 2 * u)
        break
      }
      tau -= span
      yaw += spin * span
      v = vOut * SLAB_KEEP
    }
    out.position.set(HOTEL.x, ROOF_Y - depth, HOTEL.z)
  } else {
    // Stopped on its floor: hops that die away, a flip on the first, a rattle on its
    // edge, then lying still.
    out.phase = elapsed >= out.settleAt ? 'stopped' : 'settle'
    out.speed = 0
    out.landed = true
    // Facing as it was when it hit: the fall's spins, room by room.
    let yaw = ROOF_YAW
    v = ROOF_SPEED * rootG
    for (let j = 0; j <= end; j += 1) {
      const vOut = Math.sqrt(v * v + 2 * g * fallLength(j, end))
      yaw += spinOf(seed, j) * ((vOut - v) / g)
      v = vOut * SLAB_KEEP
    }
    let q = (elapsed - tLand) * pace
    let hop = 0
    let flip = 0
    let bounces = BOUNCES
    for (let k = 0, hk = first; k < BOUNCES; k += 1, hk *= BOUNCE_KEEP) {
      const span = 2 * Math.sqrt((2 * hk) / BOUNCE_G)
      if (q < span) {
        const w = q / span
        hop = 4 * hk * w * (1 - w)
        if (k < 2) flip = (k === 0 ? 0.55 : 0.18) * (rand(seed, 500) < 0.5 ? -1 : 1) * Math.sin(Math.PI * w)
        bounces = k
        break
      }
      q -= span
    }
    out.bounces = bounces
    const rattle = bounces >= BOUNCES ? q / pace : 0
    out.position.set(HOTEL.x, landY + hop, HOTEL.z)
    out.tumble = flip
    out.tilt = 0.06 + (bounces >= BOUNCES ? 0.09 * Math.exp(-rattle / (RATTLE * 0.35)) * Math.sin(rattle * 40) : 0)
    // Still turning a little as it skids to a stop.
    out.yaw = yaw + spinOf(seed, end) * 0.25 * (1 - Math.exp(-(elapsed - tLand) / 0.3))
  }
  const y = out.position.y
  // The room it's in: below a floor's slab top means the room under it.
  let floor = 0
  while (floor < end && y < floorY(floor)) floor += 1
  out.floor = floor
  out.slabs = floor
  out.meter = out.landed ? drop.distance : meterAtY(y, drop.distance, end)
  return out
}
