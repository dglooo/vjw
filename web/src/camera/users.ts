// The mask-user counter (CP1 contract rev 2, K-3 + K-11): pure, no page, no GL. camera.ts's tick() wants a host while
// count() > 0 && cam.live; a take and a release inside one task never reach tick and spawn nothing.
let n = 0

/** One mask consumer's claim (`mask` false claims nothing); the returned release is idempotent. */
export function use(mask: boolean): () => void {
  if (!mask) return () => {}
  n++
  let held = true
  return () => {
    if (held) n--
    held = false
  }
}

/** The mask users now (`__cam.users()`). */
export const count = () => n
