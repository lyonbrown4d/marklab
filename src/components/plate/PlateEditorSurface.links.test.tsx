import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlateEditorSurface } from '@/components/plate/PlateEditorSurface'
import type { PlateEditorSurfaceHandle } from '@/components/plate/plateEditorSurfaceTypes'
import { plateSlashTestLabels as labels } from '@/components/plate/slash/testFixtures'

vi.mock('@/components/plate/nodes/usePlateLinkPreviewPortal', () => ({
  usePlateLinkPreviewPortal: () => ({ anchorRef: () => {}, preview: null }),
}))

vi.mock('@/services/languageIntelligenceApi', () => ({
  languageIntelligenceApi: {
    openDocument: vi.fn().mockResolvedValue({ ok: true, version: 1 }),
    closeDocument: vi.fn().mockResolvedValue({ ok: true }),
    changeDocument: vi.fn().mockResolvedValue({ ok: true, version: 2 }),
    completion: vi.fn().mockResolvedValue({ isIncomplete: false, items: [] }),
  },
}))

const setup = (readOnly = false) => {
  const ref = createRef<PlateEditorSurfaceHandle>()
  const view = render(
    <PlateEditorSurface
      activePath="note.md"
      completionEnabled={false}
      onChange={vi.fn()}
      placeholder="Document"
      readOnly={readOnly}
      ref={ref}
      slashLabels={labels}
      value="Guide"
    />,
  )
  const editor = ref.current!.getEditor()
  act(() =>
    editor.tf.select({ anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 5 } }),
  )
  return { ...view, editor, ref }
}

describe('rich editor link input', () => {
  const originalRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect')
  beforeEach(() => {
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(20, 20, 40, 18),
    })
  })
  afterEach(() => {
    if (originalRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalRect)
    else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect')
  })
  it('keeps selected text, returns focus, and inserts a link in one undo step', async () => {
    const user = userEvent.setup()
    const { editor, ref } = setup()
    act(() => expect(ref.current!.openLinkInput()).toBe(true))
    const input = screen.getByRole('combobox', { name: labels.linkUrlPrompt })
    await waitFor(() => expect(input).toHaveFocus())
    expect(screen.queryByLabelText(labels.linkTextPrompt)).not.toBeInTheDocument()
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull()
    await user.type(input, 'https://example.com')
    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(screen.queryByRole('combobox', { name: labels.linkUrlPrompt })).toBeNull(),
    )
    expect((await ref.current!.getMarkdown()).trim()).toBe('[Guide](https://example.com)')
    expect(screen.getByRole('textbox', { name: 'Document' })).toHaveFocus()
    expect(editor.api.isCollapsed()).toBe(true)
    act(() => editor.tf.undo())
    expect((await ref.current!.getMarkdown()).trim()).toBe('Guide')
    act(() => editor.tf.redo())
    expect((await ref.current!.getMarkdown()).trim()).toBe('[Guide](https://example.com)')
  })

  it('cancels without changing content and starts a fresh address on reopening', async () => {
    const user = userEvent.setup()
    const { ref } = setup()
    act(() => ref.current!.openLinkInput())
    await user.type(screen.getByRole('combobox', { name: labels.linkUrlPrompt }), './draft.md')
    await user.keyboard('{Escape}')
    expect((await ref.current!.getMarkdown()).trim()).toBe('Guide')
    act(() => ref.current!.openLinkInput())
    expect(screen.getByRole('combobox', { name: labels.linkUrlPrompt })).toHaveValue('')
  })

  it('does not open an insertion input in a read-only document', () => {
    const { ref } = setup(true)
    act(() => expect(ref.current!.openLinkInput()).toBe(false))
    expect(screen.queryByRole('combobox', { name: labels.linkUrlPrompt })).toBeNull()
  })
})
