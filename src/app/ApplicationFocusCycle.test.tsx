import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApplicationFocusCycle } from '@/app/ApplicationFocusCycle'

const Fixture = () => (
  <>
    <ApplicationFocusCycle />
    <header data-app-focus-zone="titlebar">
      <button type="button">Title action</button>
    </header>
    <aside data-app-focus-zone="sidebar">
      <button type="button">Workspace file</button>
    </aside>
    <main data-app-focus-zone="editor">
      <div contentEditable role="textbox" tabIndex={0}>
        Editor
      </div>
    </main>
    <footer data-app-focus-zone="statusbar">
      <button type="button">Status action</button>
    </footer>
  </>
)

describe('ApplicationFocusCycle', () => {
  it('cycles visible application regions in both directions with F6', () => {
    render(<Fixture />)
    screen.getByRole('button', { name: 'Title action' }).focus()

    fireEvent.keyDown(document, { key: 'F6' })
    expect(screen.getByRole('button', { name: 'Workspace file' })).toHaveFocus()

    fireEvent.keyDown(document, { key: 'F6' })
    expect(screen.getByRole('textbox')).toHaveFocus()

    fireEvent.keyDown(document, { key: 'F6', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Workspace file' })).toHaveFocus()
  })

  it('leaves modal interactions and IME events untouched', () => {
    render(
      <>
        <Fixture />
        <div role="dialog">
          <input aria-label="Dialog input" />
        </div>
      </>,
    )
    const input = screen.getByRole('textbox', { name: 'Dialog input' })
    input.focus()

    fireEvent.keyDown(input, { key: 'F6' })
    fireEvent.keyDown(input, { isComposing: true, key: 'F6' })

    expect(input).toHaveFocus()
  })

  it('uses spatial order when portal regions appear later in the DOM', () => {
    render(
      <>
        <ApplicationFocusCycle />
        <header data-app-focus-zone="titlebar">
          <button type="button">Title</button>
        </header>
        <main data-app-focus-zone="editor">
          <button type="button">Editor</button>
        </main>
        <div style={{ display: 'none' }}>
          <main data-app-focus-zone="editor">
            <button type="button">Cached editor</button>
          </main>
        </div>
        <footer data-app-focus-zone="statusbar">
          <button type="button">Status</button>
        </footer>
        <aside data-app-focus-zone="sidebar">
          <button type="button">Sidebar portal</button>
        </aside>
        <aside data-app-focus-zone="inspector">
          <button type="button">Inspector portal</button>
        </aside>
      </>,
    )
    screen.getByRole('button', { name: 'Title' }).focus()

    fireEvent.keyDown(document, { key: 'F6' })
    expect(screen.getByRole('button', { name: 'Sidebar portal' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'F6' })
    expect(screen.getByRole('button', { name: 'Editor' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'F6' })
    expect(screen.getByRole('button', { name: 'Inspector portal' })).toHaveFocus()
  })
})
