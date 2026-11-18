import { useEffect, useState } from 'react'

import { formatNumber } from '@shared/format'
import { dailyState } from '@shared/logic'

import { isMuted, onMutedChange, setMuted } from '../../audio/sfx'
import { useGame } from '../../store/game'
import AuthHUD from '../AuthHUD'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import useNow from '../useNow'
import { AlertBadge, ChunkyButton } from './parts'
import { GRADIENTS, u } from './style'

export function RoundButton({ icon, label, onClick, alert, iconSize = 38, gradient = GRADIENTS.slate, size = 64 }) {
  return (
    <ChunkyButton gradient={gradient} onClick={onClick} title={label} radius={size / 2} style={{ width: u(size), height: u(size) }}>
      <Icon name={icon} size={u(iconSize)} />
      {alert && <AlertBadge size={26} style={{ top: u(-8), right: u(-8) }} />}
    </ChunkyButton>
  )
}

/** Turns the music and sound effects on and off (remembered on this device). */
function SoundButton() {
  const [muted, setMutedState] = useState(isMuted)
  useEffect(() => onMutedChange(setMutedState), [])
  return <RoundButton icon={muted ? 'soundOff' : 'sound'} label={muted ? 'Sound: off' : 'Sound: on'} onClick={() => setMuted(!muted)} iconSize={36} />
}

/** Your Crystals, the permanent currency, in a pill. */
export function CrystalCounter({ size = 44 }) {
  const crystals = useGame((s) => s.profile.crystals)
  return (
    <div
      className="flex items-center"
      style={{ gap: u(8), padding: `${u(4)} ${u(18)} ${u(4)} ${u(6)}`, borderRadius: u(40), background: 'rgba(12, 18, 32, 0.55)', border: `${u(3)} solid rgba(255,255,255,0.18)` }}
    >
      <Icon name="crystal" size={u(size * 1.15)} />
      <span style={{ fontSize: u(size) }}>
        <StrokeText stroke={u(size * 0.2)} gradient={GRADIENTS.crystal}>
          {formatNumber(crystals)}
        </StrokeText>
      </span>
    </div>
  )
}

/**
 * The top-right corner: sound, daily rewards, leaderboards, settings and your name tag,
 * with your Crystals right-aligned underneath.
 */
export function TopBar() {
  const openPanel = useGame((s) => s.openPanel)
  const daily = useGame((s) => s.profile.daily)
  const now = useNow(10000)
  const dailyReady = dailyState({ daily }, now).canClaim

  return (
    <div className="pointer-events-none absolute flex flex-col items-end" style={{ right: u(16), top: u(14), gap: u(10) }}>
      <div className="flex items-center" style={{ gap: u(12) }}>
        <SoundButton />
        <RoundButton icon="calendar" label="Daily Rewards" alert={dailyReady} onClick={() => openPanel('daily')} />
        <RoundButton icon="trophy" label="Leaderboards" onClick={() => openPanel('leaderboards')} iconSize={34} />
        <RoundButton icon="settings" label="Settings" onClick={() => openPanel('settings')} iconSize={42} />
        <AuthHUD />
      </div>
      <CrystalCounter />
    </div>
  )
}

export default TopBar
