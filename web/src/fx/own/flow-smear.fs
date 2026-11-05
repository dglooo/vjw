// VeeJay Wizard, 2026
// Look: TD opticalFlow (studied, rewritten). Credits: the flow estimate is adapted from ISF-Files' "Optical Flow
// Generator" (by VIDVOX / v002 / Andrew Benson), MIT; its credit and licence follow the header.
/*{
    "CATEGORIES": ["Feedback"],
    "CREDIT": "VeeJay Wizard; flow estimate after VIDVOX / v002 / Andrew Benson (MIT)",
    "DESCRIPTION": "Optical-flow smear: a small luma copy of the image finds where it moves, and a trail of the moving parts streams back along that motion every frame, so movement leaves streaks. Bass pushes them further, a build lengthens them, hats turn their colour.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "force", "LABEL": "Force", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0, "MAX": 5 },
        { "NAME": "decay", "LABEL": "Decay", "TYPE": "float", "DEFAULT": 0.92, "MIN": 0.5, "MAX": 0.99 },
        { "NAME": "tint", "LABEL": "Tint (hue turns)", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 }
    ],
    "PASSES": [
        { "TARGET": "flow", "PERSISTENT": true, "FLOAT": true, "WIDTH": "$WIDTH/8", "HEIGHT": "$HEIGHT/8" },
        { "TARGET": "smear", "PERSISTENT": true, "FLOAT": true, "WIDTH": "$WIDTH/2", "HEIGHT": "$HEIGHT/2" },
        {}
    ],
    "VJW_BIND": {
        "force": { "source": "reese", "amount": 1, "attack": 0.05, "release": 0.3, "min": 0.5, "max": 3 },
        "decay": { "source": "build", "amount": 1, "attack": 1, "release": 2, "min": 0.92, "max": 0.97 },
        "tint": { "source": "hats", "amount": 1, "attack": 0, "release": 0.12, "min": 0, "max": 0.35 }
    }
}*/

// The flow estimate (in main, pass 0) is adapted from "Optical Flow Generator.fs" in ISF-Files
// (https://github.com/Vidvox/ISF-Files), CREDIT "by VIDVOX / v002 / Andrew Benson":
//	based on v002 Optical Flow which is itself a port of Andrew Bensons HS Flow implementation on the GPU.
//	https://github.com/v002/v002-Optical-Flow
// MIT License
//
// Copyright (c) 2018
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
// (end of the donor's notice)

// Knobs (tuned on the spectrum, shots in scratchpad/td/s1.7/): TD's gradient offset (in ⅛-size texels) and lambda (the
// gradient's noise floor); the wake kept per frame (the raw flow lives only within OFFSET of a moving edge, so a trail
// pushed by it alone stalls in a few px: the wake keeps it flowing where the motion passed); the push per frame in
// half-size px at `force` 1 and its knee (a wake above KNEE pushes nearly the full length, so slow motion still
// streaks and fast motion can't tear); the wake that starts and fully opens the seed (what doesn't move never
// trails); the moving image's level in the trail.
#define OFFSET 3.0
#define LAMBDA 0.1
#define HOLD 0.9
#define PUSH 6.0
#define KNEE 0.1
#define MOVE0 0.05
#define MOVE1 0.25
#define LEVEL 0.8

// c's hue turned by `a` radians: Rodrigues' rotation about the grey axis.
vec3 hue(vec3 c, float a) {
    const vec3 k = vec3(0.57735);
    return c * cos(a) + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cos(a));
}

void main() {
    vec2 uv = isf_FragNormCoord;
    vec3 src = IMG_THIS_PIXEL(inputImage).rgb;
    // k: this frame's length in 60 fps frames, so the look holds at any frame rate.
    float k = clamp(TIMEDELTA * 60.0, 0.0, 4.0);
    if (PASSINDEX == 0) { // ⅛ size: (luma now, luma last frame, the wake), from an 8×8 box of the image (TD's preshrink)
        vec2 t = 1.0 / IMG_SIZE(inputImage);
        vec3 s = vec3(0.0);
        for (int i = 0; i < 4; i++)
            for (int j = 0; j < 4; j++) s += IMG_NORM_PIXEL(inputImage, uv + (vec2(i, j) * 2.0 - 3.0) * t).rgb; // 2×2 each
        float now = dot(s / 16.0, vec3(0.2126, 0.7152, 0.0722));
        vec4 f = IMG_THIS_PIXEL(flow); // last frame's
        if (FRAMEINDEX == 0) {
            gl_FragColor = vec4(now, now, 0.0, 0.0);
            return;
        }
        // The flow between the last two frames (donor): −It·∇I / sqrt(|∇I|² + λ), the gradients by central differences
        // over both. Bounded by the luma change, it points the way the image moves; a frame late, which nobody sees.
        vec2 o = OFFSET / RENDERSIZE;
        vec2 l = IMG_NORM_PIXEL(flow, uv - vec2(o.x, 0.0)).rg;
        vec2 r = IMG_NORM_PIXEL(flow, uv + vec2(o.x, 0.0)).rg;
        vec2 d = IMG_NORM_PIXEL(flow, uv - vec2(0.0, o.y)).rg;
        vec2 u = IMG_NORM_PIXEL(flow, uv + vec2(0.0, o.y)).rg;
        vec2 g = vec2(r.x - l.x + r.y - l.y, u.x - d.x + u.y - d.y);
        vec2 v = (f.g - f.r) * g / sqrt(dot(g, g) + LAMBDA);
        // The wake: this flow plus last frame's wake, softened (four taps half a texel off the diagonals: a 3×3 tent)
        // and faded. A steady motion sums to about v / (1 − HOLD); the push's knee keeps that in check.
        vec2 h = 0.5 / RENDERSIZE;
        vec2 w = IMG_NORM_PIXEL(flow, uv + h).ba + IMG_NORM_PIXEL(flow, uv - h).ba
               + IMG_NORM_PIXEL(flow, uv + vec2(h.x, -h.y)).ba + IMG_NORM_PIXEL(flow, uv + vec2(-h.x, h.y)).ba;
        gl_FragColor = vec4(now, f.r, v + 0.25 * pow(HOLD, k) * w);
        return;
    }
    if (PASSINDEX == 2) { // full size: lighten, so the trail shows where it is brighter than the sharp image
        gl_FragColor = vec4(max(src, IMG_THIS_PIXEL(smear).rgb), 1.0);
        return;
    }
    // Pass 1, at half size: the trail streams back along the wake (each frame a bright point grows into a segment: the
    // max of 4 taps, so fast pushes leave no gaps), fades, and takes in what moves now, its hue turned by `tint`. The
    // knee saturates the push, so it gets k like the fade: a streak grows as fast per second at any frame rate.
    vec4 f = IMG_THIS_PIXEL(flow);
    vec2 p = f.ba / (length(f.ba) + KNEE) * force * PUSH * k / RENDERSIZE;
    vec3 h = max(max(IMG_NORM_PIXEL(smear, uv + 0.25 * p).rgb, IMG_NORM_PIXEL(smear, uv + 0.5 * p).rgb),
                 max(IMG_NORM_PIXEL(smear, uv + 0.75 * p).rgb, IMG_NORM_PIXEL(smear, uv + p).rgb)) * pow(decay, k);
    vec3 seed = LEVEL * smoothstep(MOVE0, MOVE1, length(f.ba)) * hue(src, 6.2831853 * tint);
    gl_FragColor = vec4(max(h, seed), 1.0);
}
