// VeeJay Wizard, 2026
// Look: TD Palette rgbaBlur (studied, rewritten): in → blur R (preshrink 2, filter 7) / G (1,1) / B (0,0) →
// reorder → comp maximum(in) (research §2, §6 q11) — only the red channel bleeds at ⅛ res, so every bright edge
// carries a red halo, and the per-channel max with the dry keeps the original wherever it is brighter. Same
// budget note as hsv-blur: the plan's lever (the resolution factor) — ¼-res with a 5×5 tent measured halo +flash
// p95 6.64 ms (over 5), so the target runs at ⅛ res with a 3×3 tent (max radius ≈ 16 source px where TD's is
// ≈ 28). The size range rests at 0.9 (the single surviving tap keeps the rest ≈ the input) and the 3×3 cost is
// size-independent (all nine taps fetch either way). No third-party code.
/*{
    "CATEGORIES": ["Glow", "Retro"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Blurs the red channel only, at ⅛ resolution, and max'es it with the dry: bright edges grow a red halo. The bass widens the bleed.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "size", "LABEL": "Blur size", "TYPE": "float", "DEFAULT": 0.9, "MIN": 0.9, "MAX": 2.0 }
    ],
    "PASSES": [
        { "TARGET": "blur", "FLOAT": true, "WIDTH": "$WIDTH/8", "HEIGHT": "$HEIGHT/8" },
        {}
    ],
    "VJW_BIND": {
        "size": { "source": "reese", "amount": 1, "attack": 0.05, "release": 0.4, "min": 0.9, "max": 2.0 }
    }
}*/

void main() {
    if (PASSINDEX == 0) { // ⅛ res: the red channel's 3×3 tent blur in TARGET texels (±1 = ±8 source px;
        // 1 − r/size, self-normalised; at the rest (0.9) only the centre tap survives, so the rest is ≈ the input)
        vec2 px = 1.0 / IMG_SIZE(blur);
        float r = 0.0, sum = 0.0, w;
        for (int i = -1; i <= 1; i++)
            for (int j = -1; j <= 1; j++) {
                w = max(0.0, 1.0 - length(vec2(float(i), float(j))) / size);
                r += w * IMG_NORM_PIXEL(inputImage, isf_FragNormCoord + vec2(float(i), float(j)) * px).r;
                sum += w;
            }
        gl_FragColor = vec4(r / sum, 0.0, 0.0, 1.0);
    }
    else { // full res: comp maximum(in) — the dry, with the blurred red max'd over it (G and B unchanged)
        vec4 src = IMG_THIS_PIXEL(inputImage);
        gl_FragColor = vec4(max(src.rgb, vec3(IMG_THIS_NORM_PIXEL(blur).r, 0.0, 0.0)), src.a);
    }
}
