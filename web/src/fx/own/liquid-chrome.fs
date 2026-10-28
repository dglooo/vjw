// VeeJay Wizard, 2026
/*{
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Liquid chrome: a swelling mercury surface reflecting a studio sky. Burst sends a ring wave out from the centre: bound to onsets, every hit is a drop.",
    "ISFVSN": "2",
    "CATEGORIES": ["Liquid"],
    "INPUTS": [
        { "NAME": "burst", "LABEL": "Burst", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "flow", "LABEL": "Flow", "TYPE": "float", "DEFAULT": 0.8, "MIN": 0, "MAX": 2 },
        { "NAME": "speed", "LABEL": "Speed", "TYPE": "float", "DEFAULT": 1, "MIN": 0, "MAX": 3 },
        { "NAME": "tint", "LABEL": "Tint", "TYPE": "color", "DEFAULT": [0.85, 0.9, 1.0, 1.0] }
    ],
    "VJW_BIND": {
        "burst": { "source": "onset", "amount": 1, "attack": 0, "release": 0.35, "min": 0, "max": 1 }
    }
}*/

// Knobs: how far a burst's ring travels (screen heights), its wavelength and width, and the surface steepness
// (how far the reflections swing).
#define RING 1.2
#define RING_K 26.0
#define RING_W 30.0
#define BUMP 0.2

float height(vec2 p, float t) {
    vec2 q = p * 2.2;
    q += flow * vec2(sin(0.9 * q.y + 0.7 * t), sin(0.8 * q.x - 0.6 * t)); // big slow swells …
    q += flow * 0.5 * vec2(sin(1.7 * q.y - 0.9 * t), sin(1.9 * q.x + 0.8 * t)); // … folded once more
    float h = sin(q.x) * sin(q.y);
    // Burst falls 1 → 0 after a hit, so its ring moves out as it fades, slowing as a real ripple does.
    float d = length(p) - RING * (1.0 - burst);
    return h + 0.6 * burst * sin(RING_K * d) * exp(-RING_W * d * d);
}

// A studio around the pool: sky over a tilted horizon, a dark floor, two soft boxes. The sharp horizon reads as chrome.
vec3 env(vec3 r) {
    float y = dot(r.xy, vec2(0.28, 0.96)) + 0.3; // a flat surface sees the sky just above the horizon
    vec3 sky = mix(vec3(1.0, 0.97, 0.93), vec3(0.1, 0.25, 0.75), smoothstep(0.0, 1.0, y));
    vec3 ground = mix(vec3(0.3, 0.22, 0.17), vec3(0.012, 0.01, 0.02), smoothstep(0.0, 0.4, -y));
    vec3 c = mix(ground, sky, smoothstep(-0.02, 0.02, y));
    c += 2.0 * smoothstep(0.07, 0.0, abs(r.x + 0.5 - 0.3 * r.y)) * smoothstep(-0.1, 0.1, y);
    c += 1.5 * pow(max(dot(r, vec3(0.53, 0.64, 0.56)), 0.0), 48.0);
    return c;
}

void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y;
    float t = TIME * speed;
    float e = 1.0 / RENDERSIZE.y; // one pixel
    float h = height(p, t);
    vec2 g = vec2(height(p + vec2(e, 0.0), t) - h, height(p + vec2(0.0, e), t) - h) / e;
    vec3 n = normalize(vec3(-BUMP * g, 1.0));
    vec3 col = env(reflect(vec3(0.0, 0.0, -1.0), n)) * tint.rgb;
    col *= 0.6 + 0.4 * n.z; // steep flanks darken
    gl_FragColor = vec4(col, 1.0);
}
