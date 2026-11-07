// VeeJay Wizard, 2026
// Look: TD Palette superFormula (studied, rewritten). Gielis' formula r(φ) = (|cos(mφ/4)/a|^n2 + |sin(mφ/4)/b|^n3)^(−1/n1),
// drawn per pixel as a glowing outline: |p| vs r(atan p), fragment-only, no line pass. No third-party code (the formula
// is a published mathematical definition, Philippe Gielis).
/*{
    "CATEGORIES": ["Geometry"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Gielis superformula as a glowing outline: snares step the lobe count m, the bass (Auto-style: reese, wobble under Dubstep) rounds the lobes via n1, kicks pump the size, the sub lights the halo, and a drop sweeps the shape's (n2, n3) presets.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "m", "LABEL": "Symmetry m", "TYPE": "float", "DEFAULT": 16, "MIN": 1, "MAX": 32 },
        { "NAME": "n1", "LABEL": "n1", "TYPE": "float", "DEFAULT": 1, "MIN": 0.5, "MAX": 6 },
        { "NAME": "n2", "LABEL": "n2", "TYPE": "float", "DEFAULT": 0.6, "MIN": 0.1, "MAX": 8 },
        { "NAME": "n3", "LABEL": "n3", "TYPE": "float", "DEFAULT": 6, "MIN": 0.1, "MAX": 8 },
        { "NAME": "a", "LABEL": "a", "TYPE": "float", "DEFAULT": 1, "MIN": 0.25, "MAX": 2 },
        { "NAME": "b", "LABEL": "b", "TYPE": "float", "DEFAULT": 1, "MIN": 0.25, "MAX": 2 },
        { "NAME": "scale", "LABEL": "Scale", "TYPE": "float", "DEFAULT": 1, "MIN": 0.1, "MAX": 2 },
        { "NAME": "glow", "LABEL": "Glow", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "preset", "LABEL": "Preset", "TYPE": "long", "DEFAULT": 0, "VALUES": [0, 1, 2, 3], "LABELS": ["Doc", "Tilt +", "Tilt −", "Pillow"] }
    ],
    "VJW_BIND": {
        "m": { "source": "snare", "amount": 1, "attack": 0, "release": 0.3, "min": 10, "max": 14 },
        "n1": { "source": "reese", "amount": 1, "attack": 0.05, "release": 0.3, "min": 1, "max": 3 },
        "scale": { "source": "kick", "amount": 1, "attack": 0, "release": 0.15, "min": 0.7, "max": 1 },
        "glow": { "source": "sub", "amount": 1, "attack": 0.02, "release": 0.4, "min": 0, "max": 1 },
        "preset": { "source": "drop", "amount": 1, "attack": 0, "release": 1.5, "min": 0, "max": 3 }
    }
}*/

// Knobs: BASE is the shape's radius in screen-height units; every (m, n) combo the presets allow stays inside 0.5 at
// scale 1. PRESETS are (n2, n3) pairs; 0 = the doc values through the inputs, the rest fixed by preset (the drop
// sweeps them — the generator is stateless, so the sweep decays back to 0).
#define PI 3.14159265
#define BASE 0.36

vec3 pal(float t) { // the outline's colour turns once around the shape (bloom's cosine shape, one full cycle)
    return 0.5 + 0.5 * cos(2.0 * PI * (t + vec3(0.0, 0.33, 0.67)));
}

void main() {
    float ar = RENDERSIZE.x / RENDERSIZE.y;
    vec2 p = (isf_FragNormCoord - 0.5) * vec2(ar, 1.0); // screen units: the height is 1
    float phi = atan(p.y, p.x);
    float mm = floor(m); // snare's continuous 10→14 as integer lobe steps
    float n2v, n3v;
    if (preset == 1) { n2v = 1.0; n3v = 3.0; }
    else if (preset == 2) { n2v = 3.0; n3v = 1.0; }
    else if (preset == 3) { n2v = 0.25; n3v = 0.25; }
    else { n2v = n2; n3v = n3; }
    float u = mm * phi / 4.0;
    // Gielis; the pow base is always > 0 (|cos| and |sin| are never both 0), so the negative exponent is safe
    float s = pow(abs(cos(u)) / a, n2v) + pow(abs(sin(u)) / b, n3v);
    float r = BASE * scale * pow(s, -1.0 / max(n1, 0.2));
    float d = length(p) - r; // < 0 inside the outline
    float px = 1.0 / RENDERSIZE.y;
    float line = exp(-d * d / (2.0 * 2.0 * px * px)); // the outline: a 2 px Gaussian, a glowing line, never a fill
    float halo = glow * 0.5 * exp(-max(d, 0.0) / (0.08 * (1.0 + glow))); // the sub's halo, wider as it grows
    vec3 c = pal(phi / (2.0 * PI) + 0.5 + 0.02 * TIME); // one hue cycle around, drifting slowly
    vec3 col = c * (line * 1.4 + halo);
    gl_FragColor = vec4(1.0 - exp(-1.5 * col), 1.0);
}
