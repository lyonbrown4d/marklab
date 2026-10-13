import type { editor as MonacoEditor } from 'monaco-editor'
import type { VimAdapterInstance } from 'monaco-vim'
import { isImeKeyboardEvent } from '@/logic/ime'
import { sanitizeMonacoVimStatus } from '@/components/vim/monacoVimStatusSanitizer'
import {
  createVimCommandRunner,
  type VimCommand,
  type VimCommandHandlers,
} from '@/components/vim/vimCommands'

type VimAdapter = VimAdapterInstance & {
  editor: MonacoEditor.IStandaloneCodeEditor
  attached: boolean
}

type MonacoVim = typeof import('monaco-vim')
type VimApi = {
  defineEx: (name: string, prefix: string, run: (adapter: VimAdapterInstance) => void) => void
}
const sessions = new WeakMap<MonacoEditor.IStandaloneCodeEditor, (command: VimCommand) => void>()
const configured = new WeakSet<object>()

const configureCommands = (plugin: MonacoVim) => {
  if (configured.has(plugin.VimMode)) return
  // The package exposes Vim at runtime but omits it from its generated declarations.
  const vim = (plugin.VimMode as unknown as { Vim: VimApi }).Vim
  const define = (name: string, prefix: string, command: VimCommand) =>
    vim.defineEx(name, prefix, (adapter) => {
      sessions.get((adapter as VimAdapter).editor)?.(command)
    })
  define('write', 'w', 'write')
  define('quit', 'q', 'quit')
  define('wq', 'wq', 'writeQuit')
  define('xit', 'x', 'writeQuit')
  configured.add(plugin.VimMode)
}

export const loadMonacoVim = async () => {
  const plugin = await import('monaco-vim')
  configureCommands(plugin)
  return plugin
}

export const attachMonacoVim = ({
  plugin,
  editor,
  statusNode,
  handlers,
  isCurrent,
  onMode,
  commandLabel,
  searchLabel,
}: {
  plugin: MonacoVim
  editor: MonacoEditor.IStandaloneCodeEditor
  statusNode: HTMLElement
  handlers: VimCommandHandlers
  isCurrent: () => boolean
  onMode: (mode: string) => void
  commandLabel: string
  searchLabel: string
}): (() => void) => {
  class StatusBar extends plugin.StatusBar {
    constructor(node: HTMLElement, host: MonacoEditor.IStandaloneCodeEditor) {
      // Vendor disposal closes its input. Avoid focusing an inactive/disposed editor.
      super(node, null, sanitizeMonacoVimStatus)
      node.lastElementChild?.removeAttribute('style')
      node.firstElementChild?.setAttribute('aria-live', 'polite')
      const inputKeyDown = this.inputKeyDown
      this.inputKeyDown = (event) => {
        if (isImeKeyboardEvent(event)) return
        inputKeyDown(event)
      }
      const closeInput = this.closeInput
      this.closeInput = () => {
        closeInput()
        if (!node.hidden && isCurrent()) host.focus()
      }
    }

    override setMode(event: Parameters<MonacoVim['StatusBar']['prototype']['setMode']>[0]) {
      super.setMode(event)
      onMode(
        event.mode === 'visual' && event.subMode
          ? `VISUAL ${event.subMode === 'linewise' ? 'LINE' : 'BLOCK'}`
          : event.mode.toUpperCase(),
      )
    }

    override setSec(...args: Parameters<MonacoVim['StatusBar']['prototype']['setSec']>) {
      const close = super.setSec(...args)
      const input = statusNode.querySelector('input')
      input?.setAttribute(
        'aria-label',
        statusNode.textContent?.trim().includes(':') ? commandLabel : searchLabel,
      )
      return close
    }

    override toggleVisibility(visible: boolean) {
      super.toggleVisibility(visible)
      statusNode.style.removeProperty('display')
      statusNode.hidden = !visible
    }
  }
  const selections = editor.getSelections()
  const options = editor.getRawOptions()
  let adapter: VimAdapter | null = null
  let alive = true
  // The vendor listener has no IME guard. Let Monaco receive composition keys
  // while suspending only Vim's listener for this event, without cancelling it.
  const imeGuard = editor.onKeyDown(({ browserEvent }) => {
    if (!adapter || !adapter.attached) return
    // keyCode 229 covers native IME events whose composition flag is missing.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    if (!isImeKeyboardEvent(browserEvent) && browserEvent.keyCode !== 229) return
    const current = adapter
    current.attached = false
    queueMicrotask(() => {
      if (alive) current.attached = true
    })
  })
  try {
    adapter = plugin.initVimMode(editor, statusNode, StatusBar) as VimAdapter
  } catch (error) {
    alive = false
    imeGuard.dispose()
    throw error
  }
  if (selections) editor.setSelections(selections)
  // A new adapter starts in Normal; do not mutate or recreate the text model.
  const modeNode = statusNode.firstElementChild
  if (modeNode) modeNode.textContent = '--NORMAL--'
  onMode('NORMAL')
  const session = createVimCommandRunner({
    handlers,
    isCurrent,
    onError: (error) =>
      adapter?.openNotification(error instanceof Error ? error.message : String(error)),
  })
  sessions.set(editor, session)
  return () => {
    if (sessions.get(editor) === session) sessions.delete(editor)
    const currentSelections = editor.getSelections()
    alive = false
    imeGuard.dispose()
    adapter?.dispose()
    editor.updateOptions({
      cursorBlinking: options.cursorBlinking ?? 'blink',
      cursorStyle: options.cursorStyle ?? 'line',
      cursorWidth: options.cursorWidth ?? 2,
    })
    if (currentSelections) editor.setSelections(currentSelections)
  }
}
