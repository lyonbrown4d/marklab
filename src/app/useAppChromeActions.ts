import { useCallback } from 'react'
import type { AppDialogHostsHandle } from '@/app/AppDialogHosts'
import type { SettingsDialogHostHandle } from '@/app/SettingsDialogHost'
import type { TitlebarHandle } from '@/components/Titlebar'
import type { SettingsSelection } from '@/components/settings/settingsRoutes'

type ChromeActionState = {
  activePath: string | null
  rootPath?: string
  editorReadOnlyMode: boolean
  showEditorStatusBar: boolean
  setEditorReadOnlyMode: (value: boolean) => void
  setShowEditorStatusBar: (value: boolean) => void
  setViewMode: (mode: 'wysiwyg') => void
}

type UseAppChromeActionsOptions = {
  titlebarRef: { current: TitlebarHandle | null }
  settingsDialogRef: {
    current: (SettingsDialogHostHandle & Partial<AppDialogHostsHandle>) | null
  }
  stateRef: { readonly current: ChromeActionState }
}

export const useAppChromeActions = ({
  titlebarRef,
  settingsDialogRef,
  stateRef,
}: UseAppChromeActionsOptions) => {
  const openCommandPalette = useCallback(
    () => titlebarRef.current?.openCommandPalette(),
    [titlebarRef],
  )
  const openSettings = useCallback(
    (selection?: SettingsSelection) => settingsDialogRef.current?.openSettings(selection),
    [settingsDialogRef],
  )
  const openWorkspacePublication = useCallback(() => {
    const rootPath = stateRef.current.rootPath
    if (rootPath) settingsDialogRef.current?.openWorkspacePublication?.(rootPath)
  }, [settingsDialogRef, stateRef])
  const toggleReadOnly = useCallback(() => {
    const state = stateRef.current
    const nextReadOnly = !state.editorReadOnlyMode
    state.setEditorReadOnlyMode(nextReadOnly)
    if (nextReadOnly && state.activePath) state.setViewMode('wysiwyg')
  }, [stateRef])
  const toggleStatusBar = useCallback(() => {
    const state = stateRef.current
    state.setShowEditorStatusBar(!state.showEditorStatusBar)
  }, [stateRef])

  return {
    openCommandPalette,
    openSettings,
    openWorkspacePublication,
    toggleReadOnly,
    toggleStatusBar,
  }
}
