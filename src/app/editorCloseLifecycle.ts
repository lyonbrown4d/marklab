type EditorCloseFlusher = () => Promise<void> | void

const snapshotFlushers = new Set<EditorCloseFlusher>()
const bufferFlushers = new Set<EditorCloseFlusher>()
let activeCloseFlush: Promise<void> | null = null

const registerFlusher = (flushers: Set<EditorCloseFlusher>, flusher: EditorCloseFlusher) => {
  flushers.add(flusher)
  return () => {
    flushers.delete(flusher)
  }
}

const runFlushers = (flushers: Set<EditorCloseFlusher>) =>
  Promise.all(Array.from(flushers, (flusher) => Promise.resolve().then(flusher))).then(
    () => undefined,
  )

export const registerEditorSnapshotFlusher = (flusher: EditorCloseFlusher) =>
  registerFlusher(snapshotFlushers, flusher)

export const registerEditorBufferFlusher = (flusher: EditorCloseFlusher) =>
  registerFlusher(bufferFlushers, flusher)

export const flushEditorChangesForClose = (): Promise<void> => {
  if (activeCloseFlush) return activeCloseFlush
  const task = runFlushers(snapshotFlushers).then(() => runFlushers(bufferFlushers))
  const tracked = task.finally(() => {
    if (activeCloseFlush === tracked) activeCloseFlush = null
  })
  activeCloseFlush = tracked
  return tracked
}
