import { DAILY_REWARDS } from '@shared/balance'
import { formatClock } from '@shared/format'
import { dailyState } from '@shared/logic'

import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import useNow from '../useNow'
import { ChunkyButton } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

const DAY_MS = 24 * 60 * 60 * 1000

/** A week of Crystals: one claim a day. Miss a day and the week starts again. */
export function DailyRewardsPanel() {
  const daily = useGame((s) => s.profile.daily)
  const now = useNow(1000)
  const state = dailyState({ daily }, now)
  return (
    <Panel title="DAILY REWARDS" icon="calendar" width={1100}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', gap: u(10) }}>
        {DAILY_REWARDS.map((crystals, i) => {
          const claimed = i < state.claimed && !(state.canClaim && i === state.next)
          const today = state.canClaim && i === state.next
          return (
            <div
              key={i}
              className="flex flex-col items-center"
              style={{ padding: `${u(10)} ${u(4)}`, borderRadius: u(10), background: today ? GRADIENTS.rewardCard : claimed ? GRADIENTS.cardLocked : GRADIENTS.card, border: `${u(5)} solid ${today ? '#ffffff' : '#0b0c0e'}`, gap: u(4) }}
            >
              <span style={{ fontSize: u(24) }}>
                <StrokeText stroke={u(5)}>Day {i + 1}</StrokeText>
              </span>
              <Icon name={claimed ? 'check' : 'crystal'} size={u(i === 6 ? 74 : 58)} />
              <span style={{ fontSize: u(30) }}>
                <StrokeText stroke={u(6)} gradient={GRADIENTS.crystal}>
                  {crystals}
                </StrokeText>
              </span>
            </div>
          )
        })}
      </div>
      <ChunkyButton gradient={state.canClaim ? GRADIENTS.greenButton : GRADIENTS.greyButton} disabled={!state.canClaim} onClick={() => actions.claimDaily()} className="w-full" style={{ height: u(80), marginTop: u(16) }}>
        <span style={{ fontSize: u(38) }}>
          <StrokeText stroke={u(7)}>{state.canClaim ? `CLAIM DAY ${state.next + 1}` : `Next reward in ${formatClock(DAY_MS - (now % DAY_MS))}`}</StrokeText>
        </span>
      </ChunkyButton>
    </Panel>
  )
}

export default DailyRewardsPanel
