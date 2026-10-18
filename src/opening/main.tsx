import { createRoot } from 'react-dom/client'
import { WorkspaceOpeningSurface } from '@/components/loading/WorkspaceOpeningSurface'
import { getDesktopRuntime } from '@/runtime/desktop'
import { initializeDesktopRuntime } from '@/runtime/tauri'
import '@/splash/splash.scss'

await initializeDesktopRuntime()
await getDesktopRuntime().appReady({ phase: 'shell' })

// The loading document has no editor buffers; keep the native close barrier ready
// until navigation transfers that responsibility to the workspace application.
const unlistenClose = getDesktopRuntime().window.onCloseRequested(() => undefined)
window.addEventListener('pagehide', unlistenClose, { once: true })

const root = document.getElementById('opening-root')
if (!root) throw new Error('Window opening root is missing.')

createRoot(root).render(<WorkspaceOpeningSurface standalone />)
