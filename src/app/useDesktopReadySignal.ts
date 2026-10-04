import { useEffect } from 'react'
import { signalAppReady } from '@/runtime/app'
import { isDesktopRuntime } from '@/runtime/environment'
import { rendererDiagnostics } from '@/services/rendererDiagnostics'

const READY_TIMEOUT_MS = 900

const nextFrame = () =>
  new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })

const waitForFirstStablePaint = async () => {
  await nextFrame()
  await nextFrame()

  const fonts = document.fonts
  if (!fonts) return

  await Promise.race([
    fonts.ready.then(() => undefined),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, READY_TIMEOUT_MS)
    }),
  ])
}

export const useDesktopReadySignal = () => {
  useEffect(() => {
    if (!isDesktopRuntime()) return

    let cancelled = false
    void waitForFirstStablePaint()
      .then(async () => {
        if (cancelled) return
        if (!cancelled) {
          await signalAppReady()
        }
      })
      .catch((error) => {
        rendererDiagnostics.error('app.lifecycle', 'ready-signal-failed', error)
      })

    return () => {
      cancelled = true
    }
  }, [])
}
