import { createEvent, fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  controllerMock,
  renderEditor,
  resetMarkdownEditorMocks,
} from '@/components/MarkdownEditor.testFixtures'

describe('MarkdownEditor context menu', () => {
  beforeEach(resetMarkdownEditorMocks)

  it('replaces the browser menu with editor actions and runs formatting commands', async () => {
    renderEditor()
    const root = screen.getByTestId('markdown-editor')
    const contextMenuEvent = createEvent.contextMenu(root)

    fireEvent(root, contextMenuEvent)

    expect(contextMenuEvent.defaultPrevented).toBe(true)
    expect(screen.getByRole('menuitem', { name: /Undo/ })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: /Redo/ })).toHaveAttribute('data-disabled')
    expect(screen.getByRole('menuitem', { name: /Insert link/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: /Bold/ }))
    expect(controllerMock.runContextMenuAction).toHaveBeenCalledWith('bold')

    fireEvent.contextMenu(root)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('disables unavailable selection actions and hides links without link capability', () => {
    controllerMock.getContextMenuCapabilities.mockReturnValueOnce({
      copy: false,
      cut: false,
      link: false,
      redo: false,
      undo: false,
    })
    renderEditor()

    fireEvent.contextMenu(screen.getByTestId('markdown-editor'))

    expect(screen.getByRole('menuitem', { name: /Copy/ })).toHaveAttribute('data-disabled')
    expect(screen.getByRole('menuitem', { name: /Cut/ })).toHaveAttribute('data-disabled')
    expect(screen.queryByRole('menuitem', { name: /Insert link/ })).not.toBeInTheDocument()
  })

  it('opens the editor menu from the keyboard', () => {
    renderEditor()

    fireEvent.keyDown(screen.getByTestId('markdown-editor').parentElement as HTMLElement, {
      key: 'F10',
      shiftKey: true,
    })

    expect(screen.getByRole('menuitem', { name: /Undo/ })).toBeInTheDocument()
  })
})
