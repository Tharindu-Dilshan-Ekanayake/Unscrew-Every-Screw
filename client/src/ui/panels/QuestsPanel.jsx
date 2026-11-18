import { QUEST_BONUS, QUEST_REWARDS } from '@shared/balance'
import { questDone, questsReady, questText } from '@shared/engage'
import { formatClock, formatNumber } from '@shared/format'

import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import useNow from '../useNow'
import { ChunkyButton } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

const TIERS = ['EASY', 'MEDIUM', 'HARD']
const DAY_MS = 24 * 60 * 60 * 1000

/** Today's three quests and the bonus for finishing all of them. New ones every day (UTC). */
export function QuestsPanel() {
  const quests = useGame((s) => s.profile.quests)
  const profile = useGame((s) => s.profile)
  const now = useNow(1000)
  const resetIn = DAY_MS - (now % DAY_MS)
  if (!quests) return null
  const bonusReady = questsReady(profile)
  return (
    <Panel title="QUESTS" icon="quest" width={980}>
      <p className="m-0 text-center" style={{ fontSize: u(24), marginBottom: u(10) }}>
        <StrokeText stroke={u(5)} fill="#cfd8ff">
          New quests in {formatClock(resetIn)}
        </StrokeText>
      </p>
      <div className="flex flex-col" style={{ gap: u(10) }}>
        {quests.list.map((quest, index) => {
          const done = questDone(quest)
          const pct = Math.min(100, (quest.progress / quest.target) * 100)
          return (
            <div key={index} className="flex items-center" style={{ gap: u(14), padding: u(12), borderRadius: u(10), background: GRADIENTS.card, border: `${u(5)} solid ${done && !quest.claimed ? '#ffd23a' : '#0b0c0e'}` }}>
              <div className="flex-1">
                <div style={{ fontSize: u(22) }}>
                  <StrokeText stroke={u(4)} fill={['#7dff8a', '#ffd27a', '#ff8a7a'][quest.tier]}>
                    {TIERS[quest.tier]}
                  </StrokeText>
                </div>
                <div style={{ fontSize: u(32) }}>
                  <StrokeText stroke={u(6)}>{questText(quest)}</StrokeText>
                </div>
                <div className="relative overflow-hidden" style={{ height: u(22), borderRadius: u(12), background: '#1b1d22', border: `${u(3)} solid #111`, marginTop: u(6) }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: GRADIENTS.barFill }} />
                  <span className="absolute inset-0 flex items-center justify-center" style={{ fontSize: u(18) }}>
                    <StrokeText stroke={u(4)}>
                      {formatNumber(quest.progress)} / {formatNumber(quest.target)}
                    </StrokeText>
                  </span>
                </div>
              </div>
              <ChunkyButton
                gradient={quest.claimed ? GRADIENTS.greyButton : done ? GRADIENTS.greenButton : GRADIENTS.slate}
                disabled={quest.claimed || !done}
                onClick={() => actions.claimQuest(index)}
                style={{ width: u(190), height: u(70) }}
              >
                <span className="flex items-center" style={{ gap: u(6), fontSize: u(30) }}>
                  {quest.claimed ? (
                    <StrokeText stroke={u(6)}>DONE</StrokeText>
                  ) : (
                    <>
                      <Icon name="crystal" size={u(34)} />
                      <StrokeText stroke={u(6)}>{QUEST_REWARDS[quest.tier]}</StrokeText>
                    </>
                  )}
                </span>
              </ChunkyButton>
            </div>
          )
        })}
      </div>
      <ChunkyButton
        gradient={quests.bonus ? GRADIENTS.greyButton : bonusReady ? GRADIENTS.goldButton : GRADIENTS.slate}
        disabled={quests.bonus || !bonusReady}
        onClick={() => actions.claimQuestBonus()}
        className="w-full"
        style={{ height: u(76), marginTop: u(14) }}
      >
        <span className="flex items-center" style={{ gap: u(10), fontSize: u(32) }}>
          <StrokeText stroke={u(6)}>{quests.bonus ? 'BONUS CLAIMED' : 'ALL 3 DONE BONUS'}</StrokeText>
          {!quests.bonus && (
            <>
              <Icon name="crystal" size={u(36)} />
              <StrokeText stroke={u(6)}>{QUEST_BONUS}</StrokeText>
            </>
          )}
        </span>
      </ChunkyButton>
    </Panel>
  )
}

export default QuestsPanel
