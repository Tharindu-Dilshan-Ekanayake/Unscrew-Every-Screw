import { useEffect, useRef, useState } from 'react'

import { CHAPTERS, DIFFICULTIES, TOOLS, TUTORIAL, UPGRADE_IDS } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { getLayout } from '@shared/layout'
import { adReady, bagCapacity, chapterIndex, speedBoosted, toolPrice, upgradeCost } from '@shared/logic'

import { sfx } from '../../audio/sfx'
import { isRewardedAvailable, watchRewardedAd } from '../../bloxity/services'
import { fp } from '../../game/stage/fpInput'
import { runtime } from '../../game/runtime'
import { pickToolSlot } from '../../game/toolActions'
import { useGame } from '../../store/game'
import { useQuality } from '../../store/quality'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import useNow from '../useNow'
import { AlertBadge, ChunkyButton } from './parts'
import { GRADIENTS, u } from './style'
import { CrystalCounter, RoundButton } from './TopBar'

const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds))
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

/** The run's clock, ticking smoothly between the server's updates. */
function useRunClock() {
  const time = useGame((s) => s.profile.run?.time || 0)
  const [anchor, setAnchor] = useState(() => ({ time, at: Date.now() }))
  const now = useNow(1000)
  if (anchor.time !== time) setAnchor({ time, at: now })
  return anchor.time + Math.max(0, now - anchor.at) / 1000
}

/** Top-left: the chapter, which room, and how much of it is unscrewed. */
function RoomProgress() {
  const run = useGame((s) => s.profile.run)
  const ci = chapterIndex(run.chapter)
  const chapter = CHAPTERS[ci]
  const count = getLayout(ci, run.room).count
  const pct = Math.floor(((count - run.left) / count) * 100)
  return (
    <div className="absolute" style={{ left: u(22), top: u(92), width: u(420) }}>
      <div style={{ fontSize: u(26) }}>
        <StrokeText stroke={u(6)} fill="#cfd8ff">
          {chapter.name} · {DIFFICULTIES[run.diff].name}
        </StrokeText>
      </div>
      <div style={{ fontSize: u(40) }}>
        <StrokeText stroke={u(8)} gradient={GRADIENTS.gold}>
          ROOM {run.room + 1} / {chapter.rooms.length}
        </StrokeText>
      </div>
      <div style={{ fontSize: u(28), marginTop: u(-2) }}>
        <StrokeText stroke={u(6)}>{chapter.rooms[run.room]?.name}</StrokeText>
      </div>
      <div className="flex items-center" style={{ gap: u(10), marginTop: u(4) }}>
        <div className="relative flex-1 overflow-hidden" style={{ height: u(24), borderRadius: u(14), background: '#1b1d22', border: `${u(4)} solid #111` }}>
          <div style={{ width: `${pct}%`, height: '100%', background: GRADIENTS.barFill, transition: 'width 200ms' }} />
        </div>
        <span style={{ fontSize: u(28) }}>
          <StrokeText stroke={u(6)} gradient={GRADIENTS.gold}>
            {pct}%
          </StrokeText>
        </span>
      </div>
      <div style={{ fontSize: u(24), marginTop: u(4) }}>
        <StrokeText stroke={u(5)}>{run.left > 0 ? `${formatNumber(run.left)} screws to go` : 'Every screw is out!'}</StrokeText>
      </div>
    </div>
  )
}

/** Top-centre: what to do now - the tutorial's next step, or the room's goal. */
function Objective() {
  const step = useGame((s) => s.profile.tutorialStep)
  const left = useGame((s) => s.profile.run?.left ?? 1)
  const screws = useGame((s) => s.profile.stats.screws)
  const isMobile = useQuality((s) => s.isMobile)
  let text = left === 0 ? 'The exit is open! Walk through the door' : 'Unscrew every screw to open the exit!'
  if (step < TUTORIAL.length && left > 0) {
    const t = TUTORIAL[step]
    // On a touchscreen there's no click: it's the USE button.
    const line = isMobile ? t.text.replace('Hold click on one', 'Touch and hold one') : t.text
    text = t.count ? `${line} ${Math.min(screws, t.count)}/${t.count}` : line
  }
  return (
    <div className="hud-topcenter absolute left-1/2 -translate-x-1/2 text-center" style={{ fontSize: u(46), width: 'max-content', maxWidth: '88vw' }}>
      <StrokeText key={text} stroke={u(9)} className="pp-bump" gradient={left === 0 ? GRADIENTS.cash : undefined} style={{ whiteSpace: 'normal' }}>
        {text}
      </StrokeText>
    </div>
  )
}

/** Top-right: Crystals, the clock, back to the lobby, settings. */
function RunTopBar() {
  const clock = useRunClock()
  const openPanel = useGame((s) => s.openPanel)
  return (
    <div className="pointer-events-none absolute flex items-center" style={{ right: u(16), top: u(14), gap: u(12) }}>
      <CrystalCounter size={38} />
      <div className="flex items-center" style={{ gap: u(6), fontSize: u(36) }}>
        <Icon name="clock" size={u(40)} />
        <StrokeText stroke={u(7)}>{formatTime(clock)}</StrokeText>
      </div>
      <RoundButton icon="home" label="Back to the lobby (your run is saved)" onClick={() => openPanel('leave')} iconSize={38} gradient={GRADIENTS.redButton} />
      <RoundButton icon="settings" label="Settings" onClick={() => openPanel('settings')} iconSize={42} />
    </div>
  )
}

/**
 * The crosshair: a dot, and round it a ring that fills as your tool turns a screw - red
 * when it's out of reach. Moved by its own animation frame from runtime.aim, never
 * through React.
 */
/** How far above a finger the progress ring sits while it holds a screw (so it shows). */
const TOUCH_RING_LIFT = 70

function Crosshair() {
  const wrapRef = useRef(null)
  const ringRef = useRef(null)
  const dotRef = useRef(null)
  useEffect(() => {
    let id = 0
    let last = ''
    const loop = () => {
      id = requestAnimationFrame(loop)
      const aim = runtime.aim
      const ring = ringRef.current
      const dot = dotRef.current
      const wrap = wrapRef.current
      if (!ring || !dot || !wrap) return
      // A finger on a screw: the ring follows it, just above (fingers hide what's under them).
      const touch = runtime.input.touchAim
      const at = touch.active ? `${Math.round(touch.x)}px:${Math.round(touch.y - TOUCH_RING_LIFT)}px` : '50%:50%'
      const p = Math.round(aim.progress * 100)
      const state = `${p}:${aim.target >= 0}:${aim.tooFar}:${at}`
      if (state === last) return
      last = state
      const [left, top] = at.split(':')
      wrap.style.left = left
      wrap.style.top = top
      ring.style.background = p > 0 ? `conic-gradient(#ffd23a ${p}%, rgba(255,255,255,0.18) ${p}%)` : 'transparent'
      dot.style.background = aim.tooFar ? '#ff5a4a' : aim.target >= 0 ? '#ffd23a' : '#ffffff'
      dot.style.transform = `scale(${aim.target >= 0 ? 1.35 : 1})`
    }
    loop()
    return () => cancelAnimationFrame(id)
  }, [])
  const size = 54
  return (
    <div ref={wrapRef} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: '50%', top: '50%', width: u(size), height: u(size) }}>
      <div
        ref={ringRef}
        className="absolute inset-0 rounded-full"
        style={{ WebkitMask: `radial-gradient(circle, transparent ${u(size * 0.3)}, #000 ${u(size * 0.32)})`, mask: `radial-gradient(circle, transparent ${u(size * 0.3)}, #000 ${u(size * 0.32)})` }}
      />
      <div
        ref={dotRef}
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{ width: u(10), height: u(10), marginLeft: u(-5), marginTop: u(-5), background: '#fff', border: `${u(2)} solid #111`, transition: 'transform 80ms' }}
      />
    </div>
  )
}

/** Bottom-left: your cash, and the bag - full, it flashes. */
function Wallet() {
  const cash = useGame((s) => s.profile.run?.cash || 0)
  const bag = useGame((s) => s.profile.run?.bag || 0)
  const capacity = useGame((s) => bagCapacity(s.profile))
  const full = bag >= capacity
  return (
    <div className="hud-wallet absolute" style={{ left: u(24), bottom: u(28) }}>
      <div className="flex items-center" style={{ gap: u(10), fontSize: u(64) }}>
        <Icon name="cash" size={u(70)} />
        <StrokeText stroke={u(11)} gradient={GRADIENTS.cash}>
          ${formatNumber(cash)}
        </StrokeText>
      </div>
      <div className="flex items-center" style={{ gap: u(10), fontSize: u(46), marginTop: u(4) }}>
        <Icon name="bag" size={u(58)} />
        <StrokeText key={full ? 'full' : bag} stroke={u(9)} gradient={full ? GRADIENTS.priceShort : undefined} className={full ? 'pp-pulse-text' : 'pp-bump'}>
          {formatNumber(bag)} / {formatNumber(capacity)}
        </StrokeText>
        {full && (
          <span style={{ fontSize: u(28) }}>
            <StrokeText stroke={u(6)} fill="#ff8a7a">
              FULL - go SELL!
            </StrokeText>
          </span>
        )}
      </div>
    </div>
  )
}

/** Bottom-centre: your four tools. Locked ones show their price; tap (or 1-4) to buy or equip. */
function Hotbar() {
  const run = useGame((s) => s.profile.run)
  const profile = useGame((s) => s.profile)
  return (
    <div className="hud-hotbar pointer-events-none absolute left-1/2 flex -translate-x-1/2" style={{ bottom: u(18), gap: u(10) }}>
      {TOOLS.map((tool, i) => {
        const owned = run.tools.includes(tool.id)
        const active = run.tool === tool.id
        const price = toolPrice(profile, tool.id)
        const afford = run.cash >= price
        return (
          <button
            key={tool.id}
            type="button"
            title={`${tool.name}: ${tool.blurb}`}
            onClick={() => pickToolSlot(i)}
            className="pp-btn pointer-events-auto relative flex flex-col items-center justify-center"
            style={{
              width: u(104),
              height: u(104),
              borderRadius: u(12),
              background: active ? 'linear-gradient(180deg, #4a90ff, #1f5fd8)' : 'rgba(20, 24, 34, 0.72)',
              border: `${u(4)} solid ${active ? '#ffffff' : '#111'}`,
              boxShadow: active ? `0 0 ${u(14)} rgba(80,160,255,0.8)` : 'none',
            }}
          >
            <span className="absolute" style={{ left: u(7), top: u(2), fontSize: u(22) }}>
              <StrokeText stroke={u(5)}>{i + 1}</StrokeText>
            </span>
            <Icon name={tool.id} size={u(62)} style={{ opacity: owned ? 1 : 0.45 }} />
            {!owned && (
              <>
                <Icon name="lock" size={u(28)} className="absolute" style={{ right: u(6), top: u(6) }} />
                <span style={{ fontSize: u(22), marginTop: u(-4) }}>
                  <StrokeText stroke={u(5)} gradient={afford ? GRADIENTS.cash : GRADIENTS.priceShort}>
                    ${formatNumber(price)}
                  </StrokeText>
                </span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Right side: UPGRADE (B), and a free x2 speed for an ad when Boxity has one. */
function SideButtons() {
  const openPanel = useGame((s) => s.openPanel)
  const canUpgrade = useGame((s) => UPGRADE_IDS.some((id) => upgradeCost(s.profile, id) <= (s.profile.run?.cash || 0)))
  const profile = useGame((s) => s.profile)
  const now = useNow(1000)
  const [watching, setWatching] = useState(false)
  const boosted = speedBoosted(profile, now)
  const showAd = isRewardedAvailable() && (boosted || adReady(profile, 'speed-boost', now))
  return (
    <div className="hud-side pointer-events-none absolute flex flex-col items-center" style={{ right: u(28), top: '42%', gap: u(22) }}>
      <div className="relative flex flex-col items-center">
        <ChunkyButton
          gradient={GRADIENTS.blueButton}
          onClick={() => {
            sfx.click()
            openPanel('upgrades')
          }}
          title="Upgrades (B)"
          radius={22}
          style={{ width: u(112), height: u(112) }}
        >
          <Icon name="upgrade" size={u(76)} />
        </ChunkyButton>
        {canUpgrade && <AlertBadge size={34} style={{ top: u(-10), right: u(-8) }} />}
        <span style={{ fontSize: u(28), marginTop: u(2) }}>
          <StrokeText stroke={u(6)}>UPGRADE</StrokeText>
        </span>
      </div>
      {showAd && (
        <div className="relative flex flex-col items-center">
          <ChunkyButton
            gradient={boosted ? GRADIENTS.greyButton : GRADIENTS.goldButton}
            disabled={boosted || watching}
            onClick={async () => {
              setWatching(true)
              await watchRewardedAd('speed-boost')
              setWatching(false)
            }}
            title="Watch an ad: x2 speed for 3 minutes"
            radius={22}
            style={{ width: u(100), height: u(100) }}
          >
            <Icon name="speed" size={u(66)} />
          </ChunkyButton>
          <span style={{ fontSize: u(24), marginTop: u(2) }}>
            <StrokeText stroke={u(5)}>{boosted ? `x2 ${Math.ceil((profile.boosts.speedUntil - now) / 1000)}s` : 'FREE x2'}</StrokeText>
          </span>
        </div>
      )}
    </div>
  )
}

/** Desktop, pointer not captured: how to start. */
/** A key on the keyboard, for the controls card. */
function KeyCap({ children }) {
  return (
    <span className="inline-flex items-center justify-center" style={{ minWidth: u(46), height: u(46), padding: `0 ${u(10)}`, borderRadius: u(9), background: 'linear-gradient(180deg, #ffffff 0%, #d6dce8 100%)', border: `${u(3)} solid #0b0c0e`, boxShadow: `0 ${u(4)} 0 #0b0c0e`, fontSize: u(22), color: '#1d2440' }}>
      {children}
    </span>
  )
}

/** A mouse with its left button lit: click (and hold) that. */
function MouseIcon() {
  return (
    <span className="relative inline-block overflow-hidden" style={{ width: u(38), height: u(54), borderRadius: u(19), background: '#ffffff', border: `${u(3)} solid #0b0c0e`, boxShadow: `0 ${u(4)} 0 #0b0c0e` }}>
      <span className="pp-pulse-text absolute left-0 top-0" style={{ width: '50%', height: '45%', background: '#ffc21a', borderRight: `${u(2)} solid #0b0c0e`, borderBottom: `${u(2)} solid #0b0c0e` }} />
      <span className="absolute left-1/2 top-0" style={{ width: '50%', height: '45%', borderBottom: `${u(2)} solid #0b0c0e` }} />
    </span>
  )
}

const CONTROLS = [
  { keys: ['mouse'], label: 'Aim · hold to unscrew' },
  { keys: ['W', 'A', 'S', 'D'], label: 'Move' },
  { keys: ['1-4'], label: 'Tools' },
  { keys: ['B'], label: 'Upgrades' },
  { keys: ['Esc'], label: 'Free the mouse' },
]

/**
 * Before the mouse is captured (and again after Esc): CLICK TO PLAY, with the controls.
 * The card lets clicks through - clicking anywhere captures the mouse and starts. Where
 * the browser won't capture it (drag to look instead), the first click puts it away.
 */
function ClickToPlay() {
  const isMobile = useQuality((s) => s.isMobile)
  const panel = useGame((s) => s.panel)
  const [locked, setLocked] = useState(fp.locked)
  const [clicked, setClicked] = useState(false)
  useEffect(() => {
    const onChange = () => {
      const now = Boolean(document.pointerLockElement)
      setLocked(now)
      if (!now) setClicked(false)
    }
    const onDown = (e) => {
      if (e.pointerType !== 'touch' && e.button === 0) setClicked(true)
    }
    document.addEventListener('pointerlockchange', onChange)
    window.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('pointerlockchange', onChange)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [])
  if (isMobile || locked || clicked || panel) return null
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ background: 'radial-gradient(circle at 50% 50%, rgb(0 0 0 / 0) 25%, rgb(0 0 0 / 0.45) 100%)' }}>
      <div className="pp-panel-in flex flex-col items-center text-center" style={{ padding: `${u(18)} ${u(30)}`, borderRadius: u(18), background: 'linear-gradient(180deg, rgb(30 36 54 / 0.92), rgb(16 20 32 / 0.92))', border: `${u(5)} solid #0b0c0e`, gap: u(12), maxWidth: '92vw' }}>
        <span style={{ fontSize: u(58), lineHeight: 1 }}>
          <StrokeText stroke={u(10)} gradient={GRADIENTS.gold} className="pp-pulse-text">
            CLICK TO PLAY
          </StrokeText>
        </span>
        <div className="flex flex-wrap items-start justify-center" style={{ gap: `${u(12)} ${u(22)}` }}>
          {CONTROLS.map((c) => (
            <div key={c.label} className="flex flex-col items-center" style={{ gap: u(8) }}>
              <div className="flex items-center" style={{ gap: u(5), height: u(58) }}>
                {c.keys.map((k) => (k === 'mouse' ? <MouseIcon key={k} /> : <KeyCap key={k}>{k}</KeyCap>))}
              </div>
              <span style={{ fontSize: u(20) }}>
                <StrokeText stroke={u(4)} fill="#cfd8ff">
                  {c.label}
                </StrokeText>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** The pedestal you're at: what its tool costs, and a button to buy it (or E). */
function PedestalPrompt() {
  const pedestal = useGame((s) => s.zone.pedestal)
  const run = useGame((s) => s.profile.run)
  const profile = useGame((s) => s.profile)
  if (pedestal < 0 || !run) return null
  const tool = TOOLS[pedestal + 1]
  if (!tool || run.tools.includes(tool.id)) return null
  const price = toolPrice(profile, tool.id)
  return (
    <div className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ bottom: u(170), gap: u(6) }}>
      <span style={{ fontSize: u(30) }}>
        <StrokeText stroke={u(6)}>{tool.blurb}</StrokeText>
      </span>
      <ChunkyButton gradient={run.cash >= price ? GRADIENTS.greenButton : GRADIENTS.greyButton} onClick={() => pickToolSlot(pedestal + 1)} style={{ padding: `${u(8)} ${u(26)}` }}>
        <span style={{ fontSize: u(34) }}>
          <StrokeText stroke={u(7)}>
            Buy {tool.name} ${formatNumber(price)} [E]
          </StrokeText>
        </span>
      </ChunkyButton>
    </div>
  )
}

/** Everything on screen inside a run. */
export function RunHUD() {
  const active = useGame((s) => Boolean(s.profile.run?.active))
  if (!active) return null
  return (
    <>
      <RoomProgress />
      <Objective />
      <RunTopBar />
      <Crosshair />
      <Wallet />
      <Hotbar />
      <SideButtons />
      <PedestalPrompt />
      <ClickToPlay />
    </>
  )
}

export default RunHUD
