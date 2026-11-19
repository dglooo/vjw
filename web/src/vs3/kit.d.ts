// The copied donor files (vs3/kit/**/*.js) ship no types, as three does (three/three.d.ts): an import of a `.js` file
// that resolves to no typed source is untyped here. A typed package named *.js (twgl.js) keeps its types: tsc resolves
// it first and reads a pattern module only when that fails.
declare module '*.js'
