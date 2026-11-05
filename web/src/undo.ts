// Undo/redo (design S3), pure: each edit records its own inverse as a Step where it has the data (the old value, the
// removed node), so undoing never rebuilds the scene. The caller clears `edits` when another scene is edited.

/** `t`: ms, stamped by `record` when absent. `key`: steps with one key, each within 1 s of the last, are one step. */
export interface Step { undo(): void; redo(): void; key?: string; t?: number }

// ponytail: unbounded history (cleared per scene); cap it if a session's steps ever weigh in memory
const done: Step[] = []
const undone: Step[] = []

export const edits = {
  /** A new edit clears redo. With the top step's key, within 1 s of it, it only takes over the top's redo: the top's
   *  undo still goes back to before the first one (a slider drag = one step, however long it lasts). */
  record(s: Step) {
    const top = done.at(-1)
    s.t ??= performance.now()
    if (top && s.key !== undefined && s.key === top.key && s.t - top.t! < 1000) {
      top.redo = s.redo
      top.t = s.t
    } else done.push(s)
    undone.length = 0
  },
  /** False: nothing to undo. */
  undo() {
    const s = done.pop()
    if (!s) return false
    s.undo()
    undone.push(s)
    return true
  },
  /** False: nothing to redo. */
  redo() {
    const s = undone.pop()
    if (!s) return false
    s.redo()
    done.push(s)
    return true
  },
  clear() {
    done.length = undone.length = 0
  },
  /** The step Cmd+Z would undo: the editor's tried block is pending while its add is still this (2b S3.1). */
  top: () => done.at(-1),
}
