// Source: donor/visual_system_2/scenes/release/raw_video.synScene (main.glsl + scene.json) · unknown
// Author: unknown (the donor's CREDIT is empty: the donor app's own utility scene)
// License: unknown (no licence in the file; shipped inside a commercial app; personal use, ⚠️ check before release)
// VeeJay Wizard, 2026: ported for fx/syn.ts, body unchanged. NEEDS A MEDIA INPUT: it draws _loadMedia() and nothing
// else (a black frame until the adapter feeds media).
/*{
  "TITLE": "Raw Video",
  "CREDIT": "",
  "TAGS": ["media", "utility", "donor"],
  "CONTROLS": [
  ]
}*/
vec4 renderMain(void)
{
    return _loadMedia();
}
