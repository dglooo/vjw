// VeeJay Wizard, 2026
// Look: TD bloom.tox (studied, rewritten). Credits: the dual-filter down/up shaders of our web/src/gl/bloom.ts (after
// Bjørge, "Bandwidth-Efficient Rendering", ARM, SIGGRAPH 2015), ported to ISF passes.
/*{
    "CATEGORIES": ["Glow", "Retro"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "TouchDesigner-style bloom: the brights above a soft-kneed threshold run down a pyramid of half-size blurs and back up, each level added onto the sharper one, and the sum glows over the image through a cosine colour ramp. Kicks pulse the glow, a build lowers the threshold, a drop floods it, and the ramp turns once a bar.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "threshold", "LABEL": "Threshold", "TYPE": "float", "DEFAULT": 0.35, "MIN": 0, "MAX": 1 },
        { "NAME": "glow", "LABEL": "Glow", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "level", "LABEL": "Level", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "rampShift", "LABEL": "Ramp shift", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 }
    ],
    "PASSES": [
        { "TARGET": "down4", "FLOAT": true, "WIDTH": "$WIDTH/4", "HEIGHT": "$HEIGHT/4" },
        { "TARGET": "down8", "FLOAT": true, "WIDTH": "$WIDTH/8", "HEIGHT": "$HEIGHT/8" },
        { "TARGET": "down16", "FLOAT": true, "WIDTH": "$WIDTH/16", "HEIGHT": "$HEIGHT/16" },
        { "TARGET": "down32", "FLOAT": true, "WIDTH": "$WIDTH/32", "HEIGHT": "$HEIGHT/32" },
        { "TARGET": "down64", "FLOAT": true, "WIDTH": "$WIDTH/64", "HEIGHT": "$HEIGHT/64" },
        { "TARGET": "up32", "FLOAT": true, "WIDTH": "$WIDTH/32", "HEIGHT": "$HEIGHT/32" },
        { "TARGET": "up16", "FLOAT": true, "WIDTH": "$WIDTH/16", "HEIGHT": "$HEIGHT/16" },
        { "TARGET": "up8", "FLOAT": true, "WIDTH": "$WIDTH/8", "HEIGHT": "$HEIGHT/8" },
        { "TARGET": "up4", "FLOAT": true, "WIDTH": "$WIDTH/4", "HEIGHT": "$HEIGHT/4" },
        {}
    ],
    "VJW_FLASH": ["glow", "level"],
    "VJW_BIND": {
        "threshold": { "source": "build", "amount": 1, "attack": 1, "release": 1, "min": 0.35, "max": 0.15 },
        "glow": { "source": "kick", "amount": 1, "attack": 0, "release": 0.2, "min": 0, "max": 1 },
        "level": { "source": "drop", "amount": 1, "attack": 0, "release": 1.5, "min": 0, "max": 1 },
        "rampShift": { "source": "bar", "shape": "saw", "amount": 1, "attack": 0, "release": 0, "min": 0, "max": 1 }
    }
}*/

#define KNEE 0.5       // the soft knee's half-width, × threshold
#define INTENSITY 1.6  // the glow's overall gain (TD Intensity)
#define RAMP 0.6       // how far the cosine ramp tints the glow (TD Ramp Glow .619)

// Down: the centre ×4 plus 4 diagonal taps one source texel out, each bilinear tap a 2×2 average; /8.
vec3 down(sampler2D t, vec2 texel) {
    vec2 uv = isf_FragNormCoord, d = texel;
    vec3 c = 4.0 * texture2D(t, uv).rgb + texture2D(t, uv + d).rgb + texture2D(t, uv - d).rgb;
    return (c + texture2D(t, uv + vec2(d.x, -d.y)).rgb + texture2D(t, uv - vec2(d.x, -d.y)).rgb) / 8.0;
}

// Up: a tent over the smaller level, 4 edge taps ×1 plus 4 diagonal taps ×2; /12.
vec3 up(sampler2D t, vec2 texel) {
    vec2 uv = isf_FragNormCoord, d = 0.5 * texel;
    vec3 c = texture2D(t, uv + vec2(2.0 * d.x, 0.0)).rgb + texture2D(t, uv - vec2(2.0 * d.x, 0.0)).rgb;
    c += texture2D(t, uv + vec2(0.0, 2.0 * d.y)).rgb + texture2D(t, uv - vec2(0.0, 2.0 * d.y)).rgb;
    c += 2.0 * (texture2D(t, uv + d).rgb + texture2D(t, uv - d).rgb + texture2D(t, uv + vec2(d.x, -d.y)).rgb + texture2D(t, uv - vec2(d.x, -d.y)).rgb);
    return c / 12.0;
}

void main() {
    if (PASSINDEX == 0) { // ¼: the 5 taps cover a 4×4 block; keep what lies above the threshold (soft knee, brightest channel)
        vec3 c = down(inputImage, 1.0 / IMG_SIZE(inputImage));
        float b = max(c.r, max(c.g, c.b)), k = KNEE * threshold + 1e-4;
        float q = clamp(b - threshold + k, 0.0, 2.0 * k);
        gl_FragColor = vec4(c * max(q * q / (4.0 * k), b - threshold) / max(b, 1e-4), 1.0);
    }
    else if (PASSINDEX == 1) gl_FragColor = vec4(down(down4, 1.0 / IMG_SIZE(down4)), 1.0);
    else if (PASSINDEX == 2) gl_FragColor = vec4(down(down8, 1.0 / IMG_SIZE(down8)), 1.0);
    else if (PASSINDEX == 3) gl_FragColor = vec4(down(down16, 1.0 / IMG_SIZE(down16)), 1.0);
    else if (PASSINDEX == 4) gl_FragColor = vec4(down(down32, 1.0 / IMG_SIZE(down32)), 1.0);
    // up ×4: each level is its own down plus the wider one above it, so up4 holds all five
    else if (PASSINDEX == 5) gl_FragColor = vec4(IMG_THIS_PIXEL(down32).rgb + up(down64, 1.0 / IMG_SIZE(down64)), 1.0);
    else if (PASSINDEX == 6) gl_FragColor = vec4(IMG_THIS_PIXEL(down16).rgb + up(up32, 1.0 / IMG_SIZE(up32)), 1.0);
    else if (PASSINDEX == 7) gl_FragColor = vec4(IMG_THIS_PIXEL(down8).rgb + up(up16, 1.0 / IMG_SIZE(up16)), 1.0);
    else if (PASSINDEX == 8) gl_FragColor = vec4(IMG_THIS_PIXEL(down4).rgb + up(up8, 1.0 / IMG_SIZE(up8)), 1.0);
    else { // full size: the image screened with its glow (the five levels summed), tinted by the cosine ramp at its luma.
        // The exp screen is an add that soft-clips toward 1 per channel: brights keep their shape, the dark takes the halo.
        vec3 src = min(IMG_THIS_PIXEL(inputImage).rgb, 1.0);
        vec3 g = IMG_THIS_PIXEL(up4).rgb;
        float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
        vec3 tint = mix(vec3(1.0), 0.5 + 0.5 * cos(6.28318 * (rampShift + l + vec3(0.0, 0.33, 0.67))), RAMP);
        gl_FragColor = vec4(1.0 - (1.0 - src) * exp(-INTENSITY * (0.4 + 0.3 * glow + level) * g * tint), 1.0);
    }
}
