/**
 * Where Boxity's screen ads go while a panel is open, and the room the panel leaves for
 * them. Boxity draws the ads over the game (left, right, bottom-centre); the game picks
 * which of those slots fit the screen, so a panel never ends up under an ad.
 */

/** The panel screen's slots, as declared to Boxity (integration.js AD_SCREENS). */
export const PANEL_AD_SLOTS = [
  { position: 'middle-left', sizes: ['300x250', '160x600'] },
  { position: 'middle-right', sizes: ['300x600', '300x250', '160x600'] },
  { position: 'bottom-center', sizes: ['728x90', '320x50'] },
]

/** Space between an ad and the panel or the screen's edge, in CSS pixels. */
const AD_GAP = 12
/** Boxity's "ADVERTISEMENT" caption over each ad. */
const AD_LABEL = 16

/**
 * The slots to use on a `width` x `height` screen (CSS pixels) and the room to keep clear
 * for them: side ads only where the panel still has a comfortable width between them
 * (big ones from 1500 px, slim ones from 1150 px), the bottom banner only where the panel
 * keeps its height (the small banner on phones held upright; none when short).
 *
 * @returns {{ sizes: Record<string, string>, skip: string[], insets: { left: number, right: number, bottom: number } }}
 */
export function panelAdPlan(width, height) {
  const sizes = {}
  const skip = []
  let side = 0
  if (width >= 1500) {
    sizes['middle-left'] = '300x250'
    sizes['middle-right'] = height >= 680 ? '300x600' : '300x250'
    side = 300
  } else if (width >= 1150 && height >= 680) {
    sizes['middle-left'] = '160x600'
    sizes['middle-right'] = '160x600'
    side = 160
  } else {
    skip.push('middle-left', 'middle-right')
  }
  let bottom = 0
  if (width >= 760 && height >= 760) {
    sizes['bottom-center'] = '728x90'
    bottom = 90
  } else if (width >= 340 && height >= 480) {
    sizes['bottom-center'] = '320x50'
    bottom = 50
  } else {
    skip.push('bottom-center')
  }
  const sideRoom = side ? side + AD_GAP * 2 : 0
  return { sizes, skip, insets: { left: sideRoom, right: sideRoom, bottom: bottom ? bottom + AD_LABEL + AD_GAP * 2 : 0 } }
}
