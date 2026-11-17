import { useCallback, useEffect, useRef, useState } from 'react'

import { HIT_GRADES, hitGrade, hitReach } from '@shared/balance'

import { sfx } from '../../audio/sfx'
import { cancelPull, grab, launch, letGo } from '../../game/launch'
import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { ChunkyButton } from './parts'
import { GRADIENTS, u } from './style'

/** With Auto Drop on, the next throw starts this long after you're back in the zone. */
const AUTO_DELAY_MS = 700
/** Auto Drop lets go this long after the meter fills. */
const AUTO_HOLD_MS = 150
/** A press is ignored this soon after the last (a double tap, a bouncing key). */
const PRESS_COOLDOWN_MS = 250
/** Keys that hold DROP. */
const DROP_KEYS = new Set(['KeyE', 'Enter', 'KeyF'])

/** The meter's coloured bands, from the grades: each runs from its `min` to the top. */
const BANDS = HIT_GRADES.filter((g) => g.min > 0).map((g) => ({ id: g.id, from: g.min }))
const BAND_COLORS = {
  perfect: 'linear-gradient(180deg, #fff6a3 0%, #ffd21f 55%, #ff9c00 100%)',
  great: 'linear-gradient(180deg, #d9ff9a 0%, #5fe83a 55%, #1fb52a 100%)',
  good: 'linear-gradient(180deg, #bff4ff 0%, #4fc8ff 55%, #1f8ae0 100%)',
}
/** Each grade's colour for the live label over the meter. */
const GRADE_COLORS = { perfect: '#ffd21f', great: '#7dff4a', good: '#9fe8ff', weak: '#ff6a5a' }

/**
 * The DROP ZONE's HUD: the big DROP! button and, while you hold it, the throw meter.
 * Hold DROP (or E / Enter) and you step up to the edge and wind up: the meter charges and,
 * once full, wobbles off the top. Let go to throw: the fuller the meter, the deeper the
 * phone smashes and the more it pays (HIT_GRADES) - let go right at the top of a wobble
 * for PERFECT. With the Auto Drop pass, a toggle under it throws for you every time
 * you're back (a plain drop, no meter). Jumping gives the throw up.
 *
 * The meter is moved straight on the DOM every animation frame (the player keeps
 * launch.charge up to date); React only hears about starting and letting go.
 */
export function RollButton() {
  const near = useGame((s) => s.zone.atPosts && !s.roll && !s.rollResult && !s.panel)
  const ownsAuto = useGame((s) => Boolean(s.profile.passes.autoRoll))
  const autoOn = useGame((s) => Boolean(s.profile.passes.autoRoll && s.profile.settings.autoRoll))
  /** Winding up right now (mirrors launch.gripping for React). */
  const [gripping, setGripping] = useState(false)
  const [auto, setAuto] = useState(false)
  const lastPress = useRef(-Infinity)
  const fillRef = useRef(null)
  const labelRef = useRef(null)
  const visible = near || gripping

  const doGrab = useCallback((byAuto = false) => {
    if (launch.gripping || launch.released) return
    const now = performance.now()
    if (!byAuto && now - lastPress.current < PRESS_COOLDOWN_MS) return
    lastPress.current = now
    grab(byAuto, now)
    sfx.stretchStart()
    setGripping(true)
    setAuto(byAuto)
  }, [])

  /** Lets go; `plain` sends no meter reading (Auto Drop). */
  const doLetGo = useCallback((plain = false) => {
    if (!launch.gripping) return
    const charge = letGo()
    sfx.stretchStop()
    setGripping(false)
    setAuto(false)
    actions.roll(plain ? undefined : Math.round(charge * 1000) / 1000)
  }, [])

  // A panel opened or the drop started: give the throw up.
  const panel = useGame((s) => s.panel)
  const rolling = useGame((s) => Boolean(s.roll))
  const [blocked, setBlocked] = useState(false)
  if (Boolean(panel || rolling) !== blocked) {
    setBlocked(Boolean(panel || rolling))
    if (panel || rolling) {
      setGripping(false)
      setAuto(false)
    }
  }
  useEffect(() => {
    if (!blocked || !launch.gripping) return
    cancelPull()
    sfx.stretchStop()
  }, [blocked])

  // Keyboard: hold E / Enter / F to wind up, let go to throw.
  useEffect(() => {
    if (!visible) return undefined
    const down = (e) => {
      if (e.repeat || !DROP_KEYS.has(e.code)) return
      doGrab()
    }
    const up = (e) => {
      if (!DROP_KEYS.has(e.code) || launch.auto) return
      doLetGo()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [visible, doGrab, doLetGo])

  // A finger or mouse let go anywhere (not only over the button) throws.
  useEffect(() => {
    if (!gripping || auto) return undefined
    const up = () => doLetGo()
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [gripping, auto, doLetGo])

  // Auto Drop: wind up and throw by itself every time you're back in the zone.
  useEffect(() => {
    if (!near || !autoOn || gripping) return undefined
    const id = setTimeout(() => doGrab(true), AUTO_DELAY_MS)
    return () => clearTimeout(id)
  }, [near, autoOn, gripping, doGrab])

  // The meter, every frame, while winding up (and noticing a jump giving it up).
  useEffect(() => {
    if (!gripping) return undefined
    let raf = 0
    const tick = () => {
      if (!launch.gripping) {
        sfx.stretchStop()
        setGripping(false)
        setAuto(false)
        return
      }
      const charge = launch.charge
      sfx.stretchSet(charge, launch.full)
      if (auto && launch.full && performance.now() - launch.fullSince > AUTO_HOLD_MS) {
        doLetGo(true)
        return
      }
      if (fillRef.current) fillRef.current.style.width = `${charge * 100}%`
      // The grade letting go now would get, in its colour, and how deep it would go:
      // "LET GO! PERFECT x1.5". Both layers of the outlined text (StrokeText).
      const grade = hitGrade(charge)
      const text = launch.full ? `LET GO! ${grade.label.replace(/ THROW|[!.]+$/g, '')} x${hitReach(charge).toFixed(1)}` : 'CHARGING...'
      for (const layer of labelRef.current?.querySelectorAll('.pp-text-stroke, .pp-text-fill') ?? []) layer.textContent = text
      const fill = labelRef.current?.querySelector('.pp-text-fill')
      if (fill) fill.style.color = launch.full ? GRADE_COLORS[grade.id] : '#ffffff'
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [gripping, auto, doLetGo])

  if (!visible) return null
  return (
    <>
      {/* The throw meter, up under the top bar: the middle of the screen is you at the edge. */}
      {gripping && !auto && (
        <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ top: u(150) }}>
          <span ref={labelRef} className="whitespace-nowrap" style={{ fontSize: u(54), color: '#ffffff' }}>
            <StrokeText stroke={u(11)}>CHARGING...</StrokeText>
          </span>
          <div
            className="relative overflow-hidden"
            style={{
              width: u(560),
              height: u(54),
              borderRadius: u(27),
              border: `${u(6)} solid #1b1b1f`,
              background: '#2a1f4a',
              boxShadow: `0 ${u(6)} 0 rgba(0,0,0,0.35)`,
            }}
          >
            {BANDS.map((b) => (
              <div key={b.id} className="absolute top-0 bottom-0" style={{ left: `${b.from * 100}%`, right: 0, background: BAND_COLORS[b.id], opacity: 0.32 }} />
            ))}
            <div
              ref={fillRef}
              className="absolute top-0 bottom-0 left-0"
              style={{
                width: '0%',
                background: 'repeating-linear-gradient(135deg, #4fc8ff 0 14px, #9fe8ff 14px 28px)',
                borderRight: `${u(5)} solid #ffffff`,
              }}
            />
            {BANDS.map((b) => (
              <div key={`${b.id}-mark`} className="absolute top-0 bottom-0" style={{ left: `${b.from * 100}%`, width: u(4), background: '#1b1b1f', opacity: 0.6 }} />
            ))}
          </div>
          <span className="flex items-center" style={{ fontSize: u(32), marginTop: u(10), gap: u(8) }}>
            <Icon name="tire" size={u(40)} />
            <StrokeText stroke={u(7)}>Let go when the meter hits the top for a PERFECT throw!</StrokeText>
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ bottom: u(300) }}>
        {!gripping && (
          <ChunkyButton
            gradient={GRADIENTS.greenButton}
            onPointerDown={(e) => {
              e.preventDefault()
              doGrab()
            }}
            title="Drop your phone (hold, then let go)"
            radius={22}
            border={6}
            style={{ width: u(330), height: u(130), touchAction: 'none' }}
          >
            <span className="flex items-center" style={{ gap: u(10), fontSize: u(78) }}>
              <StrokeText stroke={u(13)}>DROP!</StrokeText>
            </span>
          </ChunkyButton>
        )}
        {!gripping && (
          <span style={{ fontSize: u(30), marginTop: u(10) }}>
            <StrokeText stroke={u(7)}>Hold DROP (or E), let go at the top!</StrokeText>
          </span>
        )}
        {ownsAuto && (
          <ChunkyButton
            gradient={autoOn ? GRADIENTS.goldButton : GRADIENTS.greyButton}
            onClick={() => actions.setSetting('autoRoll', !autoOn)}
            title="Auto Drop"
            radius={10}
            border={4}
            style={{ height: u(56), padding: `0 ${u(20)}`, marginTop: u(12) }}
          >
            <span style={{ fontSize: u(32) }}>
              <StrokeText stroke={u(7)}>Auto Drop: {autoOn ? 'ON' : 'OFF'}</StrokeText>
            </span>
          </ChunkyButton>
        )}
      </div>
    </>
  )
}

export default RollButton
