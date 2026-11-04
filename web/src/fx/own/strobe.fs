// VeeJay Wizard, 2026
/*{
    "CATEGORIES": ["Retro"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Strobe: while on, the frame is the strobe colour (its alpha is the strength). Bound to the beat, it flashes on the first part of every beat.",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "strobe", "LABEL": "Strobe", "TYPE": "bool", "DEFAULT": false },
        { "NAME": "color", "LABEL": "Colour", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 0.6] }
    ],
    "VJW_BIND": {
        "strobe": { "source": "beat", "shape": "saw", "amount": 1, "attack": 0, "release": 0, "min": 0, "max": 0.65 }
    },
    "VJW_FLASH": ["strobe"],
    "ISFVSN": "2"
}*/

void main() {
    vec4 c = IMG_THIS_PIXEL(inputImage);
    gl_FragColor = strobe ? vec4(mix(c.rgb, color.rgb, color.a), c.a) : c;
}
