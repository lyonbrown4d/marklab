import { useEffect } from 'react'
import { useLatest } from 'ahooks'
import { APP_EVENT, onAppEvent } from '@/utils/appEvents'

type VimEditorState = {
  activePath: string | null
  workspaceKey: string
  viewMode: string
  onCloseActiveTab: () => void
}

export const useVimEditorCommands = (state: VimEditorState) => {
  const stateRef = useLatest(state)
  useEffect(
    () =>
      onAppEvent(APP_EVENT.closeVimSource, ({ path, workspaceKey }) => {
        const current = stateRef.current
        if (
          current.activePath === path &&
          current.workspaceKey === workspaceKey &&
          current.viewMode === 'source'
        ) {
          current.onCloseActiveTab()
        }
      }),
    [stateRef],
  )
}
