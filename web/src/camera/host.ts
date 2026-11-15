// Host health (CP1 contract rev 2, K-1 + N-3): the [R0] knobs and two pure seams, testable in node. camera.ts's tick()
// is their only caller (design § K-1 closure).
export const STUCK_MS = 1000 // [R0] after its first mask, a host's oldest unanswered request older than this = stalled (89× the clip p95)
export const INIT_MS = 10_000 // [R0] before its first mask, a host's spawn older than this = stalled (40× the measured start)
export const RETRY_MS = 5000 // [R0] a host that keeps dying respawns at most once per this
export const RECYCLE_MS = 30 * 60_000 // [R0] the serving host's age at which a make-before-break swap starts (D2)

/** The watchdog's view of one host: its spawn, whether a mask came back yet, its request in flight (null = idle). */
export interface HostClock {
  born: number
  masked: boolean
  sentAt: number | null
}

/** Stalled (both strict `>`): after the first mask, the request in flight is older than STUCK_MS; before it, the spawn
 *  is older than INIT_MS. `ponytail:` a wall-clock limit; a main-thread stall over 1 s can fail a healthy host. */
export function stalled(h: HostClock, now: number): boolean {
  return h.masked ? h.sentAt !== null && now - h.sentAt > STUCK_MS : now - h.born > INIT_MS
}

/** The respawn time after a failure at `now` (N-3): at once after the first; then at most once per RETRY_MS, counted
 *  from the last granted respawn. fail() stores the result as the new lastRetryAt; no other spawn writes it. */
export function retryAt(now: number, lastRetryAt: number | null): number {
  return lastRetryAt === null ? now : Math.max(now, lastRetryAt + RETRY_MS)
}
