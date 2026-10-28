// VeeJay Wizard, 2026
/*{
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "A flight through an endless lattice of girders, light pulses racing along the beams, raymarched. The layer's speed is the flight speed.",
    "ISFVSN": "2",
    "CATEGORIES": ["Geometry"],
    "INPUTS": [
        { "NAME": "glow", "LABEL": "Glow", "TYPE": "float", "DEFAULT": 0.6, "MIN": 0, "MAX": 3 },
        { "NAME": "sway", "LABEL": "Sway", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0, "MAX": 1 },
        { "NAME": "hue", "LABEL": "Hue", "TYPE": "float", "DEFAULT": 0.55, "MIN": 0, "MAX": 1 }
    ],
    "VJW_BIND": {
        "glow": { "source": "bass", "amount": 1, "attack": 0.02, "release": 0.25, "min": 0.3, "max": 2 }
    }
}*/

// Knobs: march steps (the GPU cost; bench budget p95 ≤ 5 ms at 1728×1118), lattice cell, beam half-width, flight m/s.
#define STEPS 72
#define CELL 4.0
#define BEAM 0.2
#define FLY 5.0

vec3 palette(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

// Three square beams through every cell, along x, y and z.
float map(vec3 p) {
    vec3 q = abs(mod(p, CELL) - 0.5 * CELL);
    return min(min(max(q.y, q.z), max(q.x, q.z)), max(q.x, q.y)) - BEAM;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y;
    float z = TIME * FLY;
    // The corridor between beams is the line x = y = 0 (cell corners); sway stays inside it.
    vec3 ro = vec3(sway * 0.9 * sin(TIME * 0.37), sway * 0.9 * sin(TIME * 0.29 + 1.0), z);
    vec3 rd = normalize(vec3(uv, 1.3));
    rd.xy = rot(sway * 0.35 * sin(TIME * 0.21)) * rd.xy;
    rd.xz = rot(sway * 0.25 * sin(TIME * 0.33)) * rd.xz;

    float t = 0.0;
    float haze = 0.0; // light scattered near beams along the ray
    float d = 1.0;
    for (int i = 0; i < STEPS; i++) {
        d = map(ro + rd * t);
        haze += exp(-8.0 * d);
        if (d < 0.001 * t || t > 60.0) break;
        t += d;
    }
    vec3 fogc = palette(hue + 0.5) * 0.03;
    vec3 col = fogc;
    if (d < 0.01 * t + 0.01) {
        vec3 p = ro + rd * t;
        vec3 q = mod(p, CELL) - 0.5 * CELL;
        vec3 a = abs(q);
        // Which beam: the axis the hit point is farthest along; u runs along it, (v, w) across it.
        float u = p.z;
        vec2 vw = q.xy;
        if (a.x > a.y && a.x > a.z) { u = p.x; vw = q.yz; }
        else if (a.y > a.z) { u = p.y; vw = q.xz; }
        vec3 cell = floor(p / CELL);
        vec3 tint = palette(hue + 0.15 * fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453));
        float edge = smoothstep(0.75, 0.97, min(abs(vw.x), abs(vw.y)) / BEAM);
        float pulse = pow(1.0 - fract(u * 0.125 - TIME * 1.5), 6.0);
        vec3 n = vec3(0.0);
        if (abs(vw.x) > abs(vw.y)) n.x = sign(vw.x); else n.y = sign(vw.y); // in the beam's (v, w) frame
        float lit = 0.25 + 0.75 * abs(n.x * 0.6 + n.y * 0.8);
        col = tint * (0.05 * lit + edge * (0.35 + 2.5 * pulse) * glow);
        col = mix(fogc, col, exp(-0.045 * t));
    }
    col += palette(hue + 0.05) * haze * 0.006 * glow;
    col = 1.0 - exp(-1.6 * col);
    gl_FragColor = vec4(pow(col, vec3(0.85)), 1.0);
}
