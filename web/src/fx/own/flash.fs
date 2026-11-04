// VeeJay Wizard, 2026
/*{
    "CATEGORIES": ["Retro"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Colour flash: screens the colour over the image by the flash amount. Bound to onsets, every hit flashes and fades.",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "flash", "LABEL": "Flash", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "color", "LABEL": "Colour", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.6, 1.0] }
    ],
    "VJW_BIND": {
        "flash": { "source": "onset", "amount": 1, "attack": 0, "release": 0.1, "min": 0, "max": 0.9 }
    },
    "VJW_FLASH": ["flash"],
    "ISFVSN": "2"
}*/

void main() {
    vec4 c = IMG_THIS_PIXEL(inputImage);
    vec3 f = color.rgb * color.a * flash;
    gl_FragColor = vec4(1.0 - (1.0 - c.rgb) * (1.0 - f), c.a); // screen: brightens towards the colour, never past white
}
