// VeeJay Wizard, 2026
// Look: TD phaserCHOP's staggered wipe (studied, rewritten; the readMe's "a bit like what Time Machine TOP does").
// B is a treated copy of the input made in-shader — the research's A/B two-layer open point, dissolved. No
// third-party code.
/*{
    "CATEGORIES": ["Feedback"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "A staggered wipe: a treated copy of the image (inverted, hue-flipped, or zoomed) sweeps across the frame, each cell flipping at its own moment, through three phase maps (snake bars, a random grid, diamond shells from the centre). A build drives the wipe, and a drop flicks the maps.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "treat", "LABEL": "Treat", "TYPE": "long", "DEFAULT": 1, "VALUES": [0, 1, 2], "LABELS": ["Invert", "Hue +180", "Zoom"] },
        { "NAME": "t", "LABEL": "Wipe", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "map", "LABEL": "Map", "TYPE": "long", "DEFAULT": 0, "VALUES": [0, 1, 2], "LABELS": ["Snake", "Grid", "Diamond"] },
        { "NAME": "e", "LABEL": "Edge", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0.05, "MAX": 1 }
    ],
    "VJW_BIND": {
        "t": { "source": "build", "amount": 1, "attack": 1, "release": 2, "min": 0, "max": 1 },
        "map": { "source": "drop", "amount": 1, "attack": 0, "release": 0.1, "min": 0, "max": 2 }
    }
}*/

// Knobs: the cell counts of the maps (the TD dump runs 8–16); the treated copy's zoom-in factor.
#define BARS 12.0
#define GRID 12.0
#define ZOOM 1.35

// TD's phaser (research §5 #4): a cell's phase ph ∈ [0,1] is the moment it flips as t runs 0 → 1; e widens the
// transition. ph 1 flips first (right at t 0), ph 0 last (at t 1); outside [0,1] of t the cell is settled one way
// or the other, so a rest at t 0 is the input untouched.
float phaser(float t, float ph, float e) {
    return clamp((ph - 1.0 + t * (1.0 + e)) / e, 0.0, 1.0);
}

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); // the house sin hash (glitch.ts, tunnel.ts)
}

// The three phase maps: snake bars (a column sweeps, direction alternating per column), a random phase per grid
// cell, and diamond shells from the centre.
float phase(vec2 uv, int m) {
    if (m == 1) return hash(floor(uv * vec2(GRID, GRID * 0.72))); // ~12 × 9 cells on 16:9
    if (m == 2) {
        vec2 d = abs(2.0 * uv - 1.0);
        return (floor(d.x * GRID) + floor(d.y * GRID)) / (2.0 * GRID);
    }
    float col = floor(uv.x * BARS);
    return (col + (mod(col, 2.0) > 0.5 ? 1.0 - uv.y : uv.y)) / BARS;
}

// The treated copy B: invert, hue +180 (the complementary — a Rodrigues turn at π collapses to 2·mean − c, the
// bars.fs form), or a zoomed-in re-sample.
vec3 treatCopy(vec3 c, vec2 uv, int m) {
    if (m == 0) return 1.0 - c;
    if (m == 1) {
        float l = dot(c, vec3(1.0 / 3.0));
        return 2.0 * l - c;
    }
    return IMG_NORM_PIXEL(inputImage, (uv - 0.5) / ZOOM + 0.5).rgb;
}

void main() {
    vec2 uv = isf_FragNormCoord;
    vec3 a = IMG_THIS_PIXEL(inputImage).rgb;
    gl_FragColor = vec4(mix(a, treatCopy(a, uv, treat), phaser(t, phase(uv, map), e)), 1.0);
}
