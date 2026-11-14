// The animals' path data (plan_scenes_wave3.md S0.1, picks P1/P9): hand-authored SVG path strings, own art — no
// third-party art, no fonts. shapes.ts rasterises them into the density map the particle scenes sample.
// Style: graphic emblems — straight edges, sharp points, a few bold plates and creases; holes for the eyes.
// Authoring rules: a 100×100 box, y down, ≥ 3 units of margin (a stroke is 2 wide), absolute M/L/Q/Z only, features
// ≥ 4 units apart (closer strokes merge into a blob), holes ≥ 6 across (a smaller one fills with its own rim: the
// eagle's eye is such a glint on purpose).
// `mirror`: only the left half (x ≤ 50) is authored. A half's subpath that reaches the axis starts and ends ON it
// and stays open (no Z): the fill closes it along the axis, the stroke leaves the axis clear. Never cross x = 50 or
// overlap two subpaths by accident: even-odd punches the overlap out. An animal with one asymmetric part (the
// eagle's head) leaves `mirror` off and writes both halves with `flip`.
// Look: TD SN/POP sprinklePOP ex1 (points sprinkled over a shape; studied, rewritten).

/** d: the even-odd fill (eyes = holes), also stroked; lines: stroked detail; mirror: the left half is authored. */
export interface AnimalPath { d: string; lines?: string; mirror?: boolean }

/** A left half reflected about x = 50 (every number in the string is one of an "x y" pair). */
const flip = (d: string) => d.replace(/([\d.]+) ([\d.]+)/g, (_, x, y) => `${+(100 - +x).toFixed(1)} ${y}`)

// The eagle's left half: its head is in profile, so the halves are written out (a frontal head read as an owl).
// A feather is a straight blade: base corner, shoulder, tip, shoulder, base corner; the slots open towards the tips.
const EAGLE =
  'M50 34L44.5 34L38 35.5L32 27L29.5 14' + // neck cut, shoulder, arm
  'L23.2 10.1L10.2 7.5L4.1 8.4L9 12.1L21.8 15.9L21.6 18L9 18.2L3.5 20.4L8.8 23L21.4 24L21 26L8.7 28.8L3.8 32.1L9.5 33.6L22 32' + // primaries 1–3
  'L21.3 34.2L9.3 40L5 44.4L11.2 44.4L23.7 39.8L23.2 42.1L12.9 50.6L9.8 55.9L15.8 54.4L26.8 46.9L26.6 49.2L19.8 58.9L18.5 64.4L23.6 61.9L31.4 52.8' + // primaries 4–6
  'L31.5 54.5L28.6 63.1L29.1 67.6L32.6 64.8L36.5 56.5L36.3 56.7L35.7 63.7L37.1 66.9L39.3 64.2L40.7 57.3' + // secondaries
  'L41 61L43.5 68' + // body side, hip
  'L36.5 84L35.5 90.5L39.3 85.5L42.5 77L40.5 89L42.2 95.5L44.6 90L47 78L46.6 91L50 97' // tail blades
const EAGLE_LINES = 'M45 44L50 48M44.5 51L50 55M45 58L50 62' // chest

export const ANIMALS: Readonly<Record<string, AnimalPath>> = {
  // Front head, faceted: forehead → ear → five ruff tufts down to the chin. Holes: eye, nose, inner ear.
  wolf: {
    mirror: true,
    d:
      'M50 22L41 19L29 3L19 31' + // forehead, ear
      'L6 46L14.5 49L4.5 62L13.5 63.5L11 76L19.5 73L22 86L29.5 82.5L37 94L42.5 91L50 97' + // five tufts, chin
      'M42 53L34 42.5L23 42L31 51.5Z' + // eye
      'M50 70L42.5 70L46 79L50 81' + // nose
      'M37 21.5L29.5 9.5L23.5 28Z', // inner ear
    lines:
      'M23 42L41 19M23 42L19 31' + // brow plate, temple
      'M42 53L42.5 70L37.5 80L45 87.5L50 86.5M50 81L50 86.5' + // bridge, muzzle pad, mouth, philtrum
      'M31 51.5L14.5 49M27 61L13.5 63.5M30 70L19.5 73M37.5 80L29.5 82.5', // the tufts' creases
  },
  // Displayed (heraldic): wings raised, six bladed primaries a side, a fan tail; the head in profile, beak hooked.
  eagle: {
    d:
      EAGLE + flip(EAGLE) +
      'M46.8 34L45.8 27.8L44.4 25L39.5 24.5L44.2 21.8L39.3 22.4L37 26.6Q34.1 20.7 37.4 16.7' + // throat, chin, beak, hook
      'L44.9 13.7L51.5 8.5L58.2 11.2L62 19.8L58.6 20.2L61.5 27.8L58.2 27.4L57.2 34Z' + // brow, crown, nape feathers
      'M45.9 17.5L51.6 15.2L50.5 19.2Z', // eye
    lines: EAGLE_LINES + flip(EAGLE_LINES),
  },
  // Prowling profile (the one unmirrored hard case): a low crouch, forelegs stretched forward, hind legs back, the
  // tail raised in a straight blade. One closed outline, nose → ears → back → tail → four blade legs → throat.
  // Holes: the slit eye; lines: the shoulder and hip plates, the brow crease.
  panther: {
    d:
      'M90 35L84 31L81 26L79 18L73 24L67 18L62 26' + // nose, stubby snout, brow, small ears, nape
      'L55 25L45 29L34 34L27 35' + // shoulder hump, back, tail base
      'L26 36L6 8L17 42' + // raised tail: top edge, tip, bottom edge, rump
      'L11 54L7 70L4 80L12 82L14 72L17 62' + // hind near leg, stretched back
      'L26 63L28 64L30 74L32 82L40 82L38 72L36 63' + // belly, hind far leg, stretched forward
      'L46 62L50 62L52 73L54 82L62 82L60 72L58 62' + // belly, fore far leg, stretched back
      'L63 56L67 50L70 56L75 68L80 80L91 82L86 72L81 62L76 53' + // chest, fore near leg, stretched forward
      'L70 48L73 43L78 41L84 38Z' + // throat, jaw, lower snout
      'M76 32L68 31L65 36L73 38Z', // eye
    lines:
      'M55 25L61 45M34 34L37 56M73 24L68 30', // shoulder plate, hip crease, brow
  },
  // Front head, mirrored: forehead → out-swept ear → cheek → long muzzle → chin; the diamond nose pad is a hole on
  // the axis, the antlers (beam with a hook tip, two tines) are lines.
  stag: {
    mirror: true,
    d:
      'M50 20L42 23L16 14L31 27L26 40L23 52L28 63L35 71L42 79L50 85' + // forehead, ear, cheek, jaw, muzzle, chin
      'M44 36L35 33L31 40L40 42Z' + // eye
      'M50 64L42 66L44 74L50 76', // nose pad
    lines:
      'M44 20L37 13L27 9L14 8L7 13M37 13L32 4M27 9L23 3' + // antlers: beam + hook, two tines
      'M50 42L50 64M42 23L44 36M26 40L31 40M50 76L50 84', // bridge, brow plate, cheek crease, philtrum
  },
}

/** The scenes' animal sets (the `set` input's values); CP1 steps append theirs: 1 chase, 2 abyss, 3 dust, 4 zodiac. */
export const SETS: readonly { name: string; ids: readonly string[] }[] = [
  { name: 'spirit', ids: ['wolf', 'eagle'] },
  { name: 'chase', ids: ['panther', 'stag'] },
]
