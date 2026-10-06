import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LinkPlugin } from '@platejs/link/react'
import {
  createPlateEditor,
  ParagraphPlugin,
  Plate,
  PlateContent,
  PlateElement,
  type PlateElementProps,
} from 'platejs/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/previews/EmbeddedFilePreview', () => ({
  default: ({ documentPath, target, title }: Record<string, string>) => (
    <article contentEditable={false} data-testid="embedded-file-preview">
      {documentPath}|{target}|{title}
    </article>
  ),
}))

vi.mock('@/components/previews/ExternalLinkPreview', () => ({
  default: ({ title, url }: { title: string; url: string }) => (
    <article contentEditable={false} data-testid="external-link-preview">
      {url}|{title}
    </article>
  ),
}))

import { createLinkElement } from '@/components/plate/nodes/MediaElements'

const TestParagraphElement = (props: PlateElementProps) => <PlateElement {...props} as="p" />

const renderLink = (url: string, documentPath = 'notes/current.md') => {
  const editor = createPlateEditor({
    plugins: [
      ParagraphPlugin.withComponent(TestParagraphElement),
      LinkPlugin.configure({
        options: { allowedSchemes: ['http', 'https'] },
      }).withComponent(createLinkElement({ getDocumentPath: () => documentPath })),
    ],
    value: [
      {
        children: [{ children: [{ text: 'Brief' }], type: 'a', url }, { text: ' tail' }],
        type: 'p',
      },
    ],
  })

  return render(
    <Plate editor={editor}>
      <PlateContent aria-label="Markdown document" />
    </Plate>,
  )
}

describe('Plate media elements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a standard local file link with an adjacent preview and editable link text', () => {
    renderLink('./brief.pdf')

    const link = screen.getByRole('link', { name: 'Brief' })
    const preview = screen.getByTestId('embedded-file-preview')
    expect(link).toHaveAttribute('data-slate-node', 'element')
    expect(link).not.toHaveAttribute('href')
    expect(link).not.toContainElement(preview)
    expect(preview.closest('p')).toBeNull()
    expect(preview).toHaveTextContent('notes/current.md|./brief.pdf|Brief')
    expect(preview).toHaveAttribute('contenteditable', 'false')
  })

  it('keeps safe HTTP links external and removes executable link destinations', async () => {
    const safe = renderLink('https://example.com/guide')
    expect(screen.getByRole('link', { name: 'Brief' })).toHaveAttribute(
      'href',
      'https://example.com/guide',
    )
    expect(screen.getByRole('link', { name: 'Brief' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    )
    expect(screen.getByRole('link', { name: 'Brief' })).toHaveAttribute('target', '_blank')
    expect(screen.getByTestId('external-link-preview')).toHaveTextContent(
      'https://example.com/guide|Brief',
    )
    expect(screen.getByTestId('external-link-preview').closest('p')).toBeNull()
    safe.unmount()

    renderLink('javascript:alert(1)')
    await waitFor(() => {
      expect(screen.getByText('Brief').closest('a')).not.toHaveAttribute('href')
    })
  })

  it('keeps fragments native and opens workspace links only with Ctrl or Cmd', () => {
    const fragment = renderLink('#summary')
    const fragmentLink = screen.getByRole('link', { name: 'Brief' })
    expect(fragmentLink).toHaveAttribute('href', '#summary')
    expect(fragmentLink).not.toHaveAttribute('target')
    fragment.unmount()

    const onWorkspaceLink = vi.fn()
    const editor = createPlateEditor({
      plugins: [
        ParagraphPlugin.withComponent(TestParagraphElement),
        LinkPlugin.withComponent(
          createLinkElement({
            getDocumentPath: () => 'notes/current.md',
            onWorkspaceLink,
          }),
        ),
      ],
      value: [
        {
          children: [{ children: [{ text: 'Brief' }], type: 'a', url: '../other.md' }],
          type: 'p',
        },
      ],
    })
    render(
      <Plate editor={editor}>
        <PlateContent aria-label="Markdown document" />
      </Plate>,
    )
    const workspaceLink = screen.getByRole('link', { name: 'Brief' })
    expect(workspaceLink).not.toHaveAttribute('href')

    fireEvent.click(workspaceLink)

    expect(onWorkspaceLink).not.toHaveBeenCalled()

    fireEvent.click(workspaceLink, { ctrlKey: true })

    expect(onWorkspaceLink).toHaveBeenCalledExactlyOnceWith('../other.md', 'notes/current.md')

    onWorkspaceLink.mockClear()
    fireEvent.click(workspaceLink, { metaKey: true })

    expect(onWorkspaceLink).toHaveBeenCalledExactlyOnceWith('../other.md', 'notes/current.md')
  })

  it('does not expose non-web schemes or protocol-relative URLs as DOM links', () => {
    const mail = renderLink('mailto:person@example.com')
    expect(screen.getByText('Brief').closest('a')).not.toHaveAttribute('href')
    mail.unmount()

    renderLink('//example.com/guide')
    expect(screen.getByText('Brief').closest('a')).not.toHaveAttribute('href')
  })
})
