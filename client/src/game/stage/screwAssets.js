import { BufferAttribute, BufferGeometry, CanvasTexture, ConeGeometry, CylinderGeometry, MeshLambertMaterial, MeshPhongMaterial, SRGBColorSpace } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { HEAD_HEIGHT, HEAD_RADIUS } from '@shared/layout'

/**
 * A screw head: a low beveled disc standing on +Y from y = 0, `segments` round. Its top
 * maps the head texture (the recess); the sides sample the texture's metal rim. ~5
 * triangles per segment, so a 12-sided head is 60 - the biggest single cost in a room of
 * 1,200 screws, which is why the quality preset picks the count.
 */
export function createHeadGeometry(segments = 12) {
  const R = HEAD_RADIUS
  const H = HEAD_HEIGHT
  const rings = [
    { r: R, y: 0 },
    { r: R, y: H * 0.55 },
    { r: R * 0.8, y: H },
  ]
  const positions = []
  const uvs = []
  const uvAt = (x, z) => [0.5 + (x / R) * 0.49, 0.5 - (z / R) * 0.49]
  for (const ring of rings) {
    for (let s = 0; s < segments; s += 1) {
      const a = (s / segments) * Math.PI * 2
      const x = Math.cos(a) * ring.r
      const z = Math.sin(a) * ring.r
      positions.push(x, ring.y, z)
      uvs.push(...uvAt(x, z))
    }
  }
  const center = positions.length / 3
  positions.push(0, H * 1.04, 0)
  uvs.push(0.5, 0.5)
  const index = []
  for (let k = 0; k < rings.length - 1; k += 1) {
    for (let s = 0; s < segments; s += 1) {
      const a = k * segments + s
      const b = k * segments + ((s + 1) % segments)
      const c = a + segments
      const d = b + segments
      index.push(a, c, b, b, c, d)
    }
  }
  const top = (rings.length - 1) * segments
  for (let s = 0; s < segments; s += 1) index.push(top + s, center, top + ((s + 1) % segments))
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  g.setIndex(index)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

/** A whole screw (head + threaded shank pointing down -Y), for the ones flying to your bag. */
export function createLooseScrewGeometry(segments = 8) {
  const head = createHeadGeometry(segments)
  const shank = new CylinderGeometry(0.055, 0.055, 0.26, Math.max(6, segments - 2), 1, true)
  shank.translate(0, -0.13, 0)
  const tip = new ConeGeometry(0.055, 0.09, Math.max(6, segments - 2))
  tip.rotateX(Math.PI)
  tip.translate(0, -0.305, 0)
  for (const g of [shank, tip]) {
    // Sample the texture's metal rim, like the head's sides.
    const uv = g.getAttribute('uv')
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, 0.985, 0.5)
  }
  const merged = mergeGeometries([head.toNonIndexed(), shank.toNonIndexed(), tip.toNonIndexed()], false)
  head.dispose()
  shank.dispose()
  tip.dispose()
  merged.computeVertexNormals()
  return merged
}

/**
 * The head's face, drawn on a canvas: brushed metal with the recess of the chapter's
 * screw style ('phillips' +, 'slot' -, 'hex', 'torx' star). White-ish, so the instance
 * colour (brass, steel, gold, crystal) tints it.
 */
export function createHeadTexture(style = 'phillips', size = 256) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const c = canvas.getContext('2d')
  const m = size / 2
  // Metal: a soft radial gradient with brushed rings.
  const grad = c.createRadialGradient(m * 0.8, m * 0.7, size * 0.05, m, m, m)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.7, '#d7dbe0')
  grad.addColorStop(1, '#9aa1aa')
  c.fillStyle = grad
  c.fillRect(0, 0, size, size)
  c.globalAlpha = 0.08
  c.strokeStyle = '#000'
  for (let r = size * 0.04; r < m; r += size * 0.025) {
    c.beginPath()
    c.arc(m, m, r, 0, Math.PI * 2)
    c.stroke()
  }
  c.globalAlpha = 1
  // The recess, with a light lip on its lower-right edges.
  const path = new Path2D()
  const s = size / 256
  if (style === 'phillips') {
    const L = 78 * s
    const W = 20 * s
    path.roundRect(m - L, m - W, L * 2, W * 2, W * 0.6)
    path.roundRect(m - W, m - L, W * 2, L * 2, W * 0.6)
  } else if (style === 'slot') {
    path.roundRect(m - 84 * s, m - 14 * s, 168 * s, 28 * s, 10 * s)
  } else if (style === 'hex') {
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6
      const x = m + Math.cos(a) * 62 * s
      const y = m + Math.sin(a) * 62 * s
      if (k === 0) path.moveTo(x, y)
      else path.lineTo(x, y)
    }
    path.closePath()
  } else {
    // Torx: a six-lobed star.
    for (let k = 0; k <= 72; k += 1) {
      const a = (k / 72) * Math.PI * 2
      const r = (52 + 18 * Math.cos(a * 6)) * s
      const x = m + Math.cos(a) * r
      const y = m + Math.sin(a) * r
      if (k === 0) path.moveTo(x, y)
      else path.lineTo(x, y)
    }
    path.closePath()
  }
  c.save()
  c.translate(3 * s, 3 * s)
  c.fillStyle = 'rgba(255,255,255,0.9)'
  c.fill(path)
  c.restore()
  c.fillStyle = '#23262b'
  c.fill(path)
  c.save()
  c.clip(path)
  c.fillStyle = 'rgba(0,0,0,0.6)'
  c.translate(-5 * s, -5 * s)
  c.fill(path)
  c.restore()
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/**
 * The screws' material. Instance colours above 1 glow (the crystal screws): the excess
 * is added as emissive light, so they shine without a texture or a second pass.
 * Shiny Phong on presets that can afford it, Lambert on LOW.
 */
export function createScrewMaterial(map, shiny = true) {
  const material = shiny ? new MeshPhongMaterial({ map, shininess: 70, specular: '#8a8a8a' }) : new MeshLambertMaterial({ map })
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      #if defined( USE_INSTANCING_COLOR ) || defined( USE_COLOR )
        totalEmissiveRadiance += max( vColor.rgb - 1.0, 0.0 ) * 0.6;
      #endif`,
    )
  }
  material.customProgramCacheKey = () => `screw-${shiny ? 'phong' : 'lambert'}`
  return material
}
