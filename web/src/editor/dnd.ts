// Drag and drop in the editor (2b S2.3, design S8): native HTML5, no dependency. The pure parts.

/** A library tile's drag (S3.1): `dataTransfer` carries its block id under this type. */
export const MIME = 'application/x-vjw-block'

/** The insert index for a pointer at `y`: how many row midpoints lie above it (0 above the first row, n below the last). */
export const insertIndex = (y: number, mids: readonly number[]) => mids.filter((m) => m < y).length

/** An insert index into the list as it is → where the dragged row at `from` ends up (`move`'s `to`): an index past it
 *  counts one less once the row is out. `from` and `from + 1` give `from`: no move. */
export const adjustForSource = (idx: number, from: number) => (idx > from ? idx - 1 : idx)
