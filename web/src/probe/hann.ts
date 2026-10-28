// Tiny helper imported by the probe worklet (R5: does a relative TS import survive bundling?).
export const hann = (i: number, n: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)
