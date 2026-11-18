import { useEffect, useRef } from 'react'

import { runtime } from '../game/runtime'
import { useGame } from '../store/game'
import { useInput } from '../store/input'
import Icon from './Icon'
import StrokeText from './StrokeText'
import { GRADIENTS } from './hud/style'

/** Joystick travel radius, in CSS pixels. */
const RADIUS = 56
/** How far a finger on the view travels before it turns the view instead of unscrewing. */
const DRAG_TO_LOOK = 14

/** Points the touch aim at a finger, in `rect` (the view). */
function aimAt(e, rect) {
  const t = runtime.input.touchAim
  t.active = true
  t.x = e.clientX - rect.left
  t.y = e.clientY - rect.top
  t.nx = (t.x / rect.width) * 2 - 1
  t.ny = 1 - (t.y / rect.height) * 2
}

const roundButton = (size, background) => ({ width: size, height: size, background, border: '4px solid #111' })

/** A button that stays "down" while a finger is on it (writes runtime.input[key]). */
function HoldButton({ label, className, size, gradient, inputKey, children }) {
  const set = (on) => {
    runtime.input[inputKey] = on
  }
  return (
    <button
      type="button"
      aria-label={label}
      className={`pp-btn pp-chunky absolute z-20 flex touch-none flex-col items-center justify-center rounded-full text-white ${className}`}
      style={roundButton(size, gradient)}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture?.(e.pointerId)
        set(true)
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onLostPointerCapture={() => set(false)}
    >
      <span className="pp-gloss" style={{ borderRadius: `${size / 2}px ${size / 2}px ${size * 0.3}px ${size * 0.3}px` }} />
      {children}
    </button>
  )
}

/**
 * On-screen controls for touch devices. Everywhere: a floating joystick wherever the left
 * of the screen is touched, and JUMP. In a room: touch a screw and hold to unscrew it
 * (and the ones around it, with an area tool); drag anywhere to look round instead; or
 * aim the crosshair and hold USE.
 *
 * Writes straight into `runtime.input` and moves the knob through refs, so dragging never
 * re-renders React.
 */
export function TouchControls() {
  const isTouch = useInput((s) => s.touch)
  const inRun = useGame((s) => Boolean(s.profile.run?.active))
  const panelOpen = useGame((s) => s.panel !== null)
  const baseRef = useRef(null)
  const knobRef = useRef(null)
  const active = useRef({ id: null, x: 0, y: 0 })
  const look = useRef({ id: null, x: 0, y: 0 })

  useEffect(
    () => () => {
      Object.assign(runtime.input, { joyX: 0, joyY: 0, jump: false, use: false, lookX: 0, lookY: 0 })
      runtime.input.touchAim.active = false
    },
    [],
  )

  // Leaving a room (or opening a panel) lets go of USE, and of a screw held.
  useEffect(() => {
    if (!inRun || panelOpen) {
      runtime.input.use = false
      runtime.input.touchAim.active = false
    }
  }, [inRun, panelOpen])

  if (!isTouch) return null

  const show = (x, y) => {
    const base = baseRef.current
    if (!base) return
    base.style.opacity = '1'
    base.style.left = `${x - RADIUS}px`
    base.style.top = `${y - RADIUS}px`
  }

  const onDown = (e) => {
    if (active.current.id !== null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    active.current = { id: e.pointerId, x: e.clientX - rect.left, y: e.clientY - rect.top }
    show(active.current.x, active.current.y)
  }

  const onMove = (e) => {
    const a = active.current
    if (a.id !== e.pointerId) return
    const rect = e.currentTarget.getBoundingClientRect()
    let dx = e.clientX - rect.left - a.x
    let dy = e.clientY - rect.top - a.y
    const len = Math.hypot(dx, dy)
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS
      dy = (dy / len) * RADIUS
    }
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`
    const strength = Math.max(0, Math.min(len, RADIUS) / RADIUS - 0.08) / 0.92
    runtime.input.joyX = len > 0 ? (dx / Math.min(len, RADIUS)) * strength : 0
    runtime.input.joyY = len > 0 ? (-dy / Math.min(len, RADIUS)) * strength : 0
  }

  const onUp = (e) => {
    if (active.current.id !== e.pointerId) return
    active.current.id = null
    runtime.input.joyX = 0
    runtime.input.joyY = 0
    if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)'
    if (baseRef.current) baseRef.current.style.opacity = '0.35'
  }

  // The view: a finger held still unscrews what's under it; one that travels turns the
  // view instead (for the rest of that touch).
  const onLookDown = (e) => {
    if (look.current.id !== null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    look.current = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, looking: false, rect }
    aimAt(e, rect)
  }
  const onLookMove = (e) => {
    const l = look.current
    if (l.id !== e.pointerId) return
    if (!l.looking) {
      if (Math.hypot(e.clientX - l.sx, e.clientY - l.sy) < DRAG_TO_LOOK) {
        aimAt(e, l.rect)
        return
      }
      l.looking = true
      runtime.input.touchAim.active = false
    }
    runtime.input.lookX += e.clientX - l.x
    runtime.input.lookY += e.clientY - l.y
    l.x = e.clientX
    l.y = e.clientY
  }
  const onLookUp = (e) => {
    if (look.current.id !== e.pointerId) return
    look.current.id = null
    runtime.input.touchAim.active = false
  }

  return (
    <>
      {inRun && (
        <div
          className="absolute inset-0 z-10 touch-none"
          onPointerDown={onLookDown}
          onPointerMove={onLookMove}
          onPointerUp={onLookUp}
          onPointerCancel={onLookUp}
        />
      )}
      <div className="absolute bottom-0 left-0 z-10 h-[62%] w-[42%] touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div
          ref={baseRef}
          className="touch-joy-rest pointer-events-none absolute rounded-full border-4 border-white/70 bg-black/25"
          style={{ width: RADIUS * 2, height: RADIUS * 2, opacity: 0.35, left: RADIUS }}
        >
          <div ref={knobRef} className="absolute rounded-full border-4 border-black/40 bg-white/90 shadow-lg" style={{ width: RADIUS, height: RADIUS, left: RADIUS / 2, top: RADIUS / 2 }} />
        </div>
      </div>

      {inRun && (
        <HoldButton label="Unscrew" className="touch-use" size={104} gradient={GRADIENTS.goldButton} inputKey="use">
          <Icon name="driver" size={44} />
          <span style={{ fontSize: 16, lineHeight: 1 }}>
            <StrokeText stroke={4}>USE</StrokeText>
          </span>
        </HoldButton>
      )}

      <HoldButton label="Jump" className="touch-jump" size={70} gradient={GRADIENTS.slate} inputKey="jump">
        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="3.5">
          <path d="M5 15l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </HoldButton>
    </>
  )
}

export default TouchControls
