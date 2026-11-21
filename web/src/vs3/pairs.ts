// WCAG 2.3.1 general flash pairs on a frame-mean luma trace (plan_vs3_engine S0.2, skeptic N5): gate H2's rule (c).
// Only the gate harness imports it, in the page (scratchpad/vs3-engine/h2.mjs); nothing in the app does, so Rollup
// drops it from the build.

/** `t` in s, `luma` 0..1, one per frame. The changes are zig-zag legs of at least .10 whose darker end is under .8;
 *  they alternate, and every second one completes a pair. `max1s`: the most pairs completed in any closed 1 s window. */
export function flashPairs(t: ArrayLike<number>, luma: ArrayLike<number>): { total: number; max1s: number } {
  const done: number[] = [] // when each pair completed, s
  let [dir, from, ext, lo, hi] = [0, luma[0], luma[0], luma[0], luma[0]] // the leg: its direction, start and extreme
  let [counted, changes] = [false, 0]
  for (let i = 1; i < luma.length; i++) {
    const x = luma[i]
    if (dir === 0) {
      lo = Math.min(lo, x)
      hi = Math.max(hi, x)
      if (x - lo >= 0.1) [dir, from, ext] = [1, lo, x]
      else if (hi - x >= 0.1) [dir, from, ext] = [-1, hi, x]
      else continue
    } else if (dir * (x - ext) > 0) ext = x // the leg goes on
    else if (dir * (ext - x) >= 0.1) [dir, from, ext, counted] = [-dir, ext, x, false] // turned by .10: the next leg
    if (!counted && Math.min(from, ext) < 0.8) {
      counted = true
      if (++changes % 2 === 0) done.push(t[i])
    }
  }
  let max1s = 0
  for (let i = 0, j = 0; j < done.length; j++) {
    while (done[j] - done[i] > 1) i++
    max1s = Math.max(max1s, j - i + 1)
  }
  return { total: done.length, max1s }
}
