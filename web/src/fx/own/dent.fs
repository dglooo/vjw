// VeeJay Wizard, 2026
// Look: TD Palette dent (studied, rewritten): a per-axis pinch toward the centre. Each axis' distance from the centre
// (n = |uv·2 − 1|) is scaled by a smoothstep band (width → width2, offset by the per-axis centre) and the sign is
// restored, so the middle is magnified out and a rim stays fixed. The kick widens the bulge (width .3 → .5, the
// research look-good .5/.6 at the top of the range; the centre offsets −.3/−.1 are the research doc values). No
// third-party code.
/*{
    "CATEGORIES": ["Geometry"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "A per-axis pinch/bulge toward the centre: the middle is magnified, a rim stays fixed. The kick widens the bulge.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "width", "LABEL": "Band inner", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0, "MAX": 1 },
        { "NAME": "width2", "LABEL": "Band outer", "TYPE": "float", "DEFAULT": 0.6, "MIN": 0, "MAX": 1 },
        { "NAME": "centerX", "LABEL": "Center X", "TYPE": "float", "DEFAULT": -0.3, "MIN": -1, "MAX": 1 },
        { "NAME": "centerY", "LABEL": "Center Y", "TYPE": "float", "DEFAULT": -0.1, "MIN": -1, "MAX": 1 }
    ],
    "VJW_BIND": {
        "width": { "source": "kick", "amount": 1, "attack": 0, "release": 0.15, "min": 0.3, "max": 0.5 }
    }
}*/

void main() {
    vec2 o = isf_FragNormCoord * 2.0 - 1.0; // −1..1, 0 at the centre
    vec2 n = abs(o);
    vec2 cc = vec2(centerX, centerY);
    // The research formula, per axis: n = .5n + .5·smoothstep(w.x, w.y, n+c)·n; the sign of o is restored to sample.
    vec2 s = vec2(smoothstep(width, width2, n.x + cc.x), smoothstep(width, width2, n.y + cc.y));
    vec2 nn = 0.5 * n + 0.5 * s * n; // the band's inner side (s 0) halves → pulled out; the rim (s 1) is kept
    gl_FragColor = IMG_NORM_PIXEL(inputImage, 0.5 + 0.5 * sign(o) * nn);
}
