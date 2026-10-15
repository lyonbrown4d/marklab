import { useEffect, useMemo, useRef } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import type { OnMount } from '@monaco-editor/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SourceCodeEditor from '@/components/SourceCodeEditor'
import { executeFocusedEditCommand } from '@/app/focusedEditCommand'

type FocusEditor = {
  focus: ReturnType<typeof vi.fn>
  trigger: ReturnType<typeof vi.fn>
  disposeFocus: ReturnType<typeof vi.fn>
}
const editors = vi.hoisted(() => new Map<string, FocusEditor>())
vi.mock('@/components/source-code/useConfiguredMonaco', () => ({
  useConfiguredMonaco: () => ({ ready: true, error: null }),
}))
vi.mock('@/hooks/useDarkMode', () => ({ useDarkMode: () => false }))
vi.mock('@/store/usePreferencesStore', () => ({ usePreferencesStore: () => false }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => false }))
vi.mock('@/components/SourceCodeEditorSurface', () => ({
  SourceCodeEditorSurface: ({
    activePath,
    onMount,
    value,
  }: {
    activePath: string
    onMount: OnMount
    value: string
  }) => {
    const mount = useRef(onMount)
    const host = useMemo(() => {
      let onFocus = () => undefined
      const editor = {
        focus: vi.fn(),
        trigger: vi.fn(),
        disposeFocus: vi.fn(() => {
          onFocus = () => undefined
        }),
        getModel: () => ({ getValue: () => value }),
        getPosition: () => ({ lineNumber: 1, column: 1 }),
        onDidChangeCursorPosition: () => ({ dispose: vi.fn() }),
        onDidFocusEditorText: (listener: () => undefined) => {
          onFocus = listener
          return { dispose: editor.disposeFocus }
        },
        notifyFocus: () => onFocus(),
      }
      return editor
    }, [value])
    useEffect(() => {
      editors.set(activePath, host)
      mount.current(
        host as unknown as Parameters<OnMount>[0],
        { editor: { setModelMarkers: vi.fn() } } as unknown as Parameters<OnMount>[1],
      )
    }, [activePath, host])
    return (
      <div className="monaco-editor">
        <textarea aria-label={activePath} onFocus={host.notifyFocus} />
      </div>
    )
  },
}))
const props = {
  workspaceKey: 'internal:',
  files: [],
  fileContents: {},
  onChange: vi.fn(),
  value: 'content',
}

beforeEach(() => editors.clear())

describe('cached source editor command focus', () => {
  it('routes native undo and redo to the refocused retained editor rather than the latest mounted editor', async () => {
    render(
      <>
        <SourceCodeEditor {...props} activePath="a.ts" />
        <SourceCodeEditor {...props} activePath="b.ts" />
      </>,
    )
    await waitFor(() => expect(editors.size).toBe(2))
    const first = editors.get('a.ts')!
    const second = editors.get('b.ts')!
    act(() => screen.getByRole('textbox', { name: 'a.ts' }).focus())
    expect(executeFocusedEditCommand('edit.undo')).toBe(true)
    expect(first.trigger).toHaveBeenCalledWith('marklab.editMenu', 'undo', null)
    expect(second.trigger).not.toHaveBeenCalled()
    act(() => screen.getByRole('textbox', { name: 'b.ts' }).focus())
    expect(executeFocusedEditCommand('edit.redo')).toBe(true)
    expect(second.trigger).toHaveBeenCalledWith('marklab.editMenu', 'redo', null)
  })

  it('disposes the focus subscription and does not clear another editor when an inactive editor unmounts', async () => {
    const view = render(
      <>
        <SourceCodeEditor key="a" {...props} activePath="a.ts" />
        <SourceCodeEditor key="b" {...props} activePath="b.ts" />
      </>,
    )
    await waitFor(() => expect(editors.size).toBe(2))
    const first = editors.get('a.ts')!
    const second = editors.get('b.ts')!
    act(() => screen.getByRole('textbox', { name: 'b.ts' }).focus())
    view.rerender(<SourceCodeEditor key="b" {...props} activePath="b.ts" />)
    expect(first.disposeFocus).toHaveBeenCalledOnce()
    expect(executeFocusedEditCommand('edit.undo')).toBe(true)
    expect(second.trigger).toHaveBeenCalledWith('marklab.editMenu', 'undo', null)
    view.unmount()
    expect(second.disposeFocus).toHaveBeenCalledOnce()
    expect(executeFocusedEditCommand('edit.undo')).toBe(false)
  })
})
