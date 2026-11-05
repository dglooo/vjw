// VeeJay Wizard, 2026
/*{
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "A Menger-class fold fractal (KIFS), raymarched from an orbiting camera. Fold twists every fold and morphs the sponge into crystal.",
    "ISFVSN": "2",
    "CATEGORIES": ["Geometry"],
    "INPUTS": [
        { "NAME": "fold", "LABEL": "Fold", "TYPE": "float", "DEFAULT": 0.12, "MIN": 0, "MAX": 1 },
        { "NAME": "speed", "LABEL": "Orbit", "TYPE": "float", "DEFAULT": 0.15, "MIN": 0, "MAX": 1 },
        { "NAME": "hue", "LABEL": "Hue", "TYPE": "float", "DEFAULT": 0.58, "MIN": 0, "MAX": 1 },
        { "NAME": "glow", "LABEL": "Glow", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0, "MAX": 3 }
    ],
    "VJW_BIND": {
        "fold": { "source": "bass", "amount": 1, "attack": 0.03, "release": 0.3, "min": 0.06, "max": 0.32 },
        "glow": { "source": "onset", "amount": 1, "attack": 0, "release": 0.25, "min": 0, "max": 2.5 }
    },
    "VJW_FLASH": ["glow"]
}*/

// Knobs: march steps × fold iterations is the GPU cost (bench budget: p95 ≤ 5 ms at 1728×1118).
#define STEPS 32
#define ITER 3

mat2 R1; // the fold twists, set once per pixel in main
mat2 R2;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
vec3 palette(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }

// Menger IFS: fold into one sorted octant, twist, scale 3 about (1,1,1), re-centre the z slab; a unit box at the end.
float de(vec3 p) {
    float s = 1.0;
    for (int i = 0; i < ITER; i++) {
        p = abs(p);
        if (p.x < p.y) p.xy = p.yx;
        if (p.x < p.z) p.xz = p.zx;
        if (p.y < p.z) p.yz = p.zy;
        p.xy = R1 * p.xy;
        p.yz = R2 * p.yz;
        p = p * 3.0 - 2.0;
        if (p.z < -1.0) p.z += 2.0;
        s *= 3.0;
    }
    vec3 d = abs(p) - 1.0;
    return (length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0)) / s;
}

void main() {
    R1 = rot(fold * 1.3);
    R2 = rot(fold * 0.7);
    vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y;
    float a = TIME * speed;
    vec3 ro = vec3(2.6 * sin(a), 0.3 + 0.9 * sin(a * 0.71), 2.6 * cos(a));
    vec3 fw = normalize(-ro);
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 rd = normalize(1.5 * fw + uv.x * rt + uv.y * cross(rt, fw));

    vec3 col = palette(hue + 0.5) * 0.05 * (1.2 - length(uv));
    // Bounding sphere r = 1.8 (the box corners sit at √3): rays that miss it skip the march.
    float b = dot(ro, rd);
    float h = b * b - dot(ro, ro) + 3.24;
    if (h > 0.0) {
        h = sqrt(h);
        float t = max(-b - h, 0.0);
        float tmax = -b + h;
        float n = 0.0;
        for (int i = 0; i < STEPS; i++) {
            float d = de(ro + rd * t);
            if (d < 0.0015 * t || t > tmax) break;
            t += d;
            n += 1.0;
        }
        float k = n / float(STEPS); // march effort: occlusion on a hit, glow on a miss
        if (t < tmax) {
            vec3 p = ro + rd * t;
            vec2 e = vec2(0.0015 * t, -0.0015 * t);
            vec3 nrm = normalize(e.xyy * de(p + e.xyy) + e.yyx * de(p + e.yyx) + e.yxy * de(p + e.yxy) + e.xxx * de(p + e.xxx));
            vec3 base = palette(hue + 0.15 * dot(p, p) + 0.1 * nrm.y);
            vec3 l = normalize(vec3(0.5, 0.8, 0.3));
            float dif = max(dot(nrm, l), 0.0);
            float spec = pow(max(dot(reflect(rd, nrm), l), 0.0), 24.0);
            float rim = pow(1.0 - max(dot(-rd, nrm), 0.0), 3.0);
            float ao = (1.0 - k) * (1.0 - k);
            col = (base * (0.12 + 0.88 * dif) + spec * 0.7) * ao + rim * palette(hue + 0.35) * 0.4 * ao;
        }
        col += palette(hue + 0.15) * glow * k * k * 0.9;
    }
    col = 1.0 - exp(-1.5 * col); // tone map
    gl_FragColor = vec4(pow(col, vec3(0.85)), 1.0);
}
