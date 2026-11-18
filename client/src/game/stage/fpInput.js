import { getBloxityState } from '../../bloxity/store'
import { getGame } from '../../store/game'
import { runtime } from '../runtime'

/**
 * First-person input in a room, kept in plain module state (read every frame, never
 * React state).
 *
 * Mouse: clicking the view locks the pointer (the browser shows "press Esc"); then moving
 * the mouse looks and holding the left button unscrews. Where pointer lock isn't allowed
 * (some embeds) it falls back to look-while-dragging: hold the left button to unscrew
 * and drag to sweep across the screws. Touch: the on-screen joystick, a look pad and
 * the USE button (TouchControls writes runtime.input).
 */
export const fp = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  /** Left mouse held on the view. */
  mouse: false,
  /** Look movement since the controller last read it, in pixels. */
  lookX: 0,
  lookY: 0,
  locked: false,
}

const KEYS = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'jump',
}

/** Look sensitivity in radians per pixel, scaled by Boxity's camera_sensitivity. */
export const lookSensitivity = (touch = false) => (touch ? 0.0055 : 0.0024) * getBloxityState().cameraSensitivity

/**
 * Hooks the room's input onto `canvas`. `onKey(code)` gets the other keys (tools,
 * upgrades, interact). Returns the teardown.
 */
export function installFpInput(canvas, onKey) {
  const reset = () => {
    for (const k of Object.values(KEYS)) fp[k] = false
    fp.mouse = false
  }
  const typing = (e) => e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))

  const onKeyDown = (e) => {
    if (typing(e)) return
    const action = KEYS[e.code]
    if (action) {
      e.preventDefault()
      fp[action] = true
      return
    }
    if (!e.repeat) onKey?.(e.code)
  }
  const onKeyUp = (e) => {
    const action = KEYS[e.code]
    if (action) fp[action] = false
  }

  const onPointerDown = (e) => {
    if (e.pointerType === 'touch') return
    if (e.button !== 0) return
    if (getGame().panel) return
    fp.mouse = true
    if (!fp.locked && canvas.requestPointerLock) {
      try {
        const request = canvas.requestPointerLock()
        // Newer browsers return a promise that rejects where lock isn't allowed.
        request?.catch?.(() => {})
      } catch {
        // Not allowed here: drag-to-look it is.
      }
    }
  }
  const onPointerUp = (e) => {
    if (e.button === 0) fp.mouse = false
  }
  const onMouseMove = (e) => {
    if (fp.locked || fp.mouse) {
      fp.lookX += e.movementX || 0
      fp.lookY += e.movementY || 0
    }
  }
  const onLockChange = () => {
    fp.locked = document.pointerLockElement === canvas
    if (!fp.locked) fp.mouse = false
  }
  const onContextMenu = (e) => e.preventDefault()

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', reset)
  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('mousemove', onMouseMove)
  document.addEventListener('pointerlockchange', onLockChange)
  canvas.addEventListener('contextmenu', onContextMenu)

  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', reset)
    canvas.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('pointerlockchange', onLockChange)
    canvas.removeEventListener('contextmenu', onContextMenu)
    if (document.pointerLockElement === canvas) document.exitPointerLock?.()
    reset()
    fp.lookX = 0
    fp.lookY = 0
    fp.locked = false
  }
}

/** Lets go of the pointer (a panel opened, so the mouse is needed for it). */
export function releasePointer() {
  if (document.pointerLockElement) document.exitPointerLock?.()
  fp.mouse = false
}

/** Whether the player is asking to unscrew this frame (mouse or the USE button). */
export const wantsUse = () => fp.mouse || runtime.input.use
