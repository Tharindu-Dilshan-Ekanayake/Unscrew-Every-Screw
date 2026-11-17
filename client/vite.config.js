import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

/**
 * A local Boxity stack: the API, the play (matchmaker) service and the portal. Static
 * files come from the local API too.
 */
const LOCAL_BLOXITY_ENV = {
  env: 'local',
  apiUrl: 'http://localhost:4000',
  playUrl: 'http://localhost:2567',
  portalUrl: 'http://localhost:3000',
  staticUrl: 'http://localhost:4000',
}

/**
 * The environment to hand the page in `vite dev`, from BLOXITY_DEV_ENV in the shell
 * (never a file):
 *   (unset)  nothing: the SDK uses its own defaults, so avatars, skins and guest
 *            pictures load as on Boxity (signing in needs the real portal, though)
 *   local    a local Boxity stack (LOCAL_BLOXITY_ENV)
 *   {...}    any other environment, given whole as JSON:
 *            BLOXITY_DEV_ENV='{"env":"stage","apiUrl":"...","playUrl":"...","portalUrl":"...","staticUrl":"..."}'
 */
function devEnvironment() {
  const raw = process.env.BLOXITY_DEV_ENV
  if (!raw) return null
  if (raw === 'local') return LOCAL_BLOXITY_ENV
  try {
    const env = JSON.parse(raw)
    if (env && typeof env === 'object' && env.env && env.apiUrl && env.playUrl && env.portalUrl && env.staticUrl) return env
  } catch {
    // Falls through to the warning.
  }
  console.warn('[bloxity] BLOXITY_DEV_ENV must be "local" or a whole environment as JSON; using the SDK defaults')
  return null
}

/**
 * `vite dev` only (`apply: 'serve'`, never in a build): when asked (devEnvironment), tells
 * the Boxity SDK - and src/bloxity/env.js - which environment to use, by injecting
 * `window.BLOXITY_ENV` ahead of every other script (so ahead of the SDK tag).
 *
 * Production builds get nothing: the page Boxity hosts the game in provides it.
 */
function bloxityDevEnv() {
  return {
    name: 'bloxity-dev-env',
    apply: 'serve',
    transformIndexHtml() {
      const env = devEnvironment()
      if (!env) return []
      return [
        {
          tag: 'script',
          children: `window.BLOXITY_ENV = ${JSON.stringify(env)};`,
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [bloxityDevEnv(), react(), tailwindcss()],
  resolve: {
    alias: {
      // Game rules and world layout, shared with the server.
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    // ../shared lives outside the client root.
    fs: { allow: ['..'] },
  },
  optimizeDeps: {
    // Dev-only perf overlay, imported lazily; pre-bundle it so the first ?perf load
    // doesn't hit a mid-session dependency re-optimisation.
    include: ['r3f-perf'],
  },
})
