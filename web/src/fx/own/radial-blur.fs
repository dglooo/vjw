// VeeJay Wizard, 2026
// Look: TD radialBlur.tox (studied, rewritten). No third-party code.
/*{
    "CATEGORIES": ["Geometry"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "TouchDesigner-style radial (zoom) blur: every pixel averages 24 taps on the line toward the centre, so the brights streak outwards like a jump to light speed. A kick stretches the streaks, then they settle.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "strength", "LABEL": "Strength", "TYPE": "float", "DEFAULT": 0.04, "MIN": 0, "MAX": 1 },
        { "NAME": "dryWet", "LABEL": "Dry/wet", "TYPE": "float", "DEFAULT": 0.7, "MIN": 0, "MAX": 1 },
        { "NAME": "centerX", "LABEL": "Centre X", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0, "MAX": 1 }
    ],
    "PASSES": [
        { "TARGET": "blur", "WIDTH": "$WIDTH/2", "HEIGHT": "$HEIGHT/2" },
        {}
    ],
    "VJW_BIND": {
        "strength": { "source": "kick", "amount": 1, "attack": 0, "release": 0.18, "min": 0.04, "max": 0.3 }
    }
}*/

void main() {
    if (PASSINDEX == 1) { // full size: the sharp image under its half-size blur
        gl_FragColor = mix(IMG_THIS_PIXEL(inputImage), IMG_THIS_PIXEL(blur), dryWet);
        return;
    }
    // Pass 0, at half size: 24 taps from the pixel toward the centre, the last at 23/24 of `strength` of the way
    // (TD's uv − i/N·dir·strength; a constant bound for GLSL ES 1.00). A zoom, so the aspect doesn't matter.
    vec2 uv = isf_FragNormCoord;
    vec2 d = (uv - vec2(centerX, 0.5)) * (strength / 24.0);
    vec4 sum = vec4(0.0);
    for (int i = 0; i < 24; i++) sum += IMG_NORM_PIXEL(inputImage, uv - float(i) * d);
    gl_FragColor = sum / 24.0;
}
