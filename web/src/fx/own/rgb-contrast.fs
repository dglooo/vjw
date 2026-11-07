// VeeJay Wizard, 2026
// Look: TD Palette rgbContrast (studied, rewritten): a per-channel contrast `(x − .5)·c + .5`, where a c below 0
// inverts that channel. Rest is the research sample row (R 1, G 2.57, B 1); the red's c is driven by the snare 1 → −5
// (a reversed bind, min > max), so a hit inverts the reds to cyan and settles back. No third-party code.
/*{
    "CATEGORIES": ["Color Effect", "Retro"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Per-channel contrast: (x − .5)·c + .5; a c below 0 inverts that channel. The reds invert on the snare; the greens and blues ride static gains (2.57 / 1, the research sample).",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "cR", "LABEL": "Red contrast", "TYPE": "float", "DEFAULT": 1, "MIN": -10, "MAX": 10 },
        { "NAME": "cG", "LABEL": "Green contrast", "TYPE": "float", "DEFAULT": 2.57, "MIN": -10, "MAX": 10 },
        { "NAME": "cB", "LABEL": "Blue contrast", "TYPE": "float", "DEFAULT": 1, "MIN": -10, "MAX": 10 }
    ],
    "VJW_BIND": {
        "cR": { "source": "snare", "amount": 1, "attack": 0, "release": 0.3, "min": 1, "max": -5 }
    }
}*/

void main() {
    vec4 src = IMG_THIS_PIXEL(inputImage);
    gl_FragColor = vec4((src.rgb - 0.5) * vec3(cR, cG, cB) + 0.5, src.a);
}
