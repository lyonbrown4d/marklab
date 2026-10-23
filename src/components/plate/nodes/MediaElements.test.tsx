import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { H2Plugin } from '@platejs/basic-nodes/react'
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
const TestHeadingElement = (props: PlateElementProps) => <PlateElement {...props} as="h2" />

const renderLink = (url: string, documentPath = 'notes/current.md') => {
  const editor = createPlateEditor({
    plugins: [
      ParagraphPlugin.withComponent(TestParagraphElement),
      H2Plugin.withComponent(TestHeadingElement),
      LinkPlugin.configure({
        options: { allowedSchemes: ['http', 'https'] },
      }).withComponent(createLinkElement({ getDocumentPath: () => documentPath })),
    ],
    value: [
      {
        children: [{ children: [{ text: 'Brief' }], type: 'a', url }, { text: ' tail' }],
        type: 'p',
      },
      { children: [{ text: '中文总结' }], type: 'h2' },
    ],
  })

  return {
    editor,
    ...render(
      <Plate editor={editor}>
        <PlateContent aria-label="Markdown document" />
      </Plate>,
    ),
  }
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

  it('focuses an encoded local heading only with Ctrl or Cmd without changing the router hash', () => {
    const hash = '#/files/edit/notes/current.md'
    window.history.replaceState(null, '', hash)
    const { editor } = renderLink(`#${encodeURIComponent('中文总结')}`)
    act(() => editor.tf.select({ path: [0, 1], offset: 0 }))
    const previousSelection = editor.selection
    const fragmentLink = screen.getByRole('link', { name: 'Brief' })
    expect(fragmentLink).not.toHaveAttribute('href')
    expect(fragmentLink).not.toHaveAttribute('target')

    fireEvent.click(fragmentLink)
    expect(editor.selection).toEqual(previousSelection)
    expect(window.location.hash).toBe(hash)

    fireEvent.click(fragmentLink, { ctrlKey: true })
    expect(editor.selection?.anchor).toEqual({ path: [1, 0], offset: 0 })
    expect(window.location.hash).toBe(hash)

    act(() => editor.tf.select({ path: [0, 1], offset: 0 }))
    fireEvent.click(fragmentLink, { metaKey: true })
    expect(editor.selection?.anchor).toEqual({ path: [1, 0], offset: 0 })
    expect(window.location.hash).toBe(hash)
  })

  it('leaves the current document and selection unchanged when a local heading is missing', () => {
    const hash = '#/files/edit/notes/current.md'
    window.history.replaceState(null, '', hash)
    const { editor } = renderLink('#missing')
    act(() => editor.tf.select({ path: [0, 1], offset: 0 }))
    const previousSelection = editor.selection

    fireEvent.click(screen.getByRole('link', { name: 'Brief' }), { ctrlKey: true })

    expect(editor.selection).toEqual(previousSelection)
    expect(window.location.hash).toBe(hash)
  })

  it('opens workspace links only with Ctrl or Cmd', () => {
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
