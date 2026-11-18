import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Quaternion, Vector3 } from 'three'

import { clampToWalkable, STATIC_COLLIDERS } from '@shared/world'

import { sfx } from '../../audio/sfx'
import { getGame, useGame } from '../../store/game'
import ErrorBoundary from '../../ui/ErrorBoundary'
import FallbackAvatar from '../FallbackAvatar'
import PlayerAvatar from '../PlayerAvatar'
import { runtime } from '../runtime'
import useKeyboard from '../useKeyboard'
import HeldTool from './HeldTool'

export const PLAYER_HEIGHT = 1.8
const RADIUS = 0.45
const WALK_SPEED = 10
const ACCELERATION = 16
const GRAVITY = 32
const JUMP_SPEED = 10.5

const _input = new Vector3()
const _move = new Vector3()
const _camForward = new Vector3()
const _camRight = new Vector3()
const _targetQuat = new Quaternion()
const _up = new Vector3(0, 1, 0)
const _clamped = { x: 0, z: 0 }

/** Pushes a circle out of an axis-aligned rect. */
function pushOut(pos, rect) {
  const cx = Math.min(rect.maxX, Math.max(rect.minX, pos.x))
  const cz = Math.min(rect.maxZ, Math.max(rect.minZ, pos.z))
  const dx = pos.x - cx
  const dz = pos.z - cz
  const d2 = dx * dx + dz * dz
  if (d2 >= RADIUS * RADIUS) return
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2)
    const push = (RADIUS - d) / d
    pos.x += dx * push
    pos.z += dz * push
    return
  }
  const left = pos.x - rect.minX
  const right = rect.maxX - pos.x
  const near = pos.z - rect.minZ
  const far = rect.maxZ - pos.z
  const m = Math.min(left, right, near, far)
  if (m === left) pos.x = rect.minX - RADIUS
  else if (m === right) pos.x = rect.maxX + RADIUS
  else if (m === near) pos.z = rect.minZ - RADIUS
  else pos.z = rect.maxZ + RADIUS
}

/**
 * You in the lobby: a third-person kinematic character controller (no physics engine -
 * the yard is flat with a handful of rectangular walls, which a circle-vs-rect push-out
 * handles exactly; zero rigid bodies). Your Boxity avatar carries your screwdriver.
 *
 * Reads and writes `runtime.player`; never touches React state per frame.
 */
export function LobbyPlayer({ onAvatarReady }) {
  const groupRef = useRef(null)
  const visualRef = useRef(null)
  const handRef = useRef(null)
  const keys = useKeyboard()
  const velocity = useRef(new Vector3())
  const vy = useRef(0)
  const skin = useGame((s) => s.profile.skin)

  const motionRef = useRef({ time: 0, speed: 0, grounded: true, maxSpeed: WALK_SPEED, vy: 0, stride: 0, windup: 0, throwT: 0, tossF: 1, run: 0 })

  const shownAt = useMemo(() => new Vector3().copy(runtime.player.position), [])
  useEffect(() => {
    const caster = { position: shownAt, size: 1.1 }
    runtime.shadowCasters.add(caster)
    return () => runtime.shadowCasters.delete(caster)
  }, [shownAt])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const player = runtime.player
    const pos = player.position
    const k = keys.current
    const joy = runtime.input
    const motion = motionRef.current
    motion.time += delta
    const game = getGame()
    const still = player.frozen || game.panel === 'chapters'

    _input.set(0, 0, 0)
    if (!still) {
      _input.set((k.right ? 1 : 0) - (k.left ? 1 : 0) + joy.joyX, 0, (k.backward ? 1 : 0) - (k.forward ? 1 : 0) - joy.joyY)
    }
    const inputLength = Math.min(1, _input.length())
    if (inputLength > 0.02) {
      _input.normalize()
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
    velocity.current.lerp(_move, 1 - Math.exp(-ACCELERATION * delta))

    pos.x += velocity.current.x * delta
    pos.z += velocity.current.z * delta
    for (const rect of STATIC_COLLIDERS) pushOut(pos, rect)
    clampToWalkable(pos.x, pos.z, _clamped)
    pos.x = _clamped.x
    pos.z = _clamped.z

    if (!still && (k.jump || joy.jump) && player.grounded) {
      vy.current = JUMP_SPEED
      player.grounded = false
      sfx.jump()
    }
    vy.current -= GRAVITY * delta
    pos.y += vy.current * delta
    if (pos.y <= 0) {
      if (!player.grounded && vy.current < -5) sfx.jumpLand()
      pos.y = 0
      vy.current = 0
      player.grounded = true
    }

    const speed = Math.hypot(velocity.current.x, velocity.current.z)
    if (speed > 0.3) player.yaw = Math.atan2(velocity.current.x, velocity.current.z)

    const group = groupRef.current
    const visual = visualRef.current
    if (group && visual) {
      group.position.set(pos.x, pos.y, pos.z)
      _targetQuat.setFromAxisAngle(_up, player.yaw)
      visual.quaternion.slerp(_targetQuat, 1 - Math.pow(0.0005, delta))
    }
    shownAt.set(pos.x, pos.y, pos.z)

    player.speed = speed
    player.anim = !player.grounded ? 'jump' : speed > 0.5 ? 'walk' : 'idle'
    motion.speed = speed
    motion.grounded = player.grounded
    motion.vy = vy.current
    motion.stride += delta * (5 + 6 * Math.min(1, speed / WALK_SPEED))
  })

  return (
    <group ref={groupRef}>
      <group ref={visualRef}>
        <ErrorBoundary fallback={<FallbackAvatar motionRef={motionRef} onReady={onAvatarReady} handRef={handRef} />}>
          <Suspense fallback={<FallbackAvatar motionRef={motionRef} handRef={handRef} />}>
            <PlayerAvatar onReady={onAvatarReady} targetHeight={PLAYER_HEIGHT} motionRef={motionRef} handRef={handRef} />
          </Suspense>
        </ErrorBoundary>
        <HeldTool ref={handRef} skin={skin} />
      </group>
    </group>
  )
}

export default LobbyPlayer
