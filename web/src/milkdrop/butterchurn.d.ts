// web/src/milkdrop/butterchurn.d.ts — only what we call (3.0.0-beta.5); the installed dist is the source of truth
// (node_modules/butterchurn/dist/butterchurn.js, plan_milkdrop S1.1). Upstream ships no types.
declare module 'butterchurn' {
  interface Levels { timeByteArray: Uint8Array; timeByteArrayL: Uint8Array; timeByteArrayR: Uint8Array }
  interface Size { pixelRatio: number; textureRatio: number; meshWidth?: number; meshHeight?: number }
  export interface Visualizer {
    loadPreset(preset: object, blendTime: number): Promise<void>
    // elapsedTime = seconds since the previous frame (dt); 0/omitted → its own performance.now() clock (dist :11199)
    render(opts: { audioLevels: Levels; elapsedTime: number }): void
    setRendererSize(width: number, height: number, opts: Size): void
    readonly internalCanvas: OffscreenCanvas // undocumented (G2): boot check
    // undocumented (milk-sync): the levels its render() computes first (dist :11655), then reads into the equations
    readonly renderer: { readonly audioLevels: { val: Float32Array; att: Float32Array; updateAudioLevels(fps: number, frame: number): void } }
  }
  const butterchurn: { createVisualizer(ctx: AudioContext, canvas: HTMLCanvasElement, opts: { width: number; height: number } & Size): Visualizer }
  export default butterchurn
}
