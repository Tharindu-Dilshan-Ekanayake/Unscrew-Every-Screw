import { lazy } from 'react'

/**
 * A run's rooms are their own chunk: the lobby never waits for them. Fetched in the
 * background as soon as you look at the chapters (prefetchStage), so entering a room
 * never stalls on a download.
 */
const loadStage = () => import('./stage/RunStage')

export const RunStage = lazy(loadStage)

export function prefetchStage() {
  loadStage().catch(() => null)
}
