import {
  forwardRef,
  lazy,
  memo,
  Suspense,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { SettingsDialogHost, type SettingsDialogHostHandle } from '@/app/SettingsDialogHost'
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'
import type { SettingsSelection } from '@/components/settings/settingsRoutes'

const WorkspacePublicationDialog = lazy(() => import('@/components/WorkspacePublicationDialog'))

export type AppDialogHostsHandle = {
  openSettings: (selection?: SettingsSelection) => void
  openWorkspacePublication: (rootPath: string) => void
}

const AppDialogHostsView = forwardRef<AppDialogHostsHandle>((_, ref) => {
  const settingsRef = useRef<SettingsDialogHostHandle | null>(null)
  const [publicationOpen, setPublicationOpen] = useState(false)
  const [rootPath, setRootPath] = useState('')
  useNativeSurfaceOcclusion('workspace-publication-dialog', publicationOpen, {
    blocksCommandPalette: true,
  })
  const openSettings = useCallback(
    (selection?: SettingsSelection) => settingsRef.current?.openSettings(selection),
    [],
  )
  const openWorkspacePublication = useCallback((nextRootPath: string) => {
    setRootPath(nextRootPath)
    setPublicationOpen(true)
  }, [])
  useImperativeHandle(ref, () => ({ openSettings, openWorkspacePublication }), [
    openSettings,
    openWorkspacePublication,
  ])

  return (
    <>
      <SettingsDialogHost ref={settingsRef} />
      {publicationOpen ? (
        <Suspense fallback={null}>
          <WorkspacePublicationDialog
            onOpenChange={setPublicationOpen}
            open={publicationOpen}
            rootPath={rootPath}
          />
        </Suspense>
      ) : null}
    </>
  )
})

AppDialogHostsView.displayName = 'AppDialogHosts'

export const AppDialogHosts = memo(AppDialogHostsView)
