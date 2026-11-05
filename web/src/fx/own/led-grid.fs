// VeeJay Wizard, 2026
// Look: an LED wall — round, glowing dots on a grid, the image's colour and light quantised to a few steps (the
// RGB/CMYK Halftone (zoidberg) donor's dot grids, studied only, nothing copied).
/*{
    "CATEGORIES": ["Pixel"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "LED grid: the image on a wall of round LEDs. Each LED reads the light of its cell, quantised to a few steps, and glows in the cell's colour. The sub swells the dots, kicks flare the glow (gated to 3/s), the build refines the steps, and the unlit LEDs keep a dim floor.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "cell", "LABEL": "Cell", "TYPE": "float", "DEFAULT": 0.015, "MIN": 0.005, "MAX": 0.05 },
        { "NAME": "dot", "LABEL": "Dot", "TYPE": "float", "DEFAULT": 0.7, "MIN": 0.1, "MAX": 1 },
        { "NAME": "gap", "LABEL": "Gap", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0, "MAX": 0.9 },
        { "NAME": "levels", "LABEL": "Levels", "TYPE": "long", "DEFAULT": 4, "VALUES": [2, 3, 4, 5, 6, 8, 10, 12, 16], "LABELS": ["2", "3", "4", "5", "6", "8", "10", "12", "16"] },
        { "NAME": "off", "LABEL": "Off floor", "TYPE": "float", "DEFAULT": 0.05, "MIN": 0, "MAX": 0.5 },
        { "NAME": "glow", "LABEL": "Glow", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "round", "LABEL": "Round", "TYPE": "float", "DEFAULT": 1, "MIN": 0, "MAX": 1 }
    ],
    "VJW_BIND": {
        "dot": { "source": "sub", "amount": 1, "attack": 0.05, "release": 0.4, "min": 0.5, "max": 1 },
        "glow": { "source": "kick", "amount": 1, "attack": 0, "release": 0.15, "min": 0, "max": 1 },
        "levels": { "source": "build", "amount": 1, "attack": 1, "release": 2, "min": 4, "max": 12 }
    },
    "VJW_FLASH": ["glow"]
}*/

// Knobs. AA: the dot's edge in px. The halo's width rides the dot, so a swelled LED carries a wider glow.
#define AA 1.0

void main() {
    float cs = cell * RENDERSIZE.x; // the LED pitch, px
    vec2 uv = gl_FragCoord.xy;
    vec2 g = floor(uv / cs);
    // A 2×2 box over the cell (in px — IMG_PIXEL normalises by the image's size): what the LED represents; a
    // single tap would stand as 1 px specks in the steps
    vec4 im = 0.25 * (IMG_PIXEL(inputImage, (g + 0.25) * cs) + IMG_PIXEL(inputImage, (g + 0.75) * cs)
                    + IMG_PIXEL(inputImage, (g + vec2(0.25, 0.75)) * cs) + IMG_PIXEL(inputImage, (g + vec2(0.75, 0.25)) * cs));
    float lum = (im.r + im.g + im.b) / 3.0;
    float n = float(levels);
    float st = min(floor(lum * n), n - 1.0) / (n - 1.0); // the quantised light, 0..1
    vec2 q = uv - (g + 0.5) * cs; // about the LED centre, px
    float r = dot * (1.0 - gap) * 0.5 * cs; // the radius: dot swells up to the gap's margin
    float dd = mix(length(abs(q) - r), length(q) - r, round); // square (0) to circle (1)
    float body = smoothstep(AA, -AA, dd); // 1 px edge
    float halo = exp(-max(dd, 0.0) / (2.0 * r + 0.75)) * (0.2 + 0.8 * st);
    // the unlit floor under the lit colour, the kick's flare on top; a low base keeps the quantised steps apart (a
    // hot image would otherwise clamp every LED to the top step) and the screen gain keeps the brights' shape
    vec3 col = im.rgb * (body * (0.1 + 1.3 * st) + halo * (0.25 + 1.4 * glow)) + body * (off + glow * 0.4);
    gl_FragColor = vec4(1.0 - exp(-1.5 * col), 1.0);
}
