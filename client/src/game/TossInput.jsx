import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

import { requestToss } from './toss'

/** A press this short and this still is a throw, not a camera drag. */
const TAP_MS = 350
const TAP_PX = 10
/** Keys that throw (in the drop zone F is DROP instead: canToss says no there). */
const TOSS_KEYS = new Set(['KeyF'])

/**
 * Throws from a click or tap on the game itself (not the HUD, which sits on top), or F.
 * A drag that turns the camera isn't a tap and throws nothing.
 */
export default function TossInput() {
  const el = useThree((s) => s.gl.domElement)
  useEffect(() => {
    let down = null
    const onDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }
    }
    const onUp = (e) => {
      const d = down
      if (!d || d.id !== e.pointerId) return
      down = null
      if (performance.now() - d.t > TAP_MS || Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_PX) return
      requestToss()
    }
    const onKey = (e) => {
      if (e.repeat || !TOSS_KEYS.has(e.code)) return
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable="true"]')) return
      requestToss()
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [el])
  return null
}
