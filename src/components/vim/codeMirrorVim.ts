import type { Compartment } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { CM5EditorInterface } from '@replit/codemirror-vim'
import {
  executeVimCommand,
  type VimCommand,
  type VimCommandHandlers,
} from '@/components/vim/vimCommands'
import { registerVimCommandPanel } from '@/components/vim/vimCommandDock'
import { registerVimKeyboardScope, reportVimMode } from '@/components/vim/vimKeyboardScope'

type VimModule = typeof import('@replit/codemirror-vim')
export type CodeMirrorVimStatus = 'loading' | 'ready' | 'loadError' | 'commandError'
type CommandSession = {
  handlers: VimCommandHandlers
  reportError: (error: unknown) => void
  pending: boolean
}
const sessions = new WeakMap<CM5EditorInterface, CommandSession>()
const configured = new WeakSet<VimModule['Vim']>()

const configureCommands = (module: VimModule) => {
  if (configured.has(module.Vim)) return
  configured.add(module.Vim)
  const commands: [string, string, VimCommand][] = [
    ['write', 'w', 'write'],
    ['quit', 'q', 'quit'],
    ['wq', 'wq', 'writeQuit'],
    ['xit', 'x', 'writeQuit'],
  ]
  for (const [name, prefix, command] of commands) {
    module.Vim.defineEx(name, prefix, (cm) => {
      const session = sessions.get(cm)
      if (!session || session.pending) return
      session.pending = true
      void executeVimCommand(command, session.handlers)
        .catch(session.reportError)
        .finally(() => {
          session.pending = false
        })
    })
  }
}

// Library-owned dialog markup is updated whenever Vim opens search or Ex input.
type PanelLabels = { status: string; command: string; search: string }
const defaultLabels: PanelLabels = {
  status: 'Vim mode and command line',
  command: 'Vim command',
  search: 'Vim search',
}
const decoratePanel = (panel: HTMLElement, labels: PanelLabels) => {
  panel.classList.add(
    'border-t',
    'border-border',
    'bg-muted',
    'px-3',
    'py-1',
    'text-xs',
    'text-foreground',
  )
  panel.setAttribute('aria-label', labels.status)
  panel.setAttribute('role', 'status')
  panel.setAttribute('aria-live', 'polite')
  const input = panel.querySelector('input')
  if (input) {
    input.setAttribute(
      'aria-label',
      panel.textContent?.trim().startsWith(':') ? labels.command : labels.search,
    )
    input.classList.add(
      'bg-background',
      'text-foreground',
      'outline-none',
      'focus-visible:ring-1',
      'focus-visible:ring-ring',
    )
  }
}

export const attachCodeMirrorVim = ({
  view,
  compartment,
  root,
  handlers,
  isCurrent,
  onStatus,
  labels = defaultLabels,
  load = () => import('@replit/codemirror-vim'),
}: {
  view: EditorView
  compartment: Compartment
  root: HTMLElement
  handlers: VimCommandHandlers
  isCurrent: () => boolean
  onStatus: (status: CodeMirrorVimStatus) => void
  labels?: PanelLabels
  load?: () => Promise<VimModule>
}): (() => void) => {
  let disposed = false
  let removeScope: (() => void) | undefined
  let observer: MutationObserver | undefined
  let removeDock: (() => void) | undefined
  let cm: CM5EditorInterface | null = null
  const modeChanged = (event: { mode: string; subMode?: string }) => {
    if (current())
      reportVimMode(root, event.subMode ? `${event.mode} ${event.subMode}` : event.mode)
  }
  const current = () => !disposed && isCurrent()
  const reportError = () => {
    if (current()) onStatus('commandError')
  }
  onStatus('loading')
  void load()
    .then((module) => {
      if (!current()) return
      configureCommands(module)
      view.dispatch({ effects: compartment.reconfigure(module.vim({ status: true })) })
      cm = module.getCM(view)
      if (!cm) throw new Error('Vim editor adapter is unavailable')
      const guardedHandlers: VimCommandHandlers = {
        write: () => {
          if (current()) return handlers.write()
        },
        quit: () => {
          if (current()) return handlers.quit()
        },
      }
      sessions.set(cm, { handlers: guardedHandlers, reportError, pending: false })
      removeScope = registerVimKeyboardScope(root)
      cm.on('vim-mode-change', modeChanged)
      reportVimMode(root, 'normal')
      const panel = view.dom.querySelector<HTMLElement>('.cm-vim-panel')
      if (panel) {
        removeDock = registerVimCommandPanel(root, panel)
        observer = new MutationObserver(() => decoratePanel(panel, labels))
        observer.observe(panel, { childList: true, subtree: true })
        decoratePanel(panel, labels)
      }
      onStatus('ready')
    })
    .catch(() => {
      if (current()) onStatus('loadError')
    })
  return () => {
    disposed = true
    if (cm) {
      cm.off('vim-mode-change', modeChanged)
      sessions.delete(cm)
    }
    observer?.disconnect()
    removeDock?.()
    removeScope?.()
    if (isCurrent()) view.dispatch({ effects: compartment.reconfigure([]) })
  }
}
