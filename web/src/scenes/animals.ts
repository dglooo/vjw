// The animals' path data (plan_scenes_wave3.md S0.1, picks P1/P9): hand-authored SVG path strings, own art — no
// third-party art, no fonts. shapes.ts rasterises them into the density map the particle scenes sample.
// Authoring rules: a 100×100 box, y down, ≥ 3 units of margin (a stroke is 2 wide), absolute M/L/Q/Z only, features
// ≥ 4 units apart (closer strokes merge into a blob). `mirror`: only the left half (x ≤ 50) is authored. A half's
// subpath that reaches the axis starts and ends ON it and stays open (no Z): the fill closes it along the axis, the
// stroke leaves the axis clear. Never cross x = 50 or overlap two subpaths by accident: even-odd punches the overlap
// out. An animal with one asymmetric part (the eagle's head) leaves `mirror` off and writes both halves with `flip`.
// Look: TD SN/POP sprinklePOP ex1 (points sprinkled over a shape; studied, rewritten).

/** d: the even-odd fill (eyes = holes), also stroked; lines: stroked detail; mirror: the left half is authored. */
export interface AnimalPath { d: string; lines?: string; mirror?: boolean }

/** A left half reflected about x = 50 (every number in the string is one of an "x y" pair). */
const flip = (d: string) => d.replace(/([\d.]+) ([\d.]+)/g, (_, x, y) => `${+(100 - +x).toFixed(1)} ${y}`)

// The eagle's left half: its head is in profile, so the halves are written out (a frontal head read as an owl).
const EAGLE =
  'M50 34L44.5 34Q40 35.5 36 32Q27 27 24 13Q22.5 8 16 7.5' + // neck cut, shoulder, arm, wrist
  'Q9.6 6.9 3.6 9.3Q8.7 13.3 15 14.5L15.4 18Q9 18.5 3.5 21.9Q9.2 24.9 15.6 25L15.8 28.6Q9.1 30.3 3.8 34.7Q10.4 36.6 17.2 35.4' + // primaries 1–3
  'L17.1 38.8Q10.9 41.9 6.6 47.3Q13.5 47.7 19.9 45.2L19.8 48.2Q14.6 52.7 11.8 59Q18.5 57.8 24.2 53.8L24.3 56.1Q20.8 61.5 20.1 67.8Q25.9 65 29.7 59.9' + // primaries 4–6
  'L31.2 60.6Q29.5 64.8 30.8 69Q34.5 66.6 35.8 62.4L36.3 61.8Q35.5 65.7 37.8 69Q40.6 66.2 40.7 62.2' + // secondaries
  'L41.5 64.5Q43.5 72 41 79L36.5 91Q37.8 95.5 40.8 92Q43.2 97 46 93.2Q48 97.5 50 97' // body side, tail fan
const EAGLE_LINES =
  'M20.5 16Q20 30 24.5 43Q28.5 53 39 59.5' + // coverts
  'M45 42L50 46M44.5 50L50 54M45 58L50 62' + // chest
  'M40.8 92L44.5 79M46 93.2L47.5 79' // tail feathers

export const ANIMALS: Readonly<Record<string, AnimalPath>> = {
  // Front head: forehead → ear → five cheek tufts down to the chin. Holes: eye, nose, inner ear.
  wolf: {
    mirror: true,
    d:
      'M50 22Q45 21 40 19L30 3Q22 14 19 31' + // forehead, ear
      'Q12 36 7 47L14 49Q8 54 5 61L13 63Q11 68 12 74L19 72Q19 79 23 85L29 82Q31 89 37 93L42 91Q45 95 50 97' + // tufts, chin
      'M42 52Q37 40 25 43Q32 51 42 52Z' + // eye
      'M50 72L44 72Q42 77 50 81' + // nose
      'M36 22L30.5 9L24 28Z', // inner ear
    lines:
      'M43 55Q42 64 44 72' + // bridge
      'M38 59Q32 70 37 82Q43 89 50 85M50 81L50 85' + // muzzle pad, mouth, philtrum
      'M45 45Q44 33 39 24', // mask line
  },
  // Displayed (heraldic): wings raised, six bladed primaries a side, a fan tail; the head in profile, beak hooked.
  eagle: {
    d:
      EAGLE + flip(EAGLE) +
      'M44.5 34Q44.5 28 42.4 24L37.4 23.2L42.4 20.9Q38.3 20.4 36.3 21.8L34.7 25Q32.4 20 35.6 16' + // throat, beak
      'Q38.3 12.8 42.8 13.2Q45.5 8.3 50.5 7.8Q56.8 8.3 57.2 17.3Q57.2 25 55.5 34Z' + // brow, crown, nape
      'M44.6 16.9L49.1 14.6L48.7 18.2Z', // eye
    lines: EAGLE_LINES + flip(EAGLE_LINES),
  },
}

/** The scenes' animal sets (the `set` input's values); CP1 steps append theirs: 1 chase, 2 abyss, 3 dust, 4 zodiac. */
export const SETS: readonly { name: string; ids: readonly string[] }[] = [
  { name: 'spirit', ids: ['wolf', 'eagle'] },
]
