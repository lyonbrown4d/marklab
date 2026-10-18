import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceMapStaticMarkdownPreview } from '@/pages/workspace-map/WorkspaceMapStaticMarkdownPreview'

describe('WorkspaceMapStaticMarkdownPreview', () => {
  it('presents native document structure without constructing a Slate editor', () => {
    const { container } = render(
      <WorkspaceMapStaticMarkdownPreview
        markdown="fallback"
        preview={{
          html: '<h1>Title</h1><p><strong>Strong</strong> <kbd>Ctrl</kbd><br></p><blockquote>Quoted</blockquote><hr><pre><code>const answer = 42</code></pre><ul><li>Plan</li><li>Ship</li></ul><table><tbody><tr><th>Name</th><td>Value</td></tr></tbody></table><details><summary>More</summary>Details</details><aside role="doc-footnote" aria-label="[^1]">[1]Source</aside><span class="graph-preview-link">Remote</span><span class="graph-preview-image">Diagram</span>',
          math: [],
        }}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument()
    expect(screen.getByText('Strong').closest('strong')).not.toBeNull()
    expect(screen.getByText('Ctrl').closest('kbd')).not.toBeNull()
    expect(screen.getByText('Quoted').closest('blockquote')).not.toBeNull()
    expect(screen.getByText('const answer = 42').closest('pre')).not.toBeNull()
    expect(screen.getByRole('list')).toHaveTextContent('PlanShip')
    expect(screen.getByRole('table')).toHaveTextContent('NameValue')
    expect(screen.getByText('More').closest('summary')).not.toBeNull()
    expect(screen.getByText('Details').closest('details')).not.toBeNull()
    expect(screen.getByRole('doc-footnote', { name: '[^1]' })).toHaveTextContent('[1]Source')
    expect(screen.getByText('Remote')).toBeInTheDocument()
    expect(screen.getByText('Diagram')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-slate-editor]')).toBeNull()
  })

  it('renders accessible bounded KaTeX slots with untrusted commands disabled', async () => {
    render(
      <WorkspaceMapStaticMarkdownPreview
        markdown="fallback"
        preview={{
          html: '<p><span data-graph-math-id="graph-math-0">x^2</span></p><span class="graph-preview-display-math" data-graph-math-id="graph-math-1">y = 2</span><span data-graph-math-id="graph-math-2">unsafe</span>',
          math: [
            { id: 'graph-math-0', expression: 'x^2', displayMode: false },
            { id: 'graph-math-1', expression: 'y = 2', displayMode: true },
            {
              id: 'graph-math-2',
              expression: '\\href{https://evil.example}{unsafe}',
              displayMode: false,
            },
            { id: 'graph-math-3', expression: 'missing slot', displayMode: false },
          ],
        }}
      />,
    )
    await vi.dynamicImportSettled()
    expect(await screen.findByRole('math', { name: 'x^2' })).not.toBeNull()
    expect(screen.getByRole('math', { name: 'y = 2' }).closest('.katex-display')).not.toBeNull()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('escapes fallback text and replaces stale formula content when details change', () => {
    const view = render(<WorkspaceMapStaticMarkdownPreview markdown="**Text** <img src=x>" />)
    const preview = screen.getByTestId('workspace-map-document-preview')
    expect(preview).toHaveTextContent('**Text** <img src=x>')
    expect(preview.querySelector('img')).toBeNull()
    view.rerender(
      <WorkspaceMapStaticMarkdownPreview
        markdown="next"
        preview={{ html: '<p>Next</p>', math: [] }}
      />,
    )
    expect(screen.getByText('Next').closest('p')).not.toBeNull()
    view.rerender(<WorkspaceMapStaticMarkdownPreview markdown="Fallback again" />)
    expect(screen.getByTestId('workspace-map-document-preview')).toHaveTextContent('Fallback again')
    expect(screen.queryByText('Next')).not.toBeInTheDocument()
  })

  it('ignores an old formula import after the node preview changes', async () => {
    const view = render(
      <WorkspaceMapStaticMarkdownPreview
        markdown="old"
        preview={{
          html: '<span data-graph-math-id="graph-math-0">Old formula</span>',
          math: [{ id: 'graph-math-0', expression: 'x^2', displayMode: false }],
        }}
      />,
    )
    view.rerender(
      <WorkspaceMapStaticMarkdownPreview
        markdown="new"
        preview={{
          html: '<span data-graph-math-id="graph-math-0">Fresh text</span>',
          math: [],
        }}
      />,
    )
    await vi.dynamicImportSettled()
    expect(screen.getByText('Fresh text')).toBeInTheDocument()
    expect(screen.queryByRole('math')).not.toBeInTheDocument()
  })
})
