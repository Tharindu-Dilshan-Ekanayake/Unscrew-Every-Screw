import { useEffect, useRef, useState } from 'react'

import { CHAPTERS, DIFFICULTIES } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { isDifficultyUnlocked } from '@shared/logic'

import { sfx } from '../../audio/sfx'
import { getInviteLink } from '../../bloxity/services'
import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import useNow from '../useNow'
import { ChunkyButton } from './parts'
import { GRADIENTS, u } from './style'

/** A short banner under the top centre (room cleared, new tool, quest done...). */
/** Whether `item` (a toast or hint with an id) is still showing, `ms` after it came. */
function useFleeting(item, ms) {
  const [goneId, setGoneId] = useState(null)
  useEffect(() => {
    if (!item) return undefined
    const id = setTimeout(() => setGoneId(item.id), ms)
    return () => clearTimeout(id)
  }, [item, ms])
  return item && item.id !== goneId ? item : null
}

export function Toast() {
  const shown = useFleeting(useGame((s) => s.toast), 3200)
  if (!shown) return null
  return (
    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-center" style={{ top: u(170), fontSize: u(40), maxWidth: '86vw' }}>
      <StrokeText key={shown.id} stroke={u(8)} gradient={GRADIENTS.gold} className="pp-bump" style={{ whiteSpace: 'normal' }}>
        {shown.text}
      </StrokeText>
    </div>
  )
}

/** A hint near the crosshair (TOO FAR!, BAG FULL!), fading away. */
export function Hint() {
  const shown = useFleeting(useGame((s) => s.hint), 1500)
  if (!shown) return null
  return (
    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-center" style={{ top: 'calc(50% + 46px)', fontSize: u(34) }}>
      <StrokeText key={shown.id} stroke={u(7)} fill="#ff6a55" className="pp-hint">
        {shown.text}
      </StrokeText>
    </div>
  )
}

/** Copies the Boxity invite link (or shares it), for INVITE FRIENDS. */
async function inviteFriends(setNote) {
  const link = getInviteLink()
  if (!link) {
    setNote('Invites work when you play on Boxity')
    return
  }
  try {
    if (navigator.share) await navigator.share({ title: 'Play Screwball Escape with me!', url: link })
    else {
      await navigator.clipboard.writeText(link)
      setNote('Invite link copied - send it to your friends!')
    }
  } catch {
    setNote(link)
  }
}

/** Beeps the last three seconds of a countdown (`left`: whole seconds, or null). */
function useCountdownBeeps(left) {
  const lastBeep = useRef(null)
  useEffect(() => {
    if (left === null) lastBeep.current = null
    if (left === null || left > 3 || left === lastBeep.current) return
    lastBeep.current = left
    sfx.beep(left === 0)
  }, [left])
}

/** One seat on a team pad: who's in it (the host in gold), or an empty one. */
function SeatChip({ name, host }) {
  if (!name) {
    return (
      <span style={{ fontSize: u(22), padding: `${u(4)} ${u(12)}`, borderRadius: u(20), border: `${u(3)} dashed rgba(255,255,255,0.4)` }}>
        <StrokeText stroke={u(4)} fill="#8a93a6">
          waiting...
        </StrokeText>
      </span>
    )
  }
  return (
    <span style={{ fontSize: u(22), padding: `${u(4)} ${u(12)}`, borderRadius: u(20), background: host ? GRADIENTS.goldButton : GRADIENTS.slate, border: `${u(3)} solid #111` }}>
      <StrokeText stroke={u(4)}>{name}</StrokeText>
    </span>
  )
}

/**
 * You're on a team pad: how many it seats, who's on it, the chapter its section plays -
 * then, once every seat is taken, STARTING IN 3, 2, 1. Anyone can INVITE FRIENDS into
 * this server; stepping off the pad leaves it. The card itself lets
 * touches through (only its buttons take them), so the joystick under it still works.
 */
export function PadOverlay() {
  const live = useGame((s) => s.pads.find((p) => p.seat >= 0) || null)
  // Only on a pad does its clock tick.
  return live ? <PadCard live={live} /> : null
}

function PadCard({ live }) {
  const online = useGame((s) => s.net.mode === 'online')
  const hasRun = useGame((s) => Boolean(s.profile.run))
  // Not reached it yet? The team carries you - and clearing it opens it for you too.
  const lockedForYou = useGame((s) => !isDifficultyUnlocked(s.profile, live.chapter, live.diff))
  const now = useNow(200)
  const [note, setNote] = useState('')
  const left = live.endsAt ? Math.max(0, Math.ceil((live.endsAt - now) / 1000)) : null
  useCountdownBeeps(left)

  const chapter = CHAPTERS.find((c) => c.id === live.chapter)
  const missing = live.size - live.names.length
  const seats = Array.from({ length: live.size }, (_, i) => live.names[i] || null)
  return (
    <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center" style={{ top: u(16) }}>
      <div className="pp-panel-in flex flex-col items-center text-center" style={{ padding: `${u(12)} ${u(22)}`, borderRadius: u(16), background: 'linear-gradient(180deg, rgb(30 36 54 / 0.9), rgb(16 20 32 / 0.9))', border: `${u(5)} solid #0b0c0e`, gap: u(6), maxWidth: 'min(92vw, 46rem)' }}>
        <span style={{ fontSize: u(30) }}>
          <StrokeText stroke={u(6)} gradient={GRADIENTS.gold}>
            {live.size}-PLAYER TEAM
          </StrokeText>
        </span>
        <span style={{ fontSize: u(26) }}>
          <StrokeText stroke={u(5)} fill="#cfd8ff" style={{ whiteSpace: 'normal' }}>
            {chapter?.name} · {DIFFICULTIES[live.diff]?.name}
          </StrokeText>
        </span>
        {lockedForYou && live.ready && (
          <span className="flex items-center justify-center" style={{ gap: u(6), fontSize: u(22) }}>
            <Icon name="lock" size={u(28)} />
            <StrokeText stroke={u(5)} fill="#7dffb4" style={{ whiteSpace: 'normal' }}>
              Not reached yet - your team carries you (just for fun: it won't unlock)
            </StrokeText>
          </span>
        )}
        <div className="flex flex-wrap items-center justify-center" style={{ gap: u(8) }}>
          {seats.map((name, i) => (
            <SeatChip key={`${i}:${name}`} name={name} host={i === 0} />
          ))}
        </div>
        {left !== null ? (
          <>
            <span style={{ fontSize: u(34) }}>
              <StrokeText stroke={u(7)}>STARTING IN</StrokeText>
            </span>
            <span style={{ fontSize: u(80), lineHeight: 1 }}>
              <StrokeText key={left} stroke={u(11)} gradient={GRADIENTS.gold} className="pp-bump">
                {left}
              </StrokeText>
            </span>
          </>
        ) : missing > 0 ? (
          <span style={{ fontSize: u(28) }}>
            <StrokeText stroke={u(6)} className="pp-pulse-text" style={{ whiteSpace: 'normal' }}>
              Waiting for {missing} more player{missing === 1 ? '' : 's'}...
            </StrokeText>
          </span>
        ) : null}
        {!live.ready && (
          <span className="flex items-center justify-center" style={{ gap: u(6), fontSize: u(22) }}>
            <Icon name="lock" size={u(28)} />
            <StrokeText stroke={u(5)} fill="#ff9a7a" style={{ whiteSpace: 'normal' }}>
              Someone on this pad must have reached {chapter?.name} to play it
            </StrokeText>
          </span>
        )}
        <div className="flex flex-wrap justify-center" style={{ gap: u(10), marginTop: u(2) }}>
          {online && missing > 0 && (
            <ChunkyButton gradient={GRADIENTS.blueButton} onClick={() => inviteFriends(setNote)} style={{ padding: `${u(6)} ${u(18)}`, height: u(58) }}>
              <span style={{ fontSize: u(26) }}>
                <StrokeText stroke={u(6)}>INVITE FRIENDS</StrokeText>
              </span>
            </ChunkyButton>
          )}
        </div>
        <span style={{ fontSize: u(20) }}>
          <StrokeText stroke={u(4)} fill="#ffd27a" style={{ whiteSpace: 'normal' }}>
            {!online ? 'Team pads fill up online - play with friends!' : hasRun ? 'Step off the pad to leave · team runs aren\'t saved, your solo run stays safe' : 'Step off the pad to leave'}
          </StrokeText>
        </span>
        {note && (
          <span style={{ fontSize: u(20) }}>
            <StrokeText stroke={u(4)} fill="#ffd27a" style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>
              {note}
            </StrokeText>
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Your SOLO run about to start: the chapter, and STARTING IN 3, 2, 1 (LEAVE calls it
 * off). Shaped for parties: should one ever have seats to fill, it shows who's in and
 * waits for them.
 */
export function PartyOverlay() {
  const party = useGame((s) => s.countdown)
  const online = useGame((s) => s.net.mode === 'online')
  const now = useNow(200)
  const [note, setNote] = useState('')
  const left = party ? Math.max(0, Math.ceil((party.endsAt - now) / 1000)) : 0
  useCountdownBeeps(party ? left : null)

  if (!party) return null
  const chapter = CHAPTERS.find((c) => c.id === party.chapter)
  const full = party.names.length >= party.size
  const starting = full || left <= 3
  return (
    <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center" style={{ bottom: u(40) }}>
      <div className="pp-panel-in pointer-events-auto flex flex-col items-center text-center" style={{ padding: `${u(16)} ${u(26)}`, borderRadius: u(16), background: 'linear-gradient(180deg, rgb(30 36 54 / 0.92), rgb(16 20 32 / 0.92))', border: `${u(5)} solid #0b0c0e`, gap: u(8), maxWidth: '92vw' }}>
        <span style={{ fontSize: u(34) }}>
          <StrokeText stroke={u(7)} fill="#cfd8ff" style={{ whiteSpace: 'normal' }}>
            {chapter?.name} · {DIFFICULTIES[party.diff]?.name}
            {party.action === 'load' ? ' · saved run' : ''}
          </StrokeText>
        </span>
        <div className="flex flex-wrap items-center justify-center" style={{ gap: u(8), display: party.size > 1 ? undefined : 'none' }}>
          <span style={{ fontSize: u(30) }}>
            <StrokeText stroke={u(6)} gradient={GRADIENTS.gold}>
              PARTY {party.names.length}/{party.size}
            </StrokeText>
          </span>
          {party.names.map((name, i) => (
            <span key={`${name}:${i}`} style={{ fontSize: u(22), padding: `${u(4)} ${u(12)}`, borderRadius: u(20), background: i === 0 ? GRADIENTS.goldButton : GRADIENTS.slate, border: `${u(3)} solid #111` }}>
              <StrokeText stroke={u(4)}>{name}</StrokeText>
            </span>
          ))}
          {Array.from({ length: party.size - party.names.length }, (_, i) => (
            <span key={`seat${i}`} style={{ fontSize: u(22), padding: `${u(4)} ${u(12)}`, borderRadius: u(20), border: `${u(3)} dashed rgba(255,255,255,0.35)` }}>
              <StrokeText stroke={u(4)} fill="#8a93a6">
                open
              </StrokeText>
            </span>
          ))}
        </div>
        <span style={{ fontSize: u(starting ? 40 : 28) }}>
          <StrokeText stroke={u(7)} style={{ whiteSpace: 'normal' }}>
            {starting ? 'STARTING IN' : 'Waiting for friends... starts in'}
          </StrokeText>
        </span>
        <span style={{ fontSize: u(starting ? 96 : 56), lineHeight: 1 }}>
          <StrokeText key={left} stroke={u(12)} gradient={GRADIENTS.gold} className="pp-bump">
            {left}
          </StrokeText>
        </span>
        <div className="flex flex-wrap justify-center" style={{ gap: u(10), marginTop: u(4) }}>
          {party.hostIsYou && !starting && (
            <ChunkyButton gradient={GRADIENTS.greenButton} onClick={() => actions.startParty()} style={{ padding: `${u(8)} ${u(22)}`, height: u(70) }}>
              <span style={{ fontSize: u(32) }}>
                <StrokeText stroke={u(7)}>START NOW</StrokeText>
              </span>
            </ChunkyButton>
          )}
          {online && party.size > 1 && !full && (
            <ChunkyButton gradient={GRADIENTS.blueButton} onClick={() => inviteFriends(setNote)} style={{ padding: `${u(8)} ${u(22)}`, height: u(70) }}>
              <span style={{ fontSize: u(30) }}>
                <StrokeText stroke={u(6)}>INVITE FRIENDS</StrokeText>
              </span>
            </ChunkyButton>
          )}
          <ChunkyButton gradient={GRADIENTS.redButton} onClick={() => actions.leaveParty()} style={{ padding: `${u(8)} ${u(22)}`, height: u(70) }}>
            <span style={{ fontSize: u(32) }}>
              <StrokeText stroke={u(7)}>LEAVE</StrokeText>
            </span>
          </ChunkyButton>
        </div>
        {note && (
          <span style={{ fontSize: u(20) }}>
            <StrokeText stroke={u(4)} fill="#ffd27a" style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>
              {note}
            </StrokeText>
          </span>
        )}
      </div>
    </div>
  )
}

/** Covers the switch into a room while its chunk loads and its first frame draws. */
export function EnteringCover() {
  const entering = useGame((s) => s.entering)
  if (!entering) return null
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex flex-col items-center justify-center" style={{ background: 'radial-gradient(circle, #24314f 0%, #0d1220 80%)' }}>
      <Icon name="screw" size={u(140)} className="pp-loading-disc" />
      <span style={{ fontSize: u(48), marginTop: u(16) }}>
        <StrokeText stroke={u(9)}>Entering the room…</StrokeText>
      </span>
    </div>
  )
}

const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

/** The chapter's results: your time, your best, the Crystals and what you unlocked. */
export function ChapterClear() {
  const clear = useGame((s) => s.clear)
  const setClear = useGame((s) => s.setClear)
  if (!clear) return null
  const chapter = CHAPTERS.find((c) => c.id === clear.chapter)
  // A team run is just for fun: its time and screws, nothing earned or saved.
  const rows = clear.team
    ? [
        ['clock', 'Team time', formatTime(clear.time)],
        ['screw', 'Screws', formatNumber(clear.screws)],
      ]
    : [
        ['clock', 'Time', formatTime(clear.time) + (clear.newBest ? '  NEW BEST!' : '')],
        ['trophy', 'Best', clear.best ? formatTime(clear.best) : '-'],
        ['screw', 'Screws', formatNumber(clear.screws)],
        ['crystal', 'Crystals', `+${formatNumber(clear.crystals)}`],
      ]
  return (
    <div className="pp-font pointer-events-auto absolute inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(5, 8, 16, 0.6)' }}>
      <div className="pp-panel-in flex flex-col items-center text-center" style={{ padding: u(34), borderRadius: u(18), background: 'linear-gradient(180deg, #2a3350, #151a2a)', border: `${u(6)} solid #ffd23a`, width: `min(${u(760)}, 92vw)` }}>
        <span style={{ fontSize: u(72) }}>
          <StrokeText stroke={u(12)} gradient={GRADIENTS.gold}>
            ESCAPED!
          </StrokeText>
        </span>
        <span style={{ fontSize: u(34), marginBottom: u(16) }}>
          <StrokeText stroke={u(7)} fill="#cfd8ff">
            {chapter?.name} · {DIFFICULTIES[clear.diff]?.name}
          </StrokeText>
        </span>
        {rows.map(([icon, label, value]) => (
          <div key={label} className="flex w-full items-center justify-between" style={{ fontSize: u(38), padding: `${u(6)} ${u(18)}` }}>
            <span className="flex items-center" style={{ gap: u(10) }}>
              <Icon name={icon} size={u(44)} />
              <StrokeText stroke={u(7)}>{label}</StrokeText>
            </span>
            <StrokeText stroke={u(7)} gradient={icon === 'crystal' ? GRADIENTS.crystal : GRADIENTS.gold}>
              {value}
            </StrokeText>
          </div>
        ))}
        {clear.team && (
          <span style={{ fontSize: u(26), marginTop: u(10) }}>
            <StrokeText stroke={u(5)} fill="#cfd8ff" style={{ whiteSpace: 'normal' }}>
              Team play is just for fun - only the crystals you unscrewed are kept. Your solo run is waiting!
            </StrokeText>
          </span>
        )}
        {(clear.unlockedChapter || clear.unlockedDifficulty) && (
          <span style={{ fontSize: u(32), marginTop: u(10) }}>
            <StrokeText stroke={u(7)} gradient={GRADIENTS.cash} style={{ whiteSpace: 'normal' }}>
              {clear.unlockedChapter ? `UNLOCKED: ${clear.unlockedChapter}! ` : ''}
              {clear.unlockedDifficulty ? `${clear.unlockedDifficulty} mode open!` : ''}
            </StrokeText>
          </span>
        )}
        <ChunkyButton gradient={GRADIENTS.greenButton} onClick={() => setClear(null)} style={{ width: u(320), height: u(84), marginTop: u(22) }}>
          <span style={{ fontSize: u(44) }}>
            <StrokeText stroke={u(8)}>AWESOME!</StrokeText>
          </span>
        </ChunkyButton>
      </div>
    </div>
  )
}

/** How long the lobby notification stays (its slide in and out included: see .pp-notify). */
const NOTIFY_MS = 6000
/** The last notification that played to the end: each one shows once. */
let notified = null

/**
 * A notification on arriving in the lobby: where to go (first visit), or that your solo
 * run is saved. It slides down, stays a few seconds and slides away - once for each
 * (stepping off a pad doesn't bring it back).
 */
export function LobbyHint() {
  const runs = useGame((s) => s.profile.stats.runs)
  const savedAt = useGame((s) => s.profile.run?.savedAt ?? null)
  const key = runs === 0 ? 'welcome' : savedAt !== null ? `saved:${savedAt}` : null
  const [done, setDone] = useState(null)
  useEffect(() => {
    if (!key || key === notified) return undefined
    const id = setTimeout(() => {
      notified = key
      setDone(key)
    }, NOTIFY_MS)
    return () => clearTimeout(id)
  }, [key])
  if (!key || key === done || key === notified) return null
  const welcome = key === 'welcome'
  return (
    <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ top: u(18) }}>
      <div key={key} className="pp-notify flex items-center" style={{ gap: u(14), padding: `${u(12)} ${u(22)} ${u(12)} ${u(14)}`, borderRadius: u(16), background: 'linear-gradient(180deg, rgb(34 42 66 / 0.94), rgb(18 22 36 / 0.94))', border: `${u(4)} solid #0b0c0e`, boxShadow: `0 ${u(6)} 0 rgb(0 0 0 / 0.35)`, maxWidth: 'min(88vw, 40rem)' }}>
        <div className="flex shrink-0 items-center justify-center" style={{ width: u(64), height: u(64), borderRadius: u(14), background: welcome ? GRADIENTS.greenButton : GRADIENTS.goldButton, border: `${u(3)} solid #0b0c0e` }}>
          <Icon name={welcome ? 'solo' : 'check'} size={u(44)} />
        </div>
        <div className="flex min-w-0 flex-col" style={{ gap: u(2) }}>
          <span style={{ fontSize: u(28), lineHeight: 1.1 }}>
            <StrokeText stroke={u(6)} gradient={GRADIENTS.gold}>
              {welcome ? 'WELCOME!' : 'RUN SAVED'}
            </StrokeText>
          </span>
          <span style={{ fontSize: u(22) }}>
            <StrokeText stroke={u(5)} style={{ whiteSpace: 'normal' }}>
              {welcome ? 'Step on the SOLO pad - or a team pad with friends - to play!' : 'LOAD it on the SOLO pad to carry on.'}
            </StrokeText>
          </span>
        </div>
      </div>
    </div>
  )
}
