export const createMarkdownTableToolbarScheduler = (
  update: () => void,
  requestFrame: typeof window.requestAnimationFrame = window.requestAnimationFrame.bind(window),
  cancelFrame: typeof window.cancelAnimationFrame = window.cancelAnimationFrame.bind(window),
) => {
  let animationFrame: number | null = null

  return {
    cancel: () => {
      if (animationFrame === null) return
      cancelFrame(animationFrame)
      animationFrame = null
    },
    schedule: () => {
      if (animationFrame !== null) return
      animationFrame = requestFrame(() => {
        animationFrame = null
        update()
      })
    },
  }
}
