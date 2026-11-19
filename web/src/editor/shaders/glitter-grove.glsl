// VeeJay Wizard shader editor example, from donor/vs3 visual_kit/src/lib/shader-examples.js (the friends' copy of
// the Shadertoy source, its licence checked by them 2026-11-12). Credit: Galactic Glitter Grove by mrange. CC0.
// CC0: Galactic Glitter Grove
//  More 4D shenanigans this time using the Kali fractal

void mainImage(out vec4 O, vec2 C) {
  // Get screen resolution
  vec2 R = iResolution.xy;

  // Create a rotation matrix that changes over time
  // This gives the fractal its animated, rotating appearance
  mat2 M = mat2(cos(.1 * iTime + vec4(0, 11, 33, 0)));

  vec4 o = vec4(0.), P, q; // App: o starts at zero
  
  // Main ray marching loop
  for(
    // Declare variables for iteration counters, distances, and scaling
      float i = 0., j, z = 0., d, s, D // App: i and z start at zero
    ; ++i < 55.
    // Increment ray distance for next iteration
    ; z += .6 * d + 1E-3
    ) {

    // Compute 3D position using raydirection and extend to 4D
    q = vec4(normalize(vec3((C + C - R) / R.y, 2)) * z, .5);

    // Move camera to 0,0,-2
    q.z -= 2.;

    // Apply rotation to different planes of the 4D vector
    q.yw *= M;
    q.wx *= M;
    q.zw *= M;

    // Store original rotated position for coloring later
    P = q;

    // Kali fractal magic in 4D
    for(
        // Initialize distance and scaling factor for the fractal iteration
        //  Start iteration at 1. to be able to reuse constant
        d = s = j = 1.
      ; ++j < 9.
      ; s *= D = dot(P, P)
//      , P = abs(P.yzwx) / D - .1 * vec4(7, 9, 5, 5)
      , P = abs(P.ywzx) / D - .1 * vec4(7, 5, 9, 5)
      )
        // Find minimum distance to fractal surface
        d = min(d, length(P) * s)
      ;

    // Create color based on original position
    // The color varies based on position and distance from origin
    P = 1. + cos(.7 * vec4(2, 1, 0, 3. * length(q.xy)) + 1. + 8. * length(q));

    // Accumulate color based on inverse distance (closer = more intense)
    //   Creates a glow.
    //   Apply alpha (P.w)
    o += P.w * P / d;

  }

  // tanh tone map
  // The 3E3 divisor controls the overall brightness of the image
  O = tanh(o / 3E3);
}
