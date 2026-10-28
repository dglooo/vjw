// VeeJay Wizard, 2026
/*{
    "CATEGORIES": ["Feedback"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Rising rainbow trails: whatever was bright fades slowly, drifts up and walks round the colour wheel as it ages. Half-float, so long trails fade smoothly. Bound to bass, kicks blow the trails upward.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "decay", "LABEL": "Decay", "TYPE": "float", "DEFAULT": 0.94, "MIN": 0.5, "MAX": 0.995 },
        { "NAME": "rise", "LABEL": "Rise", "TYPE": "float", "DEFAULT": 2, "MIN": -10, "MAX": 10 },
        { "NAME": "hue", "LABEL": "Hue drift", "TYPE": "float", "DEFAULT": 0.01, "MIN": -0.05, "MAX": 0.05 }
    ],
    "PASSES": [{ "TARGET": "trail", "PERSISTENT": true, "FLOAT": true }],
    "VJW_BIND": {
        "rise": { "source": "bass", "amount": 1, "attack": 0.02, "release": 0.3, "min": 1, "max": 8 }
    }
}*/

// Turns c round the grey axis by a radians (Rodrigues), so the brightness holds while the hue walks.
vec3 hueTurn(vec3 c, float a) {
    vec3 k = vec3(0.57735);
    return c * cos(a) + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cos(a));
}

// decay, rise (px) and hue (turns) are per frame at 60 fps; k rescales them to this frame's length.
void main() {
    float k = clamp(TIMEDELTA * 60.0, 0.0, 4.0);
    vec4 old = IMG_PIXEL(trail, gl_FragCoord.xy - vec2(0.0, rise * k));
    old.rgb = max(hueTurn(old.rgb, 6.28318 * hue * k), 0.0) * pow(decay, k);
    gl_FragColor = max(IMG_THIS_PIXEL(inputImage), old);
}
