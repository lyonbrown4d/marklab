import { act, renderHook, waitFor } from '@testing-library/react'
import { createPlateEditor } from 'platejs/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import { plateSlashTestLabels as labels } from '@/components/plate/slash/testFixtures'
import { usePlateSlashCommands } from '@/components/plate/slash/usePlateSlashCommands'

const createEditor = (text: string) => {
  const editor = createPlateEditor({
    plugins: createPlateEditorPlugins(),
    value: [{ type: 'p', children: [{ text }] }],
  })
  editor.selection = {
    anchor: { path: [0, 0], offset: text.length },
    focus: { path: [0, 0], offset: text.length },
  }
  return editor
}

const keyboardEvent = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init })

describe('usePlateSlashCommands', () => {
  afterEach(() => {
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

  it.each(['scroll', 'resize'])('updates the menu anchor on %s', (eventName) => {
    let rect = { bottom: 40, left: 20 }
    vi.spyOn(window, 'getSelection').mockReturnValue({
      getRangeAt: () => ({ getBoundingClientRect: () => rect }) as Range,
      rangeCount: 1,
    } as unknown as Selection)
    const editor = createEditor('/head')
    const { result } = renderHook(() =>
      usePlateSlashCommands({ documentIdentity: 'a.md', editor, labels }),
    )
    act(() => result.current.syncFromEditor())
    expect(result.current.menu.anchor).toEqual({ left: 20, top: 40 })

    rect = { bottom: 120, left: 80 }
    act(() => window.dispatchEvent(new Event(eventName)))

    expect(result.current.menu.anchor).toEqual({ left: 80, top: 120 })
  })
})
