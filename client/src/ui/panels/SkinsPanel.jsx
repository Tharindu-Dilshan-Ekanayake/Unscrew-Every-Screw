import { SKINS } from '@shared/balance'

import { sfx } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { ChunkyButton, Price } from '../hud/parts'
import { CARD_GRID as GRID, GRADIENTS, u } from '../hud/style'
import { ShopCard } from './cards'
import Panel from './Panel'

/** A screwdriver drawn in the skin's colours. */
function SkinPreview({ skin }) {
  return (
    <svg viewBox="0 0 100 100" width={u(96)} height={u(96)} style={{ filter: skin.glow ? `drop-shadow(0 0 6px ${skin.accent})` : 'none' }}>
      <path d="M44 56 82 18" stroke="#1b1b1f" strokeWidth="11" strokeLinecap="round" />
      <path d="M44 56 82 18" stroke="#cdd5de" strokeWidth="5" strokeLinecap="round" />
      <path d="M14 86 44 56" stroke="#1b1b1f" strokeWidth="24" strokeLinecap="round" />
      <path d="M14 86 44 56" stroke={skin.grip} strokeWidth="16" strokeLinecap="round" />
      <path d="M22 78 28 72M32 68l6-6" stroke={skin.accent} strokeWidth="16" />
    </svg>
  )
}

/** The paint shop: tool skins for Crystals. Others see yours in the lobby too. */
export function SkinsPanel() {
  const profile = useGame((s) => s.profile)
  return (
    <Panel title="SKINS" icon="palette" width={1100}>
      <div className="grid" style={GRID}>
        {SKINS.map((skin) => {
          const owned = profile.skins.includes(skin.id)
          const equipped = profile.skin === skin.id
          const afford = profile.crystals >= skin.price
          return (
            <ShopCard key={skin.id} iconNode={<SkinPreview skin={skin} />} name={skin.name} highlight={equipped}>
              <ChunkyButton
                gradient={equipped ? GRADIENTS.greyButton : owned ? GRADIENTS.blueButton : afford ? GRADIENTS.greenButton : GRADIENTS.slate}
                disabled={equipped}
                onClick={() => {
                  if (owned) {
                    sfx.equip()
                    actions.equipSkin(skin.id)
                  } else if (afford) {
                    sfx.buy()
                    actions.buySkin(skin.id)
                  } else sfx.error()
                }}
                className="w-full"
                style={{ height: u(58), marginTop: u(6) }}
              >
                {owned ? (
                  <span style={{ fontSize: u(30) }}>
                    <StrokeText stroke={u(6)}>{equipped ? 'EQUIPPED' : 'EQUIP'}</StrokeText>
                  </span>
                ) : (
                  <Price amount={skin.price} icon="crystal" size={30} afford={afford} />
                )}
              </ChunkyButton>
            </ShopCard>
          )
        })}
      </div>
    </Panel>
  )
}

export default SkinsPanel
