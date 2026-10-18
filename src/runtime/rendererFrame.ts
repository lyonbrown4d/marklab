import { isTauriRuntime } from '@/runtime/environment'
import { isTauriWindowVisible } from '@/runtime/tauri/window'
import { rendererDiagnostics } from '@/services/rendererDiagnostics'

const HIDDEN_WINDOW_YIELD_MS = 50

// WKWebView suspends rAF while native startup hides the window. Yield until React
// commits, then let the existing loading-DOM gate wait for editor hydration.
// Re-read visibility because workspace transitions can hide the same renderer.
export const nextRendererFrame = async (): Promise<void> => {
  const hidden =
    isTauriRuntime() &&
    !(await isTauriWindowVisible().catch((error: unknown) => {
      rendererDiagnostics.warn('app.lifecycle', 'frame-visibility-unavailable', error)
      // An unknown visibility must never bypass the real-paint requirement.
      return true
    }))
  await new Promise<void>((resolve) => {
    const pending: { frame?: number; timer?: number } = {}
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      if (pending.frame !== undefined) window.cancelAnimationFrame(pending.frame)
      if (pending.timer !== undefined) window.clearTimeout(pending.timer)
      resolve()
    }
    pending.frame = window.requestAnimationFrame(finish)
    if (settled) window.cancelAnimationFrame(pending.frame)
    else if (hidden) pending.timer = window.setTimeout(finish, HIDDEN_WINDOW_YIELD_MS)
  })
}
