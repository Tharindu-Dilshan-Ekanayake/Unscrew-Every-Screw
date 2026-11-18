import { useState } from 'react'

import { AD_REWARDS, GEM_PRODUCTS } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { adReady } from '@shared/logic'

import { buyGems, isRewardedAvailable, useGemsBalance, watchRewardedAd } from '../../bloxity/services'
import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import useNow from '../useNow'
import { ChunkyButton } from '../hud/parts'
import { CARD_GRID as GRID, GRADIENTS, u } from '../hud/style'
import { SectionTitle, ShopCard } from './cards'
import Panel from './Panel'

/**
 * Boxity Gems: real-currency extras, priced by Boxity's catalog (the game only names the
 * sku). The purchase is confirmed to the game server by Boxity, which then grants it;
 * offline it's granted here once Boxity says it went through.
 */
function GemsSection() {
  const balance = useGemsBalance()
  const passes = useGame((s) => s.profile.passes)
  const [busy, setBusy] = useState(null)
  const [message, setMessage] = useState(null)
  const purchase = async (sku) => {
    setBusy(sku)
    setMessage(null)
    const result = await buyGems(sku)
    setBusy(null)
    if (!result.success) setMessage(result.error ? `Purchase not completed: ${result.error}` : 'Purchase not completed')
  }
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between" style={{ gap: u(10) }}>
        <SectionTitle>Gems Shop</SectionTitle>
        {balance !== null && (
          <span style={{ fontSize: u(30) }}>
            <StrokeText stroke={u(6)} fill="#7fe2ff">
              {formatNumber(balance)} Gems
            </StrokeText>
          </span>
        )}
      </div>
      <div className="card-grid-3">
        {Object.entries(GEM_PRODUCTS).map(([sku, product]) => {
          const owned = Boolean(product.grant.pass && passes[product.grant.pass])
          return (
            <ShopCard key={sku} icon={product.icon} name={product.name} blurb={product.blurb} faded={owned}>
              <ChunkyButton gradient={owned ? GRADIENTS.greyButton : GRADIENTS.blueButton} disabled={owned || busy !== null} onClick={() => purchase(sku)} className="w-full" style={{ height: u(58) }}>
                <span style={{ fontSize: u(28) }}>
                  <StrokeText stroke={u(6)}>{owned ? 'Owned' : busy === sku ? '...' : 'Buy with Gems'}</StrokeText>
                </span>
              </ChunkyButton>
            </ShopCard>
          )
        })}
      </div>
      {message && (
        <p className="m-0 text-center" style={{ fontSize: u(24), marginTop: u(8) }}>
          <StrokeText stroke={u(5)} fill="#ffd27a">
            {message}
          </StrokeText>
        </p>
      )}
    </div>
  )
}

/** Free rewards for watching an ad (Boxity rewarded ads), when Boxity has one to show. */
function FreeSection() {
  const profile = useGame((s) => s.profile)
  const now = useNow(1000)
  const [state, setState] = useState({})
  if (!isRewardedAvailable()) return null
  const watch = async (placement) => {
    setState((s) => ({ ...s, [placement]: 'watching' }))
    const result = await watchRewardedAd(placement)
    setState((s) => ({ ...s, [placement]: result.ok ? 'done' : 'retry' }))
  }
  return (
    <div>
      <SectionTitle>Free Rewards</SectionTitle>
      <div className="grid" style={GRID}>
        {Object.entries(AD_REWARDS).map(([placement, reward]) => {
          const status = state[placement]
          const ready = adReady(profile, placement, now)
          return (
            <ShopCard key={placement} icon={reward.icon} name={reward.label} blurb="Watch a short ad to get it">
              <ChunkyButton gradient={ready ? GRADIENTS.greenButton : GRADIENTS.greyButton} disabled={!ready || status === 'watching'} onClick={() => watch(placement)} className="w-full" style={{ height: u(58) }}>
                <span style={{ fontSize: u(28) }}>
                  <StrokeText stroke={u(6)}>{!ready ? 'Come back soon' : status === 'watching' ? '...' : status === 'retry' ? 'Try again' : 'Watch Ad'}</StrokeText>
                </span>
              </ChunkyButton>
            </ShopCard>
          )
        })}
      </div>
    </div>
  )
}

export function StorePanel() {
  return (
    <Panel title="SHOP" icon="store" width={1100}>
      <div className="flex flex-col" style={{ gap: u(18) }}>
        <FreeSection />
        <GemsSection />
      </div>
    </Panel>
  )
}

export default StorePanel
