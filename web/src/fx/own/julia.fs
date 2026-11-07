// VeeJay Wizard, 2026
// Look: TD Palette julia (studied, rewritten): the orbit trap — each pixel iterates z ← z^p + C from its own point
// and stamps the input's colour where the orbit first lands in the input's footprint: the layer tiled into fractal
// lace; the rest takes a smooth iteration-count ramp (the donor's escape colour). Mode 1 is the mandelbrot sibling
// (z₀ = c, the pixel's own point; the trap skipped): the static basin, the view crawling over it. The polar power is
// the donor's r^p·(cos pφ, sin pφ); p = ±2 take the exact algebraic paths (z², 1/z²) — no trig per iteration.
/*{
    "CATEGORIES": ["Geometry"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Julia orbit trap: the incoming layer tiled into fractal lace. An lfo turns the crawl's angle, the bass (Auto-style: reese, wobble under Dubstep) opens its radius, kicks zoom 1→1.25, snares step the ramp's hue, and a drop re-rolls C. Mode 1 is the mandelbrot sibling: the static basin under the same crawl.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "mode", "LABEL": "Mode", "TYPE": "long", "DEFAULT": 0, "VALUES": [0, 1], "LABELS": ["Julia trap", "Mandelbrot"] },
        { "NAME": "Iter", "LABEL": "Iterations", "TYPE": "long", "DEFAULT": 32, "VALUES": [16, 24, 32, 48, 64] },
        { "NAME": "p", "LABEL": "Power p", "TYPE": "float", "DEFAULT": -2, "MIN": -4, "MAX": 4 },
        { "NAME": "cx", "LABEL": "C x", "TYPE": "float", "DEFAULT": -0.15, "MIN": -3, "MAX": 3 },
        { "NAME": "cy", "LABEL": "C y", "TYPE": "float", "DEFAULT": 0.6, "MIN": -3, "MAX": 3 },
        { "NAME": "cAngle", "LABEL": "C angle", "TYPE": "float", "DEFAULT": 0.25, "MIN": 0, "MAX": 1 },
        { "NAME": "cMag", "LABEL": "C radius", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0, "MAX": 1 },
        { "NAME": "scale", "LABEL": "Scale", "TYPE": "float", "DEFAULT": 1, "MIN": 0.02, "MAX": 8 },
        { "NAME": "rampHue", "LABEL": "Ramp hue", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "reseed", "LABEL": "Reseed", "TYPE": "long", "DEFAULT": 0, "VALUES": [0, 1, 2, 3], "LABELS": ["Doc", "1", "2", "3"] }
    ],
    "VJW_BIND": {
        "cAngle": { "source": "lfo", "shape": "sine", "rate": 0.05, "amount": 1, "attack": 0, "release": 0, "min": 0, "max": 1 },
        "cMag": { "source": "reese", "amount": 1, "attack": 0.05, "release": 0.3, "min": 0, "max": 0.8 },
        "scale": { "source": "kick", "amount": 1, "attack": 0, "release": 0.2, "min": 1, "max": 1.25 },
        "rampHue": { "source": "snare", "amount": 1, "attack": 0, "release": 0.3, "min": 0, "max": 0.3 },
        "reseed": { "source": "drop", "amount": 1, "attack": 0, "release": 1.5, "min": 0, "max": 3 }
    }
}*/

// Knobs: the loop bound is a constant (GLSL ES 1.00); `Iter` breaks it (doc Iter 32 — the S1.2 gate: Iter 48 / res .5
// billed 20.4 ms p95 at 1728×1117, over the 5 ms budget; the frozen fallback), and the settle test breaks a converged
// orbit early (see main). SPAN is the view's height in fractal units, centred on C (the donor's 3.6; its 6.4 was the
// 16:9 width). The p = -2 orbits stay bounded (no escape); the smooth count serves p > 1.5 in mode 0 and every escape
// in mode 1.
#define PI 3.14159265
#define BOUND 64
#define SPAN 3.6

vec3 pal(float t) { return 0.5 + 0.5 * cos(2.0 * PI * (t + vec3(0.0, 0.33, 0.67))); }

vec2 zpow(vec2 z, float p) { // the donor's polar power; p = +-2 as z*z / 1/(z*z) (exact, trig-free per iteration)
    if (p > 1.5) return vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y);
    if (p < -1.5) {
        vec2 z2 = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y);
        float inv = 1.0 / dot(z2, z2); // 1/z^2 = conj(z^2)/|z|^4 (complex, not componentwise); one reciprocal
        return vec2(z2.x * inv, -z2.y * inv);
    }
    float phi = atan(z.y, z.x);
    return vec2(cos(p * phi), sin(p * phi)) * pow(length(z), p);
}

vec2 reseedOff(int s) { // the drop's re-roll: 0 holds the doc's C; 1..3 jump it up to +-0.8 (a hash, stateless)
    if (s < 1) return vec2(0.0);
    float h1 = fract(sin(float(s) * 12.9898) * 43758.5453);
    float h2 = fract(sin(float(s) * 78.233) * 43758.5453);
    return (vec2(h1, h2) - 0.5) * 1.6;
}

void main() {
    float ar = RENDERSIZE.x / RENDERSIZE.y;
    // C = the doc's base, plus the crawl (the lfo's angle, the bass's radius), plus the drop's re-roll
    vec2 C = vec2(cx, cy) + cMag * vec2(cos(2.0 * PI * cAngle), sin(2.0 * PI * cAngle)) + reseedOff(reseed);
    vec2 z0 = C + (isf_FragNormCoord - 0.5) * vec2(SPAN * ar, SPAN) / scale; // the view: SPAN tall, centred on C
    // The p = -2 orbit stays in the C + unit disc once it is in it (any |z| >= 1 point maps there); the unit disc
    // is reachable only while |C| < 2 (the lens C + disc ∩ disc(0,1)). So with |C| > 2 and the disc missing the
    // footprint, no orbit can stamp after the first 8 steps — the full-count ramp below is the colour either way.
    float dxm = max(max(-C.x, C.x - 1.0), 0.0);
    float dym = max(max(-C.y, C.y - 1.0), 0.0);
    bool noStamp = mode < 1 && p < -1.5 && dot(C, C) > 4.0 && dxm*dxm + dym*dym > 1.0;
    vec2 z = z0;
    vec2 z1 = z0; // the orbit one and two back (mode 1's settle test)
    vec2 z2 = z0;
    vec3 col;
    float s = float(Iter); // the ramp position x100: the full count when the orbit ran out (p = -2 never escapes)
    float done = 0.0;
    for (int k = 0; k < BOUND; k++) {
        if (k >= Iter) break;
        if (noStamp && k >= 8) break;
        z = zpow(z, p) + (mode < 1 ? C : z0); // mode 1: the pixel is c, the trap is skipped
        if (mode < 1) {
            if (p > 1.5 && dot(z, z) > 4.0) { s = float(k) + 1.0 - log2(log2(dot(z, z))); break; } // the donor's smooth count
            if (z.x >= 0.0 && z.x <= 1.0 && z.y >= 0.0 && z.y <= 1.0) { // the orbit in the input's footprint
                vec4 ip = IMG_NORM_PIXEL(inputImage, z);
                if (ip.a > 0.1) { col = ip.rgb; done = 1.0; break; }
            }
        } else if (dot(z, z) > 4.0) {
            s = float(k) + 1.0 - log2(log2(dot(z, z)));
            break;
        } else if (k >= 8) {
            // Settle early-out (mode 1's cost): within 1e-3 of a fixed point or 2-cycle, the orbit cannot leave —
            // it will not escape either, and the ramp below is the full-count colour (a settled orbit stays 1e-3
            // from its cycle, so no later |z| > 2 crossing the ramp's edge can differ by more than a pixel).
            vec2 dz = z - z1;
            if (dot(dz, dz) < 1e-6 || (k >= 10 && dot(z - z2, z - z2) < 1e-6)) break;
        }
        z2 = z1;
        z1 = z;
    }
    if (done < 1.0) {
        s = clamp(s, 0.0, 100.0);
        col = pal(rampHue + s / 100.0) * (0.35 + 0.55 * s / 100.0);
        col = 1.0 - exp(-1.5 * col); // the generated light tone-maps; a stamp is the input's own (already mapped)
    }
    gl_FragColor = vec4(col, 1.0);
}
