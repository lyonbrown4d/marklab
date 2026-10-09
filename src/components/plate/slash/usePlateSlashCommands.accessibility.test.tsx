import { act, renderHook } from '@testing-library/react'
import { createPlateEditor } from 'platejs/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import { plateSlashTestLabels as labels } from '@/components/plate/slash/testFixtures'
import { usePlateSlashCommands } from '@/components/plate/slash/usePlateSlashCommands'

const createEditor = () => {
  const editor = createPlateEditor({
    plugins: createPlateEditorPlugins(),
    value: [{ type: 'p', children: [{ text: '/head' }] }],
  })
  editor.selection = {
    anchor: { path: [0, 0], offset: 5 },
    focus: { path: [0, 0], offset: 5 },
  }
  const root = document.createElement('div')
  const selectedNode = document.createTextNode('/head')
  root.append(selectedNode)
  vi.spyOn(editor.api, 'toDOMNode').mockReturnValue(root)
  vi.spyOn(window, 'getSelection').mockReturnValue({
    getRangeAt: () =>
      ({
        commonAncestorContainer: selectedNode,
        getClientRects: () => [{ bottom: 40, height: 20, left: 20, width: 1 }],
      }) as unknown as Range,
    rangeCount: 1,
  } as unknown as Selection)
  return { editor, root }
}

const keyboardEvent = (key: string) =>
  new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key })

describe('usePlateSlashCommands accessibility', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.replaceChildren()
  })

  it('connects the focused editor to the listbox and active option until dismissal', () => {
    const { editor, root } = createEditor()
    const { result } = renderHook(() =>
      usePlateSlashCommands({ documentIdentity: 'a.md', editor, labels }),
    )
    const menuId = (result.current.menu as typeof result.current.menu & { menuId?: string }).menuId
    expect(menuId).toBeTruthy()
    if (!menuId) throw new Error('Expected a slash menu id')
    const menu = document.createElement('div')
    menu.id = menuId
    const listbox = document.createElement('div')
    listbox.id = 'slash-listbox'
    listbox.setAttribute('role', 'listbox')
    menu.append(listbox)
    document.body.append(menu)

    act(() => result.current.syncFromEditor())

    expect(root).toHaveAttribute('aria-controls', 'slash-listbox')
    expect(root).toHaveAttribute('aria-expanded', 'true')
    expect(root).toHaveAttribute('aria-autocomplete', 'list')
    expect(root).toHaveAttribute('aria-activedescendant', `${menuId}-option-h1-0`)

    act(() => result.current.onKeyDown(keyboardEvent('ArrowDown')))
    expect(root).toHaveAttribute('aria-activedescendant', `${menuId}-option-h2-0`)

    act(() => result.current.onKeyDown(keyboardEvent('Escape')))
    expect(root).not.toHaveAttribute('aria-controls')
    expect(root).not.toHaveAttribute('aria-activedescendant')
    expect(root).toHaveAttribute('aria-expanded', 'false')
  })
})
