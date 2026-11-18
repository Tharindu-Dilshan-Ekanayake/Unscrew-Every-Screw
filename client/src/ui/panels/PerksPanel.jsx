import { DRONE_RATES, PERK_IDS, PERKS } from '@shared/balance'
import { perkCost } from '@shared/logic'

import { sfx } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { ChunkyButton, Price } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import { ShopCard } from './cards'
import Panel from './Panel'

/** What a perk does at its current level, in a few words. */
function perkNow(id, level) {
  const perk = PERKS[id]
  if (id === 'drone') return level ? `${DRONE_RATES[level]} screws/sec` : 'Not yet'
  if (id === 'cash') return `+$${perk.per * level} x chapter`
  return `+${Math.round(perk.per * level * 100)}%`
}

/**
 * The workbench: permanent upgrades bought with Crystals. They carry into every run, so
 * each one makes the next escape quicker.
 */
export function PerksPanel() {
  const profile = useGame((s) => s.profile)
  return (
    <Panel title="PERKS" icon="speed" width={980}>
      <p className="m-0 text-center" style={{ fontSize: u(26), marginBottom: u(12) }}>
        <StrokeText stroke={u(5)} fill="#cfd8ff" style={{ whiteSpace: 'normal' }}>
          Permanent boosts for every run. Earn Crystals from crystal screws, chapter clears and quests.
        </StrokeText>
      </p>
      {/* Six perks: two rows of three (three rows of two on a tall screen). */}
      <div className="card-grid-3">
        {PERK_IDS.map((id) => {
          const perk = PERKS[id]
          const level = profile.perks[id]
          const cost = perkCost(profile, id)
          const maxed = !Number.isFinite(cost)
          const afford = profile.crystals >= cost
          return (
            <ShopCard key={id} icon={perk.icon} name={perk.name} blurb={perk.blurb} level={level} max={perk.costs.length} highlight={!maxed && afford}>
              <span style={{ fontSize: u(22) }}>
                <StrokeText stroke={u(5)} fill="#ffd27a">
                  Now: {perkNow(id, level)}
                </StrokeText>
              </span>
              <ChunkyButton
                gradient={maxed ? GRADIENTS.greyButton : afford ? GRADIENTS.greenButton : GRADIENTS.slate}
                disabled={maxed}
                onClick={() => {
                  if (!afford) return sfx.error()
                  sfx.upgrade()
                  actions.buyPerk(id)
                }}
                className="w-full"
                style={{ height: u(58), marginTop: u(6) }}
              >
                {maxed ? (
                  <span style={{ fontSize: u(30) }}>
                    <StrokeText stroke={u(6)}>MAX</StrokeText>
                  </span>
                ) : (
                  <Price amount={cost} icon="crystal" size={30} afford={afford} />
                )}
              </ChunkyButton>
            </ShopCard>
          )
        })}
      </div>
    </Panel>
  )
}

export default PerksPanel
