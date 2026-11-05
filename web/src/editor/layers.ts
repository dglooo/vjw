// The editor's layer stack (2b S2.2), its pure parts: the preview's mute mask and the selection.

/** The selected layer, and one of its effects (null: the layer itself). */
export interface Sel { layer: number; fx: number | null }

/** The preview's mute per layer (design S2, never saved): the layers' own flags, or, with a layer soloed, every other
 *  layer muted and that one not. */
export const muteMask = (muted: readonly boolean[], solo: number | null) => muted.map((m, i) => (solo === null ? m : i !== solo))

/** The selection, clamped to the scene after a removal or an undo: the nearest layer, its nearest effect. */
export function clampSel(layers: readonly { fx: readonly unknown[] }[], { layer, fx }: Sel): Sel {
  layer = Math.min(layer, layers.length - 1)
  const n = layers[layer].fx.length
  return { layer, fx: fx === null || !n ? null : Math.min(fx, n - 1) }
}
