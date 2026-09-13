import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  AppStatusBarProvider,
  EditorStatusBar,
  EditorStatusBarSlot,
} from '@/components/EditorStatusBar'
import { EditorDocumentStatus } from '@/components/EditorDocumentStatus'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key.replace('status.', '') }),
}))

const StatusLayout = ({
  activePath = 'note.md',
  source = false,
  visible = true,
}: {
  activePath?: string
  source?: boolean
  visible?: boolean
}) => (
  <AppStatusBarProvider activePath={activePath} viewMode={source ? 'source' : 'wysiwyg'}>
    <main aria-label="Editor">
      {visible && (
        <EditorDocumentStatus
          activePath="note.md"
          viewMode="wysiwyg"
          stats={{ lines: 2, words: 3, characters: 9 }}
          value={'one\r\ntwo three'}
        />
      )}
      {visible && (
        <EditorStatusBar activePath="other.md" viewMode="wysiwyg">
          Inactive document
        </EditorStatusBar>
      )}
      {visible && (
        <EditorStatusBar activePath="note.md" viewMode="source">
          Source cursor
        </EditorStatusBar>
      )}
    </main>
    <footer aria-label="Status bar">
      <EditorStatusBarSlot label="Document status" />
    </footer>
  </AppStatusBarProvider>
)

describe('EditorStatusBar', () => {
  it('renders document statistics and format only in the shared footer', () => {
    render(<StatusLayout />)
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByText('3 words')).toBeInTheDocument()
    expect(within(footer).getByText('2 lines')).toBeInTheDocument()
    expect(within(footer).getByText('9 characters')).toBeInTheDocument()
    expect(within(footer).getByText('Markdown')).toBeInTheDocument()
    expect(within(footer).getByText('CRLF')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeEmptyDOMElement()
    expect(screen.queryByText('Inactive document')).not.toBeInTheDocument()
    expect(screen.queryByText('Source cursor')).not.toBeInTheDocument()
  })

  it('removes cached document status when switching paths and modes', () => {
    const { rerender } = render(<StatusLayout />)
    rerender(<StatusLayout source />)
    expect(screen.queryByText('3 words')).not.toBeInTheDocument()
    expect(screen.getByText('Source cursor')).toBeInTheDocument()
    rerender(<StatusLayout activePath="other.md" />)
    expect(screen.queryByText('Source cursor')).not.toBeInTheDocument()
    expect(screen.getByText('Inactive document')).toBeInTheDocument()
  })

  it('clears the slot when the status preference is disabled and restores it when enabled', () => {
    const { rerender } = render(<StatusLayout />)
    rerender(<StatusLayout visible={false} />)
    expect(screen.getByRole('group', { name: 'Document status' })).toBeEmptyDOMElement()
    rerender(<StatusLayout />)
    expect(screen.getByText('3 words')).toBeInTheDocument()
  })

  it('renders actual source cursor coordinates alongside document format', () => {
    render(
      <AppStatusBarProvider activePath="note.md" viewMode="source">
        <EditorDocumentStatus
          activePath="note.md"
          viewMode="source"
          value="abc"
          cursor={{ lineNumber: 7, column: 12 }}
          stats={{ lines: 1, words: 1, characters: 3 }}
        />
        <footer>
          <EditorStatusBarSlot label="Document status" />
        </footer>
      </AppStatusBarProvider>,
    )
    expect(screen.getByText('Ln 7, Col 12')).toBeInTheDocument()
    expect(screen.getByText('LF')).toBeInTheDocument()
  })

  it('does not create an extra status bar without a shell host', () => {
    const { container } = render(
      <EditorStatusBar activePath="note.md" viewMode="wysiwyg">
        Hidden
      </EditorStatusBar>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
