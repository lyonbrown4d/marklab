import { useEffect, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SourceCodePage from '@/pages/SourceCodePage'
import {
  MAX_MERMAID_SOURCE_BYTES,
  MAX_MERMAID_SOURCE_LINES,
} from '@/components/previews/SourceDocumentPreview'

const state = vi.hoisted(() => ({ mounts: 0, unmounts: 0, active: true }))
vi.mock('keepalive-for-react', () => ({
  useKeepAliveContext: () => ({ cacheKey: 'source', active: state.active }),
}))
vi.mock('@/pages/useDocumentStats', () => ({ useDocumentStats: () => ({}) }))
vi.mock('@/components/EditorDocumentStatus', () => ({ EditorDocumentStatus: () => null }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/SourceCodeEditor', () => {
  const MockSourceCodeEditor = ({
    value,
    onChange,
    interactionActive,
  }: {
    value: string
    onChange: (value: string) => void
    interactionActive: boolean
  }) => {
    useEffect(() => {
      state.mounts++
      return () => {
        state.unmounts++
      }
    }, [])
    return (
      <textarea
        aria-label="Source editor"
        data-interactive={interactionActive}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }
  return { default: MockSourceCodeEditor }
})
vi.mock('@/components/previews/MermaidPreview', () => ({
  default: ({ source }: { source: string }) => <div data-testid="mermaid">{source}</div>,
}))
// This page suite exercises editor lifetime and render gating; line highlighting
// has its own coverage and does not need thousands of DOM rows in jsdom here.
vi.mock('@/components/previews/SourceCodeLines', () => ({
  SourceCodeLines: ({ lines }: { lines: readonly string[] }) => <pre>{lines.join('\n')}</pre>,
}))

vi.mock('@/components/previews/HtmlPreviewSurface', () => ({
  default: ({ source }: { source: string }) => <div data-testid="html">{source}</div>,
}))
vi.mock('@/components/previews/SpreadsheetPreviewSurface', () => ({
  default: ({ source }: { source: string }) => <div data-testid="spreadsheet">{source}</div>,
}))

const Page = ({
  path = 'diagram.mmd',
  initial = 'graph TD\nA --> B',
}: {
  path?: string
  initial?: string
}) => {
  const [value, setValue] = useState(initial)
  return (
    <SourceCodePage
      activePath={path}
      workspaceKey="wiki"
      value={value}
      files={[]}
      fileContents={{}}
      onChange={setValue}
      showStatusBar={false}
      readOnly={false}
    />
  )
}

const togglePreview = () =>
  fireEvent.click(screen.getByRole('button', { name: /preview.sourcePreview/ }))

describe('Mermaid source page', () => {
  beforeEach(() => {
    state.mounts = 0
    state.unmounts = 0
    state.active = true
  })

  it.each(['diagram.mmd', 'diagram.MERMAID'])(
    'previews the edited buffer and keeps the same editor when toggling %s',
    async (path) => {
      render(<Page path={path} />)
      const editor = await screen.findByRole('textbox', { name: 'Source editor' })
      fireEvent.change(editor, { target: { value: 'graph TD\nA --> Changed' } })
      togglePreview()
      expect(await screen.findByTestId('mermaid')).toHaveTextContent('Changed')
      expect(editor).not.toBeVisible()
      expect(editor).toHaveAttribute('data-interactive', 'false')
      togglePreview()
      expect(editor).toBeVisible()
      expect(editor).toHaveValue('graph TD\nA --> Changed')
      expect(editor).toHaveAttribute('data-interactive', 'true')
      expect(state.mounts).toBe(1)
      expect(state.unmounts).toBe(0)
    },
  )

  it.each([
    ['page.html', 'html', '<h1>Unsaved HTML</h1>'],
    ['data.csv', 'spreadsheet', 'name,value\nUnsaved,2'],
  ])('previews the unsaved source buffer for %s', async (path, testId, source) => {
    render(<Page path={path} />)
    const editor = await screen.findByRole('textbox')
    fireEvent.change(editor, { target: { value: source } })
    togglePreview()
    expect(await screen.findByTestId(testId)).toHaveTextContent(source.replace(/\n/g, ' '))
    togglePreview()
    expect(editor).toHaveValue(source)
    expect(state.mounts).toBe(1)
  })

  it('scopes preview selection to its file and unmounts previews in cached inactive tabs', async () => {
    const view = render(<Page />)
    const editor = await screen.findByRole('textbox')
    togglePreview()
    await screen.findByTestId('mermaid')
    state.active = false
    view.rerender(<Page />)
    expect(screen.queryByTestId('mermaid')).not.toBeInTheDocument()
    expect(editor).toHaveAttribute('data-interactive', 'false')
    state.active = true
    view.rerender(<Page path="other.mermaid" />)
    expect(screen.queryByTestId('mermaid')).not.toBeInTheDocument()
    expect(editor).toBeVisible()
    expect(editor).toHaveAttribute('data-interactive', 'true')
  })

  it.each([
    'x'.repeat(MAX_MERMAID_SOURCE_BYTES + 1),
    '\n'.repeat(MAX_MERMAID_SOURCE_LINES),
    '中'.repeat(MAX_MERMAID_SOURCE_BYTES / 2),
  ])(
    'keeps oversized diagrams out of the renderer and preserves the complete editable buffer',
    async (initial) => {
      render(<Page initial={initial} />)
      const editor = await screen.findByRole('textbox')
      togglePreview()
      expect(await screen.findByRole('alert')).toHaveTextContent('preview.sourceTooLarge')
      expect(screen.queryByTestId('mermaid')).not.toBeInTheDocument()
      togglePreview()
      expect(editor).toHaveValue(initial)
    },
  )

  it('shows empty source explicitly without leaving Mermaid loading', async () => {
    render(<Page initial="  " />)
    await screen.findByRole('textbox')
    togglePreview()
    expect(await screen.findByText('preview.sourceEmpty')).toBeInTheDocument()
    expect(screen.queryByTestId('mermaid')).not.toBeInTheDocument()
  })
})
