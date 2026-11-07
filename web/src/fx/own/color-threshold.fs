// VeeJay Wizard, 2026
// Look: TD Palette colorThreshold (studied, rewritten): each channel hard-steps at its threshold (soft 0) into a 0/1
// mask — the three bits make the 8 colour combinations — multiplied back over the input, so the picture posterises
// into hard-edged regions. The reds' threshold opens on the sub; the greens and blues rest at .491. No third-party code.
/*{
    "CATEGORIES": ["Pixel", "Color Effect"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "A per-channel hard threshold (0/1 mask, soft 0) multiplied over the input: the three bits posterise the picture into 8-colour regions. The reds' threshold opens on the sub.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "tR", "LABEL": "Red threshold", "TYPE": "float", "DEFAULT": 0.491, "MIN": 0, "MAX": 1 },
        { "NAME": "tG", "LABEL": "Green threshold", "TYPE": "float", "DEFAULT": 0.491, "MIN": 0, "MAX": 1 },
        { "NAME": "tB", "LABEL": "Blue threshold", "TYPE": "float", "DEFAULT": 0.491, "MIN": 0, "MAX": 1 }
    ],
    "VJW_BIND": {
        "tR": { "source": "sub", "amount": 1, "attack": 0.05, "release": 0.3, "min": 0.3, "max": 0.6 }
    }
}*/

void main() {
    vec4 src = IMG_THIS_PIXEL(inputImage);
    vec3 mask = step(src.rgb, vec3(tR, tG, tB)); // 1 where the channel is ≤ its threshold (soft 0: a hard step)
    gl_FragColor = vec4(mask * src.rgb, src.a);
}
