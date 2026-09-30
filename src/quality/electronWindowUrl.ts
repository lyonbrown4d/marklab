export const isMainRendererUrl = (candidateUrl: string, rendererUrl: string): boolean => {
  try {
    const candidate = new URL(candidateUrl)
    const renderer = new URL(rendererUrl)
    return candidate.origin === renderer.origin && ['/', '/index.html'].includes(candidate.pathname)
  } catch {
    return false
  }
}
