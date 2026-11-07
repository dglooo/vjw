// VeeJay Wizard, 2026
// Look: TD Palette sharpen (studied, rewritten): an unsharp over the 3×3 neighbourhood with a cross-weighted
// blur — the box plus the cross, so the orthogonal neighbours count double (9 taps, weight 12). TD's own 5×5
// convolve (research §6 q8) reduced to the plan's 3×3 + cross. The donor ISF Sharpen RGB.fs is rejected: its body
// declares `varying`, which will not compile under our ISF_VS (design fact 8). Static — no binds (q8). No
// third-party code.
/*{
    "CATEGORIES": ["Stylize", "Retro"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Unsharp: in + amount·(in − blur), the blur a 3×3 cross-weighted box (orthogonals count double). amount 0 is the input untouched.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "amount", "LABEL": "Amount", "TYPE": "float", "DEFAULT": 1, "MIN": 0, "MAX": 2 }
    ]
}*/

void main() {
    vec4 src = IMG_THIS_PIXEL(inputImage);
    vec2 uv = isf_FragNormCoord;
    vec2 px = 1.0 / IMG_SIZE(inputImage);
    vec3 blur = (2.0 * (IMG_NORM_PIXEL(inputImage, uv + vec2(px.x, 0.0)).rgb + IMG_NORM_PIXEL(inputImage, uv - vec2(px.x, 0.0)).rgb
                      + IMG_NORM_PIXEL(inputImage, uv + vec2(0.0, px.y)).rgb + IMG_NORM_PIXEL(inputImage, uv - vec2(0.0, px.y)).rgb)
               + IMG_NORM_PIXEL(inputImage, uv + px).rgb + IMG_NORM_PIXEL(inputImage, uv - px).rgb
               + IMG_NORM_PIXEL(inputImage, uv + vec2(-px.x, px.y)).rgb + IMG_NORM_PIXEL(inputImage, uv + vec2(px.x, -px.y)).rgb) / 12.0;
    gl_FragColor = vec4(src.rgb + amount * (src.rgb - blur), src.a);
}
