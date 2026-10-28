// VeeJay Wizard, 2026
/*{
    "CATEGORIES": ["Retro"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "CRT scanlines: soft dark gaps between horizontal lines.",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "lines", "LABEL": "Lines", "TYPE": "float", "DEFAULT": 240, "MIN": 60, "MAX": 720 },
        { "NAME": "darkness", "LABEL": "Darkness", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0, "MAX": 1 }
    ],
    "VJW_BIND": {
        "darkness": { "source": "treb", "amount": 1, "attack": 0, "release": 0.3, "min": 0.35, "max": 0.7 }
    },
    "ISFVSN": "2"
}*/

void main() {
    vec4 c = IMG_THIS_PIXEL(inputImage);
    float n = min(lines, RENDERSIZE.y / 3.0); // at least 3 px per line, or a small target turns the lines into moiré
    float s = 0.5 + 0.5 * cos(6.2831853 * isf_FragNormCoord.y * n); // 1 on a line, 0 in a gap
    gl_FragColor = vec4(c.rgb * (1.0 - darkness * (1.0 - s)), c.a);
}
