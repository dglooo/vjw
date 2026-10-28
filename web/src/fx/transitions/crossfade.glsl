// VeeJay Wizard, 2026
// The pilot's crossfade as a transition (design E7): a straight mix, so fades look as they always have.
vec4 transition(vec2 uv) {
  return mix(getFromColor(uv), getToColor(uv), progress);
}
