import { useCallback, useEffect } from 'react'

import { formatDistance, formatNumber } from '@shared/format'
import { zoneIndexAt } from '@shared/logic'

import { sfx } from '../../audio/sfx'
import { setRollHudElement } from '../../game/roll/hudLink'
import { useGame } from '../../store/game'
import { zones } from '../../game/worldLook'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { GRADIENTS, u } from './style'

/**
 * While your phone falls: the depth in big numbers at the top, "-1,234 m", the name of the
 * floor it's smashing into under it, and down the right a tall depth bar with your phone
 * sliding down it and a BEST mark where your deepest drop got to. All written straight to
 * the DOM from the frame loop (see hudLink), never through React - and the whole counter
 * is contained, so those writes re-lay-out this box alone.
 */
const DISTANCE_GRADIENT = 'linear-gradient(180deg, #ffffff 0%, #e0faff 45%, #9fd8ff 100%)'
const BAR_HEIGHT = 560

function DistanceCounter() {
  // A callback ref: registered when the element mounts, cleared when it unmounts.
  const ref = useCallback((el) => setRollHudElement(el), [])
  const roll = useGame((s) => s.roll)
  const prevBest = roll?.prevBest || 0
  const scale = Math.max(roll?.distance || 0, prevBest, 400) * 1.12
  return (
    <div ref={ref} className="pointer-events-none absolute inset-0" style={{ contain: 'layout style' }}>
      <div className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ top: u(40) }}>
        <span className="pp-text" style={{ fontSize: u(116), lineHeight: 1 }}>
          <span data-distance aria-hidden="true" className="pp-text-stroke" style={{ WebkitTextStrokeWidth: u(22) }}>
            0 m
          </span>
          <span data-distance className="pp-text-fill" style={{ backgroundImage: DISTANCE_GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
            0 m
          </span>
        </span>
        <span className="pp-text" style={{ fontSize: u(70), marginTop: u(4) }}>
          <span data-zone aria-hidden="true" className="pp-text-stroke" style={{ WebkitTextStrokeWidth: u(14) }} />
          <span data-zone data-zone-fill className="pp-text-fill" style={{ WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }} />
        </span>
      </div>
      {/* The depth bar down the right: sky blue to the roof, then the hotel. */}
      <div className="absolute" style={{ right: u(60), top: u(150), width: u(30), height: u(BAR_HEIGHT) }}>
        <div className="absolute inset-0" style={{ border: `${u(5)} solid #111`, borderRadius: u(16), background: 'linear-gradient(180deg, #ffd21f 0%, #ffb21f 18%, #2a2f3a 22%, #1d1f22 100%)' }} />
        {prevBest > 0 && (
          <div className="absolute flex items-center" style={{ right: u(-6), top: `${Math.min(100, (prevBest / scale) * 100)}%`, transform: 'translateY(-50%)', gap: u(6) }}>
            <span className="flex items-center justify-center" style={{ fontSize: u(28), padding: `${u(2)} ${u(12)}`, borderRadius: u(14), border: `${u(4)} solid #111`, background: GRADIENTS.goldButton, marginRight: u(4) }}>
              <StrokeText stroke={u(6)}>BEST</StrokeText>
            </span>
            <span style={{ width: u(40), height: u(6), background: '#ffffff', border: `${u(2)} solid #111` }} />
          </div>
        )}
        {/* The marker rides a track as tall as the bar, slid by a transform (a % of the
            track's own height): moving it never needs a layout. */}
        <div data-zone-marker className="absolute inset-0" style={{ willChange: 'transform' }}>
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
            <Icon name="tire" size={u(78)} />
          </div>
        </div>
      </div>
    </div>
  )
}

/** How many trophies fly to the Wins counter, and where each bursts out to first. */
const FLYERS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2 + 0.3
  const r = 110 + (i % 3) * 45
  return { sx: Math.cos(a) * r, sy: Math.sin(a) * r * 0.7, delay: 0.35 + i * 0.06 }
})

/**
 * The Wins flying home: a ring of trophies bursts out of the result and streams into
 * the Wins counter in the top-left (which bumps as they land - see StatsPanel), with a
 * coin ping for each.
 */
function FlyingTrophies() {
  useEffect(() => sfx.coins(FLYERS.length), [])
  return FLYERS.map((f, i) => (
    <span
      key={i}
      className="pp-fly pointer-events-none absolute left-1/2 top-[48%]"
      style={{ '--sx': u(f.sx), '--sy': u(f.sy), animationDelay: `${f.delay}s` }}
    >
      <Icon name="trophy" size={u(70)} />
    </span>
  ))
}

/**
 * Once the phone stops: "1,433 m" with the floor it smashed down to and "+60 Wins" under
 * it, and a big tilted NEW BEST! over them when it's your deepest drop yet (by how much).
 */
function RollResult({ result }) {
  const floor = zones()[zoneIndexAt(result.distance)]
  const gained = result.prevBest > 0 ? result.distance - result.prevBest : 0
  return (
    <>
      <FlyingTrophies key={`fly-${result.id}`} />
      {/* Centred by the pp-result animation's own transform. */}
      <div key={result.id} className="pp-result pointer-events-none absolute left-1/2 top-[47%] flex flex-col items-center">
        <div style={{ fontSize: u(118), transform: 'rotate(-4deg)' }}>
          <StrokeText stroke={u(22)} gradient={GRADIENTS.gold}>
            {formatDistance(result.distance)}
          </StrokeText>
        </div>
        {floor && (
          <div style={{ fontSize: u(60), transform: 'rotate(-4deg)' }}>
            <StrokeText stroke={u(12)} gradient={DISTANCE_GRADIENT}>
              {floor.name}
            </StrokeText>
          </div>
        )}
        <div className="flex items-center" style={{ gap: u(12), fontSize: u(84), transform: 'rotate(-4deg)' }}>
          <Icon name="trophy" size={u(110)} />
          <StrokeText stroke={u(16)} gradient={GRADIENTS.gold}>
            +{formatNumber(result.wins + result.prize)}
          </StrokeText>
        </div>
        {result.best && (
          <div className="flex flex-col items-center" style={{ marginTop: u(10) }}>
            <div style={{ fontSize: u(120), transform: 'rotate(-6deg)' }}>
              <StrokeText stroke={u(22)} gradient={GRADIENTS.rainbow}>
                NEW BEST!
              </StrokeText>
            </div>
            {gained > 0 && (
              <div style={{ fontSize: u(56) }}>
                <StrokeText stroke={u(11)} gradient={GRADIENTS.gold}>
                  {formatDistance(result.distance)} (+{formatDistance(gained)})
                </StrokeText>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

/** How long a toast stays up. */
const TOAST_MS = 3500

/** A celebration banner across the middle: a new floor, an ad reward, a Gems purchase. */
function Toast() {
  const toast = useGame((s) => s.toast)
  useEffect(() => {
    if (!toast) return undefined
    const id = setTimeout(() => {
      if (useGame.getState().toast === toast) useGame.setState({ toast: null })
    }, TOAST_MS)
    return () => clearTimeout(id)
  }, [toast])
  if (!toast) return null
  return (
    <div
      key={toast.id}
      className="pp-result pointer-events-none absolute left-1/2 top-[22%] flex flex-col items-center text-center"
      style={{ fontSize: u(60), animationDuration: `${TOAST_MS}ms`, width: 'max-content', maxWidth: '92vw' }}
    >
      <StrokeText stroke={u(12)} gradient={GRADIENTS.gold} style={{ whiteSpace: 'normal' }}>
        {toast.text}
      </StrokeText>
    </div>
  )
}

export function RollOverlay() {
  // The depth counter is for the fall; the result takes over once the phone stops.
  const rolling = useGame((s) => Boolean(s.roll && !s.rollResult))
  const result = useGame((s) => s.rollResult)
  return (
    <>
      {rolling && <DistanceCounter />}
      {result && <RollResult result={result} />}
      <Toast />
    </>
  )
}

export default RollOverlay
