type CancelScheduledSnapshot = () => void

type ScheduleSnapshot = (callback: () => void) => CancelScheduledSnapshot

type MarkdownSnapshotSchedulerOptions<Document> = {
  commit: (markdown: string) => void
  schedule?: ScheduleSnapshot
  serialize: (document: Document) => string
}

type RendererIdleWindow = Window & {
  cancelIdleCallback?: (handle: number) => void
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
}

const FALLBACK_SNAPSHOT_DELAY_MS = 500

export const scheduleRendererIdleSnapshot: ScheduleSnapshot = (callback) => {
  const rendererWindow = window as RendererIdleWindow
  if (rendererWindow.requestIdleCallback && rendererWindow.cancelIdleCallback) {
    let completed = false
    let idleHandle: number | null = null
    let fallbackHandle: number | null = null
    const cancel = () => {
      if (idleHandle !== null) rendererWindow.cancelIdleCallback?.(idleHandle)
      if (fallbackHandle !== null) window.clearTimeout(fallbackHandle)
    }
    const run = () => {
      if (completed) return
      completed = true
      cancel()
      callback()
    }
    idleHandle = rendererWindow.requestIdleCallback(run, {
      timeout: FALLBACK_SNAPSHOT_DELAY_MS,
    })
    if (completed) rendererWindow.cancelIdleCallback(idleHandle)
    else fallbackHandle = window.setTimeout(run, FALLBACK_SNAPSHOT_DELAY_MS)
    return () => {
      completed = true
      cancel()
    }
  }

  const handle = window.setTimeout(callback, 280)
  return () => window.clearTimeout(handle)
}

export const createMarkdownSnapshotScheduler = <Document>({
  commit,
  schedule = scheduleRendererIdleSnapshot,
  serialize,
}: MarkdownSnapshotSchedulerOptions<Document>) => {
  let cancelScheduled: CancelScheduledSnapshot | null = null
  let pendingDocument: Document | null = null

  const cancelTask = () => {
    cancelScheduled?.()
    cancelScheduled = null
  }

  const flush = () => {
    cancelTask()
    const document = pendingDocument
    if (document === null) return
    pendingDocument = null
    commit(serialize(document))
  }

  return {
    cancel: () => {
      cancelTask()
      pendingDocument = null
    },
    flush,
    update: (document: Document) => {
      pendingDocument = document
      cancelTask()
      cancelScheduled = schedule(() => {
        cancelScheduled = null
        flush()
      })
    },
  }
}
