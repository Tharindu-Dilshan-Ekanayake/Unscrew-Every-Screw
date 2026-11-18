import { useProgress } from '@react-three/drei'
import { useEffect, useState } from 'react'

import { iconUrl } from './icons'
import StrokeText from './StrokeText'

const TIPS = [
  'Hold click on a screw to unscrew it (on a phone: touch and hold it). Every screw goes in your bag!',
  'Bag full? Walk onto the SELL hopper to turn screws into cash.',
  'Gold screws sell for 15 plain ones. Keep your eyes open!',
  'Crystal screws glow blue - they give Crystals for permanent Perks.',
  'The Turbo Ratchet unscrews nine screws at once.',
  'Remove EVERY screw to open the exit door.',
  'Upgrade your Hand Speed early - it pays for itself.',
  'Clear a chapter on Normal to unlock Hard (and more Crystals).',
  'Leaving mid-run is fine: your run is saved, LOAD it from a play pad.',
  'Perks like Helper Drone keep working in every run.',
]

/**
 * The loading screen's backdrop in plain CSS (no image to download): a workshop wall of
 * screw heads in rows, under a warm glow.
 */
const BACKDROP = [
  'radial-gradient(circle at 50% 38%, rgba(255,214,140,0.55) 0%, transparent 55%)',
  'radial-gradient(circle at 24px 24px, #d9dee5 0 9px, #8f98a4 9.5px 11px, transparent 11.5px) 0 0 / 48px 48px',
  'linear-gradient(180deg, #2a3350 0%, #1a2036 100%)',
].join(', ')

/**
 * Full-screen loading overlay. Progress is drei's asset loader progress, blended with a
 * time-based creep so a single large download never looks frozen, and it only reaches
 * 100% when the game reports ready (avatar in place, first frame drawn).
 *
 * @param {{ done: boolean }} props
 */
export function LoadingScreen({ done }) {
  const { progress } = useProgress()
  const [creep, setCreep] = useState(0)
  const [hidden, setHidden] = useState(false)
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)])

  useEffect(() => {
    if (done) return undefined
    const id = setInterval(() => setCreep((c) => Math.min(90, c + (90 - c) * 0.06)), 120)
    return () => clearInterval(id)
  }, [done])

  useEffect(() => {
    if (!done) return undefined
    const id = setTimeout(() => setHidden(true), 450)
    return () => clearTimeout(id)
  }, [done])

  if (hidden) return null
  const shown = done ? 100 : Math.max(creep, Math.min(95, progress * 0.95))

  return (
    <div
      className="pp-font absolute inset-0 z-[100] flex flex-col items-center justify-center gap-8 transition-opacity duration-500"
      style={{
        opacity: done ? 0 : 1,
        background: BACKDROP,
      }}
    >
      <div className="pp-loading-disc" aria-hidden="true">
        <img src={iconUrl('screw')} alt="" width="150" height="150" draggable={false} />
      </div>

      {/* The game's name, tilted like a sticker. */}
      <h1 className="m-0 flex flex-col items-center text-center leading-none" style={{ transform: 'rotate(-3deg)' }}>
        <span style={{ fontSize: 'clamp(40px, 9vw, 104px)' }}>
          <StrokeText stroke="0.16em" gradient="linear-gradient(180deg, #ffffff 0%, #ffffff 55%, #ffe36b 56%, #ffb21e 100%)">
            Unscrew 
          </StrokeText>
        </span>
        <span style={{ fontSize: 'clamp(40px, 9vw, 104px)', marginTop: '-0.08em' }}>
          <StrokeText stroke="0.15em" gradient="linear-gradient(180deg, #e6fdff 0%, #5fe6ff 50%, #1f8fff 100%)">
            Every Screw
          </StrokeText>
        </span>
        <span className="text-base md:text-xl" style={{ marginTop: '0.4em' }}>
          <StrokeText stroke={5}>UNSCREW • SELL • UPGRADE • ESCAPE</StrokeText>
        </span>
      </h1>

      <div className="w-[min(560px,80vw)]">
        <div className="relative h-9 overflow-hidden rounded-xl border-4 border-black bg-black/40">
          <div
            // Scaled, not resized: it moves while the game is starting up, and a transform
            // never needs a layout.
            className="h-full origin-left rounded-md transition-transform duration-200"
            style={{ transform: `scaleX(${shown / 100})`, background: 'linear-gradient(180deg, #fff27a 0%, #ffc61e 50%, #ff9a12 100%)' }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-lg">
            <StrokeText stroke={5}>{done ? 'READY!' : `LOADING ${Math.round(shown)}%`}</StrokeText>
          </div>
        </div>
        <p className="mt-4 text-center text-base md:text-lg">
          <StrokeText stroke={4}>{tip}</StrokeText>
        </p>
      </div>
    </div>
  )
}

export default LoadingScreen
