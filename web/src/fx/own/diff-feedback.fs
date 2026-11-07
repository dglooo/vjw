// VeeJay Wizard, 2026
// Look: TD feedbackTOP's "Difference — psychotic" example (studied, rewritten; wave 1 built only its Screen/Add/
// Maximum examples). The one PERSISTENT FLOAT pass is the difference blend itself: the image minus its own scaled
// ghost, per channel. No third-party code.
/*{
    "CATEGORIES": ["Feedback"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Difference feedback: each frame the image is compared to its own scaled ghost (|src − k·prev| per channel, a slow zoom about the centre), so moving parts light up as rings and still parts settle into a dim ghost that zooms out. A build holds the ghost longer, a kick punches the zoom and flashes the field, a snare turns the colours.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "k", "LABEL": "Ghost", "TYPE": "float", "DEFAULT": 0.9, "MIN": 0, "MAX": 1 },
        { "NAME": "zoom", "LABEL": "Zoom", "TYPE": "float", "DEFAULT": 0.01, "MIN": 0, "MAX": 0.1 },
        { "NAME": "hue", "LABEL": "Hue", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "glow", "LABEL": "Glow", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 }
    ],
    "PASSES": [
        { "TARGET": "prev", "PERSISTENT": true, "FLOAT": true },
        {}
    ],
    "VJW_BIND": {
        "k": { "source": "build", "amount": 1, "attack": 1, "release": 2, "min": 0.85, "max": 0.97 },
        "zoom": { "source": "kick", "amount": 1, "attack": 0, "release": 0.1, "min": 0.004, "max": 0.02 },
        "hue": { "source": "snare", "amount": 1, "attack": 0, "release": 0.3, "min": 0, "max": 0.3 },
        "glow": { "source": "kick", "amount": 1, "attack": 0, "release": 0.2, "min": 0, "max": 0.5 }
    },
    "VJW_FLASH": ["glow"]
}*/

#define PI 3.14159265

// The field is bounded: |src − k·prev| ≤ max(src, k·prev) ≤ 1 by induction (the inputs are 8-bit clamped, k ≤ 1),
// so the draw's gain can never feed back into the ghost — the luma cap holds by construction, the tone map is the
// visible part of it.
vec3 hueShift(vec3 c, float a) { // a Rodrigues turn about the grey axis (bars.fs)
    vec3 k = vec3(0.57735);
    float co = cos(a);
    return c * co + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - co);
}

void main() {
    vec2 uv = isf_FragNormCoord;
    if (PASSINDEX == 0) { // the ghost: the difference at the zoomed uv, where the field is also stored
        vec2 z = (uv - 0.5) / (1.0 + zoom) + 0.5;
        gl_FragColor = vec4(abs(IMG_NORM_PIXEL(inputImage, z).rgb - k * IMG_NORM_PIXEL(prev, z).rgb), 1.0);
        return;
    }
    // The draw: the field through a luma-tilted gain (a still ghost stays dim, a moving ring reads bright), a
    // snare's hue turn, and the kick's flash-gated glow on top; the exp tone map keeps the brightest frame off white.
    vec3 d = IMG_THIS_PIXEL(prev).rgb;
    float l = dot(d, vec3(0.2126, 0.7152, 0.0722));
    vec3 c = hueShift(d * (0.5 + 1.5 * l), 2.0 * PI * hue) * (1.0 + glow);
    gl_FragColor = vec4(1.0 - exp(-1.2 * c), 1.0);
}
