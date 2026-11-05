// VeeJay Wizard, 2026
// Look: TD feedbackEdge (studied, rewritten). No third-party code.
/*{
    "CATEGORIES": ["Feedback"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "TouchDesigner-style edge feedback: every frame the history is re-lit, grows out of the centre, softens and turns its hue, and its edges are drawn back into it, so the image's brightest contours echo outward as glowing rings. Kicks push the rings out faster, snares step their colour, the sub swells the gain so they last longer, bass sharpens the edges and a drop wipes them.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "scale", "LABEL": "Scale", "TYPE": "float", "DEFAULT": 1.003, "MIN": 0.98, "MAX": 1.05 },
        { "NAME": "hueStep", "LABEL": "Hue step", "TYPE": "float", "DEFAULT": -2, "MIN": -30, "MAX": 30 },
        { "NAME": "gain", "LABEL": "Gain", "TYPE": "float", "DEFAULT": 1.03, "MIN": 0.9, "MAX": 1.2 },
        { "NAME": "edge", "LABEL": "Edges", "TYPE": "float", "DEFAULT": 0.22, "MIN": 0, "MAX": 1 },
        { "NAME": "reset", "LABEL": "Reset", "TYPE": "bool", "DEFAULT": false }
    ],
    "PASSES": [
        { "TARGET": "loop", "PERSISTENT": true, "FLOAT": true, "WIDTH": "$WIDTH/2", "HEIGHT": "$HEIGHT/2" },
        {}
    ],
    "VJW_BIND": {
        "scale": { "source": "kick", "amount": 1, "attack": 0, "release": 0.3, "min": 1.002, "max": 1.012 },
        "hueStep": { "source": "snare", "amount": 1, "attack": 0, "release": 0.3, "min": -1, "max": -8 },
        "gain": { "source": "sub", "amount": 1, "attack": 0.1, "release": 0.6, "min": 1.03, "max": 1.08 },
        "edge": { "source": "reese", "amount": 1, "attack": 0.05, "release": 0.3, "min": 0.15, "max": 0.4 },
        "reset": { "source": "drop", "amount": 1, "attack": 0, "release": 1.5, "min": 0, "max": 1 }
    }
}*/

// Knobs, per frame at 60 fps (tuned on the tunnel from TD's feedbackEdge): TD's level opacity, which times `gain` keeps
// the loop just under 1 (.93 at rest, .97 on a full sub; ≥ 1 filled the whole tunnel to the clip within seconds); the
// black level, so what is dim dies; the image enters the loop only above SEED, at LEVEL (the tunnel's end light, sparks
// and walls on a hit: all of a bright source filled the loop); the tap offset in loop texels (.5: a 3×3 tent); the
// image's level under the rings (TD's dry/wet: at 1 the tunnel's lit walls hid them).
#define OPACITY 0.9
#define BLACK 0.01
#define SEED 0.7
#define LEVEL 0.5
#define SPREAD 0.5
#define DRY 0.5

vec3 screen(vec3 a, vec3 b) {
    return 1.0 - (1.0 - a) * (1.0 - b);
}

// c's hue turned by `a` radians: Rodrigues' rotation about the grey axis.
vec3 hue(vec3 c, float a) {
    const vec3 k = vec3(0.57735);
    return c * cos(a) + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cos(a));
}

void main() {
    vec2 uv = isf_FragNormCoord;
    vec3 src = IMG_THIS_PIXEL(inputImage).rgb;
    if (PASSINDEX == 1) { // full size: the image stays sharp (at DRY), the half-size rings glow over it
        gl_FragColor = vec4(screen(DRY * src, IMG_THIS_PIXEL(loop).rgb), 1.0);
        return;
    }
    // Pass 0, at half size. k: this frame's length in 60 fps frames, so the look holds at any frame rate.
    float k = clamp(TIMEDELTA * 60.0, 0.0, 4.0);
    vec2 p = 0.5 + (uv - 0.5) / pow(scale, k); // the history grows out of the centre
    // Four bilinear taps off the diagonals: their mean is a blur, their differences a Sobel of the history.
    vec2 h = SPREAD / RENDERSIZE;
    vec3 a = IMG_NORM_PIXEL(loop, p + h).rgb;
    vec3 b = IMG_NORM_PIXEL(loop, p + vec2(-h.x, h.y)).rgb;
    vec3 d = IMG_NORM_PIXEL(loop, p + vec2(h.x, -h.y)).rgb;
    vec3 e = IMG_NORM_PIXEL(loop, p - h).rgb;
    vec3 c = 0.25 * (a + b + d + e);
    c = max(c * pow(gain * OPACITY, k) - BLACK * k, 0.0); // TD's level: the sub lengthens the echo, the black level kills haze
    c = hue(c, radians(hueStep) * k);
    vec3 gx = a + d - b - e;
    vec3 gy = a + b - d - e;
    c += edge * sqrt(gx * gx + gy * gy); // the history's edges glow and are re-fed: the contours echo outward as rings
    if (reset) c = vec3(0.0); // the drop wipes the history
    c = screen(c, LEVEL * max(src - SEED, 0.0)); // only the image's brightest parts seed new rings
    // Soft clip above .8 (D2 rule 3): a full sub can't hold the loop at white.
    gl_FragColor = vec4(mix(c, 0.8 + 0.2 * (1.0 - exp((0.8 - c) * 5.0)), step(0.8, c)), 1.0);
}
