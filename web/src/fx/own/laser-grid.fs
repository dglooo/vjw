// VeeJay Wizard, 2026
// Look: TD laserCHOP (studied, rewritten) — OPSnippets CHOP/laserCHOP example1 ("a few ways to generate laser
// patterns") and example2 (a stepped pattern: cycles + phase). Our reading: four truss emitters throw eight-beam
// fans into haze and a 16-step pattern chops them. Nothing is copied; no third-party code.
// Light is conserved by construction (WCAG 2.3.1): beam b of emitter e is lit iff mod((step + 4e + b)·hits, 16) <
// hits. For an odd `hits`, x → x·hits mod 16 is a bijection and emitters e and e+2 cover 16 consecutive x, so each
// colour pair (0+2 green, 1+3 white) lights exactly `hits` beams on every step: a chop moves the light, never its
// amount. Brightness on a hit comes only through `hit` and `burst` (VJW_FLASH, gated ≤ 3/s).
/*{
    "CATEGORIES": ["Geometry", "Laser"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Laser Grid: four truss emitters throw strict eight-beam fans into haze, green and white. The bar chases a 16-step pattern through the beams and the fans take a new pose on every beat (parallel, crossed, fan, scissor), while the amount of light stays the same. The sub opens the fans, the bass scissors them, hats dot the beams, snares swap the colours, a build thickens the smoke; kicks lift the cores and the drop lights all 32 beams with a white core (both gated to 3/s).",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "phase", "LABEL": "Phase", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "hits", "LABEL": "Hits", "TYPE": "long", "DEFAULT": 5, "VALUES": [1, 3, 5, 7], "LABELS": ["1", "3", "5", "7"] },
        { "NAME": "spread", "LABEL": "Spread", "TYPE": "float", "DEFAULT": 0.25, "MIN": 0, "MAX": 1 },
        { "NAME": "tilt", "LABEL": "Tilt", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "dash", "LABEL": "Dash", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "swap", "LABEL": "Swap", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "haze", "LABEL": "Haze", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0, "MAX": 1 },
        { "NAME": "hue", "LABEL": "Hue", "TYPE": "float", "DEFAULT": 0.36, "MIN": 0, "MAX": 1 },
        { "NAME": "hit", "LABEL": "Hit", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "burst", "LABEL": "Burst", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 }
    ],
    "VJW_BIND": {
        "phase": { "source": "bar", "shape": "saw", "amount": 1, "attack": 0, "release": 0, "min": 0, "max": 1 },
        "spread": { "source": "sub", "amount": 1, "attack": 0.05, "release": 0.3, "min": 0.25, "max": 0.6 },
        "tilt": { "source": "reese", "amount": 1, "attack": 0.05, "release": 0.4, "min": 0, "max": 0.5 },
        "dash": { "source": "hats", "amount": 1, "attack": 0, "release": 0.06, "min": 0, "max": 1 },
        "swap": { "source": "snare", "amount": 1, "attack": 0, "release": 0.25, "min": 0, "max": 1 },
        "haze": { "source": "build", "amount": 1, "attack": 1, "release": 2, "min": 0.3, "max": 0.9 },
        "hit": { "source": "kick", "amount": 1, "attack": 0, "release": 0.12, "min": 0, "max": 0.6 },
        "burst": { "source": "drop", "amount": 1, "attack": 0, "release": 0.4, "min": 0, "max": 1 }
    },
    "PASSES": [
        { "TARGET": "mist", "FLOAT": true, "WIDTH": "$WIDTH/4", "HEIGHT": "$HEIGHT/4" },
        {}
    ],
    "VJW_FLASH": ["hit", "burst"]
}*/

// A beam = a thin core + an analytic halo 1/(1 + (d/w)^2), brighter where the smoke is dense: the haze is lit only
// where a beam crosses it. Two passes. `mist` (quarter res, float) holds the soft part: each colour pair's halo sum
// (x: emitters 0+2, y: 1+3), the smoke's density (z) and the reach of the lit beams (a). The final pass draws the
// razor cores at full res over the mist, and only within that reach: most pixels have no core to look for.

// Knobs. Lengths are in frame heights (the picture is aspect-corrected); angles in radians from straight down.
#define EM_Y 0.455     // the emitters' height (the top edge is 0.5) and their spacing as a share of the width
#define EM_DX 0.24
#define FAN 1.8        // the whole fan at spread 1
#define TILT 0.9       // the scissor per unit of `tilt`
#define GLIDE 0.5      // the share of a beat the fans take to swing into the next pose (they land on the beat)
#define CORE 4.0       // the core: gain, half-width at the emitter, growth per unit of range (never under 0.8 px)
#define CORE_W 0.0006
#define CORE_R 0.0007
#define HIT 1.2        // `hit` widens the cores by up to this share and whitens them by half of `hit`
#define HALO 0.4       // the halo: gain, half-width at the emitter, growth per unit of range; the haze scales both
#define HALO_W 0.008
#define HALO_R 0.022
#define SMOKE 0.6      // how much the smoke's density shapes the halo (0 = an even glow); the core takes a quarter
#define DASH_F 56.0    // dot rings per unit of range, their speed down the beams (per s)
#define DASH_V 2.5
#define DOT 0.36       // a dotted core is 1/(1 − DOT·dash) wider: tuned until the dots move no light at any dash
#define FLOOD 0.5      // the halo share of the beams a burst adds: all 32 cores, half the smoke (the blacks stay deep)
#define WHITE vec3(0.82, 0.93, 1.0)
#define LUMA vec3(0.2126, 0.7152, 0.0722)

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// The smoke's density, 0..1 around 0.5: four octaves of value noise in flat layers, warped into wisps, drifting.
float smoke(vec2 p) {
    float t = TIME * 0.05;
    p = mat2(0.94, 0.34, -0.34, 0.94) * p * vec2(3.0, 4.2)
      + 1.4 * vec2(vnoise(p * 2.4 + vec2(t, 3.1)), vnoise(p * 2.4 + vec2(7.7, -t)));
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        s += a * vnoise(p + t * vec2(1.0, 0.4));
        p = mat2(1.656, 1.242, -1.242, 1.656) * p + vec2(13.7, 5.3); // ×2.07, turned: no octave shares the lattice's axes
        a *= 0.55;
    }
    return s / 1.009; // the weights' sum
}
// A pose: x = the lean both sides take inward, y = the lean neighbours take against each other, z = the fan's width
// as a share of the spread.
vec3 pose(float q) {
    if (q < 0.5) return vec3(0.0, 0.0, 0.3); // parallel: tight bundles straight down
    if (q < 1.5) return vec3(0.5, 0.0, 0.6); // crossed: both sides lean in and cross over the centre
    if (q < 2.5) return vec3(0.0, 0.0, 1.0); // fan: wide open
    return vec3(0.0, 0.4, 0.5); // scissor
}
// The light a beam's halo leaves along a run of length l: the integral of its width, HALO_W + HALO_R·r.
float glow(float l) { return l * (HALO_W + 0.5 * HALO_R * l); }
// The 16-step pattern: beam n is lit iff mod(n·hits, 16) < hits (hf = hits/16; the half step keeps off the edges).
float lit(float n, float hf) { return 1.0 - step(hf, fract(n * hf + 0.03125)); }

void main() {
    float ar = RENDERSIZE.x / RENDERSIZE.y;
    vec2 p = (isf_FragNormCoord - 0.5) * vec2(ar, 1.0);
    float f16 = fract(1.0 - phase) * 16.0;
    float st = floor(f16); // the 16-step chase
    // the pose: one per beat. The fans swing toward the next one over the end of the beat and land on it: the bar's
    // saw always reaches its end, so the swing is never cut short (a dipping grid confidence cuts the saw's start)
    float q = floor(st / 4.0);
    vec3 ps = mix(pose(q), pose(mod(q + 1.0, 4.0)), smoothstep(1.0 - GLIDE, 1.0, fract(f16 / 4.0)));
    float pitch = max(FAN * spread * ps.z / 7.0, 0.0001);
    float hf = float(hits) / 16.0;
    vec4 mi = vec4(0.0);
    if (PASSINDEX == 1) mi = IMG_NORM_PIXEL(mist, isf_FragNormCoord);
    float dots = dash * (1.0 - burst); // a burst holds the cores solid
    vec2 sum = vec2(0.0); // per colour pair: the halos (mist pass) or the cores (final pass)
    float near = 0.0; // mist.a: 1 on a lit beam, 0 from its reach away
    float px = (PASSINDEX == 0 ? 0.25 : 1.0) / RENDERSIZE.y; // a full-res pixel
    // the mist pass sums every fan; the final pass looks for cores only within reach of a lit beam (most pixels
    // have none: the mist is their whole picture)
    if (PASSINDEX == 0 || mi.a > 0.25) for (int e = 0; e < 4; e++) {
        float fe = float(e);
        float m = fe < 1.5 ? 1.0 : -1.0; // the right pair mirrors the left
        float alt = mod(fe, 2.0) < 0.5 ? 1.0 : -1.0; // + − + −: the scissor partners and the colour pairs
        float ex = (fe - 1.5) * EM_DX * ar; // the emitter's x
        vec2 v = p - vec2(ex, EM_Y);
        float r = length(v);
        // the pixel's angle inside the fan, mirrored: beam b sits at (b − 3.5)·pitch
        float aim = ps.x * m + (ps.y + TILT * tilt) * alt;
        float u = (atan(v.x, -v.y) - aim) * m;
        float n0 = st + 4.0 * fe;
        float wc = max(CORE_W + CORE_R * r, 0.8 * px) * (1.0 + HIT * hit) / (1.0 - DOT * dots); // the core's half-width
        float iw = 1.0 / (PASSINDEX == 0 ? (HALO_W + HALO_R * r) * (0.5 + 1.5 * haze) : wc); // mist pass: the halo's
        // 1/reach: the final pass looks this far from a lit beam for its core (never under 3 mist texels)
        float ir = 1.0 / max(3.0 * wc, 12.0 * px);
        // The mist pass sums all eight beams: the halo is wider than the beam pitch. A core is razor-thin, so the
        // final pass takes the nearest beam and its two neighbours (the three still meet at the emitter).
        float k = PASSINDEX == 0 ? 0.0 : clamp(floor(u / pitch + 4.0), 1.0, 6.0) - 1.0;
        float s = 0.0;
        for (int b = 0; b < 8; b++) {
            if (PASSINDEX == 1 && b > 2) break;
            float fb = k + float(b);
            float l = lit(n0 + fb, hf);
            float on = max(l, burst);
            float d = r * min(abs(u - (fb - 3.5) * pitch), 1.0); // the arc to the beam, capped behind the emitter
            float x = d * iw;
            if (PASSINDEX == 0) {
                // A leaning beam runs longer through the frame (to the floor or a side wall, whichever it meets
                // first) and its halo widens with range: each halo is dimmed to the light a straight-down beam
                // leaves, so a chop or a pose moves the light without changing its amount.
                float th = aim + m * (fb - 3.5) * pitch;
                float len = min((EM_Y + 0.5) / max(cos(th), 0.1),
                                (0.5 * ar - sign(th) * ex) / max(abs(sin(th)), 0.001));
                s += max(l, FLOOD * burst) * glow(EM_Y + 0.5) / (glow(len) * (1.0 + x * x));
                near = max(near, step(0.001, on) * (1.0 - d * ir));
            } else {
                x = max(1.0 - 0.25 * x * x, 0.0);
                s += on * x * x * x * x; // (1 − x²/4)⁴: exp(−x²) to a few %, compact, and no exp per beam
            }
        }
        // hats blank rings out of the cores, running down the beams: up to a third of the length, and the lit rest is
        // widened (DOT) to carry the same light. The halo is wider than a dot: it keeps its light as it is.
        float ring = abs(fract(r * DASH_F - TIME * DASH_V) - 0.5);
        if (PASSINDEX == 1) s *= smoothstep(0.0, 0.06, ring - 0.15 * dots + 0.06 * (1.0 - dots));
        sum += s * (alt > 0.0 ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
    }
    if (PASSINDEX == 0) {
        gl_FragColor = vec4(sum, smoke(p), near);
        return;
    }
    // the smoke shapes the halo (dark where no beam crosses it); its mean is 1, so it moves no light
    float sf = mix(1.0, 2.0 * smoothstep(0.3, 0.7, mi.z), SMOKE);
    vec3 green = clamp(abs(fract(hue + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
    // the exchange is decisive: the pairs trade colours through a short crossfade, never resting on the mix
    float sw = smoothstep(0.35, 0.65, swap);
    // the white carries the green's luma (down to 0.6 of itself for a dark hue), so the exchange moves no light
    vec3 white = WHITE * clamp(dot(green, LUMA) / dot(WHITE, LUMA), 0.6, 1.0);
    vec3 ca = mix(green, white, sw); // emitters 0+2
    vec3 cb = mix(white, green, sw); // emitters 1+3
    float hot = max(burst, 0.5 * hit);
    vec3 col = (mix(ca, vec3(1.0), hot) * sum.x + mix(cb, vec3(1.0), hot) * sum.y) * CORE * (0.75 + 0.25 * sf)
             + (ca * mi.x + cb * mi.y) * HALO * (0.4 + haze) * sf;
    col = 1.0 - exp(-col);
    // ±½ of an 8-bit step, on a plastic-number lattice that shifts every frame: the halo's dark gradient never
    // bands, and black stays black
    col += (fract(dot(gl_FragCoord.xy, vec2(0.7548777, 0.5698403)) + TIME * 17.0) - 0.5) / 255.0;
    gl_FragColor = vec4(col, 1.0);
}
