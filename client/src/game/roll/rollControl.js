import { comboBonus, HIT_GRADES, ZONES } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { DROP_SPOT, ROLL_RETURN } from '@shared/world'

import { sfx } from '../../audio/sfx'
import { getGame } from '../../store/game'
import { getQuality } from '../../store/quality'
import { fadeThrough } from '../../ui/fade'
import { burst, fireBurst } from '../fx/fxQueue'
import { spawnScattered } from '../fx/popups'
import { consumePull } from '../launch'
import { runtime } from '../runtime'
import { zones } from '../worldLook'
import { clearDebris, spawnDebris } from './debrisPool'
import { createDropState, dropState, floorY, HOTEL, landingFloor, T_RELEASE } from './dropPath'
import { setBarScale, showHit } from './hudLink'
import { roomLayout } from './roomThemes'

/** How long the result shows over the phone, stopped, before you're back at the edge. */
const RESULT_HOLD_MS = 2600

/**
 * The drop currently playing (the template's "roll"), read every frame by the camera,
 * the hotel, your avatar and the effects. Everything about it is known when it starts (the
 * authority already resolved the depth and the Wins), so the client just plays it back:
 * no per-frame network traffic.
 *
 * It's a drop state (dropPath.dropState: phase, position, meter, floor, slabs...) plus the
 * drop's numbers. Your logical position stays at the edge while it falls (that's what the
 * server checks); only the phone and the camera go down to the hotel.
 */
export const roll = {
  ...createDropState(),
  active: false,
  /** True once the phone has stopped and the result is showing. */
  stopped: false,
  startedAt: 0,
  distance: 0,
  duration: 1,
  wins: 0,
  prize: 0,
  discovered: [],
  blocked: -1,
  /** How many floors it smashes into past the first. */
  broken: 0,
  best: false,
  tireId: 'bicycle',
  /** How well you threw (HIT_GRADES id), or null for Auto Drop. */
  hit: null,
  /** PERFECTs in a row with this throw (0: not a PERFECT), and its lucky gift or null. */
  combo: 0,
  gift: null,
  /** How far into its last floor it got (0-1): how big the crack it leaves. */
  landFraction: 0.5,
  /** performance.now() of the release, the roof smash, the last floor smashed and the landing. */
  releasedAt: 0,
  roofAt: 0,
  hitAt: 0,
  landedAt: 0,
  /** Floors smashed so far this drop (for the climbing ding). */
  smashCount: 0,
  frameKey: -1,
  /**
   * Hit-stop: ms the drop's clock is behind real time. Every smash slows the phone (and
   * the camera on it) for a moment, so you see the floor burst; the clock catches up a
   * little faster than real time afterwards, and is always caught up before the phone
   * stops, so the drop ends exactly when the authority said.
   */
  lag: 0,
  lastNow: 0,
  /** A big hit-stop (the roof, the landing): when it started, how long, the lag then. */
  freezeAt: 0,
  freezeMs: 0,
  freezeLag: 0,
}

/** Each floor's slow motion: how long, how slow, and how fast the clock catches up. */
const SLOW_MS = 110
const SLOW_RATE = 0.3
const FREEZE_RATE = 0.08
const CATCH_UP = 0.45

let timers = []

function clearTimers() {
  for (const id of timers) clearTimeout(id)
  timers = []
}

/**
 * Moves the drop on to this frame. Idempotent per frame (keyed on the renderer's clock),
 * so the camera, the hotel and the effects all see exactly the same state however many of
 * them ask.
 */
export function advanceRoll(clockTime) {
  if (!roll.active || roll.frameKey === clockTime) return roll
  roll.frameKey = clockTime
  const now = performance.now()
  const wasPhase = roll.phase
  const wasRoof = roll.roofBroken
  const wasSlabs = roll.slabs
  const wasLanded = roll.landed
  const wasBounces = roll.bounces
  const dt = roll.lastNow ? Math.min(now - roll.lastNow, 100) : 0
  roll.lastNow = now
  if (now - roll.freezeAt < roll.freezeMs) {
    roll.lag = roll.freezeLag + (now - roll.freezeAt) * (1 - FREEZE_RATE)
  } else if (now - roll.hitAt < SLOW_MS) roll.lag += dt * (1 - SLOW_RATE)
  else roll.lag = Math.max(0, roll.lag - dt * CATCH_UP)
  // All caught up by half a second before the stop.
  const left = roll.duration - (now - roll.startedAt) / 1000
  roll.lag = Math.min(roll.lag, Math.max(0, left - 0.5) * 400)
  dropState((now - roll.startedAt - roll.lag) / 1000, roll, roll)

  if (wasPhase === 'throw' && roll.phase !== 'throw') release(now)
  if (!wasRoof && roll.roofBroken) smashRoof(now)
  // (On a very slow frame it could get through two at once: each gets its smash.)
  for (let i = wasSlabs; i < roll.slabs; i += 1) smashFloor(now, i)
  if (!wasLanded && roll.landed) land(now)
  for (let k = wasBounces; k < roll.bounces; k += 1) sfx.phoneBounce(k + 1)
  // Lying still: the result, straight away rather than at the authority's last second.
  if (roll.phase === 'stopped' && !roll.stopped) stopRoll()
  return roll
}

function freeze(now, ms) {
  roll.freezeAt = now
  roll.freezeMs = ms
  roll.freezeLag = roll.lag
}

/**
 * How each grade of throw looks and sounds as the phone leaves your hand: its burst
 * (FireBurst kind) and confetti. The title follows the grade too (HitFlash.jsx).
 */
const HIT_FX = {
  perfect: { fire: 'perfect', palette: 'gold', count: 50, speed: 11 },
  great: { fire: 'great', palette: 'power', count: 30, speed: 9 },
  good: { fire: 'good', palette: 'confetti', count: 14, speed: 6 },
  weak: { fire: null, palette: null, count: 0, speed: 0 },
}

/** The phone leaving your hand: the throw's grade, straight away, so you see why it goes as deep as it does. */
function release(now) {
  roll.releasedAt = now
  const grade = HIT_GRADES.find((g) => g.id === roll.hit)
  sfx.throwPhone(grade ? { perfect: 1, great: 0.8, good: 0.6, weak: 0.3 }[grade.id] : 0.7)
  if (!grade) return
  const fx = HIT_FX[grade.id]
  const p = roll.position
  if (fx.count) burst({ x: p.x, y: p.y, z: p.z, count: fx.count, palette: fx.palette, speed: fx.speed })
  if (grade.id === 'perfect' && roll.combo >= 2) {
    timers.push(setTimeout(() => spawnScattered(`PERFECT COMBO x${roll.combo}! +${Math.round((comboBonus(roll.combo) - 1) * 100)}% WINS`, { scale: 1.25 }), 450))
  }
  if (grade.id === 'weak') {
    spawnScattered(grade.label, { scale: 1.3 })
    sfx.weakHit()
    return
  }
  if (fx.fire && getQuality().particles) fireBurst(p.x, p.y, p.z, fx.fire)
  showHit(grade.id)
  sfx.gradeHit(grade.id)
}

/** Through the glass roof: a shatter, shards everywhere (Tower.jsx), a jolt and a beat of slow motion. */
function smashRoof(now) {
  roll.roofAt = now
  roll.hitAt = now
  freeze(now, 160)
  sfx.glassSmash()
  spawnScattered('SMASH!', { scale: 1.3 })
}

/** Through floor `index`'s slab into the room below: a crunch of concrete and a moment of slow motion. */
function smashFloor(now, index) {
  roll.hitAt = now
  roll.smashCount += 1
  sfx.floorSmash(roll.smashCount)
  const { palette } = roomLayout(activeWorldIndex(), index)
  spawnDebris({
    x: HOTEL.x,
    y: floorY(index),
    z: HOTEL.z,
    count: 10,
    colors: [palette.floorA, palette.floorB, '#d8dee8'],
    speed: 9,
    up: 3,
    size: 0.5,
    floor: floorY(index + 1),
    flat: true,
    spread: 2.2,
  })
  // A new floor: its name comes up on the HUD (Roll.jsx), and a cheer every fifth.
  if ((index + 1) % 5 === 0) sfx.stageUp()
}

/** Stopped on its floor: a slam, dust, a crack spreading (Tower.jsx) and the camera jolting. */
function land(now) {
  roll.landedAt = now
  roll.hitAt = now
  freeze(now, 180)
  sfx.phoneLand(Math.min(1, 0.4 + roll.end / 30))
  const p = roll.position
  const y = floorY(roll.end)
  if (getQuality().particles) fireBurst(p.x, y, p.z, 'dust')
  spawnDebris({ x: p.x, y: y + 0.4, z: p.z, count: 16, colors: ['#d8dee8', '#ffffff', '#b7bdc8'], speed: 8, up: 5, size: 0.35, floor: y, spread: 2 })
}

const activeWorldIndex = () => getGame().profile.world || 0

/**
 * Starts a drop the authority already resolved: you swing and throw from the edge, and
 * the phone falls onto the hotel and smashes down to its floor.
 */
export function beginRoll(result) {
  clearTimers()
  clearDebris()
  const game = getGame()
  consumePull()
  const end = landingFloor(result.distance)
  const from = ZONES[end].start
  const to = ZONES[end + 1]?.start ?? from * 2
  Object.assign(roll, createDropState(), {
    active: true,
    stopped: false,
    startedAt: performance.now(),
    distance: result.distance,
    duration: result.duration,
    wins: result.wins,
    prize: result.prize || 0,
    discovered: result.discovered || [],
    blocked: result.blocked ?? -1,
    broken: result.broken || 0,
    best: result.best,
    tireId: result.tireId || game.profile.equippedTire,
    hit: result.hit ?? null,
    combo: result.combo || 0,
    gift: result.gift || null,
    landFraction: Math.min(1, Math.max(0, (result.distance - from) / Math.max(1, to - from))),
    releasedAt: 0,
    roofAt: 0,
    hitAt: 0,
    landedAt: 0,
    smashCount: 0,
    frameKey: -1,
    lag: 0,
    lastNow: 0,
    freezeAt: 0,
    freezeMs: 0,
    freezeLag: 0,
  })
  dropState(0, roll, roll)
  // Step up to the edge to throw, facing out over it (north).
  const player = runtime.player
  player.position.set(DROP_SPOT.x, 0, DROP_SPOT.z)
  player.frozen = true
  player.yaw = Math.PI
  runtime.camera.mode = 'roll'
  // The HUD's switch to the drop (a React update and a restyle) in a task of its own, not
  // the frame the drop starts in.
  const started = {
    distance: result.distance,
    wins: result.wins,
    prize: result.prize || 0,
    blocked: result.blocked ?? -1,
    duration: result.duration,
    best: result.best,
    giftWins: result.gift?.wins || 0,
    // Your best before this drop (the profile with the new one may already be on its way).
    prevBest: game.profile.stats.bestDistance || 0,
    floor: end,
  }
  setBarScale(Math.max(result.distance, started.prevBest, ZONES[1].start) * 1.12)
  timers.push(setTimeout(() => game.startRoll(started), 0))

  // The wind rushing past as it falls, and a cartoon whistle down to the roof.
  timers.push(setTimeout(() => sfx.fallWhistle(2.2), (T_RELEASE + 0.1) * 1000))
  // The result shows as soon as the phone lies still (advanceRoll); this is the backstop
  // for a tab that stopped drawing frames.
  timers.push(setTimeout(stopRoll, result.duration * 1000))
}

/**
 * The phone lies still: the Wins pour in, a first-time floor and any lucky gift are
 * announced, and after a moment you're back at the edge. Once per drop.
 */
function stopRoll() {
  if (!roll.active || roll.stopped) return
  roll.stopped = true
  const game = getGame()
  sfx.wins()
  const f = roll.position
  burst({ x: f.x, y: f.y + 2, z: f.z, count: 50, palette: 'gold', speed: 9 })
  game.endRoll()
  // A floor reached for the first time ever: its name and the prize, once.
  const floors = zones()
  for (const zi of roll.discovered) {
    game.showToast(`NEW FLOOR: ${floors[zi].name}! +${formatNumber(floors[zi].discover)} Wins`)
  }
  // A lucky gift: a present bursting open over the phone, and what was in it.
  const gift = roll.gift
  if (gift) {
    timers.push(
      setTimeout(
        () => {
          sfx.reveal()
          burst({ x: f.x, y: f.y + 2.4, z: f.z, count: 70, palette: 'confetti', speed: 11 })
          const what = gift.wins ? `+${formatNumber(gift.wins)} Wins` : gift.label
          game.showToast(`LUCKY GIFT! ${gift.wins ? `${gift.label}: ${what}` : what}`)
        },
        roll.discovered.length ? 1600 : 500,
      ),
    )
  }
  // Back to the edge once the result has shown - and never before the authority has
  // finished the drop, so the next one is accepted.
  const ready = roll.startedAt + roll.duration * 1000 + 400 - performance.now()
  timers.push(setTimeout(() => fadeThrough(finishRoll), Math.max(RESULT_HOLD_MS, ready)))
}

/**
 * Back at the edge, camera behind you. With Auto Drop on you stay in the zone, so the next
 * drop goes straight away.
 */
export function finishRoll() {
  clearTimers()
  roll.active = false
  roll.stopped = false
  runtime.flightFocus = null
  const player = runtime.player
  const { passes, settings } = getGame().profile
  if (!(passes.autoRoll && settings.autoRoll)) player.position.set(ROLL_RETURN.x, 0, ROLL_RETURN.z)
  player.yaw = Math.PI
  player.frozen = false
  runtime.camera.mode = 'follow'
  runtime.camera.yaw = 0
  runtime.camera.snap = true
  getGame().clearRollResult()
}
