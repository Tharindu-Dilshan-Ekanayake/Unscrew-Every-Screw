/**
 * The player's body language, shared by the Bloxity avatar and the blocky stand-in so
 * both move the same way.
 *
 * `computePose` turns the motion state into joint angles; each avatar applies them to its
 * own limbs. Angles are radians in character space (the character faces +Z, its left side
 * is +X), about each joint's pivot:
 *   swing - about X: negative swings a hanging limb forward (arm up in front, knee up);
 *           on the spine and neck, which point up, negative bends them back
 *   sway  - about Z: positive moves a limb towards +X
 *   twist - about Y: positive turns the right shoulder forward
 * `lift` raises (or, to keep bent legs on the ground, lowers) the body, in metres.
 * `stretchL` / `stretchR` stay 1 here (the template's rubber arms): arms keep their length.
 */

export const POSED_BONES = [
  'Spine1',
  'Neck1',
  'ArmL1',
  'ArmL2',
  'ArmR1',
  'ArmR2',
  'LegL1',
  'LegL2',
  'LegR1',
  'LegR2',
]

/** Written by `computePose` every frame; one shared result, never reallocated. */
export const pose = {
  lift: 0,
  stretchL: 1,
  stretchR: 1,
  bones: Object.fromEntries(POSED_BONES.map((name) => [name, { swing: 0, sway: 0, twist: 0 }])),
}

/**
 * The 1.8 m character's measurements: shoulder height and how far out from the middle,
 * arm length (shoulder to palm), and the body's middle.
 */
export const BODY = { shoulderY: 1.35, shoulderX: 0.56, arm: 0.63, pivot: 0.9 }

/** Sway sign that moves a limb away from the body, per side. */
const OUT_L = 1
const OUT_R = -1

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/** Adds to a joint, scaled by weight `w`. */
function add(name, swing, sway, twist, w) {
  const b = pose.bones[name]
  b.swing += swing * w
  b.sway += sway * w
  b.twist += twist * w
}

/** Relaxed stance: knees soft, breathing, holding the phone up in front to look at it. */
function stance(w, time) {
  const breath = Math.sin(time * 1.8)
  add('LegL1', -0.04, 0.06 * OUT_L, 0, w)
  add('LegL2', 0.08, 0, 0, w)
  add('LegR1', 0.04, 0.06 * OUT_R, 0, w)
  add('LegR2', 0.08, 0, 0, w)
  add('Spine1', 0.04 + breath * 0.015, 0, 0, w)
  add('Neck1', 0.12, 0, 0, w)
  add('ArmL1', 0.04 + breath * 0.02, 0.1 * OUT_L, 0, w)
  add('ArmL2', -0.15, 0, 0, w)
  // The phone held up in front, screen towards you.
  add('ArmR1', -0.45 + breath * 0.02, 0.05 * OUT_R, 0, w)
  add('ArmR2', -1.05, 0, 0, w)
  pose.lift += (-0.01 + breath * 0.006) * w
}

/**
 * Walk to sprint: the legs swing and the body bobs once per step, the free arm swinging
 * against the legs and the phone hand carried a little in front. `phase` advances faster
 * with speed, so the steps quicken.
 */
function stride(phase, ratio) {
  const cycle = Math.sin(phase)
  const leg = 0.85 * ratio
  add('LegL1', cycle * leg, 0, 0, 1)
  add('LegR1', -cycle * leg, 0, 0, 1)
  // Knees fold on the back swing only.
  add('LegL2', Math.max(0, -cycle) * 1.1 * ratio, 0, 0, 1)
  add('LegR2', Math.max(0, cycle) * 1.1 * ratio, 0, 0, 1)
  add('Spine1', (0.06 + 0.1 * ratio) * ratio, 0, cycle * 0.12 * ratio, 1)
  add('ArmL1', -cycle * 0.75 * ratio, 0.06 * OUT_L, 0, 1)
  add('ArmL2', -0.3 * ratio, 0, 0, 1)
  add('ArmR1', -0.3 + cycle * 0.35 * ratio, 0.05 * OUT_R, 0, 1)
  add('ArmR2', -0.9, 0, 0, 1)
  pose.lift += (Math.abs(Math.cos(phase)) * 0.05 - 0.015) * ratio
}

/** In the air: one knee up on the way up; falling, the legs straighten and reach down. */
function airborne(vy) {
  const f = smooth(0, 1, clamp01((2 - vy) / 9))
  add('LegL1', lerp(-1.3, -0.35, f), 0.08 * OUT_L, 0, 1)
  add('LegL2', lerp(1.6, 0.25, f), 0, 0, 1)
  add('LegR1', lerp(0.25, -0.1, f), 0.08 * OUT_R, 0, 1)
  add('LegR2', lerp(0.5, 0.2, f), 0, 0, 1)
  add('Spine1', lerp(0.15, -0.06, f), 0, 0, 1)
  add('ArmL1', -2.4, 0.35 * OUT_L, 0, 1)
  add('ArmR1', -2.2, 0.35 * OUT_R, 0, 1)
  add('ArmR2', -0.4, 0, 0, 1)
}

/**
 * Throwing your phone for Skill (`phase` a throw per turn): reaching back with the phone,
 * whipping it over and forward (it leaves the hand at practice.THROW_RELEASE),
 * following through, then straightening up for the next one.
 */
function practicing(phase, w) {
  const f = ((phase / (Math.PI * 2)) % 1 + 1) % 1
  // 0-0.4 reaching back, 0.4-0.6 the whip, 0.6-0.8 the follow-through, 0.8-1 back up.
  const back = smooth(0, 0.4, f) * (1 - smooth(0.4, 0.6, f))
  const whip = smooth(0.4, 0.6, f) * (1 - smooth(0.8, 1, f))
  add('ArmR1', -0.6 - 2.6 * back - 0.9 * whip, 0.2 * OUT_R, 0, w)
  add('ArmR2', -0.9 - 0.6 * back + 0.7 * whip, 0, 0, w)
  add('ArmL1', -0.3 - 1.0 * back + 0.5 * whip, 0.12 * OUT_L, 0, w)
  add('ArmL2', -0.3, 0, 0, w)
  add('Spine1', 0.05 - 0.22 * back + 0.35 * whip, 0, -0.45 * back + 0.35 * whip, w)
  add('Neck1', 0.05 + 0.15 * whip, 0, 0.2 * back, w)
  add('LegL1', -0.3 * (back + whip), 0.08 * OUT_L, 0, w)
  add('LegL2', 0.15 + 0.2 * whip, 0, 0, w)
  add('LegR1', 0.25 * back + 0.1 * whip, 0.08 * OUT_R, 0, w)
  add('LegR2', 0.15 + 0.25 * back, 0, 0, w)
  pose.lift -= (0.03 + 0.04 * whip) * w
}

/**
 * Winding up the throw (`charge` 0-1): the phone cocked back behind your head, the other
 * arm pointing out at the hotel, leaning back on the back foot - further the more it's
 * charged. Full, it trembles (`wobble`).
 */
function windingUp(charge, wobble, time, w) {
  const c = smooth(0, 1, charge)
  const shake = wobble * Math.sin(time * 40) * 0.05
  add('Spine1', -0.1 - 0.18 * c, 0, -0.35 - 0.3 * c, w)
  add('Neck1', 0.1, 0, 0.25 * c, w)
  add('ArmR1', -2.6 - 0.7 * c + shake, 0.25 * OUT_R, 0, w)
  add('ArmR2', -1.0 - 0.5 * c, 0, 0, w)
  add('ArmL1', -1.5, 0.15 * OUT_L, 0, w)
  add('ArmL2', -0.1, 0, 0, w)
  add('LegL1', -0.35, 0.08 * OUT_L, 0, w)
  add('LegL2', 0.2, 0, 0, w)
  add('LegR1', 0.35 + 0.1 * c, 0.08 * OUT_R, 0, w)
  add('LegR2', 0.35, 0, 0, w)
  pose.lift -= (0.04 + 0.05 * c) * w
}

/**
 * The throw (`t` 0-1 through the swing; the phone leaves at the end): the arm whips over
 * and forward, the body turning and stepping into it, then follows through - and after,
 * you lean out over the edge watching it fall.
 */
function throwing(t, time, w) {
  // 0-0.35 cocked right back, 0.35-0.7 the whip forward, 0.7-1 the follow-through.
  const whip = smooth(0.35, 0.7, t)
  const follow = smooth(0.7, 1, t)
  add('ArmR1', lerp(-3.4, -1.3, whip) + 0.6 * follow, 0.2 * OUT_R, 0, w)
  add('ArmR2', lerp(-1.4, -0.1, whip), 0, 0, w)
  add('ArmL1', lerp(-1.5, 0.35, whip), 0.15 * OUT_L, 0, w)
  add('Spine1', lerp(-0.28, 0.4, whip), 0, lerp(-0.6, 0.45, whip), w)
  add('Neck1', lerp(0.1, -0.1, whip) + 0.3 * follow, 0, 0, w)
  add('LegL1', lerp(-0.35, -0.55, whip), 0.08 * OUT_L, 0, w)
  add('LegL2', 0.3, 0, 0, w)
  add('LegR1', lerp(0.45, 0.3, whip), 0.08 * OUT_R, 0, w)
  add('LegR2', lerp(0.35, 0.6, whip), 0, 0, w)
  pose.lift -= 0.07 * w
  // Done: leaning out over the edge, watching it go.
  if (t >= 1) {
    const sway = Math.sin(time * 2) * 0.03
    add('Spine1', 0.1 + sway, 0, 0, w)
    add('Neck1', 0.4, 0, 0, w)
  }
}

/** Arms up and waving, bouncing on the spot: the celebration. */
function cheering(time, w) {
  const wave = Math.sin(time * 10) * 0.28
  add('ArmL1', -2.7 + wave, 0.38 * OUT_L, 0, w)
  add('ArmR1', -2.7 - wave, 0.38 * OUT_R, 0, w)
  add('ArmL2', -0.25, 0, 0, w)
  add('ArmR2', -0.25, 0, 0, w)
  add('LegL1', -0.12, 0.06 * OUT_L, 0, w)
  add('LegR1', -0.12, 0.06 * OUT_R, 0, w)
  add('LegL2', 0.22, 0, 0, w)
  add('LegR2', 0.22, 0, 0, w)
  add('Spine1', -0.1, 0, 0, w)
  add('Neck1', -0.15, 0, 0, w)
  pose.lift += Math.abs(Math.sin(time * 7)) * 0.16 * w
}

/**
 * @param {{ time?: number, speed?: number, maxSpeed?: number, grounded?: boolean,
 *   vy?: number, stride?: number, run?: number, windup?: number, wobble?: number,
 *   throwT?: number, cheer?: number, emote?: string|null }} motion
 *   `run` (0-1) is throwing your phone for Skill (`stride` is the throw's phase, a turn per
 *   throw); the name is the template's.
 *   `windup` (0-1) is the throw meter while you hold DROP (0: not throwing), `wobble` 1
 *   once it's full; `throwT` (0-1) how far through the throw itself (0: no throw).
 *   `cheer` (0-1) up and celebrating.
 *   `emote` is a Boxity emote id to play over this pose, or null. It isn't posed here:
 *   the Bloxity avatar blends the emote clip on top of this pose (avatarRig.updateEmote),
 *   so the same motion object drives both. `emoteFromAnim(r.anim)` in bloxity/emotes.js
 *   turns another player's synced anim ('emote:<id>') into this field.
 */
export function computePose(motion) {
  const {
    time = 0,
    speed = 0,
    maxSpeed = 6,
    grounded = true,
    vy = 0,
    stride: phase = time * 5,
    run = 0,
    windup = 0,
    wobble = 0,
    throwT = 0,
    cheer = 0,
  } = motion
  for (const name of POSED_BONES) {
    const b = pose.bones[name]
    b.swing = 0
    b.sway = 0
    b.twist = 0
  }
  pose.lift = 0
  pose.stretchL = 1
  pose.stretchR = 1

  if (throwT > 0) {
    throwing(throwT, time, 1)
    return pose
  }
  if (windup > 0) {
    windingUp(windup, wobble, time, 1)
    return pose
  }
  if (cheer > 0) {
    cheering(time, cheer)
    const rest = clamp01(1 - cheer)
    if (rest > 0) stance(rest, time)
    return pose
  }
  if (run > 0 && grounded) {
    practicing(phase, clamp01(run))
    return pose
  }
  const ratio = grounded ? clamp01(speed / Math.max(maxSpeed, 0.001)) : 0
  if (grounded) {
    const still = 1 - smooth(0.05, 0.4, ratio)
    stance(still, time)
    if (ratio > 0.02) stride(phase, ratio)
  } else {
    airborne(vy)
  }
  return pose
}
