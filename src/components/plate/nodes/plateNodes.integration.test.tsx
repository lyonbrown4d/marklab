import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DndPlugin } from '@platejs/dnd'
import { BlockSelectionPlugin } from '@platejs/selection/react'
import { createPlateEditor, Plate, PlateContent } from 'platejs/react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { plateMarkdownPlugin } from '@/components/plate/plateMarkdownConfig'
import { deserializePlateMarkdown } from '@/components/plate/plateMarkdownSerialization'
import { createPlateNodePlugins } from '@/components/plate/nodes/plateNodePlugins'

const remoteImageCapability =
  'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

const syntaxAliasCases = [
  ['js', 'const value = 1'],
  ['javascript', 'const value = 1'],
  ['ts', 'const value: number = 1'],
  ['typescript', 'const value: number = 1'],
  ['sh', 'if true; then echo ok; fi'],
  ['bash', 'if true; then echo ok; fi'],
  ['shell', 'if true; then echo ok; fi'],
  ['py', 'def hello():\n  return True'],
  ['python', 'def hello():\n  return True'],
  ['kt', 'fun main() = println("hello")'],
  ['kotlin', 'fun main() = println("hello")'],
  ['yml', 'name: value'],
  ['yaml', 'name: value'],
  ['haskell', 'main = putStrLn "hello"'],
  ['dart', 'void main() { print("hello"); }'],
  ['powershell', '$value = Write-Output "hello"'],
  ['fortran', 'program hello\nend program hello'],
] as const

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
    plugins: [BlockSelectionPlugin, ...createPlateNodePlugins(), plateMarkdownPlugin],
    value: (instance) => deserializePlateMarkdown(instance, markdown),
  })

  return {
    editor,
    ...render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <DndProvider backend={HTML5Backend}>
            <Plate editor={editor} readOnly={readOnly}>
              <PlateContent aria-label="Markdown document" readOnly={readOnly} />
            </Plate>
          </DndProvider>
        </MemoryRouter>
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
    expect(
      screen.getByText(
        (_, element) => element?.tagName === 'CODE' && element.textContent === 'const value = 1',
      ),
    ).toBeInTheDocument()
  })

  it('decorates fenced code with syntax token classes', () => {
    renderMarkdown(['```ts', 'const value = 1', '```'].join('\n'))

    expect(screen.getByText('const').closest('.hljs-keyword')).not.toBeNull()
    expect(screen.getByText('1').closest('.hljs-number')).not.toBeNull()
  })

  it.each(syntaxAliasCases)('supports the %s fenced-code language alias', (language, source) => {
    const { container } = renderMarkdown(['```' + language, source, '```'].join('\n'))

    expect(container.querySelector('[class*="hljs-"]')).not.toBeNull()
  })

  it('falls back to plain text for an unknown fenced-code language', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { container } = renderMarkdown(['```madeup', 'alpha beta', '```'].join('\n'))

    expect(container.querySelector('code')).toHaveTextContent('alpha beta')
    expect(container.querySelector('[class*="hljs-"]')).toBeNull()
    expect(warning).toHaveBeenCalledWith(
      'Language "madeup" is not registered. Falling back to plaintext',
      undefined,
    )
    warning.mockRestore()
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
    expect(screen.getAllByRole('button', { name: 'Move block' })).toHaveLength(2)
    const handle = within(blocks[0]).getByRole('button', { name: 'Move block' })
    expect(handle).toHaveAttribute(
      'aria-keyshortcuts',
      'Space Control+Space Meta+Space Shift+Space ArrowUp ArrowDown Alt+ArrowUp Alt+ArrowDown',
    )
    expect(handle).toHaveAttribute('contenteditable', 'false')
    expect(handle).toHaveAttribute('data-block-id')
    expect(handle).toHaveAttribute('draggable', 'true')

    view.unmount()
    renderMarkdown('Read-only block')
    expect(screen.queryByRole('button', { name: 'Move block' })).not.toBeInTheDocument()
  })

  it('roves between handles and moves a selected block with Alt+Arrow', async () => {
    const { container, editor } = renderMarkdown('First\n\nSecond\n\nThird', false)
    const blocks = container.querySelectorAll<HTMLElement>('[data-block-drag-wrapper="true"]')
    const secondHandle = within(blocks[1]).getByRole('button', { name: 'Move block' })

    secondHandle.focus()
    fireEvent.keyDown(secondHandle, { key: 'ArrowUp' })

    const firstHandle = within(blocks[0]).getByRole('button', { name: 'Move block' })
    expect(firstHandle).toHaveFocus()
    expect(editor.children.map((node) => node.children[0]?.text)).toEqual([
      'First',
      'Second',
      'Third',
    ])

    fireEvent.keyDown(firstHandle, { key: 'ArrowDown' })
    expect(secondHandle).toHaveFocus()
    fireEvent.keyDown(secondHandle, { key: ' ' })
    expect(editor.getOptions(BlockSelectionPlugin).selectedIds).toEqual(
      new Set([blocks[1]?.dataset.blockId]),
    )
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Move block' })[1]).toHaveFocus()
    })
    const selectedHandle = screen.getAllByRole('button', { name: 'Move block' })[1]!
    expect(fireEvent.keyDown(selectedHandle, { altKey: true, key: 'ArrowUp' })).toBe(false)

    expect(editor.children.map((node) => node.children[0]?.text)).toEqual([
      'Second',
      'First',
      'Third',
    ])
    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(blocks[1]).getByRole('button', { name: 'Move block' }),
      )
    })

    fireEvent.keyDown(document.activeElement!, { altKey: true, key: 'ArrowDown' })
    expect(editor.children.map((node) => node.children[0]?.text)).toEqual([
      'First',
      'Second',
      'Third',
    ])
  })

  it('shows contiguous and disjoint handle selections without replacing text selection', () => {
    const { container, editor } = renderMarkdown('First\n\nSecond\n\nThird\n\nFourth', false)
    const blocks = container.querySelectorAll<HTMLElement>('[data-block-drag-wrapper="true"]')
    const handles = [...blocks].map((block) =>
      within(block).getByRole('button', { name: 'Move block' }),
    )

    fireEvent.pointerDown(handles[1])
    fireEvent.pointerDown(handles[3], { shiftKey: true })

    expect([...blocks].map((block) => block.dataset.blockSelected)).toEqual([
      'false',
      'true',
      'true',
      'true',
    ])

    fireEvent.pointerDown(handles[0], { ctrlKey: true })
    fireEvent.pointerDown(handles[2], { ctrlKey: true })
    expect(editor.getOptions(BlockSelectionPlugin).selectedIds?.size).toBe(3)
    expect([...blocks].map((block) => block.dataset.blockSelected)).toEqual([
      'true',
      'true',
      'false',
      'true',
    ])

    fireEvent.dragStart(handles[1], {
      dataTransfer: { dropEffect: 'none', effectAllowed: 'none' },
    })
    expect(editor.getOption(DndPlugin, 'draggingId')).toEqual([
      blocks[0]?.dataset.blockId,
      blocks[1]?.dataset.blockId,
      blocks[3]?.dataset.blockId,
    ])
  })
})
