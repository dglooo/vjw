// VeeJay Wizard, 2026
// Look: TD lookupTOP ex4 (studied, rewritten): luma tinted through a 2–3 colour ramp with bias, dry/wet over the layer.
// The ramp reuses own/bloom's procedural cosine shape — one expression, no lookup texture — as three fixed stops.
/*{
    "CATEGORIES": ["Retro"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Gradient map: the layer's luma runs up a 3-stop ramp, indigo-black to cyan to warm white. Snares step the ramp shift, the sub biases it, and a build moves the layer from dry to fully mapped.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "rampShift", "LABEL": "Ramp shift", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0, "MAX": 1 },
        { "NAME": "bias", "LABEL": "Bias", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0, "MAX": 1 },
        { "NAME": "dryWet", "LABEL": "Dry wet", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0, "MAX": 1 }
    ],
    "VJW_BIND": {
        "rampShift": { "source": "snare", "amount": 1, "attack": 0, "release": 0.3, "min": 0, "max": 1 },
        "bias": { "source": "sub", "amount": 1, "attack": 0.05, "release": 0.3, "min": 0, "max": 1 },
        "dryWet": { "source": "build", "amount": 1, "attack": 1, "release": 2, "min": 0, "max": 1 }
    }
}*/

// The 3 stops (TD lookupTOP ex4's darks → colour → lights); the blend is cosine-eased, own/bloom's shape.
#define C0 vec3(0.03, 0.02, 0.08)
#define C1 vec3(0.05, 0.55, 0.95)
#define C2 vec3(1.00, 0.92, 0.72)

vec3 ramp(float t) {
    float s = t * t * (3.0 - 2.0 * t); // smoothstep: 0→1 across the two half-ramps, C1 at the seam
    if (t < 0.5) return mix(C0, C1, 2.0 * s);
    return mix(C1, C2, 2.0 * s - 1.0);
}

void main() {
    vec4 src = IMG_NORM_PIXEL(inputImage, isf_FragNormCoord);
    float l = dot(src.rgb, vec3(0.2126, 0.7152, 0.0722));
    float t = clamp(l + (bias - 0.5) + (rampShift - 0.5) * 0.5, 0.0, 1.0); // bias and the snare's shift move the operating point
    gl_FragColor = vec4(mix(src.rgb, ramp(t), dryWet), src.a);
}
