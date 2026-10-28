// VeeJay Wizard, 2026
/*{
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Metaballs: eight glossy blobs drift, merge and split like a lava lamp, their colours blending where they touch. Size swells them.",
    "ISFVSN": "2",
    "CATEGORIES": ["Liquid"],
    "INPUTS": [
        { "NAME": "size", "LABEL": "Size", "TYPE": "float", "DEFAULT": 1, "MIN": 0.3, "MAX": 2 },
        { "NAME": "speed", "LABEL": "Speed", "TYPE": "float", "DEFAULT": 1, "MIN": 0, "MAX": 3 },
        { "NAME": "hue", "LABEL": "Hue", "TYPE": "float", "DEFAULT": 0.95, "MIN": 0, "MAX": 1 }
    ],
    "VJW_BIND": {
        "size": { "source": "bass", "amount": 1, "attack": 0.03, "release": 0.3, "min": 0.9, "max": 1.3 }
    }
}*/

// Knobs: the blob count and radius at size 1 (screen heights).
#define BALLS 8
#define RADIUS 0.12

vec3 palette(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }

// A sine-like swing in -1..1 with no transcendentals (a smoothstepped triangle): every pixel walks every blob's path,
// and sin() was most of the cost.
vec2 swing(vec2 x) {
    vec2 s = abs(2.0 * fract(x) - 1.0);
    return 2.0 * s * s * (3.0 - 2.0 * s) - 1.0;
}

void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y;
    float t = TIME * speed;
    vec2 span = vec2(0.5 * RENDERSIZE.x / RENDERSIZE.y - 0.15, 0.36);
    // The field f = Σ r²/d², its gradient, and each blob's palette offset weighted by its share of the field.
    float f = 0.0;
    vec2 g = vec2(0.0);
    float c = 0.0;
    for (int i = 0; i < BALLS; i++) {
        float k = float(i);
        vec2 at = span * swing(t * vec2(0.037 + 0.005 * k, 0.03 + 0.0043 * mod(3.0 * k, 8.0)) + vec2(0.3, 0.43) * k);
        float r = RADIUS * size * (0.7 + 0.5 * fract(0.618 * k + 0.2));
        vec2 d = p - at;
        float dd = dot(d, d) + 1e-5;
        float w = r * r / dd;
        f += w;
        g -= 2.0 * w / dd * d;
        c += w * k;
    }
    vec3 col = palette(hue + 0.07 * c / f); // the colours blend where blobs merge
    // A dome per blob: height 1 − 1/f is 0 at the rim and flat on top, so its normal is steep only at the edges.
    vec3 n = normalize(vec3(-0.12 * g / (f * f), 1.0));
    vec3 l = normalize(vec3(-0.5, 0.6, 0.75));
    float dif = max(dot(n, l), 0.0);
    float spec = pow(max(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0), 24.0); // broad: a small hot spot beads in the smoke
    float rim = pow(1.0 - n.z, 2.0);
    vec3 blob = col * (0.2 + 0.9 * dif) + 0.6 * spec + 0.5 * rim * (1.0 - col); // the complement: palette(t + 0.5) = 1 − palette(t)
    // Antialiased rim: the distance to f = 1 is about (f − 1) / |∇f|, in pixels here.
    float cover = clamp((f - 1.0) / (length(g) + 1e-5) * RENDERSIZE.y + 0.5, 0.0, 1.0);
    vec3 bg = vec3(0.012, 0.006, 0.025) + col * 0.22 * smoothstep(0.15, 1.0, f); // the lamp's glow
    gl_FragColor = vec4(mix(bg, blob, cover), 1.0);
}
