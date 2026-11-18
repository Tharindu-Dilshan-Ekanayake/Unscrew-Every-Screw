import { create } from 'zustand'

import { createProfile } from '@shared/logic'

/**
 * Everything the UI renders from. Written by the network layer (profile, events) and
 * the 10 Hz game ticker (zones, prompts) - never from a frame loop.
 *
 * Components must select narrowly (`useGame((s) => s.profile.crystals)`), so a change
 * re-renders the label that shows it and nothing else.
 */
export const useGame = create((set) => ({
  /** Authoritative copy of the player's save, as last sent by the server. */
  profile: createProfile('local', 'Player'),
  session: null,
  /** True once the first real profile has arrived. */
  profileLoaded: false,
  /** True once the game is on screen; non-essential start-up work waits for it. */
  playable: false,

  net: {
    /** 'connecting' | 'online' | 'offline' | 'replaced' */
    mode: 'connecting',
    lobbyId: null,
    code: null,
    isPrivate: false,
    players: 1,
    maxPlayers: 20,
    message: null,
  },
  leaderboards: null,

  /** Where the player is standing, from the ticker: lobby station / room prompts. */
  zone: { pad: null, station: null, hopper: false, pedestal: -1, door: false },

  /** Which modal panel is open ('chapters' | 'perks' | 'skins' | 'upgrades' | ...). */
  panel: null,
  panelData: null,

  /**
   * Your party forming (from the authority): `{ id, host, hostIsYou, chapter, diff, size,
   * action, names, endsAt }` - `endsAt` on this machine's clock - or null.
   */
  countdown: null,
  /**
   * The team pads (from the authority): `[{ id, size, names, seat, chapter, diff, action,
   * endsAt }]` - `seat` is yours (-1: not on it; 0: you're its host), `endsAt` (this
   * machine's clock) is set while it counts down to the start.
   */
  pads: [],
  /** Run is loading (the room chunk / teleport): a cover over the switch. */
  entering: false,
  /** The last chapter cleared, for its results screen. */
  clear: null,
  /** A short celebration banner: { text, id }. */
  toast: null,
  /** "Too far!" and other short hints near the crosshair: { text, id }. */
  hint: null,

  // --- Actions -----------------------------------------------------------------

  setProfile: (profile, session) => set((s) => ({ profile, session: session || s.session, profileLoaded: true })),
  /** Merges fields into the run (from 'unscrewed' / 'sold' events) without a whole profile. */
  patchRun: (patch) => set((s) => (s.profile.run ? { profile: { ...s.profile, run: { ...s.profile.run, ...patch } } } : {})),
  patchProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
  setNet: (patch) => set((s) => ({ net: { ...s.net, ...patch } })),
  setZone: (zone) => set({ zone }),
  setPlayable: () => set({ playable: true }),
  setLeaderboards: (leaderboards) => set({ leaderboards }),

  openPanel: (panel, panelData = null) => set({ panel, panelData }),
  closePanel: () => set({ panel: null, panelData: null }),
  togglePanel: (panel) => set((s) => (s.panel === panel ? { panel: null, panelData: null } : { panel, panelData: null })),

  setCountdown: (countdown) => set({ countdown }),
  setParties: (countdown) => set({ countdown }),
  setPads: (pads) => set({ pads }),
  setEntering: (entering) => set({ entering }),
  setClear: (clear) => set({ clear }),
  showToast: (text) => set({ toast: { text, id: Date.now() + Math.random() } }),
  showHint: (text) => set({ hint: { text, id: Date.now() + Math.random() } }),
}))

/** Non-reactive snapshot for timers and non-React code. */
export const getGame = () => useGame.getState()

/** Whether you're inside a run's room right now. */
export const inRun = (state = getGame()) => Boolean(state.profile.run?.active)
