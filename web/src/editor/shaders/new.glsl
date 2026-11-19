// A new shader (VeeJay Wizard, own). Shadertoy compatible: write a mainImage here, or paste one from shadertoy.com
// (one tab only: Buffer A to D tabs do not run here). iTime runs with the music: this layer's clock leaps on every
// kick (its speed binding, in the editor, L). iChannel0 is the sound, 512 x 2: row 0 (y 0.25) the spectrum, row 1
// (y 0.75) the waveform around 0.5. Let the sound move shapes, not brightness: light that follows it can flash.
// uniform float name; // = 0.5   adds a slider (0 to 2 x the default) in the panel (E) and the editor (L).
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = (2.0 * fragCoord - iResolution.xy) / iResolution.y; // -1..1 on the short side
    float r = length(p), a = atan(p.y, p.x);
    float v = sin(9.0 * r - 2.0 * iTime) + sin(5.0 * a + iTime) + sin(3.0 * (p.x + p.y) - 0.7 * iTime);
    vec3 col = 0.5 + 0.5 * cos(v + vec3(0.0, 2.1, 4.2));
    fragColor = vec4(col * smoothstep(1.6, 0.2, r), 1.0);
}
