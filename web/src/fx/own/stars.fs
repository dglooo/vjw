// VeeJay Wizard, 2026
// Look: TD Palette's noise generator (studied, rewritten). Ported from the Wombat noise library: Stars2D and
// PolkaDot2D, verbatim, with only the helpers they call (FAST32_hash_2D_Cell, Falloff_Xsq_C1/C2 — read from the
// in-repo extract before copying, per design ⚠️ L221; the 3D/4D and other hash variants are not pulled).
// Author: Brian Sharpe, Wombat (GPU noise development blog), http://briansharpe.wordpress.com,
// https://github.com/BrianSharpe — in-repo extract: donor/td-reverse/…/Samples/Palette/Generators/noise/noise/noise/
// glsl2_pixel1.txt (no licence file there).
// License: the author's permissive header — "I'm not one for copyrights. Use the code however you wish. All I ask
// is that credit be given back to the blog or myself when appropriate." (personal use)
/*{
    "CATEGORIES": ["Geometry"],
    "CREDIT": "VeeJay Wizard; Stars2D and PolkaDot2D from Brian Sharpe's Wombat (use the code however you wish, credit)",
    "DESCRIPTION": "A starfield and a polka-dot field in one generator, on a hash grid that scrolls with the bass: hats raise the stars' probability, kicks swell the dots, the bass scrolls the field (Auto-style: reese, wobble under Dubstep), and a drop re-rolls the mode between stars and polka.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "mode", "LABEL": "Mode", "TYPE": "long", "DEFAULT": 0, "VALUES": [0, 1], "LABELS": ["Stars", "Polka"] },
        { "NAME": "prob", "LABEL": "Probability", "TYPE": "float", "DEFAULT": 0.18, "MIN": 0, "MAX": 1 },
        { "NAME": "radius", "LABEL": "Radius", "TYPE": "float", "DEFAULT": 0.18, "MIN": 0.02, "MAX": 0.6 },
        { "NAME": "scroll", "LABEL": "Scroll", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 }
    ],
    "VJW_BIND": {
        "prob": { "source": "hats", "amount": 1, "attack": 0, "release": 0.1, "min": 0.06, "max": 0.35 },
        "radius": { "source": "kick", "amount": 1, "attack": 0, "release": 0.1, "min": 0.06, "max": 0.3 },
        "scroll": { "source": "reese", "amount": 1, "attack": 0, "release": 0.3, "min": 0, "max": 0.3 },
        "mode": { "source": "drop", "amount": 1, "attack": 0, "release": 1.5, "min": 0, "max": 1 }
    }
}*/

// Wombat (Brian Sharpe) — the four functions verbatim, comments trimmed to the credit above.
vec4 FAST32_hash_2D_Cell(vec2 gridcell) { // generates 4 different random numbers for the single given cell point
    const vec2 OFFSET = vec2(26.0, 161.0);
    const float DOMAIN = 71.0;
    const vec4 SOMELARGEFLOATS = vec4(951.135664, 642.949883, 803.202459, 986.973274);
    vec2 P = gridcell - floor(gridcell * (1.0 / DOMAIN)) * DOMAIN; // truncate the domain
    P += OFFSET.xy;
    P *= P;
    return fract((P.x * P.y) * (1.0 / SOMELARGEFLOATS.xyzw));
}
float Falloff_Xsq_C1(float xsq) { xsq = 1.0 - xsq; return xsq * xsq; } // (1 − x²)²
float Falloff_Xsq_C2(float xsq) { xsq = 1.0 - xsq; return xsq * xsq * xsq; } // (1 − x²)³

// Wombat Stars2D: a star per cell under `probability_threshold`, radius fixed (2/radius in), dimness varied. 0..1.
float Stars2D(vec2 P, float probability_threshold, float max_dimness, float two_over_radius) {
    vec2 Pi = floor(P);
    vec2 Pf = P - Pi;
    vec4 hash = FAST32_hash_2D_Cell(Pi);
    float VALUE = 1.0 - max_dimness * hash.z;
    Pf *= two_over_radius;
    Pf -= (two_over_radius - 1.0);
    Pf += hash.xy * (two_over_radius - 2.0);
    return (hash.w < probability_threshold) ? (Falloff_Xsq_C1(min(dot(Pf, Pf), 1.0)) * VALUE) : 0.0;
}

// Wombat PolkaDot2D: a dot per cell, radius random in [radius_low, radius_high], value proportional to the radius.
// 0..1.
float PolkaDot2D(vec2 P, float radius_low, float radius_high) {
    vec2 Pi = floor(P);
    vec2 Pf = P - Pi;
    vec4 hash = FAST32_hash_2D_Cell(Pi);
    float RADIUS = max(0.0, radius_low + hash.z * (radius_high - radius_low));
    float VALUE = RADIUS / max(radius_high, radius_low);
    RADIUS = 2.0 / RADIUS;
    Pf *= RADIUS;
    Pf -= (RADIUS - 1.0);
    Pf += hash.xy * (RADIUS - 2.0);
    return Falloff_Xsq_C2(min(dot(Pf, Pf), 1.0)) * VALUE;
}

// Knobs: the grid's cell count across the height (aspect-corrected, so cells and dots stay round); the stars'
// brightness spread; the scroll speed in cells/s per unit of `scroll`.
#define SCALE 24.0
#define DIMNESS 0.6
#define SCROLL 3.0
#define PI 3.14159265

void main() {
    float ar = RENDERSIZE.x / RENDERSIZE.y;
    vec2 p = (vec2(isf_FragNormCoord.x * ar, isf_FragNormCoord.y) - vec2(0.0, TIME * SCROLL * scroll)) * SCALE;
    vec3 col;
    if (mode == 1) { // polka: one hue per cell, the dots swell on the kicks
        float v = PolkaDot2D(p, 0.5 * radius, radius);
        col = (0.5 + 0.5 * cos(2.0 * PI * (FAST32_hash_2D_Cell(floor(p)).x + vec3(0.0, 0.33, 0.67)))) * v;
    } else { // stars: warm white, the hats raise their probability
        float v = Stars2D(p, prob, DIMNESS, 2.0 / max(radius, 0.02));
        col = vec3(1.0, 0.95, 0.85) * v;
    }
    gl_FragColor = vec4(1.0 - exp(-2.0 * col), 1.0);
}
