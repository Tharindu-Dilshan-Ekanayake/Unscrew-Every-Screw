/**
 * Hints raised inside the frame loop (TOO FAR!, BAG FULL!) wait here: the frame loop
 * never writes to the store. The 10 Hz ticker hands the latest one to the HUD.
 */
let pending = null

export function queueHint(text) {
  pending = text
}

/** The hint waiting since last asked, or null. */
export function takeHint() {
  const text = pending
  pending = null
  return text
}
