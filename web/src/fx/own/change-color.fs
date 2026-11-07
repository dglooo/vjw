// VeeJay Wizard, 2026
// Look: TD Palette changeColor + changeToColor (studied, rewritten): one hue band — picked by its centre and width —
// is recoloured. Mode 0 shifts the band's hue by `offset` (changeColor; TD's default is a −200° push on the snare);
// mode 1 swaps the band's hue for `target` (changeToColor; the target walks on a saw lfo). Saturation and value are
// kept, so a rest (offset 0 / m 0) is the input untouched. No third-party code.
/*{
    "CATEGORIES": ["Color Effect", "Retro"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Recolours one hue band: mode 0 shifts its hue (changeColor), mode 1 swaps it for a target hue (changeToColor). The band is the input's hue within `band` of `hue`, its edge twice as wide (TD's ±18°/36° at the default).",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "mode", "LABEL": "Mode", "TYPE": "long", "DEFAULT": 0, "VALUES": [0, 1], "LABELS": ["changeColor (shift)", "changeToColor (replace)"] },
        { "NAME": "hue", "LABEL": "Band hue", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0, "MAX": 1 },
        { "NAME": "band", "LABEL": "Band width", "TYPE": "float", "DEFAULT": 0.05, "MIN": 0.01, "MAX": 0.25 },
        { "NAME": "offset", "LABEL": "Hue offset", "TYPE": "float", "DEFAULT": 0, "MIN": -0.5, "MAX": 0.5 },
        { "NAME": "target", "LABEL": "Target hue", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 }
    ],
    "VJW_BIND": {
        "offset": { "source": "snare", "amount": 1, "attack": 0, "release": 0.3, "min": 0, "max": 0.5 },
        "target": { "source": "lfo", "shape": "saw", "rate": 0.05, "amount": 1, "attack": 0, "release": 0, "min": 0, "max": 1 }
    }
}*/

// The standard HSV pair (the K-vec4 formulation; the donor's own files carry the same math — studied, rewritten).
vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = c.g < c.b ? vec4(c.bg, K.wz) : vec4(c.gb, K.xy);
    vec4 q = c.r < p.x ? vec4(p.xyw, c.r) : vec4(c.r, p.yzx);
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec4 src = IMG_THIS_PIXEL(inputImage);
    vec3 h = rgb2hsv(src.rgb);
    float d = abs(fract(h.x - hue + 0.5) - 0.5) * 2.0; // 0 at the band's centre, 1 half a wheel away
    float m = 1.0 - smoothstep(band, 2.0 * band, d);   // the hard core, the edge twice as wide
    h.x = mode == 0 ? fract(h.x + offset * m) : mix(h.x, target, m);
    gl_FragColor = vec4(hsv2rgb(h), src.a);
}
