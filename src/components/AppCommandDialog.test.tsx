import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import AppCommandDialog from '@/components/AppCommandDialog'
import TitlebarCommandDialogFallback from '@/components/TitlebarCommandDialogFallback'
import { CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => (key === 'command.palette' ? 'Command palette' : key),
  }),
}))

const FocusHarness = ({ loading = false }: { loading?: boolean }) => {
  const [open, setOpen] = useState(false)
  const [nextOpen, setNextOpen] = useState(false)
  return (
    <>
      <div
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Document"
        onKeyDown={(event) => {
          if (event.ctrlKey && event.key === 'p') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        Keep writing
      </div>
      <button onClick={() => setOpen(true)}>Open search</button>
      {open && (
        <AppCommandDialog open onOpenChange={setOpen}>
          {loading ? <TitlebarCommandDialogFallback /> : <CommandInput aria-label="Search" />}
          <button
            onClick={() => {
              setOpen(false)
              setNextOpen(true)
            }}
          >
            Next dialog
          </button>
        </AppCommandDialog>
      )}
      <Dialog open={nextOpen} onOpenChange={setNextOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Next dialog</DialogTitle>
          <input aria-label="Next field" />
        </DialogContent>
      </Dialog>
    </>
  )
}

const openFromEditor = () => {
  const editor = screen.getByRole('textbox', { name: 'Document' })
  editor.focus()
  fireEvent.keyDown(editor, { key: 'p', ctrlKey: true })
  return editor
}

describe('AppCommandDialog', () => {
  it('labels the command dialog from i18n', () => {
    render(
      <AppCommandDialog open onOpenChange={vi.fn()}>
        <div>Command content</div>
      </AppCommandDialog>,
    )
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
  })

  it('returns keyboard focus to the editor when dismissed without a DialogTrigger', async () => {
    render(<FocusHarness />)
    const editor = openFromEditor()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    await waitFor(() => expect(editor).toHaveFocus())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('returns focus when dismissed while lazy content is loading', async () => {
    render(<FocusHarness loading />)
    const editor = openFromEditor()
    expect(screen.getByRole('combobox')).toBeDisabled()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(editor).toHaveFocus())
  })

  it('keeps the same dialog and original focus target when loading finishes', async () => {
    const { rerender } = render(<FocusHarness loading />)
    const editor = openFromEditor()
    const dialog = screen.getByRole('dialog', { name: 'Command palette' })
    rerender(<FocusHarness />)
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBe(dialog)
    screen.getByRole('combobox').focus()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    await waitFor(() => expect(editor).toHaveFocus())
  })

  it('returns focus to the button when search was opened from that button', async () => {
    render(<FocusHarness />)
    const trigger = screen.getByRole('button', { name: 'Open search' })
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('does not steal focus from a dialog opened by a command', async () => {
    render(<FocusHarness />)
    openFromEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Next dialog' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Next field' })).toHaveFocus())
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it.each([false, true])(
    'restores a text selection including its direction (backward: %s)',
    async (backward) => {
      render(<FocusHarness />)
      const editor = screen.getByRole('textbox', { name: 'Document' })
      editor.focus()
      Object.defineProperty(editor, 'isContentEditable', { configurable: true, value: true })
      const node = editor.firstChild!
      const selection = document.getSelection()!
      const anchor = backward ? 12 : 3
      const focus = backward ? 3 : 12
      selection.setBaseAndExtent(node, anchor, node, focus)
      fireEvent.keyDown(editor, { key: 'p', ctrlKey: true })
      selection.collapse(editor, 0)
      fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
      await waitFor(() => expect(editor).toHaveFocus())
      expect(selection.anchorNode).toBe(node)
      expect(selection.anchorOffset).toBe(anchor)
      expect(selection.focusNode).toBe(node)
      expect(selection.focusOffset).toBe(focus)
    },
  )

  it.each(['Project outline', '@ Project outline', '# Project outline', '? Project outline'])(
    'does not filter out matching results for the query %s',
    async (query) => {
      render(
        <AppCommandDialog open onOpenChange={vi.fn()}>
          <CommandInput aria-label="Search" />
          <CommandList>
            <CommandItem value="Project outline">Project outline</CommandItem>
            <CommandItem value="Weekly notes">Weekly notes</CommandItem>
          </CommandList>
        </AppCommandDialog>,
      )
      fireEvent.change(screen.getByRole('combobox'), { target: { value: query } })
      await waitFor(() =>
        expect(screen.getByRole('option', { name: 'Project outline' })).toBeVisible(),
      )
      expect(screen.queryByRole('option', { name: 'Weekly notes' })).not.toBeInTheDocument()
    },
  )
})
