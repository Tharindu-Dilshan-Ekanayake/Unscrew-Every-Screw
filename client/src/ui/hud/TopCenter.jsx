import { rebirthMultiplier, TUTORIAL } from '@shared/balance'
import { formatDistance, formatNumber } from '@shared/format'
import { isMaxLevel, nextTire, zoneIndexAt } from '@shared/logic'
import { useEffect, useState } from 'react'

import { zones } from '../../game/worldLook'

import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { u } from './style'

const BANNER_GRADIENT = 'linear-gradient(180deg, #fff6a8 0%, #ffd52a 45%, #ffa000 100%)'
const PANEL_GRADIENT = 'linear-gradient(180deg, #ffe45c 0%, #ffc21f 55%, #ff9a12 100%)'
/** The goal banner shows this long, then hides until the next reminder this long after. */
const REMINDER_SHOW_MS = 5000
const REMINDER_EVERY_MS = 60000

/**
 * The tutorial for brand-new players: run, kick, buy a ball - then it's gone for good.
 * A small strip, "1/3" and the step with its progress ("(16/30)"), so the world stays in
 * view; the 3D arrows (TutorialArrows) show where to go.
 */
function TutorialBanner({ step }) {
  const current = TUTORIAL[step]
  const health = useGame((s) => s.profile.health)
  const onZone = useGame((s) => s.zone.rollZone)
  let text = current.text
  if (current.health) text += ` (${formatNumber(Math.min(health, current.health))}/${formatNumber(current.health)})`
  if (current.event === 'roll' && onZone) text = 'Hold DROP, then let go when the meter hits the top!'
  return (
    <div
      className="flex items-center"
      style={{
        gap: u(14),
        padding: `${u(6)} ${u(22)} ${u(6)} ${u(8)}`,
        borderRadius: u(30),
        border: `${u(4)} solid #111`,
        background: PANEL_GRADIENT,
        boxShadow: `0 ${u(4)} 0 rgba(0,0,0,0.3), inset 0 ${u(4)} 0 rgba(255,255,255,0.45)`,
      }}
    >
      <span
        className="flex items-center justify-center"
        style={{ minWidth: u(64), height: u(44), borderRadius: u(22), background: '#111', fontSize: u(26) }}
      >
        <StrokeText stroke={u(5)} gradient={BANNER_GRADIENT}>
          {step + 1}/{TUTORIAL.length}
        </StrokeText>
      </span>
      <span style={{ fontSize: u(34) }}>
        <StrokeText stroke={u(7)} style={{ whiteSpace: 'normal' }}>
          {text}
        </StrokeText>
      </span>
    </div>
  )
}

/**
 * The next goal once the tutorial's done - something close enough to chase: rebirth when
 * you're at max level, else the next phone and how far your Wins are from it, else the
 * next floor past your deepest drop. It pops in for a few seconds and then every minute
 * (Reminder), and straight away when there's a new goal. A tap opens what it's about.
 */
function goalFor(profile, pending) {
  if (isMaxLevel(profile)) {
    return { key: 'rebirth', text: `REBIRTH READY! Rebirth for x${rebirthMultiplier(profile.rebirths + 1)} Skill`, progress: null, panel: 'rebirth' }
  }
  const next = nextTire(profile)
  if (next) {
    const wins = Math.max(0, profile.wins - pending)
    const affordable = wins >= next.cost
    return {
      key: `${affordable ? 'buy' : 'save'}:${next.id}`,
      text: affordable ? `You can buy the ${next.name}! Visit the Phone Shop` : `Next phone: ${next.name} (${formatNumber(wins)}/${formatNumber(next.cost)} Wins)`,
      progress: Math.min(1, wins / Math.max(1, next.cost)),
      panel: null,
    }
  }
  const stages = zones()
  const index = Math.min(stages.length - 1, zoneIndexAt(profile.stats.bestDistance) + 1)
  const nextStage = stages[index]
  return {
    key: `stage:${index}`,
    text: `Next stage: ${nextStage.name} at ${formatDistance(nextStage.start)} (best ${formatDistance(profile.stats.bestDistance)})`,
    progress: Math.min(1, profile.stats.bestDistance / Math.max(1, nextStage.start)),
    panel: null,
  }
}

/**
 * Pops its banner in for REMINDER_SHOW_MS, hides it, and brings it back every
 * REMINDER_EVERY_MS for as long again - a reminder, not a fixture over the game. Given a
 * new `key` (a new goal) it starts over, so a new goal shows straight away.
 */
function Reminder({ children }) {
  const [shown, setShown] = useState(true)
  useEffect(() => {
    let hide = setTimeout(() => setShown(false), REMINDER_SHOW_MS)
    const again = setInterval(() => {
      setShown(true)
      clearTimeout(hide)
      hide = setTimeout(() => setShown(false), REMINDER_SHOW_MS)
    }, REMINDER_EVERY_MS)
    return () => {
      clearTimeout(hide)
      clearInterval(again)
    }
  }, [])
  return (
    <div
      aria-hidden={!shown}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : `translateY(calc(-1 * ${u(24)}))`,
        // Hidden for real once faded, so the banner can't be tapped while it's away.
        visibility: shown ? 'visible' : 'hidden',
        transition: `opacity 300ms ease, transform 300ms ease, visibility 0s linear ${shown ? '0s' : '300ms'}`,
      }}
    >
      {children}
    </div>
  )
}

/**
 * `key` once it has held for `ms`: a goal that flickers for a moment (the Wins and the
 * Wins still to land update a frame apart as a drop starts) isn't a new goal.
 */
function useSettledKey(key, ms = 800) {
  const [settled, setSettled] = useState(key)
  useEffect(() => {
    if (key === settled) return undefined
    const id = setTimeout(() => setSettled(key), ms)
    return () => clearTimeout(id)
  }, [key, settled, ms])
  return settled
}

function GoalBanner() {
  const profile = useGame((s) => s.profile)
  const pending = useGame((s) => s.pendingWins)
  const openPanel = useGame((s) => s.openPanel)
  const { key, text, progress, panel } = goalFor(profile, pending)
  const settledKey = useSettledKey(key)
  return (
    <Reminder key={settledKey}>
      <GoalCard text={text} progress={progress} panel={panel} openPanel={openPanel} />
    </Reminder>
  )
}

function GoalCard({ text, progress, panel, openPanel }) {
  return (
    <button
      type="button"
      onClick={panel ? () => openPanel(panel) : undefined}
      className={`${panel ? 'pp-btn pointer-events-auto' : ''} relative flex flex-col items-center overflow-hidden`}
      style={{
        padding: `${u(6)} ${u(24)} ${u(progress === null ? 6 : 14)}`,
        borderRadius: u(30),
        border: `${u(4)} solid #111`,
        background: panel ? 'linear-gradient(180deg, #b4efff 0%, #4cb8ff 50%, #2477e8 100%)' : PANEL_GRADIENT,
        boxShadow: `0 ${u(4)} 0 rgba(0,0,0,0.3), inset 0 ${u(4)} 0 rgba(255,255,255,0.45)`,
      }}
    >
      <span style={{ fontSize: u(32) }}>
        <StrokeText stroke={u(7)} style={{ whiteSpace: 'normal' }}>
          {text}
        </StrokeText>
      </span>
      {progress !== null && (
        <span className="absolute bottom-0 left-0 right-0" style={{ height: u(8), background: 'rgba(0,0,0,0.35)' }}>
          <span className="block h-full origin-left" style={{ transform: `scaleX(${progress})`, background: '#3fe05a' }} />
        </span>
      )}
    </button>
  )
}

/**
 * Top centre: the tutorial while there is one, then the next goal (GoalBanner). (The
 * playtime gift lives on the left menu: GiftTile.)
 */
export function TopCenter() {
  const step = useGame((s) => s.profile.tutorialStep)
  return (
    <div className="hud-topcenter pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ width: 'max-content', maxWidth: '90vw' }}>
      {TUTORIAL[step] ? <TutorialBanner step={step} /> : <GoalBanner />}
    </div>
  )
}

export default TopCenter
