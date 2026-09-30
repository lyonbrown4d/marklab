import { forwardRef, lazy, memo, Suspense, useCallback, useImperativeHandle, useState } from 'react'
import SettingsDialogFallback from '@/components/SettingsDialogFallback'

const SettingsDialog = lazy(() => import('@/components/SettingsDialog'))

export type SettingsDialogHostHandle = {
  openSettings: () => void
}

const SettingsDialogHostView = forwardRef<SettingsDialogHostHandle>((_, ref) => {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  useImperativeHandle(ref, () => ({ openSettings }), [openSettings])

  return settingsOpen ? (
    <Suspense
      fallback={<SettingsDialogFallback open={settingsOpen} onOpenChange={setSettingsOpen} />}
    >
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </Suspense>
  ) : null
})

SettingsDialogHostView.displayName = 'SettingsDialogHost'

export const SettingsDialogHost = memo(SettingsDialogHostView)
