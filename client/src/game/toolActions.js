import { TOOLS } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { toolPrice, upgradeCost } from '@shared/logic'

import { sfx } from '../audio/sfx'
import { actions } from '../net/actions'
import { getGame } from '../store/game'

/**
 * What the hotbar, the number keys and the pedestals do with a tool: equip it if you
 * own it, buy it if you can afford it, or say how much more you need. The authority
 * checks and charges; this only spares a round trip when the answer is obviously no.
 */
export function pickToolSlot(index) {
  const game = getGame()
  const run = game.profile.run
  const tool = TOOLS[index]
  if (!run?.active || !tool) return
  if (run.tools.includes(tool.id)) {
    if (run.tool !== tool.id) {
      sfx.equip()
      actions.equipTool(tool.id)
    }
    return
  }
  buyTool(tool.id)
}

export function buyTool(id) {
  const game = getGame()
  const run = game.profile.run
  const tool = TOOLS.find((t) => t.id === id)
  if (!run?.active || !tool || run.tools.includes(id)) return
  const price = toolPrice(game.profile, id)
  if (run.cash < price) {
    sfx.error()
    game.showHint(`Need $${formatNumber(price - run.cash)} more for the ${tool.name}`)
    return
  }
  sfx.buy()
  actions.buyTool(id)
  game.showToast(`NEW TOOL: ${tool.name}!`)
}

export function buyUpgrade(stat) {
  const game = getGame()
  const run = game.profile.run
  if (!run?.active) return
  const cost = upgradeCost(game.profile, stat)
  if (!Number.isFinite(cost)) return
  if (run.cash < cost) {
    sfx.error()
    return
  }
  sfx.upgrade()
  actions.upgrade(stat)
}
