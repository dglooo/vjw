// VeeJay Wizard, 2026
// Look: TD audio-spectrum bars and MilkDrop's glowing waves (studied, rewritten). Adapted from VIDVOX's "FFT Color
// Lines" and "FFT Filled Waveform" (https://github.com/Vidvox/ISF-Files, MIT License, Copyright (c) 2018): the band
// lookup (a band's place on the FFT row → IMG_NORM_PIXEL(fft, vec2(x, 0.5)), times gain) and the wave's stroke
// (1 − smoothstep over |wave − y|). The log bands, smoothing, shapes, palette and glow are ours.
/*{
    "CATEGORIES": ["Geometry"],
    "CREDIT": "VeeJay Wizard; band lookup after VIDVOX's FFT Color Lines and FFT Filled Waveform, MIT",
    "DESCRIPTION": "Bars: the spectrum in 30 Hz–16 kHz log bands as glowing pills, in four shapes: on a floor line, round a ring, mirrored about the centre line, or the waveform as one glowing line. Kicks flare the glow, the sub thickens the bars, snares turn the hue, the bar spins the ring (or sweeps the colours across) and a build slows the bars' fall.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "fftImage", "TYPE": "audioFFT" },
        { "NAME": "waveImage", "TYPE": "audio" },
        { "NAME": "shape", "LABEL": "Shape", "TYPE": "long", "DEFAULT": 0, "VALUES": [0, 1, 2, 3], "LABELS": ["Line", "Circle", "Mirror", "Wave"] },
        { "NAME": "bands", "LABEL": "Bands", "TYPE": "long", "DEFAULT": 32, "VALUES": [8, 16, 32, 64, 128], "LABELS": ["8", "16", "32", "64", "128"] },
        { "NAME": "gap", "LABEL": "Gap", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0, "MAX": 0.9 },
        { "NAME": "thickness", "LABEL": "Thickness", "TYPE": "float", "DEFAULT": 0.6, "MIN": 0.05, "MAX": 1 },
        { "NAME": "gain", "LABEL": "Gain", "TYPE": "float", "DEFAULT": 1, "MIN": 0, "MAX": 3 },
        { "NAME": "colorA", "LABEL": "Colour A", "TYPE": "color", "DEFAULT": [0.1, 0.45, 1.0, 1.0] },
        { "NAME": "colorB", "LABEL": "Colour B", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.65, 1.0] },
        { "NAME": "hue", "LABEL": "Hue", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "glow", "LABEL": "Glow", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "smoothing", "LABEL": "Smoothing", "TYPE": "float", "DEFAULT": 0.15, "MIN": 0.02, "MAX": 1 },
        { "NAME": "spin", "LABEL": "Spin", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 }
    ],
    "PASSES": [
        { "TARGET": "levels", "PERSISTENT": true, "FLOAT": true, "WIDTH": 128, "HEIGHT": 1 },
        { "TARGET": "hot", "PERSISTENT": true, "FLOAT": true, "WIDTH": 1, "HEIGHT": 1 },
        {}
    ],
    "VJW_BIND": {
        "glow": { "source": "kick", "amount": 1, "attack": 0, "release": 0.15, "min": 0, "max": 1 },
        "hue": { "source": "snare", "amount": 1, "attack": 0, "release": 0.3, "min": 0, "max": 0.25 },
        "thickness": { "source": "sub", "amount": 1, "attack": 0.05, "release": 0.4, "min": 0.3, "max": 1 },
        "spin": { "source": "bar", "shape": "saw", "amount": 1, "attack": 0, "release": 0, "min": 0, "max": 1 },
        "smoothing": { "source": "build", "amount": 1, "attack": 1, "release": 2, "min": 0.15, "max": 0.6 }
    },
    "VJW_FLASH": ["glow"]
}*/

// Knobs. The FFT row is 512 bins to Nyquist (24 kHz at 48 kHz): LO..HI = 30 Hz–16 kHz as shares of it. The row holds
// −100…−30 dB as 0…1: FLOOR is a bar's zero, TILT lifts the top band (highs are quieter). TAPS per band (their max).
#define LO 0.00125
#define HI 0.667
#define FLOOR 0.4
#define TILT 0.25
#define TAPS 8
#define MARGIN 0.06
#define R0 0.2
#define PI 3.14159265
#define HOT_RISE 0.04 // s: the ⚡ glow and the thickness rise with post.ts heatStep's time constant (I-FL1), fall at once

float level(float i) {
    return IMG_NORM_PIXEL(levels, vec2((i + 0.5) / 128.0, 0.5)).r;
}

vec3 hueShift(vec3 c, float a) { // Rodrigues about the grey axis
    vec3 k = vec3(0.57735);
    float co = cos(a);
    return c * co + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - co);
}

// colorA → colorB across the bars (t 0 → 1) and back (t → 2), so a sweep by 2 wraps seamlessly; hue turns the result.
vec3 tint(float t) {
    return max(hueShift(mix(colorA.rgb, colorB.rgb, 0.5 - 0.5 * cos(PI * t)), 2.0 * PI * hue), 0.0);
}

// The bars along a layout: u 0..1 (bass → highs) at s screen units per unit, v out from the baseline, w a bar's
// half-width, len a full bar. Pills (round caps: a silent band is a dot). (distance, index, level) of the nearest of
// the pixel's slot and its two neighbours, and their halos summed (wider round a fatter bar, brighter round a louder
// one): seamless between slots, with no dark notch between two bars' tops.
vec4 nearest(float u, float v, float s, float w, float len) {
    float n = float(bands);
    float i = clamp(floor(u * n), 0.0, n - 1.0);
    vec4 best = vec4(1e3, i, 0.0, 0.0);
    for (int k = -1; k <= 1; k++) {
        float j = i + float(k);
        if (j < 0.0 || j > n - 1.0) continue;
        float l = level(j);
        float d = length(vec2((u - (j + 0.5) / n) * s, v - clamp(v, 0.0, l * len))) - w;
        best.w += exp(-max(d, 0.0) / (2.0 * w + 0.01)) * (0.3 + l);
        if (d < best.x) best.xyz = vec3(d, j, l);
    }
    return best;
}

// The waveform at u, a 4-sample box: MilkDrop smooths its waves too, and the hats' sample-to-sample jumps would stand
// as thin streaks of glow.
float wave(float u) {
    float x = 0.0;
    for (int k = 0; k < 4; k++) x += IMG_NORM_PIXEL(waveImage, vec2(u + (float(k) - 1.5) / 512.0, 0.5)).r;
    return (0.25 * x - 0.5) * 0.8 * gain;
}

void main() {
    vec2 uv = isf_FragNormCoord;
    float n = float(bands);
    if (PASSINDEX == 0) { // levels, one texel per band: the loudest tap in its log span, instant up, falling by smoothing
        float i = floor(uv.x * 128.0);
        float a = LO * pow(HI / LO, i / n);
        float b = LO * pow(HI / LO, (i + 1.0) / n);
        float x = 0.0;
        for (int k = 0; k < TAPS; k++) x = max(x, IMG_NORM_PIXEL(fftImage, vec2(mix(a, b, (float(k) + 0.5) / float(TAPS)), 0.5)).r);
        x = clamp(gain * (x + TILT * (i + 0.5) / n - FLOOR) / (1.0 - FLOOR), 0.0, 1.0);
        float prev = IMG_THIS_PIXEL(levels).r;
        gl_FragColor = vec4(x > prev ? x : mix(x, prev, exp(-TIMEDELTA / max(smoothing, 0.001))), 0.0, 0.0, 1.0);
        return;
    }
    if (PASSINDEX == 1) { // hot: the gated glow and the thickness as drawn, heatStep per channel (a 1×1 persistent texel)
        vec2 h = IMG_NORM_PIXEL(hot, vec2(0.5)).rg, x = vec2(glow, thickness);
        gl_FragColor = vec4(mix(x, h + (x - h) * (1.0 - exp(-TIMEDELTA / HOT_RISE)), vec2(greaterThan(x, h))), 0.0, 1.0);
        return;
    }
    vec2 hot2 = IMG_NORM_PIXEL(hot, vec2(0.5)).rg; // the glow and the thickness as drawn
    float ar = RENDERSIZE.x / RENDERSIZE.y;
    vec2 p = (uv - 0.5) * vec2(ar, 1.0); // screen units: the height is 1
    float fill = (1.0 - gap) * hot2.y; // the share of its slot a bar takes
    float d, w, t, l, g, halo; // distance, half-width, palette place, level, base → tip gradient, halo
    if (shape == 3) { // Wave: the waveform as one line, the distance to its segment across this sample (a steep spike
        // stays as tall as it is: a slope-scaled distance would smear it into streaks)
        float e = 0.5 / 512.0;
        float y0 = wave(uv.x - e);
        float y1 = wave(uv.x + e);
        vec2 pa = vec2(e * ar, p.y - y0), ba = vec2(2.0 * e * ar, y1 - y0);
        w = 0.0015 + 0.006 * hot2.y;
        d = length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)) - w;
        t = uv.x + 2.0 * spin;
        l = 0.6 + abs(y0 + y1);
        g = 1.0;
        halo = exp(-max(d, 0.0) / (2.0 * w + 0.01)) * (0.3 + l);
    } else {
        float u, v, s, len;
        if (shape == 1) { // Circle: bass at the top, mirrored down both sides; spin turns the ring
            float c = cos(2.0 * PI * spin), sn = sin(2.0 * PI * spin);
            vec2 q = mat2(c, sn, -sn, c) * p;
            float r = length(q);
            u = abs(atan(q.x, q.y)) / PI;
            v = r - R0;
            s = PI * r; // the arc: bars keep their width outwards
            w = 0.5 * PI * R0 / n * fill;
            len = 0.26;
        } else if (shape == 2) { // Mirror: bass in the middle, up and down from the centre line
            s = 0.5 * ar - MARGIN;
            u = abs(p.x) / s;
            v = abs(p.y);
            w = 0.5 * s / n * fill;
            len = 0.42;
        } else { // Line: bass on the left, standing on a floor
            s = ar - 2.0 * MARGIN;
            u = (p.x + 0.5 * s) / s;
            v = p.y + 0.38;
            w = 0.5 * s / n * fill;
            len = 0.8;
        }
        vec4 b = nearest(u, v, s, w, len);
        d = b.x;
        l = b.z;
        t = (b.y + 0.5) / n + (shape == 1 ? 0.0 : 2.0 * spin);
        g = clamp(v / max(l * len, w), 0.0, 1.0);
        halo = b.w;
    }
    // A pill's body, base dim → tip bright, and its halo; the kick's glow flares the halo and whitens the body, on top
    // of the rest look. An exp screen keeps the brights' shape.
    float px = 1.5 / RENDERSIZE.y;
    float body = smoothstep(px, -px, d);
    vec3 c = tint(t);
    vec3 col = c * (body * (0.5 + 0.9 * g) * (0.4 + l) + halo * (0.3 + 1.2 * hot2.x)) + body * hot2.x * 0.5;
    gl_FragColor = vec4(1.0 - exp(-1.5 * col), 1.0);
}
