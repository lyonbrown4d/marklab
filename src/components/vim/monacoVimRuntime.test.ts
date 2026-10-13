import type { editor as MonacoEditor } from 'monaco-editor'
import type { VimCommandHandlers } from '@/components/vim/vimCommands'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { attachMonacoVim, loadMonacoVim } from '@/components/vim/monacoVimRuntime'

const vendor = vi.hoisted(() => {
  type Adapter = {
    editor: MonacoEditor.IStandaloneCodeEditor
    attached: boolean
    dispose: () => void
    openNotification: ReturnType<typeof vi.fn>
  }
  const commands = new Map<string, (adapter: Adapter) => void>()
  const inputKeyDown = vi.fn()
  class StatusBar {
    node: HTMLElement
    constructor(node: HTMLElement, editor?: MonacoEditor.IStandaloneCodeEditor) {
      void editor
      this.node = node
      node.append(document.createElement('span'), document.createElement('span'))
    }
    inputKeyDown = inputKeyDown
    closeInput = vi.fn()
    setMode(event: { mode: string; subMode?: string }) {
      this.node.dataset.mode = event.mode
    }
    setSec(text?: Node | string | null) {
      void text
      return this.closeInput
    }
    toggleVisibility(visible: boolean) {
      this.node.hidden = !visible
    }
  }
  const defineEx = vi.fn((name: string, _prefix: string, run: (adapter: Adapter) => void) => {
    commands.set(name, run)
  })
  const VimMode = { Vim: { defineEx } }
  const adapters: Adapter[] = []
  const statuses: StatusBar[] = []
  const initVimMode = vi.fn(
    (
      editor: MonacoEditor.IStandaloneCodeEditor,
      node: HTMLElement,
      Constructor: typeof StatusBar,
    ) => {
      const status = new Constructor(node, editor)
      statuses.push(status)
      status.toggleVisibility(true)
      const adapter: Adapter = {
        editor,
        attached: true,
        openNotification: vi.fn(),
        dispose: vi.fn(() => {
          adapter.attached = false
          status.toggleVisibility(false)
          status.closeInput()
        }),
      }
      adapters.push(adapter)
      return adapter
    },
  )
  return { commands, defineEx, VimMode, StatusBar, initVimMode, adapters, statuses, inputKeyDown }
})
vi.mock('monaco-vim', () => ({
  VimMode: vendor.VimMode,
  StatusBar: vendor.StatusBar,
  initVimMode: vendor.initVimMode,
}))

const makeEditor = () => {
  const keyListeners: ((event: { browserEvent: KeyboardEvent }) => void)[] = []
  const selections = [{ startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 4 }]
  return {
    getSelections: vi.fn(() => selections),
    setSelections: vi.fn(),
    getRawOptions: vi.fn(() => ({ cursorWidth: 3, cursorBlinking: 'smooth', cursorStyle: 'line' })),
    updateOptions: vi.fn(),
    focus: vi.fn(),
    onKeyDown: vi.fn((listener: (event: { browserEvent: KeyboardEvent }) => void) => {
      keyListeners.push(listener)
      return { dispose: vi.fn() }
    }),
    sendKey: (browserEvent: KeyboardEvent) => keyListeners.forEach((run) => run({ browserEvent })),
    selections,
  }
}
const mount = async (
  handlers: VimCommandHandlers = { write: vi.fn(), quit: vi.fn() },
  isCurrent = () => true,
) => {
  const editor = makeEditor()
  const statusNode = document.createElement('div')
  const onMode = vi.fn()
  const dispose = attachMonacoVim({
    plugin: await loadMonacoVim(),
    editor: editor as unknown as MonacoEditor.IStandaloneCodeEditor,
    statusNode,
    handlers,
    isCurrent,
    onMode,
    commandLabel: 'Command',
    searchLabel: 'Search',
  })
  return { editor, dispose, onMode, statusNode, adapter: vendor.adapters.at(-1)! }
}
const settle = async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Monaco Vim vendor bridge', () => {
  it('preserves selections and cursor preferences when toggled, starts in Normal, and reports mode changes', async () => {
    const { editor, dispose, onMode, statusNode } = await mount()
    expect(onMode).toHaveBeenLastCalledWith('NORMAL')
    expect(statusNode.firstElementChild).toHaveTextContent('--NORMAL--')
    expect(editor.setSelections).toHaveBeenCalledWith(editor.selections)
    const status = vendor.statuses.at(-1)!
    status.setMode({ mode: 'visual', subMode: 'linewise' })
    expect(onMode).toHaveBeenLastCalledWith('VISUAL LINE')
    dispose()
    expect(editor.updateOptions).toHaveBeenLastCalledWith({
      cursorWidth: 3,
      cursorBlinking: 'smooth',
      cursorStyle: 'line',
    })
    expect(statusNode.hidden).toBe(true)
    expect(editor.setSelections).toHaveBeenLastCalledWith(editor.selections)
    expect(editor.focus).not.toHaveBeenCalled()
  })

  it('ignores composition keys for Vim without cancelling Monaco input', async () => {
    const { editor, adapter, dispose } = await mount()
    const event = new KeyboardEvent('keydown', {
      key: 'Process',
      isComposing: true,
      cancelable: true,
    })
    editor.sendKey(event)
    expect(adapter.attached).toBe(false)
    expect(event.defaultPrevented).toBe(false)
    await settle()
    expect(adapter.attached).toBe(true)
    editor.sendKey(new KeyboardEvent('keydown', { key: 'i', cancelable: true }))
    expect(adapter.attached).toBe(true)
    editor.sendKey(event)
    dispose()
    await settle()
    expect(adapter.attached).toBe(false)
  })

  it('does not submit command input while IME confirms composition', async () => {
    const { dispose } = await mount()
    const status = vendor.statuses.at(-1)!
    const composing = new KeyboardEvent('keydown', {
      key: 'Enter',
      isComposing: true,
      cancelable: true,
    })
    status.inputKeyDown(composing)
    expect(vendor.inputKeyDown).not.toHaveBeenCalled()
    expect(composing.defaultPrevented).toBe(false)
    status.inputKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(vendor.inputKeyDown).toHaveBeenCalledOnce()
    dispose()
  })

  it('routes Ex commands to the correct editor and reports asynchronous failures', async () => {
    const firstHandlers = { write: vi.fn(), quit: vi.fn() }
    const secondHandlers = {
      write: vi.fn(),
      quit: vi.fn(() => {
        throw new Error('E37')
      }),
    }
    const first = await mount(firstHandlers)
    const second = await mount(secondHandlers)
    vendor.commands.get('write')!(first.adapter)
    vendor.commands.get('quit')!(second.adapter)
    await settle()
    expect(firstHandlers.write).toHaveBeenCalledOnce()
    expect(secondHandlers.write).not.toHaveBeenCalled()
    expect(firstHandlers.quit).not.toHaveBeenCalled()
    expect(second.adapter.openNotification).toHaveBeenCalledWith('E37')
    first.dispose()
    vendor.commands.get('write')!(first.adapter)
    await settle()
    expect(firstHandlers.write).toHaveBeenCalledOnce()
    second.dispose()
  })

  it('serializes :wq, suppresses duplicate writes, and never closes a stale editor', async () => {
    let complete: () => void = () => {}
    let current = true
    const handlers = {
      write: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            complete = resolve
          }),
      ),
      quit: vi.fn(),
    }
    const mounted = await mount(handlers, () => current)
    const run = vendor.commands.get('wq')!
    run(mounted.adapter)
    run(mounted.adapter)
    expect(handlers.write).toHaveBeenCalledOnce()
    expect(handlers.quit).not.toHaveBeenCalled()
    current = false
    complete()
    await settle()
    expect(handlers.quit).not.toHaveBeenCalled()
    mounted.dispose()
  })
})
