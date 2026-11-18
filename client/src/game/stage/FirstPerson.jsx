import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'

import { TOOLS } from '@shared/balance'
import { clampToRoom, ROOM_PLAYER_RADIUS } from '@shared/layout'

import { sfx } from '../../audio/sfx'
import { getGame } from '../../store/game'
import { runtime } from '../runtime'
import { buyTool, pickToolSlot } from '../toolActions'
import { fp, installFpInput, lookSensitivity, releasePointer } from './fpInput'

export const EYE_HEIGHT = 1.6
const WALK_SPEED = 5.4
const ACCELERATION = 14
const GRAVITY = 26
const JUMP_SPEED = 7.6
const MAX_PITCH = 1.5

const _move = new Vector3()
const _vel = new Vector3()
const _clamped = { x: 0, z: 0 }

/** Pushes the player's circle out of an axis-aligned rect (a pedestal). */
function pushOut(pos, rect) {
  const cx = Math.min(rect.maxX, Math.max(rect.minX, pos.x))
  const cz = Math.min(rect.maxZ, Math.max(rect.minZ, pos.z))
  const dx = pos.x - cx
  const dz = pos.z - cz
  const d2 = dx * dx + dz * dz
  const r = ROOM_PLAYER_RADIUS
  if (d2 >= r * r) return
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2)
    pos.x += (dx / d) * (r - d)
    pos.z += (dz / d) * (r - d)
    return
  }
  const left = pos.x - rect.minX
  const right = rect.maxX - pos.x
  const near = pos.z - rect.minZ
  const far = rect.maxZ - pos.z
  const m = Math.min(left, right, near, far)
  if (m === left) pos.x = rect.minX - r
  else if (m === right) pos.x = rect.maxX + r
  else if (m === near) pos.z = rect.minZ - r
  else pos.z = rect.maxZ + r
}

/**
 * You, in a room: a first-person kinematic controller (no physics engine - the room is
 * a box with a few pedestals in it, and a circle-vs-rect push-out handles that exactly).
 * Owns the camera while you're in a run: eye height, look, a little head bob.
 *
 * Keys besides moving: 1-4 tools (buys one you can afford), B upgrades, E buys the tool on
 * the pedestal you're at.
 */
export function FirstPerson({ layout }) {
  const get = useThree((s) => s.get)
  const gl = useThree((s) => s.gl)
  const vy = useRef(0)
  const bob = useRef(0)

  useEffect(() => {
    const onKey = (code) => {
      const game = getGame()
      if (code.startsWith('Digit')) {
        const n = Number(code.slice(5)) - 1
        if (n >= 0 && n < TOOLS.length) pickToolSlot(n)
      } else if (code === 'KeyB') {
        sfx.click()
        game.togglePanel('upgrades')
      } else if (code === 'KeyE') {
        const pedestal = layout.pedestals[game.zone.pedestal]
        if (pedestal) buyTool(pedestal.tool)
      }
    }
    return installFpInput(gl.domElement, onKey)
  }, [gl, layout])

  // Near plane close in, for the tool in your hand; a wider lens than the lobby's.
  useEffect(() => {
    const { camera } = get()
    const near = camera.near
    camera.near = 0.03
    camera.updateProjectionMatrix()
    return () => {
      camera.near = near
      camera.updateProjectionMatrix()
    }
  }, [get])

  useFrame((state, rawDelta) => {
    const camera = state.camera
    const delta = Math.min(rawDelta, 0.05)
    const player = runtime.player
    const pos = player.position
    const game = getGame()
    const blocked = player.frozen || game.panel !== null || game.countdown !== null || game.clear !== null
    // A panel needs the mouse: let go of the pointer while one's open.
    if (game.panel) releasePointer()

    // --- Look ------------------------------------------------------------------
    const touchLook = runtime.input.lookX !== 0 || runtime.input.lookY !== 0
    const sMouse = lookSensitivity(false)
    const sTouch = lookSensitivity(true)
    if (!blocked) {
      player.yaw -= fp.lookX * sMouse + runtime.input.lookX * sTouch
      player.pitch -= fp.lookY * sMouse + runtime.input.lookY * sTouch
      player.pitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, player.pitch))
    }
    fp.lookX = 0
    fp.lookY = 0
    if (touchLook) {
      runtime.input.lookX = 0
      runtime.input.lookY = 0
    }

    // --- Move ------------------------------------------------------------------
    let ix = 0
    let iz = 0
    if (!blocked) {
      ix = (fp.right ? 1 : 0) - (fp.left ? 1 : 0) + runtime.input.joyX
      iz = (fp.forward ? 1 : 0) - (fp.backward ? 1 : 0) + runtime.input.joyY
    }
    const len = Math.hypot(ix, iz)
    if (len > 1) {
      ix /= len
      iz /= len
    }
    const sin = Math.sin(player.yaw)
    const cos = Math.cos(player.yaw)
    // Forward is (sin, cos) of yaw; right is a quarter turn clockwise of it: (-cos, sin).
    _move.set(sin * iz - cos * ix, 0, cos * iz + sin * ix).multiplyScalar(WALK_SPEED)
    _vel.lerp(_move, 1 - Math.exp(-ACCELERATION * delta))
    pos.x += _vel.x * delta
    pos.z += _vel.z * delta
    for (const rect of layout.colliders) pushOut(pos, rect)
    clampToRoom(layout, pos.x, pos.z, _clamped)
    pos.x = _clamped.x
    pos.z = _clamped.z

    // --- Jump & fall -------------------------------------------------------------
    if (!blocked && (fp.jump || runtime.input.jump) && player.grounded) {
      vy.current = JUMP_SPEED
      player.grounded = false
      sfx.jump()
    }
    vy.current -= GRAVITY * delta
    pos.y += vy.current * delta
    if (pos.y <= 0) {
      if (!player.grounded && vy.current < -6) sfx.jumpLand()
      pos.y = 0
      vy.current = 0
      player.grounded = true
    }

    const speed = Math.hypot(_vel.x, _vel.z)
    player.speed = speed
    player.anim = !player.grounded ? 'jump' : speed > 0.5 ? 'walk' : 'idle'

    // --- Camera ----------------------------------------------------------------
    if (player.grounded && speed > 0.5) bob.current += delta * speed * 2.1
    const bobY = Math.sin(bob.current * 2) * 0.035 * Math.min(1, speed / WALK_SPEED)
    camera.position.set(pos.x, pos.y + EYE_HEIGHT + bobY, pos.z)
    camera.rotation.set(player.pitch, player.yaw - Math.PI, 0, 'YXZ')
    camera.updateMatrixWorld()
  })

  return null
}

export default FirstPerson
