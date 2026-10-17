import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readClipboardText } from '@/runtime/clipboard'
import {
  clearFocusedCodeEditor,
  executeFocusedCodeEditorCommand,
  setFocusedCodeEditor,
} from '@/lib/focusedCodeEditor'

const native = vi.hoisted(() => ({
  tauri: true,
  platform: 'macos',
  windowFocused: true,
  warn: vi.fn(),
}))
vi.mock('@/runtime/environment', () => ({
  isTauriRuntime: () => native.tauri,
  inferPlatformFromUserAgent: () => native.platform,
}))
vi.mock('@/runtime/clipboard', () => ({ readClipboardText: vi.fn() }))
vi.mock('@/services/rendererDiagnostics', () => ({ rendererDiagnostics: { warn: native.warn } }))

const deferred = () => {
  let resolve!: (text: string) => void
  const promise = new Promise<string>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}
const createEditor = () => {
  const listeners = new Set<(event: never) => void>()
  const root = document.createElement('div')
  let version = 1
  let focused = true
  let disposed = false
  let readOnly = false
  let selection = 1
  let content = ''
  const model = { getVersionId: () => version, isDisposed: () => disposed }
  let currentModel: typeof model | null = model
  const editor = {
    focus: vi.fn(),
    trigger: vi.fn((_source: string, command: string, payload?: { text?: string } | null) => {
      if (command === 'paste' && payload?.text) {
        content += payload.text
        version += 1
        selection += 1
      }
    }),
    getValue: () => content,
    getModel: () => currentModel,
    getDomNode: () => root,
    onKeyDown: (receive: (event: never) => void) => {
      listeners.add(receive)
      return {
        dispose: () => {
          listeners.delete(receive)
        },
      }
    },
    getSelections: () => {
      const captured = selection
      return [
        {
          column: captured,
          equalsSelection: (other: { column: number }) => other.column === captured,
        },
      ]
    },
    hasTextFocus: () => focused,
    getRawOptions: () => ({ readOnly }),
  }
  setFocusedCodeEditor(editor as never)
  return {
    editor,
    root,
    press: (options: KeyboardEventInit, alreadyHandled = false) => {
      const browserEvent = new KeyboardEvent('keydown', { key: 'v', cancelable: true, ...options })
      if (alreadyHandled) browserEvent.preventDefault()
      const event = {
        browserEvent,
        preventDefault: vi.fn(() => browserEvent.preventDefault()),
        stopPropagation: vi.fn(),
      }
      listeners.forEach((receive) => receive(event as never))
      return event
    },
    change: (kind: string) => {
      if (kind === 'model') currentModel = null
      if (kind === 'version') version += 1
      if (kind === 'selection') selection += 1
      if (kind === 'focus') focused = false
      if (kind === 'window-focus') native.windowFocused = false
      if (kind === 'disposed') disposed = true
      if (kind === 'read-only') readOnly = true
      if (kind === 'owner') clearFocusedCodeEditor(editor as never)
    },
  }
}
const finish = async () => {
  await Promise.resolve()
  await Promise.resolve()
}
beforeEach(() => {
  native.tauri = true
  native.platform = 'macos'
  native.windowFocused = true
  vi.spyOn(document, 'hasFocus').mockImplementation(() => native.windowFocused)
  native.warn.mockClear()
  vi.mocked(readClipboardText).mockReset()
})
afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('focused source editor clipboard', () => {
  it('pastes once with macOS Meta+V in a Vim editor and preserves Ctrl+V', async () => {
    vi.mocked(readClipboardText).mockResolvedValue('Vim clipboard')
    const source = createEditor()
    source.root.dataset.vimActive = 'true'
    source.root.dataset.vimMode = 'NORMAL'
    const paste = source.press({ metaKey: true })
    const visual = source.press({ ctrlKey: true })
    await finish()
    expect(paste.preventDefault).toHaveBeenCalledOnce()
    expect(visual.preventDefault).not.toHaveBeenCalled()
    expect(readClipboardText).toHaveBeenCalledOnce()
    expect(source.editor.trigger).toHaveBeenCalledExactlyOnceWith('marklab.editMenu', 'paste', {
      text: 'Vim clipboard',
    })
    clearFocusedCodeEditor(source.editor as never)
  })

  it.each(['NORMAL', 'VISUAL'])('preserves non-macOS Vim Ctrl+V in %s mode', (mode) => {
    native.platform = 'windows'
    const source = createEditor()
    source.root.dataset.vimActive = 'true'
    source.root.dataset.vimMode = mode
    expect(source.press({ ctrlKey: true }).preventDefault).not.toHaveBeenCalled()
    expect(readClipboardText).not.toHaveBeenCalled()
    clearFocusedCodeEditor(source.editor as never)
  })

  it('does not intercept cancelled, composing or modified paste keys', () => {
    const source = createEditor()
    for (const event of [
      source.press({ metaKey: true }, true),
      source.press({ metaKey: true, isComposing: true }),
      source.press({ metaKey: true, shiftKey: true }),
    ])
      expect(event.preventDefault).not.toHaveBeenCalled()
    expect(readClipboardText).not.toHaveBeenCalled()
    clearFocusedCodeEditor(source.editor as never)
  })

  it('releases the previous owner shortcut and the final owner on cleanup', () => {
    const previous = createEditor()
    const current = createEditor()
    previous.press({ metaKey: true })
    clearFocusedCodeEditor(current.editor as never)
    current.press({ metaKey: true })
    expect(readClipboardText).not.toHaveBeenCalled()
  })

  it('uses native Tauri clipboard text for one Unicode multiline Monaco paste', async () => {
    vi.mocked(readClipboardText).mockResolvedValue('中文 😀\nsecond line')
    const { editor } = createEditor()
    expect(executeFocusedCodeEditorCommand('edit.paste')).toBe(true)
    await finish()
    expect(editor.trigger).toHaveBeenCalledExactlyOnceWith('marklab.editMenu', 'paste', {
      text: '中文 😀\nsecond line',
    })
  })

  it('serializes explicit pastes after Monaco updates the model version and cursor', async () => {
    const first = deferred()
    const second = deferred()
    vi.mocked(readClipboardText)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { editor } = createEditor()
    executeFocusedCodeEditorCommand('edit.paste')
    executeFocusedCodeEditorCommand('edit.paste')
    expect(readClipboardText).toHaveBeenCalledOnce()
    first.resolve('first')
    await finish()
    expect(editor.getValue()).toBe('first')
    expect(readClipboardText).toHaveBeenCalledTimes(2)
    second.resolve(' second')
    await finish()
    expect(editor.getValue()).toBe('first second')
    expect(editor.trigger).toHaveBeenCalledTimes(2)
  })

  it.each([
    'model',
    'version',
    'selection',
    'focus',
    'window-focus',
    'disposed',
    'read-only',
    'owner',
  ])('cancels the pending paste and queued batch after %s changes', async (kind) => {
    const read = deferred()
    vi.mocked(readClipboardText).mockReturnValue(read.promise)
    const source = createEditor()
    executeFocusedCodeEditorCommand('edit.paste')
    executeFocusedCodeEditorCommand('edit.paste')
    source.change(kind)
    read.resolve('stale clipboard')
    await finish()
    expect(source.editor.trigger).not.toHaveBeenCalled()
    expect(readClipboardText).toHaveBeenCalledOnce()
  })

  it('cancels an old owner batch even when the same editor becomes owner again', async () => {
    const stale = deferred()
    const fresh = deferred()
    vi.mocked(readClipboardText)
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(fresh.promise)
    const source = createEditor()
    executeFocusedCodeEditorCommand('edit.paste')
    executeFocusedCodeEditorCommand('edit.paste')
    createEditor()
    setFocusedCodeEditor(source.editor as never)
    executeFocusedCodeEditorCommand('edit.paste')
    stale.resolve('stale')
    await finish()
    expect(source.editor.trigger).not.toHaveBeenCalled()
    fresh.resolve('fresh')
    await finish()
    expect(source.editor.getValue()).toBe('fresh')
    expect(readClipboardText).toHaveBeenCalledTimes(2)
  })

  it('does not recapture a different cursor between successful queued pastes', async () => {
    const first = deferred()
    vi.mocked(readClipboardText).mockReturnValueOnce(first.promise).mockResolvedValue('stale')
    const source = createEditor()
    const apply = source.editor.trigger.getMockImplementation()
    source.editor.trigger.mockImplementation((...args) => {
      apply?.(...args)
      queueMicrotask(() => source.change('selection'))
    })
    executeFocusedCodeEditorCommand('edit.paste')
    executeFocusedCodeEditorCommand('edit.paste')
    first.resolve('first')
    await finish()
    expect(source.editor.getValue()).toBe('first')
    expect(readClipboardText).toHaveBeenCalledOnce()
  })

  it('bounds queued requests without retaining extra clipboard buffers', async () => {
    const first = deferred()
    vi.mocked(readClipboardText).mockReturnValueOnce(first.promise).mockResolvedValue('x')
    const { editor } = createEditor()
    for (let index = 0; index < 100; index += 1) executeFocusedCodeEditorCommand('edit.paste')
    expect(readClipboardText).toHaveBeenCalledOnce()
    first.resolve('x')
    await vi.waitFor(() => expect(editor.getValue()).toBe('x'.repeat(16)))
    expect(readClipboardText).toHaveBeenCalledTimes(16)
  })

  it('reports native clipboard failures without an unhandled rejection or insertion', async () => {
    const failure = new Error('Clipboard text exceeds limit')
    vi.mocked(readClipboardText).mockRejectedValue(failure)
    const { editor } = createEditor()
    executeFocusedCodeEditorCommand('edit.paste')
    executeFocusedCodeEditorCommand('edit.paste')
    await finish()
    expect(editor.trigger).not.toHaveBeenCalled()
    expect(readClipboardText).toHaveBeenCalledOnce()
    expect(native.warn).toHaveBeenCalledWith('editor.clipboard', 'source-paste-failed', failure)
  })

  it('keeps the Electron Monaco paste action unchanged', () => {
    native.tauri = false
    const { editor } = createEditor()
    executeFocusedCodeEditorCommand('edit.paste')
    expect(readClipboardText).not.toHaveBeenCalled()
    expect(editor.trigger).toHaveBeenCalledExactlyOnceWith(
      'marklab.editMenu',
      'editor.action.clipboardPasteAction',
      null,
    )
  })
})
