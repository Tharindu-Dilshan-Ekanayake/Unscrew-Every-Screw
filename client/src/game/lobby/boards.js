import { CanvasTexture, SRGBColorSpace } from 'three'

import { iconUrl } from '../../ui/icons'

/**
 * The lobby's big boards drawn on canvases: the factory's title and the leaderboards.
 * Fancier than a label (labelTexture.js): gradients, a frame of marquee lights, icons from
 * the game's SVG set, rank badges. Each is one texture, never over the preset's max size.
 */

const FONT = "'Fredoka One', 'Arial Rounded MT Bold', system-ui, sans-serif"
const NAVY = '#0b1022'

/** The game's icons as images, loaded once; `onLoad` redraws a board once one arrives. */
const icons = new Map()
function icon(name, onLoad) {
  let img = icons.get(name)
  if (!img) {
    img = new Image()
    img.src = iconUrl(name)
    icons.set(name, img)
  }
  if (img.complete && img.naturalWidth) return img
  img.addEventListener('load', onLoad, { once: true })
  return null
}

/**
 * A texture drawn by `draw(canvas, redraw)`, drawn again when the game font has loaded or
 * an icon arrives. `texture.userData.redraw(nextDraw)` swaps in a new drawing.
 */
export function createBoardTexture(width, height, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  let current = draw
  const redraw = () => {
    current(canvas, redraw)
    texture.needsUpdate = true
  }
  texture.userData.redraw = (next) => {
    current = next
    redraw()
  }
  redraw()
  document.fonts?.ready.then(redraw)
  return texture
}

/** Shortens `text` with an ellipsis until it fits `max` pixels in the current font. */
function fit(c, text, max) {
  if (c.measureText(text).width <= max) return text
  let s = text
  while (s.length > 1 && c.measureText(`${s}…`).width > max) s = s.slice(0, -1)
  return `${s}…`
}

/** Text with a dark outline (and optionally a second, white one), centred unless `align` says. */
function outlined(c, text, x, y, size, fill, { stroke = NAVY, width = 0.22, white = 0, align = 'center' } = {}) {
  c.font = `${size}px ${FONT}`
  c.textAlign = align
  c.textBaseline = 'middle'
  c.lineJoin = 'round'
  c.lineWidth = size * width
  c.strokeStyle = stroke
  c.strokeText(text, x, y)
  if (white) {
    c.lineWidth = size * white
    c.strokeStyle = '#ffffff'
    c.strokeText(text, x, y)
  }
  c.fillStyle = fill
  c.fillText(text, x, y)
}

/** Little lights round a rounded rectangle's edge, alternating warm white and gold. */
function marquee(c, x, y, w, h, step, r) {
  let k = 0
  const dot = (px, py) => {
    c.beginPath()
    c.arc(px, py, r, 0, Math.PI * 2)
    c.fillStyle = k % 2 ? '#ffd23a' : '#fff6c8'
    c.fill()
    k += 1
  }
  for (let px = x + step; px < x + w - step / 2; px += step) {
    dot(px, y)
    dot(px, y + h)
  }
  for (let py = y + step; py < y + h - step / 2; py += step) {
    dot(x, py)
    dot(x + w, py)
  }
}

/** The factory's title board: the game's name in gold over a ribbon, inside a frame of lights. */
export function drawTitle(canvas, redraw, title, subtitle) {
  const c = canvas.getContext('2d')
  const { width: w, height: h } = canvas
  const s = w / 512
  c.clearRect(0, 0, w, h)
  const bg = c.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#2b3b6b')
  bg.addColorStop(1, '#131b36')
  c.beginPath()
  c.roundRect(5 * s, 5 * s, w - 10 * s, h - 10 * s, 22 * s)
  c.fillStyle = bg
  c.fill()
  c.lineWidth = 7 * s
  c.strokeStyle = '#ff8a2a'
  c.stroke()
  c.beginPath()
  c.roundRect(15 * s, 15 * s, w - 30 * s, h - 30 * s, 14 * s)
  c.lineWidth = 2 * s
  c.strokeStyle = 'rgba(255, 210, 58, 0.7)'
  c.stroke()
  marquee(c, 15 * s, 15 * s, w - 30 * s, h - 30 * s, 17 * s, 3 * s)

  // The name: a navy outline, a white one, and a gold gradient - shrunk to fit.
  const size = 52 * s
  const ty = h * 0.42
  c.font = `${size}px ${FONT}`
  const textWidth = Math.min(c.measureText(title).width, w * 0.7)
  const squeeze = textWidth / Math.max(1, c.measureText(title).width)
  c.save()
  c.translate(w / 2, ty)
  c.scale(squeeze, squeeze)
  const gold = c.createLinearGradient(0, -size / 2, 0, size / 2)
  gold.addColorStop(0, '#fff7a8')
  gold.addColorStop(0.5, '#ffc928')
  gold.addColorStop(1, '#ff8f1f')
  outlined(c, title, 0, 0, size, gold, { width: 0.36, white: 0.14 })
  c.restore()
  // A screw either side of it.
  const screw = icon('screw', redraw)
  if (screw) {
    const sz = 42 * s
    c.drawImage(screw, w / 2 - textWidth / 2 - sz - 12 * s, ty - sz / 2, sz, sz)
    c.drawImage(screw, w / 2 + textWidth / 2 + 12 * s, ty - sz / 2, sz, sz)
  }
  // The ribbon with the tagline.
  const ry = h * 0.77
  c.font = `${19 * s}px ${FONT}`
  const rw = c.measureText(subtitle).width + 46 * s
  c.beginPath()
  c.roundRect(w / 2 - rw / 2, ry - 15 * s, rw, 30 * s, 15 * s)
  c.fillStyle = '#ff8a2a'
  c.fill()
  c.lineWidth = 3 * s
  c.strokeStyle = NAVY
  c.stroke()
  outlined(c, subtitle, w / 2, ry + 1 * s, 19 * s, '#ffffff', { width: 0.24 })
}

const MEDALS = ['#ffd23a', '#dbe3ee', '#e8a36a']
const MEDAL_TINT = ['rgba(255, 210, 58, 0.24)', 'rgba(219, 227, 238, 0.16)', 'rgba(232, 163, 106, 0.2)']

/**
 * A leaderboard: a gold header with trophies, then the top 8 - gold, silver and bronze
 * badges for the first three - with their scores right-aligned. `rows`: `[{ name, value }]`.
 */
export function drawLeaderboard(canvas, redraw, title, rows, format) {
  const c = canvas.getContext('2d')
  const { width: w, height: h } = canvas
  c.clearRect(0, 0, w, h)
  const bg = c.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#26325e')
  bg.addColorStop(1, '#121933')
  c.beginPath()
  c.roundRect(5, 5, w - 10, h - 10, 22)
  c.fillStyle = bg
  c.fill()
  c.lineWidth = 7
  c.strokeStyle = '#ffc21a'
  c.stroke()

  // The header band.
  const band = c.createLinearGradient(0, 14, 0, 78)
  band.addColorStop(0, '#ffe46a')
  band.addColorStop(1, '#ffab1a')
  c.beginPath()
  c.roundRect(15, 15, w - 30, 62, 14)
  c.fillStyle = band
  c.fill()
  c.lineWidth = 3
  c.strokeStyle = NAVY
  c.stroke()
  outlined(c, title, w / 2, 47, 34, '#1d2440', { stroke: '#fff6d6', width: 0.2 })
  const trophy = icon('trophy', redraw)
  if (trophy) {
    c.drawImage(trophy, 24, 22, 48, 48)
    c.drawImage(trophy, w - 72, 22, 48, 48)
  }

  const top = 88
  const rowH = 29.5
  if (!rows.length) {
    outlined(c, 'Be the first!', w / 2, top + rowH * 4, 30, '#cfd8ff')
    return
  }
  for (let i = 0; i < 8; i += 1) {
    const y = top + i * rowH
    c.beginPath()
    c.roundRect(18, y + 2, w - 36, rowH - 4, 9)
    c.fillStyle = i < 3 && rows[i] ? MEDAL_TINT[i] : i % 2 ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.08)'
    c.fill()
    const row = rows[i]
    if (!row) continue
    const cy = y + rowH / 2
    // The rank badge.
    c.beginPath()
    c.arc(40, cy, 11.5, 0, Math.PI * 2)
    c.fillStyle = MEDALS[i] || '#3d4a78'
    c.fill()
    c.lineWidth = 2.5
    c.strokeStyle = NAVY
    c.stroke()
    c.font = `15px ${FONT}`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillStyle = i < 3 ? '#1d2440' : '#ffffff'
    c.fillText(String(i + 1), 40, cy + 1)
    // Name and score.
    c.font = `20px ${FONT}`
    const value = format(row.value)
    const valueWidth = c.measureText(value).width
    outlined(c, fit(c, String(row.name), w - 120 - valueWidth), 62, cy + 1, 20, i === 0 ? '#ffe27a' : '#ffffff', { align: 'left', width: 0.2 })
    outlined(c, value, w - 30, cy + 1, 20, '#8ff3ff', { align: 'right', width: 0.2 })
  }
}

/**
 * A team section's banner: the chapter's name in its glow colour on its dark trim, with a
 * TEAM tag. `look`: `{ deck, glow, trim }` (yard.js PAD_LOOKS).
 */
export function drawBanner(canvas, redraw, title, tag, look) {
  const c = canvas.getContext('2d')
  const { width: w, height: h } = canvas
  const s = h / 96
  c.clearRect(0, 0, w, h)
  const bg = c.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, look.trim)
  bg.addColorStop(1, NAVY)
  c.beginPath()
  c.roundRect(3 * s, 3 * s, w - 6 * s, h - 6 * s, 16 * s)
  c.fillStyle = bg
  c.fill()
  c.lineWidth = 4 * s
  c.strokeStyle = look.glow
  c.stroke()
  // The tag on the right, the name filling the rest.
  c.font = `${26 * s}px ${FONT}`
  const tagWidth = c.measureText(tag).width + 34 * s
  const tagX = w - tagWidth - 18 * s
  c.beginPath()
  c.roundRect(tagX, h / 2 - 20 * s, tagWidth, 40 * s, 20 * s)
  c.fillStyle = look.deck
  c.fill()
  c.lineWidth = 3 * s
  c.strokeStyle = NAVY
  c.stroke()
  outlined(c, tag, tagX + tagWidth / 2, h / 2 + 1 * s, 26 * s, '#ffffff', { width: 0.24 })
  const size = 58 * s
  c.font = `${size}px ${FONT}`
  const room = tagX - 36 * s
  const squeeze = Math.min(1, (room * 0.92) / Math.max(1, c.measureText(title).width))
  c.save()
  c.translate(room / 2 + 18 * s, h / 2 + 2 * s)
  c.scale(squeeze, squeeze)
  outlined(c, title, 0, 0, size, look.glow, { width: 0.26 })
  c.restore()
}
