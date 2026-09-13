const LARGE_MARKDOWN_DEFER_CREATE_LIMIT = 30_000

export const scheduleMicrotask = (task: () => void) => {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(task)
    return
  }
  void Promise.resolve().then(task)
}

export const scheduleMarkdownEditorCreate = (markdown: string, task: () => void) => {
  let cancelled = false
  if (markdown.length <= LARGE_MARKDOWN_DEFER_CREATE_LIMIT) {
    let frame: number | null = window.requestAnimationFrame(() => {
      frame = null
      if (!cancelled) task()
    })
    return () => {
      cancelled = true
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }

  let firstFrame: number | null = null
  let secondFrame: number | null = null
  let timer: number | null = null
  firstFrame = window.requestAnimationFrame(() => {
    firstFrame = null
    secondFrame = window.requestAnimationFrame(() => {
      secondFrame = null
      timer = window.setTimeout(() => {
        timer = null
        if (!cancelled) task()
      }, 0)
    })
  })
  return () => {
    cancelled = true
    if (firstFrame !== null) window.cancelAnimationFrame(firstFrame)
    if (secondFrame !== null) window.cancelAnimationFrame(secondFrame)
    if (timer !== null) window.clearTimeout(timer)
  }
}
