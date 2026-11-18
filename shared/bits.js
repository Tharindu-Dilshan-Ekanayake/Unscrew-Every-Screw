/**
 * A fixed-size bitset (which screws are out), stored in the save as base64 so a room of
 * 1,500 screws costs ~250 characters. Works the same in Node and the browser.
 */

export const bitBytes = (count) => Math.ceil(count / 8)

export function createBits(count) {
  return new Uint8Array(bitBytes(count))
}

export const getBit = (bits, i) => (bits[i >> 3] >> (i & 7)) & 1

export function setBit(bits, i) {
  bits[i >> 3] |= 1 << (i & 7)
}

export function clearBit(bits, i) {
  bits[i >> 3] &= ~(1 << (i & 7))
}

/** How many of the first `count` bits are set. */
export function countBits(bits, count) {
  let n = 0
  for (let i = 0; i < count; i += 1) n += getBit(bits, i)
  return n
}

export function encodeBits(bits) {
  let s = ''
  for (let i = 0; i < bits.length; i += 1) s += String.fromCharCode(bits[i])
  return btoa(s)
}

/** Decodes a saved bitset for `count` bits; anything unreadable is an empty set. */
export function decodeBits(text, count) {
  const bits = createBits(count)
  if (typeof text !== 'string' || !text) return bits
  try {
    const raw = atob(text)
    const n = Math.min(raw.length, bits.length)
    for (let i = 0; i < n; i += 1) bits[i] = raw.charCodeAt(i)
    // Bits past `count` in the last byte are never meaningful.
    const extra = bits.length * 8 - count
    if (extra > 0 && bits.length) bits[bits.length - 1] &= 0xff >> extra
  } catch {
    return createBits(count)
  }
  return bits
}
