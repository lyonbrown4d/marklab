import { useCallback } from 'react'
import type { SettingsDialogHostHandle } from '@/app/SettingsDialogHost'
import type { TitlebarHandle } from '@/components/Titlebar'
import type { SettingsSelection } from '@/components/settings/settingsRoutes'

type ChromeActionState = {
  activePath: string | null
  editorReadOnlyMode: boolean
  showEditorStatusBar: boolean
  setEditorReadOnlyMode: (value: boolean) => void
  setShowEditorStatusBar: (value: boolean) => void
  setViewMode: (mode: 'wysiwyg') => void
}

type UseAppChromeActionsOptions = {
  titlebarRef: { current: TitlebarHandle | null }
  settingsDialogRef: { current: SettingsDialogHostHandle | null }
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

  return { openCommandPalette, openSettings, toggleReadOnly, toggleStatusBar }
}
