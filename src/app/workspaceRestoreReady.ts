import { signalRendererReady } from '@/runtime/rendererLifecycle'
import { rendererDiagnostics } from '@/services/rendererDiagnostics'
import type { RendererReadySignal } from '@/types/rendererReady'

export const reportWorkspaceRendererReady = async (signal: RendererReadySignal): Promise<void> => {
  try {
    await signalRendererReady(signal)
  } catch (error) {
    rendererDiagnostics.error('app.lifecycle', 'workspace-ready-signal-failed', error)
  }
}
