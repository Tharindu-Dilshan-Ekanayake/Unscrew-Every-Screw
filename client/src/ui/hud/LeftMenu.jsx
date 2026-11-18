import { PERK_IDS, SKINS } from '@shared/balance'
import { questsReady, questDone } from '@shared/engage'
import { perkCost } from '@shared/logic'

import { prefetchStage } from '../../game/stageLoader'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { AlertBadge, ChunkyButton } from './parts'
import { GRADIENTS, u } from './style'

function Tile({ icon, label, gradient, onClick, alert, onPointerEnter }) {
  return (
    <div className="relative flex flex-col items-center" onPointerEnter={onPointerEnter}>
      <ChunkyButton gradient={gradient} onClick={onClick} title={label} radius={22} style={{ width: u(112), height: u(112) }}>
        <Icon name={icon} size={u(72)} />
      </ChunkyButton>
      {alert && <AlertBadge size={34} style={{ top: u(-10), right: u(-8) }} />}
      <span style={{ fontSize: u(30), marginTop: u(4) }}>
        <StrokeText stroke={u(7)}>{label}</StrokeText>
      </span>
    </div>
  )
}

/**
 * The lobby's menu tiles down the left: PLAY (the chapters - or step on a play pad),
 * Perks, Skins, Quests, Stats and the Shop. A red "!" where something's waiting.
 */
export function LeftMenu() {
  const openPanel = useGame((s) => s.openPanel)
  const perkReady = useGame((s) => PERK_IDS.some((id) => perkCost(s.profile, id) <= s.profile.crystals))
  const skinReady = useGame((s) => SKINS.some((skin) => !s.profile.skins.includes(skin.id) && skin.price <= s.profile.crystals))
  const questReady = useGame((s) => Boolean(s.profile.quests && (s.profile.quests.list.some((q) => questDone(q) && !q.claimed) || questsReady(s.profile))))

  return (
    <div className="hud-menu pointer-events-none absolute grid grid-cols-2" style={{ gap: `${u(18)} ${u(22)}` }}>
      <Tile icon="door" label="Play" gradient={GRADIENTS.greenButton} onClick={() => openPanel('chapters')} onPointerEnter={prefetchStage} />
      <Tile icon="speed" label="Perks" gradient={GRADIENTS.purpleButton} onClick={() => openPanel('perks')} alert={perkReady} />
      <Tile icon="palette" label="Skins" gradient={GRADIENTS.redButton} onClick={() => openPanel('skins')} alert={skinReady} />
      <Tile icon="quest" label="Quests" gradient={GRADIENTS.goldButton} onClick={() => openPanel('quests')} alert={questReady} />
      <Tile icon="stats" label="Stats" gradient={GRADIENTS.blueButton} onClick={() => openPanel('stats')} />
      <Tile icon="store" label="Shop" gradient={GRADIENTS.slate} onClick={() => openPanel('store')} />
    </div>
  )
}

export default LeftMenu
