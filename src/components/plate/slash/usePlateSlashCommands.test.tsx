import { act, renderHook, waitFor } from '@testing-library/react'
import { createPlateEditor } from 'platejs/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import { plateSlashTestLabels as labels } from '@/components/plate/slash/testFixtures'
import { usePlateSlashCommands } from '@/components/plate/slash/usePlateSlashCommands'

let selectedDomNode: Node

const createEditor = (text: string) => {
  const editor = createPlateEditor({
    plugins: createPlateEditorPlugins(),
    value: [{ type: 'p', children: [{ text }] }],
  })
  editor.selection = {
    anchor: { path: [0, 0], offset: text.length },
    focus: { path: [0, 0], offset: text.length },
  }
  const root = document.createElement('div')
  selectedDomNode = document.createTextNode(text)
  root.append(selectedDomNode)
  vi.spyOn(editor.api, 'toDOMNode').mockReturnValue(root)
  return editor
}

const keyboardEvent = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init })

describe('usePlateSlashCommands', () => {
  beforeEach(() => {
    vi.spyOn(window, 'getSelection').mockReturnValue({
      getRangeAt: () =>
        ({
          commonAncestorContainer: selectedDomNode,
          getClientRects: () => [{ bottom: 40, height: 20, left: 20, width: 1 }],
        }) as unknown as Range,
      rangeCount: 1,
    } as unknown as Selection)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('synchronizes the slash query and supports keyboard selection', async () => {
    const editor = createEditor('/head')
    const { result } = renderHook(() =>
      usePlateSlashCommands({ documentIdentity: 'a.md', editor, labels }),
    )

    act(() => result.current.syncFromEditor())
    expect(result.current.menu.commands.map(({ key }) => key)).toEqual([
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
    ])

    const down = keyboardEvent('ArrowDown')
    act(() => expect(result.current.onKeyDown(down)).toBe(true))
    expect(down.defaultPrevented).toBe(true)
    expect(result.current.menu.selectedIndex).toBe(1)

    const enter = keyboardEvent('Enter')
    act(() => expect(result.current.onKeyDown(enter)).toBe(true))
    await waitFor(() => expect(editor.children[0]).toMatchObject({ type: 'h2' }))
    expect(result.current.menu.open).toBe(false)
  })

  it('wraps keyboard selection and closes on Escape', () => {
    const editor = createEditor('/head')
    const { result } = renderHook(() =>
      usePlateSlashCommands({ documentIdentity: 'a.md', editor, labels }),
    )
    act(() => result.current.syncFromEditor())

    act(() => result.current.onKeyDown(keyboardEvent('ArrowUp')))
    expect(result.current.menu.selectedIndex).toBe(5)
    act(() => result.current.onKeyDown(keyboardEvent('Escape')))
    expect(result.current.menu.open).toBe(false)
  })

  it('does not navigate or execute while IME composition is active', () => {
    const editor = createEditor('/head')
    const { result } = renderHook(() =>
      usePlateSlashCommands({ documentIdentity: 'a.md', editor, labels }),
    )
    act(() => result.current.syncFromEditor())
    const event = keyboardEvent('Enter', { isComposing: true })

    act(() => expect(result.current.onKeyDown(event)).toBe(false))

    expect(event.defaultPrevented).toBe(false)
    expect(editor.api.string([])).toBe('/head')
    expect(result.current.menu.open).toBe(true)
  })

  it('hides block commands when the slash follows prose but keeps inline commands', () => {
    const editor = createEditor('Keep /')
    const { result } = renderHook(() =>
      usePlateSlashCommands({ documentIdentity: 'a.md', editor, labels }),
    )

    act(() => result.current.syncFromEditor())

    expect(result.current.menu.commands.some(({ key }) => key === 'table')).toBe(false)
    expect(result.current.menu.commands.some(({ key }) => key === 'bold')).toBe(true)
    expect(result.current.menu.commands.some(({ key }) => key === 'link')).toBe(true)
  })

  it('does not execute a stale trigger after the selection moves', () => {
    const editor = createEditor('/head')
    const { result } = renderHook(() =>
      usePlateSlashCommands({ documentIdentity: 'a.md', editor, labels }),
    )
    act(() => result.current.syncFromEditor())
    editor.selection = {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 0 },
    }
    const enter = keyboardEvent('Enter')

    act(() => expect(result.current.onKeyDown(enter)).toBe(false))

    expect(enter.defaultPrevented).toBe(false)
    expect(editor.api.string([])).toBe('/head')
    expect(result.current.menu.open).toBe(false)
  })

  it('does not execute a stale trigger selected through the menu', () => {
    const editor = createEditor('/head')
    const { result } = renderHook(() =>
      usePlateSlashCommands({ documentIdentity: 'a.md', editor, labels }),
    )
    act(() => result.current.syncFromEditor())
    const command = result.current.menu.commands[0]
    editor.selection = {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 0 },
    }

    act(() => expect(command && result.current.menu.selectCommand(command)).toBe(false))

    expect(editor.api.string([])).toBe('/head')
    expect(result.current.menu.open).toBe(false)
  })

  it('closes the menu after a caret movement key invalidates the trigger', async () => {
    const editor = createEditor('/head')
    const { result } = renderHook(() =>
      usePlateSlashCommands({ documentIdentity: 'a.md', editor, labels }),
    )
    act(() => result.current.syncFromEditor())

    act(() => {
      expect(result.current.onKeyDown(keyboardEvent('Home'))).toBe(false)
      editor.selection = {
        anchor: { path: [0, 0], offset: 0 },
        focus: { path: [0, 0], offset: 0 },
      }
    })

    await waitFor(() => expect(result.current.menu.open).toBe(false))
  })

  it('opens a URL request instead of mutating the editor immediately', async () => {
    const editor = createEditor('/link')
    const { result } = renderHook(() =>
      usePlateSlashCommands({ documentIdentity: 'a.md', editor, labels }),
    )
    act(() => result.current.syncFromEditor())

    act(() => result.current.onKeyDown(keyboardEvent('Enter')))

    await waitFor(() => expect(result.current.urlDialog.request?.kind).toBe('link'))
    expect(editor.api.string([])).toBe('/link')
  })

  it('reports async command failures without leaving the menu open', async () => {
    const editor = createEditor('/calendar')
    const onError = vi.fn()
    const { result } = renderHook(() =>
      usePlateSlashCommands({
        documentIdentity: 'a.md',
        editor,
        labels,
        onCalendarFileCreate: async () => {
          throw new Error('failed')
        },
        onError,
      }),
    )
    act(() => result.current.syncFromEditor())
    act(() => result.current.onKeyDown(keyboardEvent('Enter')))

    await waitFor(() => expect(onError).toHaveBeenCalledOnce())
    expect(result.current.menu.open).toBe(false)
  })

  it('discards a stale menu when the document context changes', () => {
    const editor = createEditor('/head')
    const { rerender, result } = renderHook(
      ({ documentIdentity }) => usePlateSlashCommands({ documentIdentity, editor, labels }),
      { initialProps: { documentIdentity: 'a.md' } },
    )
    act(() => result.current.syncFromEditor())
    expect(result.current.menu.open).toBe(true)

    rerender({ documentIdentity: 'b.md' })
    rerender({ documentIdentity: 'a.md' })

    expect(result.current.menu.open).toBe(false)
  })

  it('dismisses the menu when the application window loses focus', () => {
    const editor = createEditor('/head')
    const { result } = renderHook(() =>
      usePlateSlashCommands({ documentIdentity: 'a.md', editor, labels }),
    )
    act(() => result.current.syncFromEditor())

    act(() => window.dispatchEvent(new Event('blur')))

    expect(result.current.menu.open).toBe(false)
  })

  it('does not reopen from a queued microtask after editing becomes read-only', async () => {
    const editor = createEditor('/head')
    const { rerender, result } = renderHook(
      ({ readOnly }) =>
        usePlateSlashCommands({
          canEdit: () => !readOnly,
          documentIdentity: 'a.md',
          editor,
          labels,
        }),
      { initialProps: { readOnly: false } },
    )

    act(() => expect(result.current.onKeyDown(keyboardEvent('x'))).toBe(false))
    rerender({ readOnly: true })
    await act(async () => Promise.resolve())

    expect(result.current.menu.open).toBe(false)
  })

  it('dismisses an open menu when editing becomes unavailable', () => {
    const editor = createEditor('/head')
    const { rerender, result } = renderHook(
      ({ readOnly }) =>
        usePlateSlashCommands({
          canEdit: () => !readOnly,
          documentIdentity: 'a.md',
          editor,
          labels,
        }),
      { initialProps: { readOnly: false } },
    )
    act(() => result.current.syncFromEditor())
    expect(result.current.menu.open).toBe(true)
    act(() => result.current.onKeyDown(keyboardEvent('ArrowDown')))
    expect(result.current.menu.selectedIndex).toBe(1)

    rerender({ readOnly: true })

    expect(result.current.menu.open).toBe(false)
    expect(result.current.menu.commands).toEqual([])
    expect(result.current.menu.selectedIndex).toBe(0)
  })

  it('does not run a queued timeout after the document context changes', () => {
    vi.useFakeTimers()
    const editor = createEditor('/head')
    const { rerender, result } = renderHook(
      ({ documentIdentity }) => usePlateSlashCommands({ documentIdentity, editor, labels }),
      { initialProps: { documentIdentity: 'a.md' } },
    )
    act(() => result.current.syncFromEditor())
    vi.mocked(window.getSelection).mockClear()

    act(() => expect(result.current.onKeyDown(keyboardEvent('Home'))).toBe(false))
    rerender({ documentIdentity: 'b.md' })
    act(() => vi.runAllTimers())

    expect(window.getSelection).not.toHaveBeenCalled()
    expect(result.current.menu.open).toBe(false)
  })
})
