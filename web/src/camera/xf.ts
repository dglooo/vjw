// Cover fit, camera → stage (plan_camera S0.1, the frozen CP0 contract): the returned `xf` satisfies
//   camUv = stageUv * xf.xy + xf.zw
// in stageUv = [0,1]² with x right and y down (image space: the uploaded camera's row 0 is the frame's top
// row, so the sampler flips v before the lookup). Cover = the camera fills the whole stage and the surplus
// is cropped, symmetrically; mirror flips x only (a webcam preview, like a mirror — clips are not mirrored).
export function coverFit(stageW: number, stageH: number, camW: number, camH: number, mirror: boolean): [number, number, number, number] {
  const s = Math.max(stageW / camW, stageH / camH) // camera px per stage px
  const ax = stageW / (s * camW) // the visible camera fraction per axis (≤ 1): the crop
  const ay = stageH / (s * camH)
  const ox = (1 - ax) / 2
  const oy = (1 - ay) / 2
  return mirror ? [-ax, ay, 1 - ox, oy] : [ax, ay, ox, oy]
}
