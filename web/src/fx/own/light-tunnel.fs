// VeeJay Wizard, 2026
// Look: TD lightTunnel.tox (studied, rewritten; TD's shader names Andrew Benson, Cycling '74, as its origin). No
// third-party code.
/*{
    "CATEGORIES": ["Geometry"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "TouchDesigner-style light tunnel: the image shows through a round mouth, and every pixel outside it takes the colour of the mouth's rim at its own angle, so the rim shoots out to the edges as radial light streaks that dim with distance. The sub opens the mouth, bass twirls it (Auto-style: reese in DnB, wobble in Dubstep) and the centre sways once per bar.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "radius", "LABEL": "Radius", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0.05, "MAX": 1.5 },
        { "NAME": "twirl", "LABEL": "Twirl", "TYPE": "float", "DEFAULT": 0, "MIN": -8, "MAX": 8 },
        { "NAME": "centerX", "LABEL": "Centre X", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0, "MAX": 1 }
    ],
    "VJW_BIND": {
        "radius": { "source": "sub", "amount": 1, "attack": 0.05, "release": 0.4, "min": 0.3, "max": 0.6 },
        "twirl": { "source": "bass", "amount": 1, "attack": 0.05, "release": 0.4, "min": 0, "max": 4 },
        "centerX": { "source": "bar", "shape": "sine", "amount": 1, "attack": 0, "release": 0, "min": 0.45, "max": 0.55 }
    }
}*/

// TD's units: y runs −1..1 over the height and x on the same scale, so the mouth stays round (radius .5 = a quarter of
// the height). Outside the mouth r clamps to its rim: one rim texel per angle, so the streaks stay sharp, never a blur.
void main() {
    vec2 a = vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
    vec2 c = vec2(2.0 * centerX - 1.0, 0.0) * a;
    vec2 p = (2.0 * isf_FragNormCoord - 1.0) * a - c;
    float r = length(p);
    float m = min(r, radius);
    float t = twirl * (1.0 - m); // most at the centre; the streaks turn with the rim
    vec2 q = mat2(cos(t), sin(t), -sin(t), cos(t)) * p * (m / max(r, 1e-6)); // no atan: undefined at the centre
    vec4 col = IMG_NORM_PIXEL(inputImage, (q + c) / a * 0.5 + 0.5);
    float f = radius / max(r, radius); // 1 in the mouth
    gl_FragColor = vec4(col.rgb * f * f, col.a); // the streaks fade out as 1/r²: light shooting out, not flat wedges
}
