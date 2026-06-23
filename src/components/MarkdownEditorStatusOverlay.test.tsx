import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MarkdownEditorStatusOverlay from '@/components/MarkdownEditorStatusOverlay'

describe('MarkdownEditorStatusOverlay', () => {
  it('announces loading state politely', () => {
    render(
      <MarkdownEditorStatusOverlay
        errorLabel="Editor failed"
        loadingLabel="Loading editor"
        status={{ phase: 'loading' }}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Loading editor')
  })

  it('announces error state assertively', () => {
    render(
      <MarkdownEditorStatusOverlay
        errorLabel="Editor failed"
        loadingLabel="Loading editor"
        status={{ phase: 'error', message: 'Milkdown crashed' }}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Milkdown crashed')
  })

  it('does not render once editor is ready', () => {
    const { container } = render(
      <MarkdownEditorStatusOverlay
        errorLabel="Editor failed"
        loadingLabel="Loading editor"
        status={{ phase: 'ready' }}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
