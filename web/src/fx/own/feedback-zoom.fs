// VeeJay Wizard, 2026
/*{
    "CATEGORIES": ["Feedback"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "MilkDrop-style feedback: the last frame, zoomed, turned and dimmed, under the new one, so whatever is bright leaves a spiral trail. Bound to onsets, every hit punches the zoom.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "zoom", "LABEL": "Zoom", "TYPE": "float", "DEFAULT": 0.02, "MIN": -0.1, "MAX": 0.1 },
        { "NAME": "rotate", "LABEL": "Rotate", "TYPE": "float", "DEFAULT": 0.004, "MIN": -0.05, "MAX": 0.05 },
        { "NAME": "decay", "LABEL": "Decay", "TYPE": "float", "DEFAULT": 0.9, "MIN": 0.5, "MAX": 0.99 },
        { "NAME": "center", "LABEL": "Centre", "TYPE": "point2D", "DEFAULT": [0.5, 0.5], "MIN": [0, 0], "MAX": [1, 1] }
    ],
    "PASSES": [{ "TARGET": "feedback", "PERSISTENT": true, "FLOAT": true }],
    "VJW_BIND": {
        "zoom": { "source": "onset", "amount": 1, "attack": 0, "release": 0.2, "min": 0.01, "max": 0.06 }
    }
}*/

// zoom, rotate (turns) and decay are per frame at 60 fps; k rescales them to this frame's length.
void main() {
    float k = clamp(TIMEDELTA * 60.0, 0.0, 4.0);
    vec2 c = center * RENDERSIZE;
    float a = 6.28318 * rotate * k;
    vec2 p = mat2(cos(a), sin(a), -sin(a), cos(a)) * (gl_FragCoord.xy - c) / pow(1.0 + zoom, k);
    vec4 old = IMG_PIXEL(feedback, c + p) * pow(decay, k);
    gl_FragColor = max(IMG_THIS_PIXEL(inputImage), old);
}
