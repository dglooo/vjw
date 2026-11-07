// VeeJay Wizard, 2026
// Look: TD Palette cartesianToPolar (studied, rewritten): the equirect→fisheye wrap (fov 360) as u = θ/2π, v = r, so the
// layer wraps into a disc ("tiny planet"). No third-party code.
/*{
    "CATEGORIES": ["Geometry"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Tiny planet: the layer wraps into a round disc. An lfo turns it, kicks pump the wrap's radial offset, and the bass (Auto-style: reese, wobble under Dubstep) twists the rows into a spiral. The seam sits under the planet.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "rotation", "LABEL": "Rotation", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "offset", "LABEL": "Offset", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 0.2 },
        { "NAME": "twist", "LABEL": "Twist", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 3 }
    ],
    "VJW_BIND": {
        "rotation": { "source": "lfo", "shape": "saw", "rate": 0.05, "amount": 1, "attack": 0, "release": 0, "min": 0, "max": 1 },
        "offset": { "source": "kick", "amount": 1, "attack": 0, "release": 0.1, "min": 0, "max": 0.12 },
        "twist": { "source": "reese", "amount": 1, "attack": 0, "release": 0.3, "min": 0, "max": 1.5 }
    }
}*/

#define PI 3.14159265

void main() {
    float ar = RENDERSIZE.x / RENDERSIZE.y;
    vec2 p = (isf_FragNormCoord - 0.5) * vec2(ar, 1.0); // screen units: the height is 1, the disc's rim at r .5
    float r = length(p);
    float v = 2.0 * r * (1.0 - 0.5 * offset); // the rim samples the input's bottom row; the kick pulls the wrap in (never past v 1)
    // u in turns; the .25 puts the image's seam (its left edge meeting its right) under the planet, not across it
    float u = fract(atan(p.y, p.x) / (2.0 * PI) + 0.25 + rotation + twist * v);
    vec4 col = IMG_NORM_PIXEL(inputImage, vec2(u, v));
    float px = 1.0 / RENDERSIZE.y;
    gl_FragColor = vec4(col.rgb * (1.0 - smoothstep(0.5 - 3.0 * px, 0.5, r)), col.a); // a clean planet: 3 px rim fade to black
}
