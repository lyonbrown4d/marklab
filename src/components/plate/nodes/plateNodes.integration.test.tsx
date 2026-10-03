import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createPlateEditor, Plate, PlateContent } from 'platejs/react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { describe, expect, it, vi } from 'vitest'
import { plateMarkdownPlugin } from '@/components/plate/plateMarkdownConfig'
import { deserializePlateMarkdown } from '@/components/plate/plateMarkdownSerialization'
import { createPlateNodePlugins } from '@/components/plate/nodes/plateNodePlugins'

const remoteImageCapability =
  'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

vi.mock('@/services/linkPreviewApi', () => ({
  linkPreviewApi: {
    fetch: vi.fn(async (url: string) => ({
      kind: 'image',
      media_type: 'image/png',
      src: 'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      url,
    })),
  },
}))

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
}))

const renderMarkdown = (markdown: string, readOnly = true) => {
  const editor = createPlateEditor({
    nodeId: true,
    plugins: [...createPlateNodePlugins(), plateMarkdownPlugin],
    value: (instance) => deserializePlateMarkdown(instance, markdown),
  })

  return {
    editor,
    ...render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DndProvider backend={HTML5Backend}>
          <Plate editor={editor} readOnly={readOnly}>
            <PlateContent aria-label="Markdown document" readOnly={readOnly} />
          </Plate>
        </DndProvider>
      </QueryClientProvider>,
    ),
  }
}

describe('createPlateNodePlugins', () => {
  it('renders semantic Markdown blocks, marks, links, images, and code', async () => {
    renderMarkdown(
      [
        '# Heading',
        '',
        '> Quote',
        '',
        '---',
        '',
        '**bold** *italic* ~~strike~~ `inline` [link](https://example.com)',
        '',
        '```ts',
        'const value = 1',
        '```',
        '',
        '![Diagram](https://example.com/diagram.png "Diagram title")',
      ].join('\n'),
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Heading' })).toBeInTheDocument()
    expect(screen.getByText('Quote').closest('blockquote')).not.toBeNull()
    expect(screen.getByRole('separator')).toBeInTheDocument()
    expect(screen.getByText('bold').closest('strong')).not.toBeNull()
    expect(screen.getByText('italic').closest('em')).not.toBeNull()
    expect(screen.getByText('strike').closest('s')).not.toBeNull()
    expect(screen.getByText('inline').closest('code')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'link' })).toHaveAttribute(
      'href',
      'https://example.com/',
    )
    expect(await screen.findByRole('img', { name: 'Diagram' })).toHaveAttribute(
      'src',
      remoteImageCapability,
    )
    expect(screen.getByText('const value = 1').closest('pre')).not.toBeNull()
  })

  it('renders GFM lists, tasks, and accessible tables', () => {
    renderMarkdown(
      [
        '- first',
        '- [x] complete',
        '- [ ] pending',
        '',
        '| Name | Value |',
        '| :--- | ---: |',
        '| alpha | 1 |',
      ].join('\n'),
    )

    expect(screen.getAllByRole('list')).not.toHaveLength(0)
    expect(screen.getByRole('checkbox', { name: 'Complete task' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Complete task' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Complete task' }).closest('li')).not.toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Pending task' })).not.toBeChecked()
    expect(screen.getByRole('table')).toHaveAttribute('data-slate-node', 'element')
    expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
  })

  it('renders ordered list start values and ordered task items', () => {
    renderMarkdown(['3. [x] done', '4. [ ] pending'].join('\n'))

    const list = screen.getByRole('list')
    expect(list.tagName).toBe('OL')
    expect(list).toHaveAttribute('start', '3')
    expect(screen.getByRole('checkbox', { name: 'Done task' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Pending task' })).not.toBeChecked()
  })

  it('renders plain items in a mixed ordered task list without a checkbox', () => {
    renderMarkdown(['3. [x] done', '4. plain'].join('\n'))

    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(screen.getByText('plain').closest('li')?.querySelector('[role="checkbox"]')).toBeNull()
  })

  it('renders reference links and images through the native interactive nodes', async () => {
    renderMarkdown(
      [
        '[Guide][guide]',
        '',
        '![Diagram][diagram]',
        '',
        '[guide]: https://example.com/guide "Guide title"',
        '[diagram]: https://example.com/diagram.png "Diagram title"',
      ].join('\n'),
    )

    expect(screen.getByRole('link', { name: 'Guide' })).toHaveAttribute(
      'href',
      'https://example.com/guide',
    )
    expect(await screen.findByRole('img', { name: 'Diagram' })).toHaveAttribute(
      'src',
      remoteImageCapability,
    )
  })

  it('shows accessible drag handles for editable top-level blocks only', () => {
    const view = renderMarkdown(['First', '', '```ts', 'const value = 1', '```'].join('\n'), false)
    const blocks = view.container.querySelectorAll<HTMLElement>('[data-block-drag-wrapper="true"]')

    expect(blocks).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Move block' })).not.toBeInTheDocument()
    fireEvent.pointerEnter(blocks[0])
    const handle = screen.getByRole('button', { name: 'Move block' })
    expect(handle).toHaveAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown')
    expect(handle).toHaveAttribute('contenteditable', 'false')
    expect(handle).toHaveAttribute('data-block-id')
    expect(handle).toHaveAttribute('draggable', 'true')

    view.unmount()
    renderMarkdown('Read-only block')
    expect(screen.queryByRole('button', { name: 'Move block' })).not.toBeInTheDocument()
  })

  it('moves a top-level block with the drag handle keyboard controls', async () => {
    const { container, editor } = renderMarkdown('First\n\nSecond\n\nThird', false)
    const blocks = container.querySelectorAll<HTMLElement>('[data-block-drag-wrapper="true"]')
    fireEvent.pointerEnter(blocks[1])
    const secondHandle = screen.getByRole('button', { name: 'Move block' })

    secondHandle.focus()
    fireEvent.keyDown(secondHandle, { key: 'ArrowUp' })

    expect(editor.children.map((node) => node.children[0]?.text)).toEqual([
      'Second',
      'First',
      'Third',
    ])
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move block' }))
    })

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(editor.children.map((node) => node.children[0]?.text)).toEqual([
      'First',
      'Second',
      'Third',
    ])
  })
})
