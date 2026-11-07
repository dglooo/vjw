// VeeJay Wizard, 2026
// Look: TD Palette hsvBlur (studied, rewritten): in → rgbhsv → blur H (preshrink 2, filter 7) / S (1,1) /
// V (0,0) → reorder → hsvrgb (research §2, §6 q11) — the hue bleeds like watercolour while luma and saturation
// stay sharp. Rewritten for our budget: the plan's lever (the resolution factor) — ¼-res with a 5×5 tent
// measured halo +flash p95 6.64 ms (over 5), so the target runs at ⅛ res with a 3×3 tent (max radius
// ≈ 16 source px where TD's is ≈ 28). The size range rests at 0.9 (the single surviving tap keeps the rest ≈
// the input) and the 3×3 cost is size-independent (all nine taps fetch either way). The HSV pair is the K-vec4 formulation own/change-color uses (studied, rewritten). No third-party code.
/*{
    "CATEGORIES": ["Color Effect", "Liquid"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Blurs the hue only, at ⅛ resolution: the colour bleeds like watercolour while the luma stays sharp. The bass widens the bleed.",
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

// The standard HSV pair (the K-vec4 formulation; the donor's own files carry the same math — studied, rewritten).
vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = c.g < c.b ? vec4(c.bg, K.wz) : vec4(c.gb, K.xy);
    vec4 q = c.r < p.x ? vec4(p.xyw, c.r) : vec4(c.r, p.yzx);
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    if (PASSINDEX == 0) { // ⅛ res: the hue's 3×3 tent blur in TARGET texels (±1 = ±8 source px; weight 1 − r/size,
        // self-normalised; at the rest (0.9) only the centre tap survives, so the rest is ≈ the input)
        vec2 px = 1.0 / IMG_SIZE(blur);
        float h = 0.0, sum = 0.0, w;
        for (int i = -1; i <= 1; i++)
            for (int j = -1; j <= 1; j++) {
                w = max(0.0, 1.0 - length(vec2(float(i), float(j))) / size);
                h += w * rgb2hsv(IMG_NORM_PIXEL(inputImage, isf_FragNormCoord + vec2(float(i), float(j)) * px).rgb).x;
                sum += w;
            }
        gl_FragColor = vec4(h / sum, 0.0, 0.0, 1.0);
    }
    else { // full res: recombine — the blurred hue, the sharp saturation and value (V is the luma: it stays crisp)
        vec4 src = IMG_THIS_PIXEL(inputImage);
        vec3 hsv = rgb2hsv(src.rgb);
        hsv.x = IMG_THIS_NORM_PIXEL(blur).r;
        gl_FragColor = vec4(hsv2rgb(hsv), src.a);
    }
}
