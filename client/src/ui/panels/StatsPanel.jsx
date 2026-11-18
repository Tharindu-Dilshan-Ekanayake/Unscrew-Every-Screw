import { BADGES, CHAPTERS, DIFFICULTIES } from '@shared/balance'
import { formatDuration, formatNumber } from '@shared/format'

import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { GRADIENTS, u } from '../hud/style'
import { SectionTitle } from './cards'
import Panel from './Panel'

const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

function Row({ icon, label, value }) {
  return (
    <div className="flex items-center justify-between" style={{ fontSize: u(30), padding: `${u(6)} ${u(12)}`, borderRadius: u(8), background: 'rgba(255,255,255,0.05)' }}>
      <span className="flex items-center" style={{ gap: u(10) }}>
        <Icon name={icon} size={u(38)} />
        <StrokeText stroke={u(6)}>{label}</StrokeText>
      </span>
      <StrokeText stroke={u(6)} gradient={GRADIENTS.gold}>
        {value}
      </StrokeText>
    </div>
  )
}

/** Your totals, best times and badges. */
export function StatsPanel() {
  const profile = useGame((s) => s.profile)
  const st = profile.stats
  return (
    <Panel title="STATS" icon="stats" width={1000}>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: u(10) }}>
        <Row icon="screw" label="Screws unscrewed" value={formatNumber(st.screws)} />
        <Row icon="door" label="Rooms escaped" value={formatNumber(st.rooms)} />
        <Row icon="trophy" label="Chapters cleared" value={formatNumber(st.chapters)} />
        <Row icon="cash" label="Cash earned" value={`$${formatNumber(st.cashEarned)}`} />
        <Row icon="starGold" label="Gold screws" value={formatNumber(st.gold)} />
        <Row icon="crystal" label="Crystal screws" value={formatNumber(st.crystal)} />
        <Row icon="sell" label="Bags sold" value={formatNumber(st.sells)} />
        <Row icon="clock" label="Time played" value={formatDuration(st.playtime * 1000)} />
      </div>
      <div style={{ marginTop: u(16) }}>
        <SectionTitle>Best times</SectionTitle>
      </div>
      <div className="grid" style={{ gridTemplateColumns: `${u(260)} repeat(3, 1fr)`, gap: u(8), fontSize: u(26) }}>
        <span />
        {DIFFICULTIES.map((d) => (
          <span key={d.id} className="text-center">
            <StrokeText stroke={u(5)} fill="#cfd8ff">
              {d.name}
            </StrokeText>
          </span>
        ))}
        {CHAPTERS.map((c) => (
          <div key={c.id} className="contents">
            <span>
              <StrokeText stroke={u(5)}>{c.name}</StrokeText>
            </span>
            {DIFFICULTIES.map((d, i) => {
              const best = profile.best[`${c.id}:${i}`]
              return (
                <span key={d.id} className="text-center">
                  <StrokeText stroke={u(5)} gradient={best ? GRADIENTS.gold : undefined} fill="#6a7385">
                    {best ? formatTime(best) : '-'}
                  </StrokeText>
                </span>
              )
            })}
          </div>
        ))}
      </div>
      <div style={{ marginTop: u(16) }}>
        <SectionTitle>Badges</SectionTitle>
      </div>
      <div className="flex flex-wrap" style={{ gap: u(8) }}>
        {Object.entries(BADGES).map(([id, badge]) => {
          const has = profile.badges.includes(id)
          return (
            <span key={id} style={{ fontSize: u(22), padding: `${u(6)} ${u(12)}`, borderRadius: u(20), background: has ? GRADIENTS.goldButton : 'rgba(255,255,255,0.06)', border: `${u(3)} solid #111`, opacity: has ? 1 : 0.55 }}>
              <StrokeText stroke={u(5)}>{badge.name}</StrokeText>
            </span>
          )
        })}
      </div>
    </Panel>
  )
}

export default StatsPanel
