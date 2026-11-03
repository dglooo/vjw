// Polish §6: the low bands that share a bin no longer move as a staircase.
import { expect, test, vi } from 'vitest'
import { bandEdges } from '../audio/energy'
import { rampShared } from './spectrum'

vi.mock('../gl/engine', () => ({})) // takes the page's canvas + WebGL at import; the helper needs neither
vi.mock('../audio/input', () => ({})) // creates the AudioContext at import

test('bands sharing a bin ramp to the next band with its own bins; the other bands are untouched', () => {
  const edges = bandEdges(48000, 1024) // bands 0–2 read bin 1, 3–5 bin 2, 6–7 bin 3, 8–9 bin 4
  const goal = Float32Array.from(edges, ([start]) => start / 512) // one value per bin
  const before = goal.slice()
  const shared = [1, 2, 4, 5, 7, 9] // read the same bins as the band below
  for (const i of shared) expect(before[i]).toBe(before[i - 1]) // the staircase
  rampShared(edges)(goal)
  for (let i = 1; i <= 10; i++) expect(goal[i]).toBeGreaterThan(goal[i - 1]) // one slope up to band 10
  goal.forEach((g, i) => {
    if (!shared.includes(i)) expect(g).toBe(before[i])
  })
})
