import { CanvasTexture, SRGBColorSpace } from 'three'

/**
 * Chunky outlined text drawn onto a canvas, for signs in the 3D world (SELL, prices, the
 * factory's name). One small texture per sign, never over 512 px across.
 *
 * @param {Array<{ text: string, size: number, fill?: string, stroke?: string }>} lines
 * @param {{ width?: number, height?: number, background?: string|null, radius?: number, border?: string|null }} [options]
 */
export function drawLabel(canvas, lines, { background = null, radius = 24, border = null } = {}) {
  const c = canvas.getContext('2d')
  const { width, height } = canvas
  c.clearRect(0, 0, width, height)
  if (background) {
    c.fillStyle = background
    c.beginPath()
    c.roundRect(4, 4, width - 8, height - 8, radius)
    c.fill()
    if (border) {
      c.lineWidth = 8
      c.strokeStyle = border
      c.stroke()
    }
  }
  const total = lines.reduce((sum, l) => sum + l.size * 1.12, 0)
  let y = (height - total) / 2
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.lineJoin = 'round'
  for (const line of lines) {
    const size = line.size
    y += size * 0.56
    c.font = `${size}px 'Fredoka One', 'Arial Rounded MT Bold', system-ui, sans-serif`
    // Shrink anything too wide to fit.
    const measured = c.measureText(line.text).width
    const scale = Math.min(1, (width * 0.92) / Math.max(1, measured))
    c.save()
    c.translate(width / 2, y)
    c.scale(scale, scale)
    if (line.stroke !== 'none') {
      c.lineWidth = size * 0.22
      c.strokeStyle = line.stroke || '#14161c'
      c.strokeText(line.text, 0, size * 0.04)
    }
    c.fillStyle = line.fill || '#ffffff'
    c.fillText(line.text, 0, 0)
    c.restore()
    y += size * 0.56
  }
}

export function createLabelTexture(lines, { width = 512, height = 256, ...options } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.min(512, width)
  canvas.height = Math.min(512, height)
  drawLabel(canvas, lines, options)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  texture.userData.label = { lines, options }
  // Drawn before the game font finished loading: draw it again once it has.
  document.fonts?.ready.then(() => {
    const { lines: latest, options: opts } = texture.userData.label
    drawLabel(canvas, latest, opts)
    texture.needsUpdate = true
  })
  return texture
}

/** Redraws a label texture made by createLabelTexture. */
export function updateLabelTexture(texture, lines, options = {}) {
  texture.userData.label = { lines, options }
  drawLabel(texture.image, lines, options)
  texture.needsUpdate = true
}
