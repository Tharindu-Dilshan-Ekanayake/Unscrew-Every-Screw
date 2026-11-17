import { getSDK, safeCall, toUnsubscribe, waitForSDK } from './sdk.js'

/**
 * Which Boxity deployment this page talks to: prod, stage or a local stack.
 *
 * The ONE place the game finds Boxity's URLs, and it never writes one down: Boxity
 * tells the page where it runs. Nothing may hardcode an api/play/static/portal URL or
 * guess the environment from the hostname, the referrer or a build flag.
 *
 *  - Once the SDK has loaded, `Legion.SDK.environment()` is the answer (and
 *    `Legion.SDK.onEnvironmentChanged` reports a change).
 *  - Before that, `window.BLOXITY_ENV` - the same object the SDK reads, injected by the
 *    host page (or, in `vite dev`, by the plugin in vite.config.js).
 *  - With neither (the SDK script blocked or failed), null: there is no Boxity to talk
 *    to, and everything that needs it falls back (guest play, the stand-in avatar).
 */

const ENVS = ['prod', 'stage', 'local']
const URL_KEYS = ['apiUrl', 'playUrl', 'portalUrl', 'staticUrl']

/** A trimmed http(s)/ws(s) origin without a trailing slash, or null. */
function cleanUrl(value) {
  if (typeof value !== 'string') return null
  const url = value.trim().replace(/\/+$/, '')
  return /^(https?|wss?):\/\/[^\s/]+/i.test(url) ? url : null
}

/**
 * Validates an environment object the same way the SDK does: a known `env` and all
 * four URLs, or nothing.
 */
function parseEnvironment(raw) {
  if (!raw || typeof raw !== 'object' || !ENVS.includes(raw.env)) return null
  const out = { env: raw.env }
  for (const key of URL_KEYS) {
    const url = cleanUrl(raw[key])
    if (!url) return null
    out[key] = url
  }
  return out
}

/**
 * The current environment: `{ env, apiUrl, playUrl, portalUrl, staticUrl }`, or null
 * when Boxity hasn't told us one. Cheap enough to call whenever a URL is built; never
 * cache its result in a module constant (the SDK may report a different one once it
 * loads).
 */
export function environment() {
  const sdk = getSDK()
  const fromSdk = sdk ? parseEnvironment(safeCall(sdk.environment?.bind(sdk))) : null
  if (fromSdk) return fromSdk
  return typeof window !== 'undefined' ? parseEnvironment(window.BLOXITY_ENV) : null
}

/** The environment's URLs; '' when there is none, so a request fails instead of guessing. */
export const apiUrl = () => environment()?.apiUrl ?? ''
export const playUrl = () => environment()?.playUrl ?? ''
export const staticUrl = () => environment()?.staticUrl ?? ''

/**
 * Calls `listener(environment())` whenever the SDK reports a change. Waits for the SDK
 * if it isn't there yet; returns the unsubscribe.
 */
export function onEnvironmentChanged(listener) {
  let unsubscribe = () => {}
  let cancelled = false
  waitForSDK()
    .then((sdk) => {
      if (cancelled || typeof sdk.onEnvironmentChanged !== 'function') return
      unsubscribe = toUnsubscribe(safeCall(sdk.onEnvironmentChanged.bind(sdk), () => listener(environment())))
    })
    .catch(() => {})
  return () => {
    cancelled = true
    safeCall(unsubscribe)
  }
}
