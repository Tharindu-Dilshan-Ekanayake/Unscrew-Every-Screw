/**
 * The lobby's whole look in one place: a toy screw factory's yard on a bright, breezy
 * morning - warm cream paving, candy-teal and tangerine buildings, chunky navy trim.
 *
 * Colours are sRGB hex. Light intensities are three.js physical units: a light of
 * intensity PI (~3.14) lights a surface facing it to its full colour.
 */

export const SKY = {
  top: '#3580f0',
  horizon: '#cfe6fb',
  exponent: 0.55,
  sun: '#fff1cc',
  glow: 0.55,
  clouds: 0.8,
  stars: 0,
}

export const FOG = {
  color: SKY.horizon,
}

/** The yard's palette. */
export const PALETTE = {
  paving: '#e6d6b8',
  pavingEdge: '#cbb48c',
  lawn: '#5cc659',
  factory: '#25b5a8',
  factoryDark: '#147d74',
  trim: '#1d2b4f',
  accent: '#ff8a2a',
  accentDark: '#d4601a',
  sign: '#fff4d6',
  metal: '#c9d2dc',
  metalDark: '#8a96a6',
  brass: '#f2c04a',
  wood: '#c98f52',
  perks: '#8b5cff',
  skins: '#ff5c8a',
  quests: '#ffc21a',
}

export const LIGHTS = {
  // A softer, warmer morning than plain white light: a blue sky fill and a golden sun,
  // low enough that the cream paving doesn't wash out.
  hemiSky: '#c4d9ff',
  hemiGround: '#c2a985',
  hemiIntensity: 1.4,
  sunColor: '#ffdcae',
  sunIntensity: 1.6,
  /** Direction *towards* the sun: high in the south-east, so the factory front is lit. */
  sunDirection: [0.45, 0.8, 0.4],
  shadowIntensity: 0.55,
  shadowSoftness: 3,
}
