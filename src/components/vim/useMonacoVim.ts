import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useI18n } from '@/i18n/useI18n'
import type { editor as MonacoEditor } from 'monaco-editor'
import { attachMonacoVim, loadMonacoVim } from '@/components/vim/monacoVimRuntime'
import { registerVimKeyboardScope, reportVimMode } from '@/components/vim/vimKeyboardScope'
import { registerVimCommandPanel } from '@/components/vim/vimCommandDock'
import type { VimCommandHandlers } from '@/components/vim/vimCommands'

type MonacoVimOptions = {
  editor: MonacoEditor.IStandaloneCodeEditor | null
  enabled: boolean
  interactive: boolean
  modelKey: string
  rootRef: RefObject<HTMLDivElement | null>
  statusRef: RefObject<HTMLDivElement | null>
  acceptsChanges: () => boolean
  createCommands: (isCurrent: () => boolean) => VimCommandHandlers
}

export const useMonacoVim = ({
  editor,
  enabled,
  interactive,
  modelKey,
  rootRef,
  statusRef,
  acceptsChanges,
  createCommands,
}: MonacoVimOptions) => {
  const { t } = useI18n()
  const [modelVersion, setModelVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const optionsRef = useRef({ acceptsChanges, createCommands, t })
  useLayoutEffect(() => {
    optionsRef.current = { acceptsChanges, createCommands, t }
  })

  useLayoutEffect(() => {
    if (!editor || !enabled || !interactive) return
    const root = rootRef.current
    const statusNode = statusRef.current
    if (!root || !statusNode) return
    let cancelled = false
    let dispose: (() => void) | undefined
    const model = editor.getModel()
    const isCurrent = () =>
      !cancelled && editor.getModel() === model && optionsRef.current.acceptsChanges()
    const stop = () => {
      cancelled = true
      dispose?.()
      dispose = undefined
    }
    const modelSubscription = editor.onDidChangeModel(() => {
      stop()
      setModelVersion((version) => version + 1)
    })
    const disposalSubscription = editor.onDidDispose(stop)
    // KeepAlive enables editing on its next animation frame; attach after that gate.
    const frame = window.requestAnimationFrame(() => {
      setError(null)
      void loadMonacoVim()
        .then((plugin) => {
          if (!isCurrent()) return
          const handlers: VimCommandHandlers = {
            write: () => optionsRef.current.createCommands(isCurrent).write(),
            quit: () => optionsRef.current.createCommands(isCurrent).quit(),
          }
          const detach = attachMonacoVim({
            plugin,
            editor,
            statusNode,
            handlers,
            isCurrent,
            commandLabel: optionsRef.current.t('editor.vimCommandLabel'),
            searchLabel: optionsRef.current.t('editor.vimSearchLabel'),
            onMode: (mode) => reportVimMode(root, mode),
          })
          const releaseScope = registerVimKeyboardScope(root)
          const releaseDock = registerVimCommandPanel(root, statusNode)
          dispose = () => {
            releaseDock()
            releaseScope()
            detach()
          }
        })
        .catch((cause: unknown) => {
          if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
        })
    })
    return () => {
      stop()
      window.cancelAnimationFrame(frame)
      modelSubscription.dispose()
      disposalSubscription.dispose()
    }
  }, [editor, enabled, interactive, modelKey, modelVersion, rootRef, statusRef])

  return enabled && interactive ? error : null
}
