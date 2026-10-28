# Third-party software

Every entry in `package.json` (exact pins), with the installed version and its license (spec §6, plan R4).
Regenerate the rows with `node scripts/licenses.mjs`.

## Runtime

Bundled into the app.

| name | version | license |
|---|---|---|
| fft.js | 4.0.4 | MIT |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| twgl.js | 7.0.0 | MIT |

fft.js: MIT per npm metadata (and its README); the GitHub repo (https://github.com/indutny/fft.js, Fedor Indutny) has no LICENSE file.

## Toolchain

Dev only, never shipped. `playwright-core` is the lead's browser-verification tool (it drives the installed Chrome); it stays.

| name | version | license |
|---|---|---|
| @eslint/js | 10.0.1 | MIT |
| @types/node | 24.19.2 | MIT |
| @types/react | 19.3.0 | MIT |
| @types/react-dom | 19.3.0 | MIT |
| @vitejs/plugin-react | 6.1.2 | MIT |
| eslint | 10.13.0 | MIT |
| eslint-plugin-react-hooks | 7.1.1 | MIT |
| eslint-plugin-react-refresh | 0.5.7 | MIT |
| globals | 17.13.0 | MIT |
| playwright-core | 1.64.1 | Apache-2.0 |
| typescript | 6.0.3 | Apache-2.0 |
| typescript-eslint | 8.72.1 | MIT |
| vite | 8.3.5 | MIT |
| vitest | 4.1.12 | MIT |

## Adapted code

- `src/scenes/particles.ts` adapts the twgl.js example `examples/transform-feedback-particles-va.html` (ping-pong vertex arrays + transform feedback, the update shader also rasterises the points).
  - Author: Gregg Tavares. URL: https://github.com/greggman/twgl.js. License: MIT.
  - The file keeps the original header: "twgl.js Copyright (c) 2015, Gregg Tavares All Rights Reserved. Available via the MIT license. see: http://github.com/greggman/twgl.js for details".

No other code or shaders are ported from third parties in the pilot.
