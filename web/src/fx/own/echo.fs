// VeeJay Wizard, 2026
/*{
    "CATEGORIES": ["Feedback"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Slit-scan: a band across the middle shows the live image, and every frame its edges stream out to the top and bottom, so the rest of the screen is the band's recent past. Bound to bass, kicks speed the stream.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "slit", "LABEL": "Slit", "TYPE": "float", "DEFAULT": 0.1, "MIN": 0, "MAX": 1 },
        { "NAME": "speed", "LABEL": "Speed", "TYPE": "float", "DEFAULT": 3, "MIN": 1, "MAX": 12 }
    ],
    "PASSES": [{ "TARGET": "history", "PERSISTENT": true }],
    "VJW_BIND": {
        "speed": { "source": "bass", "amount": 1, "attack": 0.02, "release": 0.3, "min": 2, "max": 10 }
    }
}*/

// speed is px per frame at 60 fps, rounded to whole pixels so the stream never blurs.
void main() {
    float y = gl_FragCoord.y - 0.5 * RENDERSIZE.y;
    if (abs(y) < 0.5 * slit * RENDERSIZE.y) {
        gl_FragColor = IMG_THIS_PIXEL(inputImage);
        return;
    }
    float d = max(1.0, floor(speed * clamp(TIMEDELTA * 60.0, 0.0, 4.0) + 0.5));
    gl_FragColor = IMG_PIXEL(history, gl_FragCoord.xy - vec2(0.0, sign(y) * d));
}
