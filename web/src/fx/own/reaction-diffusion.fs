// VeeJay Wizard, 2026
// Look: TD reaction-diffusion feedback palette (studied, rewritten). Credits: the Gray-Scott step follows jsexp's
// grayscott (pmneila, https://github.com/pmneila/jsexp), BSD-3-Clause, as the algorithm reference only (no code copied).
/*{
    "CATEGORIES": ["Feedback"],
    "CREDIT": "VeeJay Wizard; Gray-Scott after jsexp (pmneila), BSD-3-Clause",
    "DESCRIPTION": "Reaction-diffusion: two chemicals feed on each other at half size, six Gray-Scott steps a frame, and the image's brights keep seeding the second one, so coral grows out of the bright parts and spreads into a living maze, coloured by a cosine ramp. The sub feeds the seed, bass shifts the kill (spots to mazes), a build starves the feed, snares turn the colours and a drop wipes it to a fresh splash.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "seed", "LABEL": "Seed", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0, "MAX": 1 },
        { "NAME": "kill", "LABEL": "Kill", "TYPE": "float", "DEFAULT": 0.062, "MIN": 0.045, "MAX": 0.07 },
        { "NAME": "feed", "LABEL": "Feed", "TYPE": "float", "DEFAULT": 0.0545, "MIN": 0.01, "MAX": 0.1 },
        { "NAME": "palette", "LABEL": "Palette shift", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "reset", "LABEL": "Reset", "TYPE": "bool", "DEFAULT": false }
    ],
    "PASSES": [
        { "TARGET": "rd", "PERSISTENT": true, "FLOAT": true, "WIDTH": "$WIDTH/2", "HEIGHT": "$HEIGHT/2" },
        { "TARGET": "rd", "PERSISTENT": true, "FLOAT": true, "WIDTH": "$WIDTH/2", "HEIGHT": "$HEIGHT/2" },
        { "TARGET": "rd", "PERSISTENT": true, "FLOAT": true, "WIDTH": "$WIDTH/2", "HEIGHT": "$HEIGHT/2" },
        { "TARGET": "rd", "PERSISTENT": true, "FLOAT": true, "WIDTH": "$WIDTH/2", "HEIGHT": "$HEIGHT/2" },
        { "TARGET": "rd", "PERSISTENT": true, "FLOAT": true, "WIDTH": "$WIDTH/2", "HEIGHT": "$HEIGHT/2" },
        { "TARGET": "rd", "PERSISTENT": true, "FLOAT": true, "WIDTH": "$WIDTH/2", "HEIGHT": "$HEIGHT/2" },
        {}
    ],
    "VJW_BIND": {
        "seed": { "source": "sub", "amount": 1, "attack": 0.02, "release": 0.25, "min": 0.3, "max": 0.6 },
        "kill": { "source": "reese", "amount": 1, "attack": 0.1, "release": 0.6, "min": 0.062, "max": 0.064 },
        "feed": { "source": "build", "amount": 1, "attack": 2, "release": 2, "min": 0.0545, "max": 0.04 },
        "palette": { "source": "snare", "amount": 1, "attack": 0, "release": 0.3, "min": 0, "max": 0.15 },
        "reset": { "source": "drop", "amount": 1, "attack": 0, "release": 1.5, "min": 0, "max": 1 }
    }
}*/

// Six steps a frame (jsexp runs 8; 6 is the S1.9 budget lever: the coral grows a quarter slower). Below kill ≈ √feed/2 −
// feed (.0622 at feed .0545) a flat B flood is stable too and eats the maze within a minute, so kill's binding rests at
// .062. Knobs: the diffusion rates (Karl Sims' Da 1, Db .5 with dt 1: stable for this 3×3 kernel); the seed per step at
// seed 1 and luma 1; the B that reads as the ramp's full turn; how far the ramp is lit by the maze's relief.
#define DA 1.0
#define DB 0.5
#define SEED 0.02
#define SPAN 2.5
#define RELIEF 6.0

float luma(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
    vec2 uv = isf_FragNormCoord;
    if (PASSINDEX == 6) { // full size: B through a cosine ramp, lit by its own relief (the maze reads as a surface)
        vec2 t = 1.0 / IMG_SIZE(rd);
        float b = IMG_THIS_PIXEL(rd).g;
        vec2 g = vec2(IMG_NORM_PIXEL(rd, uv + vec2(t.x, 0.0)).g - IMG_NORM_PIXEL(rd, uv - vec2(t.x, 0.0)).g,
                      IMG_NORM_PIXEL(rd, uv + vec2(0.0, t.y)).g - IMG_NORM_PIXEL(rd, uv - vec2(0.0, t.y)).g);
        vec3 n = normalize(vec3(-RELIEF * g, 1.0));
        float lit = 0.6 + 0.4 * dot(n, normalize(vec3(-0.5, 0.6, 1.0)));
        vec3 ramp = 0.5 + 0.5 * cos(6.28318 * (palette + SPAN * b + vec3(0.0, 0.33, 0.67)));
        gl_FragColor = vec4(ramp * lit * smoothstep(0.02, 0.2, b), 1.0);
        return;
    }
    // Passes 0–5, at half size: one Gray-Scott step. (A, B) in .rg; the 3×3 Laplacian (.05 corners, .2 sides, −1).
    vec2 e = vec2(1.0 / RENDERSIZE.x, 0.0);
    vec2 f = vec2(0.0, 1.0 / RENDERSIZE.y);
    vec2 s = IMG_THIS_PIXEL(rd).rg;
    vec2 lap = 0.2 * (IMG_NORM_PIXEL(rd, uv + e).rg + IMG_NORM_PIXEL(rd, uv - e).rg + IMG_NORM_PIXEL(rd, uv + f).rg + IMG_NORM_PIXEL(rd, uv - f).rg)
             + 0.05 * (IMG_NORM_PIXEL(rd, uv + e + f).rg + IMG_NORM_PIXEL(rd, uv + e - f).rg + IMG_NORM_PIXEL(rd, uv - e + f).rg + IMG_NORM_PIXEL(rd, uv - e - f).rg)
             - s;
    float abb = s.x * s.y * s.y;
    s += vec2(DA * lap.x - abb + feed * (1.0 - s.x), DB * lap.y + abb - (kill + feed) * s.y);
    float l = luma(IMG_THIS_PIXEL(inputImage).rgb);
    // The brights seed B, into fresh A only: a bright patch nucleates coral, and once the coral covers it the seeding
    // stops (seeding it on would hold it in a flat B flood). seed may be bound below 0: it rests at 0 there.
    s.y += max(seed, 0.0) * l * SEED * smoothstep(0.5, 0.8, s.x);
    if (reset) s = vec2(1.0, 0.25 * step(0.5, l)); // the drop: A back to 1, B only where the image is bright (the splash)
    gl_FragColor = vec4(clamp(s, 0.0, 1.0), 0.0, 1.0);
}
