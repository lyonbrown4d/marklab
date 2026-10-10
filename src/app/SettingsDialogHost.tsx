import { forwardRef, lazy, memo, Suspense, useCallback, useImperativeHandle, useState } from 'react'
import SettingsDialogFallback from '@/components/SettingsDialogFallback'
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'
import type { SettingsSelection } from '@/components/settings/settingsRoutes'

const SettingsDialog = lazy(() => import('@/components/SettingsDialog'))

export type SettingsDialogHostHandle = {
  openSettings: (selection?: SettingsSelection) => void
}

const SettingsDialogHostView = forwardRef<SettingsDialogHostHandle>((_, ref) => {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [initialSelection, setInitialSelection] = useState<SettingsSelection | undefined>()
  useNativeSurfaceOcclusion('settings-dialog', settingsOpen, { blocksCommandPalette: true })
  const openSettings = useCallback((selection?: SettingsSelection) => {
    setInitialSelection(selection)
    setSettingsOpen(true)
  }, [])
  useImperativeHandle(ref, () => ({ openSettings }), [openSettings])

  return settingsOpen ? (
    <Suspense
      fallback={<SettingsDialogFallback open={settingsOpen} onOpenChange={setSettingsOpen} />}
    >
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialSelection={initialSelection}
      />
    </Suspense>
  ) : null
})

SettingsDialogHostView.displayName = 'SettingsDialogHost'

export const SettingsDialogHost = memo(SettingsDialogHostView)
