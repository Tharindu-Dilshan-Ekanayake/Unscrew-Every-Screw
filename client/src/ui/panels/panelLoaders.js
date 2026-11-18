/**
 * Each modal panel's code, loaded on its own: none of it is needed to start playing, so
 * it stays out of the start-up bundle and is fetched in the background once the game is
 * up (prefetchPanels), so opening a panel still never waits.
 */
export const PANEL_LOADERS = {
  chapters: () => import('./ChaptersPanel'),
  perks: () => import('./PerksPanel'),
  skins: () => import('./SkinsPanel'),
  quests: () => import('./QuestsPanel'),
  stats: () => import('./StatsPanel'),
  upgrades: () => import('./UpgradesPanel'),
  leave: () => import('./LeavePanel'),
  daily: () => import('./DailyRewardsPanel'),
  store: () => import('./StorePanel'),
  leaderboards: () => import('./LeaderboardsPanel'),
  settings: () => import('./SettingsPanel'),
}

/** Fetches every panel in the background, when the browser is idle. */
export function prefetchPanels() {
  const fetchAll = () => {
    for (const load of Object.values(PANEL_LOADERS)) load().catch(() => null)
  }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fetchAll, { timeout: 4000 })
  else setTimeout(fetchAll, 1500)
}
