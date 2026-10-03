import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/previews/EmbeddedFilePreview', () => ({
  default: () => <article data-testid="preview">Preview</article>,
}))

vi.mock('@/components/previews/ExternalLinkPreview', () => ({
  default: () => <article data-testid="preview">Preview</article>,
}))

import { usePlateLinkPreviewPortal } from '@/components/plate/nodes/usePlateLinkPreviewPortal'

const PreviewAnchor = () => {
  const { anchorRef, preview } = usePlateLinkPreviewPortal({
    documentPath: 'notes/current.md',
    target: './brief.pdf',
    title: 'Brief',
  })

  return (
    <>
      <a ref={anchorRef}>Brief</a>
      {preview}
    </>
  )
}

const SlateBlock = ({ children }: { children: ReactNode }) => (
  <p data-slate-node="element">{children}</p>
)

const previewHost = () => screen.getByTestId('preview').parentElement as HTMLElement

describe('usePlateLinkPreviewPortal', () => {
  it('places a paragraph preview after its Slate block', () => {
    render(
      <section data-testid="editor">
        <SlateBlock>
          <PreviewAnchor />
        </SlateBlock>
      </section>,
    )

    const host = previewHost()
    const paragraph = screen.getByText('Brief').closest('p')
    expect(host.parentElement).toBe(screen.getByTestId('editor'))
    expect(host.previousElementSibling).toBe(paragraph)
    expect(host.contentEditable).toBe('false')
    expect(host).toHaveAttribute('data-slate-ignore', 'true')
  })

  it('keeps a list preview inside its list item', () => {
    render(
      <ul data-testid="list">
        <li data-slate-node="element" data-testid="list-item">
          <PreviewAnchor />
        </li>
      </ul>,
    )

    const host = previewHost()
    const list = screen.getByTestId('list')
    expect(host.parentElement).toBe(screen.getByTestId('list-item'))
    expect(host).toBe(screen.getByTestId('list-item').lastElementChild)
    expect(Array.from(list.children).map((child) => child.tagName)).toEqual(['LI'])
  })

  it('keeps a table preview inside its table cell', () => {
    render(
      <table data-testid="table">
        <tbody>
          <tr data-testid="row">
            <td data-slate-node="element" data-testid="cell">
              <PreviewAnchor />
            </td>
          </tr>
        </tbody>
      </table>,
    )

    const host = previewHost()
    const row = screen.getByTestId('row')
    expect(host.parentElement).toBe(screen.getByTestId('cell'))
    expect(host).toBe(screen.getByTestId('cell').lastElementChild)
    expect(Array.from(row.children).map((child) => child.tagName)).toEqual(['TD'])
    expect(screen.getByTestId('table').querySelector(':scope > div')).toBeNull()
  })
})
