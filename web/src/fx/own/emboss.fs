// VeeJay Wizard, 2026
// Look: TD SN/TOP embossTOP / normalmapTOP (studied, rewritten): fake relief lighting — n = normalize(−∇luma, k),
// lit = dot(n, L) (research §2 q9), and the input is RELIT with lit. The relight (normalmap) half of q9, not the
// classic gray emboss (lit alone), because solar-emboss' Solarize inversion must keep its colour (the S3.4 group).
// The donor ISF Emboss.fs is rejected: its body declares `varying`, which will not compile under our ISF_VS
// (design fact 8). The gradient is the 2×2 central difference (one pixel per axis); the light angle sweeps on an
// lfo (sine, one turn per 20 s); k (the normal's z, .05 deep → .3 flat) rides the sub reversed (min > max, the
// cR precedent), so the sub DEEPENS the relief: strength on the sub (the S3.4 done line). No third-party code.
/*{
    "CATEGORIES": ["Stylize", "Retro"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Fake relief: the input relit by a normal built from its 2×2 luma gradient (n = normalize(−∇luma, k), lit = dot(n, L)). The light angle sweeps with the lfo, the sub deepens the relief.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "angle", "LABEL": "Light angle", "TYPE": "float", "DEFAULT": 0.375, "MIN": 0, "MAX": 1 },
        { "NAME": "k", "LABEL": "Relief depth", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0.01, "MAX": 2 }
    ],
    "VJW_BIND": {
        "angle": { "source": "lfo", "shape": "sine", "rate": 0.05, "amount": 1, "attack": 0, "release": 0, "min": 0, "max": 1 },
        "k": { "source": "sub", "amount": 1, "attack": 0.05, "release": 0.3, "min": 0.3, "max": 0.05 }
    }
}*/

void main() {
    vec4 src = IMG_THIS_PIXEL(inputImage);
    vec2 uv = isf_FragNormCoord;
    vec2 px = 1.0 / IMG_SIZE(inputImage);
    vec3 w = vec3(0.2126, 0.7152, 0.0722);
    float lx = dot(IMG_NORM_PIXEL(inputImage, uv + vec2(px.x, 0.0)).rgb, w)
             - dot(IMG_NORM_PIXEL(inputImage, uv - vec2(px.x, 0.0)).rgb, w);
    float ly = dot(IMG_NORM_PIXEL(inputImage, uv + vec2(0.0, px.y)).rgb, w)
             - dot(IMG_NORM_PIXEL(inputImage, uv - vec2(0.0, px.y)).rgb, w);
    vec3 n = normalize(vec3(-lx, -ly, k)); // the flat parts read (0,0,1); k ≥ 0.01 keeps it off zero
    vec3 L = normalize(vec3(cos(angle * 6.2832), sin(angle * 6.2832), 1.0));
    gl_FragColor = vec4(src.rgb * clamp(dot(n, L), 0.0, 1.0), src.a);
}
