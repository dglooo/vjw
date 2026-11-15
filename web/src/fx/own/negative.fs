// VeeJay Wizard, 2026
// Look: the photographic negative (camera plan S2.2, the CP2 contract): the inverted colours mixed in by `amount`. The
// snare drives it 0 → 1 and it fades over .15 s; a full-frame inversion is a flash, so `amount` runs through flashGate
// ≤ 3/s (VJW_FLASH; the bind rests at 0, below the gate's ON line). Layers are premultiplied (live.ts BLENDS), so the
// negative is a − rgb: 1 − rgb on an opaque layer, and a cut-out's transparent outside stays black. No third-party code.
/*{
    "CATEGORIES": ["Color Effect", "Retro"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Negative: mixes the inverted colours over the image by the amount. Bound to the snare, every hit inverts the layer and it fades back (flash-gated ≤ 3/s).",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "amount", "LABEL": "Amount", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 }
    ],
    "VJW_BIND": {
        "amount": { "source": "snare", "amount": 1, "attack": 0, "release": 0.15, "min": 0, "max": 1 }
    },
    "VJW_FLASH": ["amount"]
}*/

void main() {
    vec4 c = IMG_THIS_PIXEL(inputImage);
    gl_FragColor = vec4(mix(c.rgb, c.a - c.rgb, amount), c.a);
}
