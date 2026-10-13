import { useKeepAliveContext } from 'keepalive-for-react'
import { useI18n } from '@/i18n/useI18n'
import type { Compartment } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { useEffect, useState, type RefObject } from 'react'
import { flushEditorChanges } from '@/app/editorCloseLifecycle'
import { getVimEditorRoot } from '@/components/vim/vimKeyboardScope'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { useCurrentTabVimModeEnabled } from '@/components/vim/useEditorVimMode'
import { attachCodeMirrorVim, type CodeMirrorVimStatus } from '@/components/vim/codeMirrorVim'

export const useCodeMirrorVim = (
  viewRef: RefObject<EditorView | null>,
  rootRef: RefObject<HTMLDivElement | null>,
  compartment: Compartment,
  onBlurRef: RefObject<() => void>,
  uri: string,
  editorGeneration: unknown,
) => {
  const { t } = useI18n()
  const enabled = useCurrentTabVimModeEnabled()
  const keepAlive = useKeepAliveContext()
  const interactive = !keepAlive.cacheKey || keepAlive.active
  const [status, setStatus] = useState<CodeMirrorVimStatus>('loading')
  useEffect(() => {
    const view = viewRef.current
    const root = rootRef.current
    if (!enabled || !interactive || !view || !root) return
    let active = true
    const isCurrent = () => active && root.isConnected && viewRef.current === view
    const isFocused = () => isCurrent() && getVimEditorRoot(document.activeElement) === root
    const dispose = attachCodeMirrorVim({
      view,
      root,
      compartment,
      isCurrent,
      onStatus: setStatus,
      labels: {
        status: t('editor.vimStatusLabel'),
        command: t('editor.vimCommandLabel'),
        search: t('editor.vimSearchLabel'),
      },
      handlers: {
        write: () => {
          if (isFocused()) return flushEditorChanges()
        },
        quit: async () => {
          if (!isFocused()) return
          const workspace = useWorkspaceStore.getState()
          await flushEditorChanges()
          const currentWorkspace = useWorkspaceStore.getState()
          if (
            isFocused() &&
            workspace.activeTabId === currentWorkspace.activeTabId &&
            workspace.rootPath === currentWorkspace.rootPath &&
            workspace.rootKind === currentWorkspace.rootKind
          )
            onBlurRef.current()
        },
      },
    })
    return () => {
      dispose()
      active = false
    }
  }, [compartment, enabled, onBlurRef, rootRef, uri, viewRef, editorGeneration, interactive, t])
  return enabled && interactive ? status : null
}
