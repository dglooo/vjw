// VeeJay Wizard, 2026
/*{
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "A neon grid landscape: ridged mountains either side of a valley, rolling waves, a striped sun. Height lifts the mountains.",
    "ISFVSN": "2",
    "CATEGORIES": ["Geometry"],
    "INPUTS": [
        { "NAME": "height", "LABEL": "Height", "TYPE": "float", "DEFAULT": 1, "MIN": 0, "MAX": 2.5 },
        { "NAME": "glow", "LABEL": "Glow", "TYPE": "float", "DEFAULT": 1, "MIN": 0, "MAX": 3 },
        { "NAME": "speed", "LABEL": "Speed", "TYPE": "float", "DEFAULT": 1, "MIN": 0, "MAX": 3 },
        { "NAME": "hue", "LABEL": "Hue", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 }
    ],
    "VJW_BIND": {
        "height": { "source": "bass", "amount": 1, "attack": 0.03, "release": 0.3, "min": 0.5, "max": 1.8 },
        "glow": { "source": "onset", "amount": 1, "attack": 0, "release": 0.2, "min": 0, "max": 2.5 }
    },
    "VJW_FLASH": ["glow"]
}*/

// Knobs: march steps (the GPU cost; bench budget p95 ≤ 5 ms at 1728×1118), the least step (a fraction of the
// distance), how much shorter steps get over the mountains (× height: their slopes grow with it), far plane, grid
// spacing, flight m/s.
#define STEPS 64
#define STRIDE 0.15
#define STEEP 4.0
#define FAR 60.0
#define GRID 2.0
#define FLY 8.0

vec3 palette(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }

// Mountains from two warped sine sheets (ridges where either crosses zero; simplex noise cost 2.5× as much), zero in
// the valley, plus waves rolling towards the camera. q = the sheets' product (0 in the valley): it changes sign across a
// ridge line.
float terrain(vec2 p, out float q) {
    float h = 0.25 * sin(p.y * 0.4 - TIME * 3.0) * smoothstep(0.0, 5.0, abs(p.x));
    q = 0.0;
    if (abs(p.x) > 2.0) { // the valley floor skips the mountains
        q = sin(p.x * 0.23 + 1.3 * sin(p.y * 0.11)) * sin(p.y * 0.17 + 1.1 * sin(p.x * 0.13 + 1.7));
        float r = 1.0 - abs(q);
        h += smoothstep(2.0, 9.0, abs(p.x)) * 5.0 * r * r * r;
    }
    return height * h;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y;
    vec3 ro = vec3(0.0, 1.3, TIME * FLY * speed);
    vec3 rd = normalize(vec3(uv.x, uv.y - 0.08, 1.4));
    vec3 pink = palette(hue + 0.83);
    vec3 cyan = palette(hue + 0.45);

    // Sky: deep blue at the top to hot pink at the horizon, a striped sun, a few stars.
    float y = uv.y + 0.02;
    vec3 col = mix(pink * 0.55, vec3(0.03, 0.01, 0.08), smoothstep(-0.05, 0.45, y));
    vec2 s = uv - vec2(0.0, 0.13);
    float sun = smoothstep(0.205, 0.2, length(s));
    sun *= y > 0.1 ? 1.0 : step(0.35 + 2.5 * (0.1 - y), fract(y * 30.0)); // the cut-outs widen downwards
    col = mix(col, mix(palette(hue + 0.95), vec3(1.0, 0.85, 0.3), smoothstep(-0.05, 0.3, s.y)) * 1.4, sun);
    col += pink * 0.25 * exp(-6.0 * max(length(s) - 0.2, 0.0)) * glow;
    vec2 cell = floor(uv * 90.0);
    col += step(0.997, fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453)) * smoothstep(0.1, 0.3, y) * 0.8;

    // Terrain: rays going up leave the tallest mountain's height early.
    float top = height * 5.3 + 0.3;
    float tmax = rd.y > 0.0 ? min(FAR, (top - ro.y) / rd.y) : FAR;
    // Coarse steps (at least STRIDE × the distance, shorter over the mountains), then two secant steps between the last
    // point above the ground (tp, hp) and the first below (t, h). A ridge's tip is thinner than a step, so a step over a
    // ridge line also tests the ray where it crossed the line: else bass peaks show floating shards.
    float t = 0.4;
    float tp = t;
    float hp = 1.0;
    float h = 1.0;
    float q;
    float qc;
    float qp = 0.0;
    bool hit = false;
    for (int i = 0; i < STEPS; i++) {
        vec3 p = ro + rd * t;
        h = p.y - terrain(p.xz, q);
        if (h < 0.0) { hit = true; break; }
        if (q * qp < 0.0) {
            float tc = mix(tp, t, qp / (qp - q));
            vec3 c = ro + rd * tc;
            float hc = c.y - terrain(c.xz, qc);
            if (hc < 0.0) { t = tc; h = hc; hit = true; break; }
        }
        tp = t;
        hp = h;
        qp = q;
        t += max(0.5 * h, STRIDE * t) / (1.0 + STEEP * height * smoothstep(2.0, 9.0, abs(p.x)));
        if (t > tmax) break;
    }
    if (hit) {
        for (int j = 0; j < 2; j++) {
            float tm = tp + (t - tp) * hp / (hp - h);
            vec3 m = ro + rd * tm;
            float hm = m.y - terrain(m.xz, q);
            if (hm < 0.0) { t = tm; h = hm; } else { tp = tm; hp = hm; }
        }
        t = tp + (t - tp) * hp / (hp - h);
        vec3 p = ro + rd * t;
        vec2 g = abs(fract(p.xz / GRID + 0.5) - 0.5) * GRID; // distance to the nearest grid line
        float w = 0.03 + 0.0025 * t;                          // wider with distance, so far lines don't alias
        float line = max(smoothstep(w, 0.0, g.x), smoothstep(w, 0.0, g.y));
        vec3 lc = mix(cyan, pink, smoothstep(0.0, 4.0 * height + 0.1, p.y));
        vec3 ground = vec3(0.02, 0.0, 0.05) + lc * 0.05;
        col = mix(mix(ground, lc * 1.6 * glow, line), pink * 0.5, smoothstep(0.25 * FAR, FAR, t));
    }
    col = 1.0 - exp(-1.5 * col);
    gl_FragColor = vec4(pow(col, vec3(0.85)), 1.0);
}
