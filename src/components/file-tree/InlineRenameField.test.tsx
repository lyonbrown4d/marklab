import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { NodeApi } from 'react-arborist'
import { describe, expect, it, vi } from 'vitest'
import type { FileTreeNode } from '@/logic/fileTree'
import { InlineRenameField } from '@/components/file-tree/InlineRenameField'

const createNode = (name = 'draft.md') => {
  const reset = vi.fn()
  const submit = vi.fn()
  const node = {
    data: {
      name,
    },
    reset,
    submit,
  } as unknown as NodeApi<FileTreeNode>

  return { node, reset, submit }
}

describe('InlineRenameField', () => {
  describe.each([
    'native composition flag',
    'legacy key code',
    'composition lifecycle',
    'legacy key code after composition end',
  ])('IME protection using %s', (mode) => {
    it.each(['Enter', 'Escape'])('ignores candidate-selection %s until composition ends', (key) => {
      const parentKeyDown = vi.fn()
      const { node, reset, submit } = createNode()

      render(
        <div onKeyDown={parentKeyDown}>
          <InlineRenameField node={node} />
        </div>,
      )

      const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Rename draft.md' })
      fireEvent.change(input, { target: { value: ' \u65e5\u672c\u8a9e.md ' } })

      if (mode === 'composition lifecycle' || mode === 'legacy key code after composition end') {
        fireEvent.compositionStart(input)
      }
      if (mode === 'legacy key code after composition end') {
        fireEvent.compositionEnd(input)
      }

      const candidateKeyDown = createEvent.keyDown(input, {
        key,
        isComposing: mode === 'native composition flag',
        keyCode: mode.startsWith('legacy') ? 229 : key === 'Enter' ? 13 : 27,
      })
      fireEvent(input, candidateKeyDown)

      expect(submit).not.toHaveBeenCalled()
      expect(reset).not.toHaveBeenCalled()
      expect(parentKeyDown).not.toHaveBeenCalled()
      expect(candidateKeyDown.defaultPrevented).toBe(false)
      expect(document.activeElement).toBe(input)

      if (mode === 'composition lifecycle') {
        fireEvent.compositionEnd(input)
      }

      const normalKeyDown = createEvent.keyDown(input, { key })
      fireEvent(input, normalKeyDown)
      fireEvent.blur(input)
      fireEvent.keyDown(input, { key: 'Enter' })
      fireEvent.keyDown(input, { key: 'Escape' })

      expect(normalKeyDown.defaultPrevented).toBe(true)
      expect(parentKeyDown).not.toHaveBeenCalled()
      if (key === 'Enter') {
        expect(submit).toHaveBeenCalledExactlyOnceWith('\u65e5\u672c\u8a9e.md')
        expect(reset).not.toHaveBeenCalled()
      } else {
        expect(reset).toHaveBeenCalledTimes(1)
        expect(submit).not.toHaveBeenCalled()
      }
    })
  })

  it('submits a changed name on blur once after composition', () => {
    const { node, reset, submit } = createNode()
    render(<InlineRenameField node={node} />)

    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Rename draft.md' })
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: ' \u4e2d\u6587.md ' } })
    fireEvent.compositionEnd(input)
    fireEvent.blur(input)
    fireEvent.blur(input)

    expect(submit).toHaveBeenCalledExactlyOnceWith('\u4e2d\u6587.md')
    expect(reset).not.toHaveBeenCalled()
  })

  it('focuses, selects, and labels the active rename field', () => {
    const { node } = createNode()

    render(<InlineRenameField label="Rename draft.md" node={node} />)

    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Rename draft.md' })
    const descriptionId = input.getAttribute('aria-describedby')

    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('draft.md'.length)
    expect(input.dataset.fileTreeInlineRename).toBe('true')
    expect(input.title).toBe('Rename draft.md')
    expect(descriptionId).toBeTruthy()
    expect(document.getElementById(descriptionId ?? '')?.textContent).toContain(
      'Press Enter to save',
    )
  })

  it('submits a trimmed changed name on Enter only once', async () => {
    const user = userEvent.setup()
    const parentKeyDown = vi.fn()
    const { node, reset, submit } = createNode()

    render(
      <div onKeyDown={parentKeyDown}>
        <InlineRenameField label="Rename draft.md" node={node} />
      </div>,
    )

    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Rename draft.md' })
    await user.clear(input)
    await user.type(input, ' final.md {Enter}')
    fireEvent.blur(input)

    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledWith('final.md')
    expect(reset).not.toHaveBeenCalled()
    expect(parentKeyDown).not.toHaveBeenCalled()
  })

  it('resets on Escape without bubbling keyboard events', async () => {
    const user = userEvent.setup()
    const parentKeyDown = vi.fn()
    const { node, reset, submit } = createNode()

    render(
      <div onKeyDown={parentKeyDown}>
        <InlineRenameField label="Rename draft.md" node={node} />
      </div>,
    )

    await user.keyboard('{Escape}')

    expect(reset).toHaveBeenCalledTimes(1)
    expect(submit).not.toHaveBeenCalled()
    expect(parentKeyDown).not.toHaveBeenCalled()
  })

  it.each([
    ['empty name', ''],
    ['unchanged name', 'draft.md'],
    ['nested path segment', 'folder/draft.md'],
  ])('resets instead of submitting an invalid %s', async (_caseName, nextName) => {
    const user = userEvent.setup()
    const { node, reset, submit } = createNode()

    render(<InlineRenameField label="Rename draft.md" node={node} />)

    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Rename draft.md' })
    await user.clear(input)
    if (nextName) {
      await user.type(input, nextName)
    }
    fireEvent.blur(input)

    expect(reset).toHaveBeenCalledTimes(1)
    expect(submit).not.toHaveBeenCalled()
  })
})
