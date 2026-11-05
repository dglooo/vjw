// VeeJay Wizard, 2026
// Look: a TD-style cell mosaic, stained glass that shatters (studied, rewritten). Adapted from VIDVOX's "Triangle Mosaic"
// (https://github.com/Vidvox/ISF-Files, MIT License, Copyright (c) 2018): hash2 (verbatim), the jitter offset per
// lattice point ((hash2 − 0.5) × jitter), the flat fill sampled inside the cell, and the outline (1 − smoothstep over its
// half-width in px, mixed toward outlineColor by its alpha). The lattices, the offset table, the Voronoi cells and
// borders are ours.
/*{
    "CATEGORIES": ["Pixel"],
    "CREDIT": "VeeJay Wizard; jitter and outline after VIDVOX's Triangle Mosaic, MIT",
    "DESCRIPTION": "Mosaic: the image as flat cells (squares, hexagons, triangles or diamonds), each the colour inside it, with an optional outline. Jitter pushes the cells' centres off the grid, so the cells shatter into irregular shards and settle back. Kicks jump the cell size, the bass shakes the shards (Auto-style: reese in DnB, wobble in Dubstep) and the hats flick the outline on.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "shape", "LABEL": "Shape", "TYPE": "long", "DEFAULT": 0, "VALUES": [0, 1, 2, 3], "LABELS": ["Square", "Hex", "Triangle", "Diamond"] },
        { "NAME": "cell", "LABEL": "Cell", "TYPE": "float", "DEFAULT": 0.04, "MIN": 0.005, "MAX": 0.25 },
        { "NAME": "jitter", "LABEL": "Jitter", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0, "MAX": 1 },
        { "NAME": "outline", "LABEL": "Outline", "TYPE": "float", "DEFAULT": 0.06, "MIN": 0, "MAX": 0.3 },
        { "NAME": "outlineColor", "LABEL": "Outline colour", "TYPE": "color", "DEFAULT": [0.0, 0.0, 0.0, 1.0] }
    ],
    "PASSES": [
        { "TARGET": "noise", "WIDTH": 256, "HEIGHT": 256 },
        {}
    ],
    "VJW_BIND": {
        "cell": { "source": "kick", "amount": 1, "attack": 0, "release": 0.2, "min": 0.03, "max": 0.05 },
        "jitter": { "source": "reese", "amount": 1, "attack": 0.05, "release": 0.4, "min": 0, "max": 0.8 },
        "outline": { "source": "hats", "amount": 1, "attack": 0, "release": 0.08, "min": 0, "max": 0.1 }
    }
}*/

// Knobs. REACH: a seed's offset per axis at jitter 1, in nearest-neighbour distances (the 3×3 search's margin holds to
// about 0.25). AREA: the triangle's side in lattice units, so its cells cover as much as a square's.
#define REACH 0.25
#define AREA 1.52
#define R3 1.7320508

vec2 hash2(vec2 p) { // VIDVOX
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
}

void main() {
    if (PASSINDEX == 0) { // a 256² table of two random offsets per brick: a fetch per seed costs less than a hash
        gl_FragColor = vec4(hash2(gl_FragCoord.xy), hash2(gl_FragCoord.xy + 0.5));
        return;
    }
    // The lattice, in bricks one unit wide: square and diamond rows are 1 high; hex and triangle rows √3/2, every other
    // one half a column on. A seed per brick, mid-brick (its Voronoi cell a square or hexagon); the triangle has two,
    // the up- and down-triangles' centroids, scanned as two seed rows per brick row. Each seed moves by its own fixed
    // random offset times jitter, so the shards morph as jitter moves.
    bool tri = shape == 2;
    bool tilt = shape == 1 || tri;
    float h = tilt ? 0.5 * R3 : 1.0;
    int rows = tri ? 6 : 3;
    float r = 2.0 * REACH * (tri ? 1.0 / R3 : 1.0) * jitter;
    float unit = cell * RENDERSIZE.x * (tri ? AREA : 1.0); // px per lattice unit
    vec2 p = (isf_FragNormCoord - 0.5) * RENDERSIZE / unit; // about the centre: a kick grows the cells from there
    if (shape == 3) p = vec2(p.x + p.y, p.y - p.x) * 0.70710678; // diamond: the squares at 45°
    float k = floor(p.y / h) - 1.0;

    // The nearest seed in the 3×3 bricks round p is its cell's; the border is the nearest bisector to any other one.
    vec2 S[18];
    vec2 best = vec2(0.0);
    float bd = 1e9;
    for (int t = 0; t < 6; t++) if (t < rows) {
        float row = k + (tri ? floor(float(t) * 0.5) : float(t));
        float b = tri ? mod(float(t), 2.0) : 0.0;
        vec2 at = tri ? vec2(0.25 + 0.5 * b, (1.0 + b) / 3.0) : vec2(0.5);
        float o = tilt ? 0.5 * mod(row, 2.0) : 0.0;
        for (int i = 0; i < 3; i++) {
            vec2 g = vec2(floor(p.x - o) + float(i - 1), row);
            vec4 n = IMG_NORM_PIXEL(noise, fract((g + 0.5) / 256.0));
            vec2 s = (g + vec2(o, 0.0) + at) * vec2(1.0, h) + ((b > 0.5 ? n.ba : n.rg) - 0.5) * r;
            S[t * 3 + i] = s;
            if (dot(s - p, s - p) < bd) { bd = dot(s - p, s - p); best = s; }
        }
    }
    float edge = 1e9;
    for (int t = 0; t < 6; t++) if (t < rows) for (int i = 0; i < 3; i++) {
        vec2 e = S[t * 3 + i] - best;
        if (dot(e, e) > 1e-6) edge = min(edge, dot(best + 0.5 * e - p, e) * inversesqrt(dot(e, e)));
    }

    // Fill: the input round the seed (4 taps a fifth of a unit out, so fine detail does not flicker the cell).
    vec2 q = shape == 3 ? vec2(best.x - best.y, best.x + best.y) * 0.70710678 : best;
    vec2 uv = q * unit / RENDERSIZE + 0.5, o = 0.2 * unit / RENDERSIZE;
    vec4 c = 0.25 * (IMG_NORM_PIXEL(inputImage, uv + o) + IMG_NORM_PIXEL(inputImage, uv - o)
        + IMG_NORM_PIXEL(inputImage, uv + vec2(o.x, -o.y)) + IMG_NORM_PIXEL(inputImage, uv + vec2(-o.x, o.y)));

    // Outline: w px wide on the border, a 1 px edge; under 1 px it fades rather than vanish in a step.
    float w = outline * cell * RENDERSIZE.x;
    float a = (1.0 - smoothstep(0.5 * w - 0.5, 0.5 * w + 0.5, edge * unit)) * min(w, 1.0) * outlineColor.a;
    gl_FragColor = vec4(mix(c.rgb, outlineColor.rgb, a), c.a);
}
