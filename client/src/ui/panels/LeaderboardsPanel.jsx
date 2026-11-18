import { formatDuration, formatNumber } from '@shared/format'

import { openBoxityLeaderboard } from '../../bloxity/services'
import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

/** The boards, as the server keeps them (top 10 each). Ids match the Boxity boards. */
const BOARDS = [
  { id: 'screws', title: 'Screws', format: formatNumber, mine: (p) => p.stats.screws },
  { id: 'rooms', title: 'Rooms', format: formatNumber, mine: (p) => p.stats.rooms },
  { id: 'chapters', title: 'Chapters', format: formatNumber, mine: (p) => p.stats.chapters },
  // Seconds played, on the server's board and yours.
  { id: 'playtime', title: 'Playtime', format: (v) => formatDuration(v * 1000), mine: (p) => Math.floor(p.stats.playtime) },
]

/**
 * The leaderboards, the same data as the boards in the lobby. Inside Boxity, a board's
 * title opens Boxity's own overlay for it (everyone, not just the top 10).
 */
export function LeaderboardsPanel() {
  const leaderboards = useGame((s) => s.leaderboards)
  const profile = useGame((s) => s.profile)
  return (
    <Panel title="LEADERBOARDS" icon="trophy" width={1160}>
      <div className="grid" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${u(250)}, 1fr))`, gap: u(12) }}>
        {BOARDS.map((board) => {
          const rows = leaderboards?.[board.id] || []
          return (
            <div key={board.id} style={{ padding: u(12), borderRadius: u(10), background: GRADIENTS.card, border: `${u(5)} solid #0b0c0e` }}>
              <button type="button" className="pp-btn pointer-events-auto w-full text-center" onClick={() => openBoxityLeaderboard(board.id)} style={{ fontSize: u(36), marginBottom: u(8) }}>
                <StrokeText stroke={u(7)} gradient={GRADIENTS.gold}>
                  {board.title}
                </StrokeText>
              </button>
              {rows.length === 0 && (
                <p className="m-0 text-center" style={{ fontSize: u(22) }}>
                  <StrokeText stroke={u(4)} fill="#8a93a6">
                    No scores yet
                  </StrokeText>
                </p>
              )}
              {rows.slice(0, 10).map((row, i) => (
                <div key={`${row.name}:${i}`} className="flex justify-between" style={{ fontSize: u(22), padding: `${u(2)} ${u(4)}` }}>
                  <StrokeText stroke={u(4)} fill={i === 0 ? '#ffe27a' : '#ffffff'}>
                    {i + 1}. {String(row.name).slice(0, 14)}
                  </StrokeText>
                  <StrokeText stroke={u(4)} fill="#cfd8ff">
                    {board.format(row.value)}
                  </StrokeText>
                </div>
              ))}
              <div className="flex justify-between" style={{ fontSize: u(22), marginTop: u(8), paddingTop: u(6), borderTop: `${u(2)} solid rgba(255,255,255,0.15)` }}>
                <StrokeText stroke={u(4)} fill="#7dff8a">
                  You
                </StrokeText>
                <StrokeText stroke={u(4)} fill="#7dff8a">
                  {board.format(board.mine(profile))}
                </StrokeText>
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

export default LeaderboardsPanel
