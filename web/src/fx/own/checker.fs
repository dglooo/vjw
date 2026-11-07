// VeeJay Wizard, 2026
// Look: TD P/Generators/checker (studied, rewritten): mod(floor(uv·div).x + .y, 2) (research §6 q10) between two
// colours. A kick flips the whole frame from solid to the 9×9 board and back — a full-frame flip is a strobe, so
// `divisions` runs through flashGate ≤ 3/s (VJW_FLASH; the bind rests at 0, the gate's ON line). The bright cell
// defaults to 0.9 luma, so a full flip holds the acceptance-2 luma cap by construction. No third-party code.
/*{
    "CATEGORIES": ["Pixel", "Geometry"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "A checkerboard generator: mod(floor(uv·divisions).x + .y, 2) between two colours. The kick flips the board in (flash-gated ≤ 3/s); at rest it is solid.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "divisions", "LABEL": "Divisions", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 9 },
        { "NAME": "colorA", "LABEL": "Colour A", "TYPE": "color", "DEFAULT": [0.0, 0.0, 0.0, 1.0] },
        { "NAME": "colorB", "LABEL": "Colour B", "TYPE": "color", "DEFAULT": [0.9, 0.9, 0.9, 1.0] }
    ],
    "VJW_BIND": {
        "divisions": { "source": "kick", "amount": 1, "attack": 0, "release": 0.1, "min": 0, "max": 9 }
    },
    "VJW_FLASH": ["divisions"]
}*/

void main() {
    vec2 g = floor(isf_FragNormCoord * divisions);
    float c = mod(g.x + g.y, 2.0);
    gl_FragColor = vec4(mix(colorA.rgb, colorB.rgb, c), 1.0);
}
