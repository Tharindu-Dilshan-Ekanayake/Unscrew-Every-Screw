import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Quaternion, Vector3 } from 'three'

import { TRAIN_INTERVAL } from '@shared/balance'
import { isPadUnlocked } from '@shared/logic'
import { clampToWalkable, DROP_SPOT, groundHeightAt, PAD_YAW, padAt, STATIC_COLLIDERS } from '@shared/world'

import { sfx } from '../audio/sfx'
import { getGame, useGame } from '../store/game'
import ErrorBoundary from '../ui/ErrorBoundary'
import FallbackAvatar from './FallbackAvatar'
import HeldPhone from './HeldPhone'
import PlayerAvatar from './PlayerAvatar'
import { releasePoint, spawnThrow, THROW_RELEASE, TOSS_TIME, tossTarget } from './practice'
import { cancelPull, isPulling, launch, updatePull } from './launch'
import { roll } from './roll/rollControl'
import { runtime } from './runtime'
import { startToss, toss } from './toss'
import useKeyboard from './useKeyboard'

export const PLAYER_HEIGHT = 1.8
const RADIUS = 0.45

const WALK_SPEED = 10.875
const ACCELERATION = 16
const GRAVITY = 32
const JUMP_SPEED = 10.5
/** Ledges up to this high are walked straight onto (the showroom's back stage). */
const STEP_UP = 1.05

// Scratch objects, reused each frame so the loop allocates nothing.
const _input = new Vector3()
const _move = new Vector3()
const _camForward = new Vector3()
const _camRight = new Vector3()
const _targetQuat = new Quaternion()
const _up = new Vector3(0, 1, 0)
const _clamped = { x: 0, z: 0 }
const _hand = new Vector3()
const _target = new Vector3()

/** Pushes a circle out of an axis-aligned rect. Returns true on contact. */
function pushOut(pos, rect) {
  const cx = Math.min(rect.maxX, Math.max(rect.minX, pos.x))
  const cz = Math.min(rect.maxZ, Math.max(rect.minZ, pos.z))
  const dx = pos.x - cx
  const dz = pos.z - cz
  const d2 = dx * dx + dz * dz
  if (d2 >= RADIUS * RADIUS) return false

  if (d2 > 1e-8) {
    const d = Math.sqrt(d2)
    const push = (RADIUS - d) / d
    pos.x += dx * push
    pos.z += dz * push
    return true
  }

  // Centre inside the rect (spawned in, or a wall appeared on top of us): leave by the
  // nearest side.
  const left = pos.x - rect.minX
  const right = rect.maxX - pos.x
  const near = pos.z - rect.minZ
  const far = rect.maxZ - pos.z
  const m = Math.min(left, right, near, far)
  if (m === left) pos.x = rect.minX - RADIUS
  else if (m === right) pos.x = rect.maxX + RADIUS
  else if (m === near) pos.z = rect.minZ - RADIUS
  else pos.z = rect.maxZ + RADIUS
  return true
}

/**
 * The local player: a kinematic character controller.
 *
 * No physics engine: the world is flat ground, a few raised floors and a list of
 * rectangular walls, which a circle-vs-rect push-out handles exactly. That saves the
 * ~2 MB Rapier WASM download and keeps the active rigid body count at zero.
 *
 * Holding DROP in the DROP ZONE (RollButton, launch.js) steps you up to the edge, facing
 * out over it, and winds up the throw; letting go sends it. While the phone falls your
 * logical position stays at the edge (what the server checks) and your avatar follows
 * through the throw, empty-handed, until you're back. Every click, tap or THROW throws your
 * phone for Skill (toss.js): on a throw pad you face down its lane and it flies at the
 * target, anywhere else a few metres ahead (practice.js).
 *
 * Reads and writes `runtime.player`; never touches React state per frame.
 *
 * @param {{ onAvatarReady?: () => void }} props
 */
export function Player({ onAvatarReady }) {
  const groupRef = useRef(null)
  const visualRef = useRef(null)
  const handRef = useRef(null)
  const keys = useKeyboard()
  const velocity = useRef(new Vector3())
  const vy = useRef(0)
  const phoneId = useGame((s) => s.profile.equippedTire)

  /** Handed to the avatar so it can pose itself. A ref: written every frame. */
  const motionRef = useRef({
    time: 0,
    speed: 0,
    grounded: true,
    maxSpeed: WALK_SPEED,
    vy: 0,
    stride: 0,
    windup: 0,
    throwT: 0,
    /** How far through the current throw (0-1; 1 when not throwing), last frame. */
    tossF: 1,
  })

  // The blob shadow follows the character.
  const shownAt = useMemo(() => new Vector3().copy(runtime.player.position), [])
  useEffect(() => {
    const caster = { position: shownAt, size: 1.1 }
    runtime.shadowCasters.add(caster)
    return () => runtime.shadowCasters.delete(caster)
  }, [shownAt])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const now = performance.now()
    const player = runtime.player
    const pos = player.position
    const k = keys.current
    const joy = runtime.input
    const motion = motionRef.current
    motion.time += delta

    const group = groupRef.current
    const visual = visualRef.current

    // --- The throw: winding up at the edge ---------------------------------------
    const throwing = !roll.active && isPulling()
    updatePull(now)
    if (throwing && launch.snap) {
      // Just started: step up to the edge, facing out over it.
      launch.snap = false
      pos.set(DROP_SPOT.x, groundHeightAt(DROP_SPOT.x, DROP_SPOT.z), DROP_SPOT.z)
      velocity.current.set(0, 0, 0)
    }

    // --- Input, relative to the camera ----------------------------------------
    _input.set(0, 0, 0)
    const still = player.frozen || throwing
    if (!still) {
      _input.set(
        (k.right ? 1 : 0) - (k.left ? 1 : 0) + joy.joyX,
        0,
        (k.backward ? 1 : 0) - (k.forward ? 1 : 0) - joy.joyY,
      )
    }
    const inputLength = Math.min(1, _input.length())

    if (inputLength > 0.02) {
      _input.normalize()
      // Flatten the camera's forward onto the ground plane so "up" always means
      // "away from the camera".
      state.camera.getWorldDirection(_camForward)
      _camForward.y = 0
      _camForward.normalize()
      _camRight.crossVectors(_camForward, _up).normalize()
      _move
        .set(0, 0, 0)
        .addScaledVector(_camForward, -_input.z)
        .addScaledVector(_camRight, _input.x)
        .normalize()
        .multiplyScalar(WALK_SPEED * inputLength)
    } else {
      _move.set(0, 0, 0)
    }

    // Ease towards the target velocity: crisp, but no instant 0->max snaps.
    const blend = 1 - Math.exp(-ACCELERATION * delta)
    velocity.current.lerp(_move, blend)

    // --- Horizontal move + collision --------------------------------------------
    const prevX = pos.x
    const prevZ = pos.z
    pos.x += velocity.current.x * delta
    pos.z += velocity.current.z * delta

    for (const rect of STATIC_COLLIDERS) pushOut(pos, rect)
    for (const rect of runtime.dynamicColliders) pushOut(pos, rect)
    clampToWalkable(pos.x, pos.z, _clamped)
    pos.x = _clamped.x
    pos.z = _clamped.z

    // A ledge too tall to step onto acts as a wall.
    let floor = groundHeightAt(pos.x, pos.z)
    if (floor - pos.y > STEP_UP) {
      pos.x = prevX
      pos.z = prevZ
      floor = groundHeightAt(pos.x, pos.z)
    }

    // --- Vertical ---------------------------------------------------------------
    const wantJump = !player.frozen && (k.jump || joy.jump)
    // Jumping gives up the throw.
    if (wantJump && throwing && launch.gripping) cancelPull()
    if (wantJump && !throwing && player.grounded) {
      vy.current = JUMP_SPEED
      player.grounded = false
      sfx.jump()
    }
    vy.current -= GRAVITY * delta
    pos.y += vy.current * delta

    if (pos.y <= floor) {
      // Coming down from a jump (not just stepping off a kerb) lands with a thump.
      if (!player.grounded && vy.current < -5) sfx.jumpLand()
      pos.y = floor
      vy.current = 0
      player.grounded = true
    } else if (pos.y - floor > 0.05) {
      player.grounded = false
    }

    // --- Facing -----------------------------------------------------------------
    const speed = Math.hypot(velocity.current.x, velocity.current.z)
    // On an unlocked throw pad your throws fly down its lane: standing still there, you face it.
    const pad = padAt(pos.x, pos.z)
    const padLane = pad >= 0 && isPadUnlocked(getGame().profile, pad)
    const facingLane = padLane && player.grounded && speed < 0.5 && !still
    if (facingLane) player.yaw = PAD_YAW
    else if (throwing || roll.active) player.yaw = Math.PI
    else if (speed > 0.3) player.yaw = Math.atan2(velocity.current.x, velocity.current.z)

    // --- The throw's pose and the phone in your hand ---------------------------------
    motion.windup = throwing ? Math.max(0.15, launch.charge) : 0
    motion.wobble = throwing && launch.full ? 1 : 0
    motion.throwT = roll.active ? roll.throwT : 0
    // A throw (a click, a tap, THROW: toss.js), and the one lined up after it. Standing
    // on a throw pad it throws by itself too, one every TRAIN_INTERVAL - clicking as well
    // throws faster still.
    let tossF = (now - toss.at) / 1000 / TOSS_TIME
    if (still) toss.queued = false
    else if (tossF >= 1 && (toss.queued || (facingLane && now - toss.at >= TRAIN_INTERVAL * 1000))) {
      startToss(now)
      tossF = 0
    }
    const tossing = !still && tossF >= 0 && tossF < 1
    // The phone's gone from your hand from the moment you let it fly until you reach for the next.
    const thrown = tossing && tossF >= THROW_RELEASE
    if (handRef.current) handRef.current.visible = !(roll.active && !roll.inHand) && !thrown

    if (group && visual) {
      // Step-ups ease in over a few frames on the visual only; the logical position
      // snaps so collision and triggers stay exact.
      const shownY = group.position.y
      const steppingUp = player.grounded && pos.y > shownY
      const y = steppingUp ? shownY + (pos.y - shownY) * Math.min(1, delta * 18) : pos.y
      group.position.set(pos.x, y, pos.z)
      _targetQuat.setFromAxisAngle(_up, player.yaw)
      visual.quaternion.slerp(_targetQuat, throwing || roll.active ? 1 : 1 - Math.pow(0.0005, delta))
      visual.position.set(0, 0, 0)
    }
    shownAt.set(pos.x, pos.y, pos.z)

    // --- Publish motion ---------------------------------------------------------
    player.speed = speed
    // Every throw flips toss0/toss1, so other players see each one (RemotePlayers).
    player.anim = !player.grounded ? 'jump' : throwing ? 'pull' : tossing ? (toss.seq % 2 ? 'toss1' : 'toss0') : speed > 0.5 ? 'walk' : 'idle'

    motion.speed = speed
    motion.grounded = player.grounded
    motion.vy = vy.current
    // Throwing (playerPose `run`, its phase the throw's progress); the phone flies off as
    // it leaves your hand - down the pad's lane, or ahead of you.
    motion.run = tossing ? 1 : 0
    if (tossing) motion.stride = tossF * Math.PI * 2
    else motion.stride += delta * (5 + 6 * Math.min(1, speed / WALK_SPEED))
    if (tossing && motion.tossF < THROW_RELEASE && tossF >= THROW_RELEASE) {
      releasePoint(pos, _hand, player.yaw)
      tossTarget(pos, player.yaw, padLane ? pad : -1, _target)
      spawnThrow(_hand.x, _hand.y, _hand.z, _target.x, _target.z, getGame().profile.equippedTire, _target.y)
      sfx.practiceThrow()
    }
    motion.tossF = tossing ? tossF : 1
  })

  return (
    <group ref={groupRef}>
      <group ref={visualRef}>
        <ErrorBoundary fallback={<FallbackAvatar motionRef={motionRef} onReady={onAvatarReady} handRef={handRef} />}>
          <Suspense fallback={<FallbackAvatar motionRef={motionRef} handRef={handRef} />}>
            <PlayerAvatar onReady={onAvatarReady} targetHeight={PLAYER_HEIGHT} motionRef={motionRef} handRef={handRef} />
          </Suspense>
        </ErrorBoundary>
        <HeldPhone ref={handRef} phoneId={phoneId} />
      </group>
    </group>
  )
}

export default Player
