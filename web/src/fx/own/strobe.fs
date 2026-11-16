// VeeJay Wizard, 2026
/*{
    "CATEGORIES": ["Retro"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Strobe: while on, the frame is the strobe colour (its alpha is the strength); off, it fades out over ~0.1 s. Bound to the beat, it flashes on the first part of every beat.",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "strobe", "LABEL": "Strobe", "TYPE": "bool", "DEFAULT": false },
        { "NAME": "color", "LABEL": "Colour", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 0.6] }
    ],
    "PASSES": [
        { "TARGET": "hot", "PERSISTENT": true, "FLOAT": true, "WIDTH": 1, "HEIGHT": 1 },
        {}
    ],
    "VJW_BIND": {
        "strobe": { "source": "beat", "shape": "saw", "amount": 1, "attack": 0, "release": 0, "min": 0, "max": 0.65 }
    },
    "VJW_FLASH": ["strobe"],
    "ISFVSN": "2"
}*/

// I-FL1 (WCAG 2.3.1): the off edge falls with this time constant, s (13 % of the swing per 60 fps frame: a full-alpha
// white strobe's fall stays under a .10 frame-mean luma step), so one allowed strobe makes 1 luma step, not 2.
#define FALL 0.12

void main() {
    if (PASSINDEX == 0) { // hot: the strobe's level, on at once, off falling by FALL
        float prev = IMG_NORM_PIXEL(hot, vec2(0.5)).r;
        gl_FragColor = vec4(strobe ? 1.0 : prev * exp(-TIMEDELTA / FALL), 0.0, 0.0, 1.0);
        return;
    }
    vec4 c = IMG_THIS_PIXEL(inputImage);
    gl_FragColor = vec4(mix(c.rgb, color.rgb, color.a * IMG_NORM_PIXEL(hot, vec2(0.5)).r), c.a);
}
