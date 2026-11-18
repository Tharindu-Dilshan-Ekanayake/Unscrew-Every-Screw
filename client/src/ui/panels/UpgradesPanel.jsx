import { BAG_LEVELS, REACH_LEVELS, SPEED_STEP, TOOLS, UPGRADE_IDS, UPGRADES } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { bagCapacity, reachOf, toolPrice, upgradeCost } from '@shared/logic'

import { buyUpgrade, pickToolSlot } from '../../game/toolActions'
import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { ChunkyButton, Price } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import { SectionTitle, ShopCard } from './cards'
import Panel from './Panel'

const ICONS = { speed: 'speed', bag: 'bag', reach: 'reach' }

/** What an upgrade gives now and at its next level. */
function upgradeLine(profile, id) {
  const level = profile.run.up[id]
  if (id === 'speed') return `+${Math.round(SPEED_STEP * level * 100)}% speed`
  if (id === 'bag') return `${formatNumber(bagCapacity(profile))} screws${level < BAG_LEVELS.length - 1 ? ` → ${formatNumber(Math.floor(bagCapacity(profile) * (BAG_LEVELS[level + 1] / BAG_LEVELS[level])))}` : ''}`
  return `${reachOf(profile)} m${level < REACH_LEVELS.length - 1 ? ` → ${REACH_LEVELS[level + 1]} m` : ''}`
}

/** This run's upgrades and tools, bought with the run's cash (B in a room). */
export function UpgradesPanel() {
  const profile = useGame((s) => s.profile)
  const run = profile.run
  if (!run) return null
  return (
    <Panel title="UPGRADES" icon="upgrade" width={1100}>
      <div className="flex justify-center" style={{ fontSize: u(40), marginBottom: u(10) }}>
        <StrokeText stroke={u(8)} gradient={GRADIENTS.cash}>
          ${formatNumber(run.cash)}
        </StrokeText>
      </div>
      <SectionTitle>Upgrades</SectionTitle>
      <div className="card-grid-3 keep-3">
        {UPGRADE_IDS.map((id) => {
          const up = UPGRADES[id]
          const cost = upgradeCost(profile, id)
          const maxed = !Number.isFinite(cost)
          const afford = run.cash >= cost
          return (
            <ShopCard key={id} icon={ICONS[id]} name={up.name} blurb={up.blurb} level={run.up[id]} max={up.max} highlight={!maxed && afford}>
              <span style={{ fontSize: u(22) }}>
                <StrokeText stroke={u(5)} fill="#ffd27a">
                  {upgradeLine(profile, id)}
                </StrokeText>
              </span>
              <ChunkyButton gradient={maxed ? GRADIENTS.greyButton : afford ? GRADIENTS.greenButton : GRADIENTS.slate} disabled={maxed} onClick={() => buyUpgrade(id)} className="w-full" style={{ height: u(58), marginTop: u(6) }}>
                {maxed ? (
                  <span style={{ fontSize: u(30) }}>
                    <StrokeText stroke={u(6)}>MAX</StrokeText>
                  </span>
                ) : (
                  <Price amount={cost} size={30} afford={afford} />
                )}
              </ChunkyButton>
            </ShopCard>
          )
        })}
      </div>
      <div style={{ marginTop: u(16) }}>
        <SectionTitle>Tools</SectionTitle>
      </div>
      <div className="card-grid-4">
        {TOOLS.map((tool, i) => {
          const owned = run.tools.includes(tool.id)
          const equipped = run.tool === tool.id
          const price = toolPrice(profile, tool.id)
          const afford = run.cash >= price
          return (
            <ShopCard key={tool.id} icon={tool.id} name={tool.name} blurb={tool.blurb} highlight={equipped}>
              <ChunkyButton
                gradient={equipped ? GRADIENTS.greyButton : owned ? GRADIENTS.blueButton : afford ? GRADIENTS.greenButton : GRADIENTS.slate}
                disabled={equipped}
                onClick={() => pickToolSlot(i)}
                className="w-full"
                style={{ height: u(58), marginTop: u(6) }}
              >
                {owned ? (
                  <span style={{ fontSize: u(30) }}>
                    <StrokeText stroke={u(6)}>{equipped ? 'IN HAND' : 'EQUIP'}</StrokeText>
                  </span>
                ) : (
                  <Price amount={price} size={30} afford={afford} />
                )}
              </ChunkyButton>
            </ShopCard>
          )
        })}
      </div>
    </Panel>
  )
}

export default UpgradesPanel
