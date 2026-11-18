import { create } from 'zustand'

/**
 * Touch or mouse: what the player is playing with, for everything that differs between
 * the two (the on-screen controls, CLICK TO PLAY, "hold click" vs "touch and hold").
 *
 * Starts from what the device says it has (a coarse pointer, touch points, a phone or
 * tablet's user agent), then follows the last thing actually used: a touch switches to
 * touch, a mouse click back - so a touch laptop, or a phone emulated in DevTools, gets it
 * right whichever way it's played.
 */

function detectTouch() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(pointer: coarse)').matches) return true
  if (navigator.maxTouchPoints > 0) return true
  return /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent || '')
}

export const useInput = create(() => ({ touch: detectTouch() }))

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      const touch = e.pointerType === 'touch' || e.pointerType === 'pen'
      if (e.pointerType && useInput.getState().touch !== touch) useInput.setState({ touch })
    },
    { capture: true, passive: true },
  )
  window.matchMedia?.('(pointer: coarse)').addEventListener?.('change', (e) => useInput.setState({ touch: e.matches }))
}
