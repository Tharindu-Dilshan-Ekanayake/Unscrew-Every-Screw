/**
 * The game's icon set, hand-drawn as SVG: glossy cartoon style with thick dark outlines,
 * matching the reference HUD. Strings rather than components so the same art feeds
 * both the DOM HUD (<img src>) and the canvas-drawn 3D world labels.
 *
 * Every icon uses a 100x100 viewBox. Gradient ids are prefixed per icon so icons can
 * be inlined side by side without clashing.
 */

const OUT = '#1b1b1f'


const svg = (body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>${defs}</defs>${body}</svg>`

const vgrad = (id, stops) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops
    .map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`)
    .join('')}</linearGradient>`

const GOLD = [
  [0, '#fff6a3'],
  [0.45, '#ffcf2e'],
  [1, '#f08c00'],
]

const trophy = svg(
  `<g stroke="${OUT}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <path d="M27 24H11c0 19 9 28 22 30" fill="none" stroke-width="13"/>
    <path d="M73 24h16c0 19-9 28-22 30" fill="none" stroke-width="13"/>
  </g>
  <g fill="none" stroke="url(#tr-g)" stroke-width="5" stroke-linecap="round">
    <path d="M27 24H11c0 19 9 28 22 30"/><path d="M73 24h16c0 19-9 28-22 30"/>
  </g>
  <g stroke="${OUT}" stroke-width="5" stroke-linejoin="round" fill="url(#tr-g)">
    <path d="M42 62h16l3 15H39z"/>
    <rect x="27" y="76" width="46" height="15" rx="5"/>
    <path d="M22 12h56v22c0 19-12 30-28 30S22 53 22 34z"/>
  </g>
  <path d="M50 21l4.6 9.4 10.4 1.5-7.5 7.3 1.8 10.3L50 44.6l-9.3 4.9 1.8-10.3-7.5-7.3 10.4-1.5z" fill="#fffbd1" stroke="#d98900" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M30 18v16c0 8 3 14 8 18" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" opacity=".75"/>`,
  vgrad('tr-g', GOLD),
)

const store = svg(
  `<path d="M26 44c0-34 48-34 48 0" fill="none" stroke="${OUT}" stroke-width="14" stroke-linecap="round"/>
  <path d="M26 44c0-34 48-34 48 0" fill="none" stroke="#5fc4ff" stroke-width="6" stroke-linecap="round"/>
  <path d="M8 40h84l-9 48c-1 4-4 6-8 6H25c-4 0-7-2-8-6z" fill="url(#st-y)" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>
  <rect x="5" y="36" width="90" height="13" rx="6" fill="#ffe46b" stroke="${OUT}" stroke-width="5"/>
  <path d="M30 58v26M43 58v26M57 58v26M70 58v26" stroke="#d18a00" stroke-width="5" stroke-linecap="round"/>
  <path d="M18 66h64" stroke="#d18a00" stroke-width="4" stroke-linecap="round"/>`,
  vgrad('st-y', [
    [0, '#ffe25a'],
    [1, '#ffa412'],
  ]),
)

const calendar = svg(
  `<rect x="10" y="16" width="80" height="76" rx="12" fill="#ffffff" stroke="${OUT}" stroke-width="6"/>
  <path d="M10 28c0-7 5-12 12-12h56c7 0 12 5 12 12v12H10z" fill="url(#cl-r)" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>
  <rect x="26" y="6" width="9" height="20" rx="4" fill="#cfd8e3" stroke="${OUT}" stroke-width="4"/>
  <rect x="65" y="6" width="9" height="20" rx="4" fill="#cfd8e3" stroke="${OUT}" stroke-width="4"/>
  <g fill="#ff9a1f"><rect x="22" y="50" width="12" height="10" rx="2"/><rect x="44" y="50" width="12" height="10" rx="2"/><rect x="66" y="50" width="12" height="10" rx="2"/><rect x="22" y="68" width="12" height="10" rx="2"/><rect x="44" y="68" width="12" height="10" rx="2" fill="#2fd14a"/><rect x="66" y="68" width="12" height="10" rx="2"/></g>`,
  vgrad('cl-r', [
    [0, '#ff6b6b'],
    [1, '#d91c3a'],
  ]),
)

/** A chunky cog for Settings. */
const settingsTeeth = Array.from({ length: 8 }, (_, i) => `<rect x="42" y="6" width="16" height="20" rx="4" transform="rotate(${i * 45} 50 50)"/>`).join('')
const settings = svg(
  `<g fill="url(#se-g)" stroke="${OUT}" stroke-width="5" stroke-linejoin="round">${settingsTeeth}<circle cx="50" cy="50" r="31"/></g>
  <g fill="url(#se-g)">${settingsTeeth}</g>
  <circle cx="50" cy="50" r="27" fill="url(#se-g)"/>
  <circle cx="50" cy="50" r="12" fill="#2c344d" stroke="${OUT}" stroke-width="5"/>
  <path d="M30 40c3-7 9-12 16-13" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/>`,
  vgrad('se-g', [
    [0, '#e8eef6'],
    [1, '#9aa6b8'],
  ]),
)

const star = svg(
  `<path d="M50 8l12 25 27 4-20 19 5 27-24-13-24 13 5-27-20-19 27-4z" fill="#ffffff" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>`,
)

const close = svg(
  `<path d="M24 24l52 52M76 24L24 76" stroke="${OUT}" stroke-width="22" stroke-linecap="round"/>
  <path d="M24 24l52 52M76 24L24 76" stroke="#fff" stroke-width="11" stroke-linecap="round"/>`,
)

const arrowDown = svg(
  `<path d="M36 8h28v40h20L50 90 16 48h20z" fill="#ffffff" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>`,
)

const check = svg(
  `<path d="M16 52l22 22 46-48" fill="none" stroke="${OUT}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M16 52l22 22 46-48" fill="none" stroke="#5cf064" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`,
)

const starGold = svg(
  `<path d="M50 6l13 27 29 4-21 20 5 29-26-14-26 14 5-29L8 37l29-4z" fill="url(#sg-g)" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M38 30l7-13" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".75"/>`,
  vgrad('sg-g', GOLD),
)

const fastForward = svg(
  `<path d="M8 18l40 32-40 32z" fill="url(#ff-g)" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M50 18l40 32-40 32z" fill="url(#ff-g)" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>`,
  vgrad('ff-g', [
    [0, '#ffffff'],
    [1, '#9fdcff'],
  ]),
)

const SPEAKER = `<path d="M14 38h16l22-18v60L30 62H14z" fill="url(#sp-g)" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M20 44h8" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/>`
const SPEAKER_GRADIENT = vgrad('sp-g', [
  [0, '#ffffff'],
  [1, '#c7d3e3'],
])

const sound = svg(
  `${SPEAKER}
  <path d="M62 38c6 7 6 17 0 24M72 30c11 11 11 29 0 40" fill="none" stroke="${OUT}" stroke-width="12" stroke-linecap="round"/>
  <path d="M62 38c6 7 6 17 0 24M72 30c11 11 11 29 0 40" fill="none" stroke="#7fe2ff" stroke-width="5" stroke-linecap="round"/>`,
  SPEAKER_GRADIENT,
)

const soundOff = svg(
  `${SPEAKER}
  <path d="M62 38l22 24M84 38L62 62" stroke="${OUT}" stroke-width="13" stroke-linecap="round"/>
  <path d="M62 38l22 24M84 38L62 62" stroke="#ff5a5a" stroke-width="6" stroke-linecap="round"/>`,
  SPEAKER_GRADIENT,
)

/** A quest scroll: parchment with two ticked lines and a red seal. */
const quest = svg(
  `<path d="M22 12h50c8 0 12 5 12 12v54c0 7-5 12-12 12H28c-7 0-12-5-12-12V18c0-4 2-6 6-6z" fill="url(#qu-g)" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M28 34l6 6 10-12M28 58l6 6 10-12" fill="none" stroke="#2fae4a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M52 36h20M52 60h20" stroke="${OUT}" stroke-width="5" stroke-linecap="round" opacity=".55"/>
  <circle cx="74" cy="80" r="11" fill="#ff4a5a" stroke="${OUT}" stroke-width="5"/>
  <path d="M26 20h40" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/>`,
  vgrad('qu-g', [
    [0, '#fff6d6'],
    [1, '#f2cf86'],
  ]),
)

/** A streak flame: orange outside, gold within. */
const flame = svg(
  `<path d="M50 6c6 18 28 26 28 52 0 18-12 34-28 34S22 76 22 58c0-14 8-20 12-30 2 10 8 14 8 14 0-14 2-26 8-36z" fill="url(#fl-g)" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M50 50c4 8 14 12 14 24 0 9-6 14-14 14s-14-5-14-14c0-8 6-12 8-18 2 5 6 6 6 6 0-5-2-8 0-12z" fill="#ffe56b"/>`,
  vgrad('fl-g', [
    [0, '#ffcf3a'],
    [0.6, '#ff7a1e'],
    [1, '#e8350f'],
  ]),
)

/** Two friends side by side. */
const friends = svg(
  `<circle cx="34" cy="34" r="14" fill="#ffd27a" stroke="${OUT}" stroke-width="6"/>
  <circle cx="66" cy="30" r="14" fill="#ffd27a" stroke="${OUT}" stroke-width="6"/>
  <path d="M10 88c0-18 10-30 24-30s24 12 24 30z" fill="#4fb8ff" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M44 84c0-18 9-30 22-30s24 12 24 30z" fill="#ff6ab8" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>`,
)

const solo = svg(
  `<circle cx="50" cy="30" r="17" fill="#ffd27a" stroke="${OUT}" stroke-width="6"/>
  <path d="M20 90c0-22 13-36 30-36s30 14 30 36z" fill="#3fd17f" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>`,
)

const crystal = svg(
  `<path d="M50 6 80 34 50 94 20 34z" fill="url(#cr-g)" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M20 34h60M50 6 38 34l12 60 12-60z" fill="none" stroke="#0a5a8a" stroke-width="3" stroke-linejoin="round" opacity=".55"/>
  <path d="M33 30l10-14" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".85"/>`,
  vgrad('cr-g', [
    [0, '#e6fdff'],
    [0.5, '#5fe6ff'],
    [1, '#1f8fff'],
  ]),
)

const cash = svg(
  `<circle cx="50" cy="50" r="40" fill="url(#ca-g)" stroke="${OUT}" stroke-width="6"/>
  <circle cx="50" cy="50" r="29" fill="none" stroke="#2b8a1e" stroke-width="3" opacity=".6"/>
  <path d="M60 37c-2-5-7-7-11-7-7 0-11 4-11 9 0 12 23 7 23 19 0 5-5 9-12 9-5 0-10-2-12-7M49 24v52" fill="none" stroke="${OUT}" stroke-width="6" stroke-linecap="round"/>
  <path d="M28 34c3-6 8-10 14-12" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>`,
  vgrad('ca-g', [
    [0, '#d8ff9a'],
    [0.55, '#6fe23a'],
    [1, '#2fae2a'],
  ]),
)

const bag = svg(
  `<path d="M30 30c0-14 40-14 40 0" fill="none" stroke="${OUT}" stroke-width="7" stroke-linecap="round"/>
  <path d="M18 34h64l-6 54H24z" fill="url(#bg-g)" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>
  <circle cx="40" cy="58" r="7" fill="#d7dbe0" stroke="${OUT}" stroke-width="3"/><path d="M36 58h8M40 54v8" stroke="${OUT}" stroke-width="2.5"/>
  <circle cx="60" cy="66" r="7" fill="#d7dbe0" stroke="${OUT}" stroke-width="3"/><path d="M56 66h8M60 62v8" stroke="${OUT}" stroke-width="2.5"/>`,
  vgrad('bg-g', [
    [0, '#ffd27a'],
    [1, '#e0892a'],
  ]),
)

const screw = svg(
  `<path d="M42 44h16v34l-8 14-8-14z" fill="#b9c2cc" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M42 54l16-5M42 64l16-5M42 74l16-5" stroke="${OUT}" stroke-width="3.5"/>
  <ellipse cx="50" cy="34" rx="30" ry="16" fill="url(#sc-g)" stroke="${OUT}" stroke-width="6"/>
  <path d="M38 34h24M50 27v14" stroke="${OUT}" stroke-width="6" stroke-linecap="round"/>`,
  vgrad('sc-g', [
    [0, '#ffffff'],
    [1, '#9aa1aa'],
  ]),
)

const speed = svg(
  `<path d="M56 6 20 56h26l-8 38 42-54H52z" fill="url(#sp-g)" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M48 20 34 44" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/>`,
  vgrad('sp-g', GOLD),
)

const reach = svg(
  `<circle cx="50" cy="50" r="36" fill="none" stroke="${OUT}" stroke-width="10"/>
  <circle cx="50" cy="50" r="36" fill="none" stroke="#5fe6ff" stroke-width="5"/>
  <circle cx="50" cy="50" r="18" fill="none" stroke="${OUT}" stroke-width="9"/>
  <circle cx="50" cy="50" r="18" fill="none" stroke="#ff6a55" stroke-width="4"/>
  <circle cx="50" cy="50" r="6" fill="#ff6a55" stroke="${OUT}" stroke-width="4"/>`,
)

const upgrade = svg(
  `<path d="M50 8 86 46H64v14H36V46H14z" fill="url(#up-g)" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M50 44 80 74H62v18H38V74H20z" fill="url(#up-g)" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>`,
  vgrad('up-g', [
    [0, '#e8fbff'],
    [1, '#2fb8ff'],
  ]),
)

const lock = svg(
  `<path d="M32 44V32a18 18 0 0 1 36 0v12" fill="none" stroke="${OUT}" stroke-width="9"/>
  <path d="M32 44V32a18 18 0 0 1 36 0v12" fill="none" stroke="#c9d2dc" stroke-width="4"/>
  <rect x="20" y="42" width="60" height="46" rx="8" fill="url(#lk-g)" stroke="${OUT}" stroke-width="6"/>
  <circle cx="50" cy="62" r="6" fill="${OUT}"/><path d="M50 64v10" stroke="${OUT}" stroke-width="5"/>`,
  vgrad('lk-g', GOLD),
)

const luck = svg(
  `<circle cx="50" cy="44" r="26" fill="url(#lu-g)" stroke="${OUT}" stroke-width="6"/>
  <circle cx="50" cy="44" r="12" fill="#fff" stroke="${OUT}" stroke-width="5"/>
  <circle cx="50" cy="44" r="5" fill="${OUT}"/>
  <path d="M68 64 86 88" stroke="${OUT}" stroke-width="10" stroke-linecap="round"/>`,
  vgrad('lu-g', [
    [0, '#d9c9ff'],
    [1, '#8b5cff'],
  ]),
)

const drone = svg(
  `<path d="M24 30 42 46M76 30 58 46M24 70l18-16M76 70 58 54" stroke="${OUT}" stroke-width="7" stroke-linecap="round"/>
  <rect x="34" y="38" width="32" height="24" rx="8" fill="url(#dr-g)" stroke="${OUT}" stroke-width="6"/>
  <ellipse cx="20" cy="26" rx="14" ry="5" fill="#e8edf2" stroke="${OUT}" stroke-width="4"/>
  <ellipse cx="80" cy="26" rx="14" ry="5" fill="#e8edf2" stroke="${OUT}" stroke-width="4"/>
  <ellipse cx="20" cy="74" rx="14" ry="5" fill="#e8edf2" stroke="${OUT}" stroke-width="4"/>
  <ellipse cx="80" cy="74" rx="14" ry="5" fill="#e8edf2" stroke="${OUT}" stroke-width="4"/>
  <circle cx="50" cy="50" r="5" fill="#3dfcff" stroke="${OUT}" stroke-width="3"/>`,
  vgrad('dr-g', GOLD),
)

const sell = svg(
  `<ellipse cx="50" cy="62" rx="38" ry="18" fill="#2e3440" stroke="${OUT}" stroke-width="6"/>
  <ellipse cx="50" cy="60" rx="26" ry="10" fill="#050506"/>
  <path d="M50 8v34M38 30l12 12 12-12" fill="none" stroke="${OUT}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M50 8v34M38 30l12 12 12-12" fill="none" stroke="#ffd23a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
)

const palette = svg(
  `<path d="M50 10C26 10 10 28 10 48c0 22 18 40 36 40 8 0 9-6 6-11-3-6 1-11 8-11h10c11 0 20-8 20-20C90 26 72 10 50 10z" fill="url(#pa-g)" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>
  <circle cx="32" cy="42" r="7" fill="#ff3b55" stroke="${OUT}" stroke-width="3"/>
  <circle cx="46" cy="27" r="7" fill="#2fa8ff" stroke="${OUT}" stroke-width="3"/>
  <circle cx="64" cy="29" r="7" fill="#5df0b0" stroke="${OUT}" stroke-width="3"/>
  <circle cx="74" cy="45" r="7" fill="#ffd24a" stroke="${OUT}" stroke-width="3"/>`,
  vgrad('pa-g', [
    [0, '#fff3dc'],
    [1, '#e8c48a'],
  ]),
)

const clock = svg(
  `<circle cx="50" cy="52" r="38" fill="#fff" stroke="${OUT}" stroke-width="6"/>
  <path d="M50 28v24l16 10" fill="none" stroke="${OUT}" stroke-width="7" stroke-linecap="round"/>
  <path d="M40 8h20" stroke="${OUT}" stroke-width="8" stroke-linecap="round"/>`,
)

const door = svg(
  `<rect x="22" y="10" width="56" height="82" rx="6" fill="url(#do-g)" stroke="${OUT}" stroke-width="6"/>
  <circle cx="64" cy="54" r="5" fill="#ffd23a" stroke="${OUT}" stroke-width="3"/>
  <path d="M8 92h84" stroke="${OUT}" stroke-width="6" stroke-linecap="round"/>`,
  vgrad('do-g', [
    [0, '#ffb07a'],
    [1, '#d4601a'],
  ]),
)

const stats = svg(
  `<rect x="14" y="54" width="18" height="34" rx="3" fill="#5fe6ff" stroke="${OUT}" stroke-width="5"/>
  <rect x="41" y="34" width="18" height="54" rx="3" fill="#ffd23a" stroke="${OUT}" stroke-width="5"/>
  <rect x="68" y="14" width="18" height="74" rx="3" fill="#ff6a8a" stroke="${OUT}" stroke-width="5"/>`,
)

const home = svg(
  `<path d="M10 50 50 14l40 36" fill="none" stroke="${OUT}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M22 44v44h56V44L50 20z" fill="url(#ho-g)" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>
  <rect x="42" y="60" width="16" height="28" fill="#8a5a32" stroke="${OUT}" stroke-width="4"/>`,
  vgrad('ho-g', [
    [0, '#ff9c9c'],
    [1, '#e8323a'],
  ]),
)

const driver = svg(
  `<path d="M14 86 34 66" stroke="${OUT}" stroke-width="16" stroke-linecap="round"/>
  <path d="M14 86 34 66" stroke="#ffcc22" stroke-width="9" stroke-linecap="round"/>
  <path d="M38 62 80 20" stroke="${OUT}" stroke-width="10" stroke-linecap="round"/>
  <path d="M38 62 80 20" stroke="#cdd5de" stroke-width="5" stroke-linecap="round"/>`,
)

const drill = svg(
  `<rect x="20" y="24" width="50" height="26" rx="8" fill="url(#dl-g)" stroke="${OUT}" stroke-width="6"/>
  <path d="M34 50 28 86h20l4-36" fill="#2a2e35" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>
  <rect x="70" y="30" width="10" height="14" fill="#2a2e35" stroke="${OUT}" stroke-width="4"/>
  <path d="M80 37h14" stroke="${OUT}" stroke-width="6" stroke-linecap="round"/>`,
  vgrad('dl-g', GOLD),
)

const ratchet = svg(
  `<circle cx="64" cy="36" r="24" fill="url(#ra-g)" stroke="${OUT}" stroke-width="6"/>
  <circle cx="64" cy="36" r="9" fill="#2a2e35"/>
  <path d="M46 54 16 84" stroke="${OUT}" stroke-width="16" stroke-linecap="round"/>
  <path d="M46 54 16 84" stroke="#2fa8ff" stroke-width="9" stroke-linecap="round"/>`,
  vgrad('ra-g', [
    [0, '#ffffff'],
    [1, '#9aa1aa'],
  ]),
)

const magnet = svg(
  `<path d="M18 14h22v40a10 10 0 0 0 20 0V14h22v40a32 32 0 0 1-64 0z" fill="#e8323a" stroke="${OUT}" stroke-width="6" stroke-linejoin="round"/>
  <rect x="18" y="14" width="22" height="16" fill="#e8edf2" stroke="${OUT}" stroke-width="6"/>
  <rect x="60" y="14" width="22" height="16" fill="#e8edf2" stroke="${OUT}" stroke-width="6"/>`,
)

export const ICON_SVGS = {
  quest,
  flame,
  friends,
  solo,
  sound,
  soundOff,
  starGold,
  fastForward,
  trophy,
  store,
  calendar,
  star,
  settings,
  close,
  arrowDown,
  check,
  crystal,
  cash,
  bag,
  screw,
  speed,
  reach,
  upgrade,
  lock,
  luck,
  drone,
  sell,
  palette,
  clock,
  door,
  stats,
  home,
  driver,
  drill,
  ratchet,
  magnet,
}

const urlCache = new Map()

/** `data:` URL for an icon name. */
export function iconUrl(name) {
  let url = urlCache.get(name)
  if (url) return url
  const markup = Object.hasOwn(ICON_SVGS, name) ? ICON_SVGS[name] : null
  if (!markup) return null
  url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
  urlCache.set(name, url)
  return url
}
