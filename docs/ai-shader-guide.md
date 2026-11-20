# AI shader guide: live-coding VeeJay Wizard's shader editor

> **Для пользователя.** Это инструкция для ИИ (Claude Code и любого другого), который пишет шейдеры прямо в открытый
> редактор G, пока вы смотрите. Откройте приложение в режиме разработки (`npm run dev`), нажмите Start, затем G.
> ИИ присылает код, видит ошибки и кадр сцены, по вашей просьбе переделывает и экспортирует файл в `web/user-shaders/`.
> Свой шейдер вы сохраняете кнопкой Export (файл `.glsl`) и загружаете обратно через Import или перетаскиванием.
> На опубликованном сайте: Start, G, вставьте токен сервера в Remote AI один раз и нажмите Connect (`deploy/README.md`).

## 1. Connect

- The channel lives in the **dev server** (`npm run dev` in `web/`, default `http://localhost:5173`). The published site reaches it through a relay: see **Remote** below.
- The user opens the app, presses **Start**, then **G** (or the bar's `Shader · G`). Without an open editor every call answers `{ "ok": false, "error": "no G editor open" }`.
- Every call is local HTTP with JSON. POST bodies need `content-type: application/json`. A page of another site is refused.

| Call | Body | Answer |
|---|---|---|
| `POST /__ai/shader` | `{ "code": "<GLSL>", "name"?: "…" }` | `{ "ok": true, "status": "Playing", "errors": [], "still": "/abs/path.png" }` or `{ "ok": false, "errors": [{ "line": 7, "msg": "'x' : undeclared identifier" }], "status": "…" }` |
| `POST /__ai/export` | `{ "name": "Neon tunnel", "overwrite"?: true }` | `{ "ok": true, "file": "/abs/web/user-shaders/Neon tunnel.glsl" }`; an existing file without `overwrite` answers 409 |
| `GET /__ai/state` | – | `{ "ok": true, "code": "…", "errors": […], "author": "AI" \| "user", "scene": "New shader", "source"?: "<saved scene>" }` |
| `GET /__ai/list` | – | `{ "ok": true, "files": ["Neon tunnel.glsl", …] }`, newest first |
| `GET /__ai/file?name=Neon%20tunnel.glsl` | – | the file's text (header included) |
| `GET /__ai/guide` | – | this file |

- `push` puts the code into the editor field (the user sees it) and compiles it, as if typed. A good shader plays at once; the still is a PNG of the stage (≤ 640 px wide) taken about 1.5 s later. Open it to see what you made.
- A bad shader answers its errors by line (lines of YOUR code). The last good shader keeps playing.
- The answer waits for the editor at most 10 s. `code`: text, 1 to 65 536 characters.
- The CLI (from `web/`; `VJW_URL` changes the server):

```sh
node scripts/ai-shader.mjs push my.glsl [name] # prints "Playing" + "still: <path>", or "line N: msg" lines; exit 1 on errors
                                                # name: titles an unsaved draft (Save as… offers it)
node scripts/ai-shader.mjs export "Neon tunnel" [--overwrite]
node scripts/ai-shader.mjs state                # JSON: the code the user sees now, its errors, who wrote it last
node scripts/ai-shader.mjs list
```

**Remote: the published site** (`deploy/ai-relay.mjs` behind the user's nginx; set-up in `deploy/README.md` § Remote AI)

- The same calls at `https://<host>/vjw001/__ai/…`. Every call needs `authorization: Bearer <token>`; without it, 401.
- The user opens the site, presses **Start**, then **G**, pastes the token into **Remote AI** once and presses **Connect** (the dot turns green). From then on G connects by itself whenever it opens in that browser. One editor at a time: a newer tab takes over.
- The CLI: `VJW_URL=https://<host>/vjw001 VJW_AI_TOKEN=<token> node scripts/ai-shader.mjs push my.glsl` (the same commands).
- Differences from dev: the still comes back as base64 (`png`); the CLI saves it into `scratchpad/ai/stills/` and prints its path. `export` downloads `<name>.glsl` in the user's browser (Chrome may ask once to allow downloads); nothing is stored on the server and `--overwrite` does nothing. No `list`, no `file`. An answer waits at most 20 s.

## 2. What exists: the shader contract

A Shadertoy-style **single pass** in GLSL ES 3.00 (WebGL2). Write only `mainImage`; the app adds `#version`, the uniforms and `main()`.

```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord)  // fragCoord in pixels, (0,0) bottom left; alpha is forced to 1
```

- `vec3 iResolution` (px, z = 1) · `float iTime` (s, the layer's clock) · `float iTimeDelta` · `int iFrame` · `float iFrameRate` · `vec4 iDate` · `float iSampleRate`.
- `vec4 iMouse` is always 0. `HW_PERFORMANCE` is defined as 1. No Buffer A–D tabs, no cubemaps, no keyboard texture.
- **`iChannel0` = the sound, 512 × 2, one channel (`.r`), linear filtering:**
  - row 0 (`y = 0.25`): the spectrum, 512 bins from 0 Hz to Nyquist; bin `i` is `i · sampleRate / 1024` Hz (≈ 47 Hz at 48 kHz). The value is `0..1` for −100…−30 dB, no smoothing (it jitters frame to frame).
  - row 1 (`y = 0.75`): the waveform, 512 samples, `0.5` = silence.
  - `texture(iChannel0, vec2(x, 0.25)).r` reads bin `x · 512`; exact: `texelFetch(iChannel0, ivec2(bin, 0), 0).r`. Bass ≈ `x` 0.002–0.008, mids 0.02–0.08, highs 0.15–0.5.
- `iChannel1`–`iChannel3`: one 256 × 256 RGBA noise texture, repeating, mipmapped.
- **Sliders:** `uniform float speed; // = 0.5` adds a slider (0 to 2 × the default) in the panel (E) and the editor (L). Also `int`, `bool` (`// = true`), `vec2` (a point), `vec3` / `vec4` (a colour, `// = vec3(1.0, 0.5, 0.2)`).
- **MUSIC_TIME:** a shader made in the editor runs its layer's clock on the music: `iTime` advances at 0.6× between kicks and leaps to 2× on each kick (back in 0.3 s). Animate with `iTime` and the picture surges on the beat by itself. The user may change it in the editor (L).
- **Examples** in the editor's menu: new, apollonian, glitter grove, golden tunnel, menger sponge, star nest, topologica, treasure (`web/src/editor/shaders/`; each names its author and licence).
- **The flash limiter:** a shader's frame-mean brightness (Rec. 709 luma, 0..1) may change by at most 0.06 per frame at 60 fps (WCAG 2.3.1 safety; the project counts a step over 0.10 as a flash). Faster changes are blended from the last frame, so a strobe turns into a soft grey pulse and a beat flash into a slow swell.

## 3. What you may do

- Write a shader, push it, read the errors and the still, fix, push again. Iterate until the user is happy.
- Read `state` before you change anything: the user may have typed in the field. Keep their edits unless they ask otherwise.
- Export a shader the user liked (`export`). Tell the user its file name; ask them to press **Save as…** to keep it as a scene in their library.
- Describe what you changed in one or two lines after each push.

## 4. What is forbidden

- **No light driven straight by the sound.** Never map the spectrum or waveform to brightness, exposure, background colour or a full-frame colour change. Let the sound move shapes (size, position, rotation, distortion, density). The limiter cuts such light anyway, and it will look dull.
- **No strobes, no full-frame flashes, no fast black/white alternation**, whatever drives them (time, kicks, `iFrame`).
- **Frame budget:** under about 5 ms per frame at 1080p on a laptop GPU. At most about 100 raymarch steps, 8 fractal iterations per step, 4 nested loops. Prefer analytic shapes and `smoothstep` to loops.
- **GLSL only.** No JavaScript, no network, no `#include`, no textures from files.
- **Files:** write only through `export` (into `web/user-shaders/`; remote: the user's downloads). Never touch other files of the project.
- No secrets, keys or personal data in shader comments.

## 5. The target code

```glsl
// VeeJay Wizard shader
// Name: Orbit rings
// Author: AI
// Date: 2026-11-20T14:03:00.000Z

// Orbit rings: rings orbit the centre; the bass widens them, the light stays. Credit: VeeJay Wizard AI, own work.
uniform float rings; // = 6.0
uniform vec3 tint;   // = vec3(0.2, 0.7, 1.0)

float bass() { return texture(iChannel0, vec2(0.004, 0.25)).r; } // ≈ 50–100 Hz, 0..1

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = (2.0 * fragCoord - iResolution.xy) / iResolution.y; // -1..1 on the short side
    float r = length(p), a = atan(p.y, p.x);
    float w = 0.02 + 0.03 * bass();                               // the sound moves the shape (ring width) ...
    float d = abs(fract(r * rings - 0.3 * iTime) - 0.5) / rings;
    float ring = smoothstep(w, 0.0, d) * smoothstep(1.4, 0.2, r);
    vec3 col = tint * ring * (0.6 + 0.4 * cos(a * 3.0 + iTime));  // ... the brightness does not follow it
    fragColor = vec4(col, 1.0);
}
```

The header block (the first lines up to the blank line) is written by `export` and the editor's Export; you may leave it out when you push.

## 6. Checklist before export

1. It compiles: `push` answers `"ok": true`, `"status": "Playing"`.
2. You looked at the still: it is not black, not flat white, not a single colour.
3. No brightness, background or full-frame colour on the sound; no strobe.
4. It stays smooth: no raymarch over ~100 steps; the user sees no stutter.
5. A comment line names what it is and its credit (`Credit: own work`, or the author and licence of what you adapted).
6. The sliders (`// = default`) have sensible defaults.
7. The user agreed. Then `export "<Name>"` and tell them: "Saved to web/user-shaders/<Name>.glsl (remote: your downloads); press Save as… to keep it as a scene".
