// VeeJay Wizard, 2026
/*{
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "A neon wireframe tube with a polygon cross-section, solved per pixel (no march). Twist screws it along its depth.",
    "ISFVSN": "2",
    "CATEGORIES": ["Geometry"],
    "INPUTS": [
        { "NAME": "sides", "LABEL": "Sides", "TYPE": "float", "DEFAULT": 6, "MIN": 3, "MAX": 10 },
        { "NAME": "twist", "LABEL": "Twist", "TYPE": "float", "DEFAULT": 0.03, "MIN": 0, "MAX": 0.3 },
        { "NAME": "flash", "LABEL": "Flash", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "speed", "LABEL": "Speed", "TYPE": "float", "DEFAULT": 1, "MIN": 0, "MAX": 3 },
        { "NAME": "hue", "LABEL": "Hue", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0, "MAX": 1 }
    ],
    "VJW_BIND": {
        "twist": { "source": "bass", "amount": 1, "attack": 0.03, "release": 0.35, "min": 0.01, "max": 0.1 },
        "flash": { "source": "onset", "amount": 1, "attack": 0, "release": 0.15, "min": 0, "max": 1 }
    }
}*/

// Knobs: focal length, mesh cells across a face, line half-width (world units), flight m/s.
#define FOCAL 0.6
#define DIV 2.0
#define LINE 0.012
#define FLY 3.0

vec3 palette(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }

// A line of half-width LINE at g = 0, antialiased over px (one pixel's footprint), faded out before it aliases.
float grid(float g, float px, float cell) {
    return smoothstep(LINE + px, LINE, g) * smoothstep(0.4 * cell, 0.1 * cell, px);
}

void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y;
    p -= 0.08 * vec2(sin(TIME * 0.31), cos(TIME * 0.23)); // the vanishing point drifts
    float n = floor(sides + 0.5);
    float seg = 6.28318 / n;
    float r = max(length(p), 1e-4);
    float a0 = atan(p.y, p.x);
    // The camera sits on the axis of a tube with apothem 1: the wall at screen angle a is the face whose normal is
    // nearest, at depth FOCAL / (r cos(angle to that normal)). Twist turns the faces with depth (one fixed-point pass).
    float fa = a0 - seg * floor(a0 / seg + 0.5);
    float z = FOCAL / (r * cos(fa));
    float a = a0 + twist * z;
    float face = floor(a / seg + 0.5);
    fa = a - seg * face;
    z = FOCAL / (r * cos(fa));

    float hw = tan(0.5 * seg);  // half the face width
    float cell = 2.0 * hw / DIV; // square mesh cells
    float zz = z + TIME * FLY * speed;
    float w = tan(fa) + hw;      // 0..2hw across the face
    float lat = z / (FOCAL * RENDERSIZE.y); // a pixel's footprint across the wall …
    float dep = lat * z;                    // … and along it (grazing)
    float gz = abs(fract(zz / cell + 0.5) - 0.5) * cell;
    float gw = abs(fract(w / cell + 0.5) - 0.5) * cell;
    float edge = min(w, 2.0 * hw - w);      // to the face's own edges
    float mesh = max(grid(gz, dep, cell), grid(gw, lat, cell));
    float rim = smoothstep(2.0 * LINE + lat, 0.0, edge);

    float fog = exp(-0.07 * z);
    float ring = pow(1.0 - fract(zz * 0.0625 - TIME * 0.5), 10.0); // light rings racing down the tube
    vec3 c = palette(hue + 0.015 * zz + 0.08 * face);
    float shade = 0.6 + 0.4 * cos(face * seg - 2.0);
    vec3 col = c * (0.035 * shade + mesh * (0.55 + 2.0 * ring) + rim * 1.4) * fog * (1.0 + 2.5 * flash);
    col += palette(hue + 0.3) * 0.012 / r * (1.0 + 4.0 * flash) + flash * 0.25 * fog * mesh;
    col = 1.0 - exp(-1.5 * col);
    gl_FragColor = vec4(pow(col, vec3(0.85)), 1.0);
}
