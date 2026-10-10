import { fireEvent, render, screen } from '@testing-library/react'
import { createPlateEditor, Plate, PlateContent } from 'platejs/react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { describe, expect, it } from 'vitest'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import {
  deserializePlateMarkdown,
  serializePlateMarkdown,
} from '@/components/plate/plateMarkdownSerialization'

const markdown = [
  '---',
  '# keep this comment',
  'title: Demo # keep title comment',
  'tag: note',
  'published: false',
  'date: 2026-10-11',
  'website: https://example.com',
  'aliases: [one, two]',
  'tags:',
  '  - plate',
  '  - editor',
  'nested:',
  '  owner: Marklab',
  'shared: &shared exact',
  'copy: *shared',
  '---',
  '',
  '# Body',
].join('\n')

const renderFrontmatter = (source = markdown, readOnly = false) => {
  const editor = createPlateEditor({
    plugins: createPlateEditorPlugins(),
    value: (instance) => deserializePlateMarkdown(instance, source),
  })
  return {
    editor,
    ...render(
      <DndProvider backend={HTML5Backend}>
        <Plate editor={editor} readOnly={readOnly}>
          <PlateContent aria-label="Markdown document" readOnly={readOnly} />
        </Plate>
      </DndProvider>,
    ),
  }
}

describe('FrontmatterElement', () => {
  it('renders structured controls for supported values', () => {
    renderFrontmatter()

    expect(screen.getByRole('region', { name: 'Frontmatter' })).toHaveAttribute(
      'data-frontmatter-mode',
      'structured',
    )
    expect(screen.getByRole('textbox', { name: 'title frontmatter value' })).toHaveValue('Demo')
    expect(screen.getByRole('textbox', { name: 'tag frontmatter value' })).toHaveValue('note')
    expect(screen.getByRole('switch', { name: 'published frontmatter value' })).not.toBeChecked()
    expect(screen.getByLabelText('date frontmatter value')).toHaveAttribute('type', 'date')
    expect(screen.getByRole('textbox', { name: 'website frontmatter value' })).toHaveValue(
      'https://example.com',
    )
    expect(screen.getByRole('textbox', { name: 'aliases frontmatter value' })).toHaveValue(
      'one\ntwo',
    )
    expect(screen.getByRole('textbox', { name: 'tags frontmatter value' })).toHaveValue(
      'plate\neditor',
    )
    expect(screen.getByText('3 source-only')).toBeInTheDocument()
  })

  it('writes supported changes while preserving comments and unsupported YAML', () => {
    const { editor } = renderFrontmatter()

    fireEvent.change(screen.getByRole('textbox', { name: 'title frontmatter value' }), {
      target: { value: 'A: safer title' },
    })
    fireEvent.click(screen.getByRole('switch', { name: 'published frontmatter value' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'aliases frontmatter value' }), {
      target: { value: 'first\nsecond value\nthird' },
    })

    const serialized = serializePlateMarkdown(editor)
    expect(serialized).toContain('title: "A: safer title" # keep title comment')
    expect(serialized).toContain('published: true')
    expect(serialized).toContain('aliases: [ first, second value, third ]')
    expect(serialized).toContain(
      ['nested:', '  owner: Marklab', 'shared: &shared exact', 'copy: *shared'].join('\n'),
    )
    expect(serialized).toContain('# keep this comment')
  })

  it('provides source mode and uses it as the fallback for malformed YAML', () => {
    const valid = renderFrontmatter()
    fireEvent.click(screen.getByRole('radio', { name: 'Frontmatter source' }))
    expect(screen.getByRole('region', { name: 'Frontmatter' })).toHaveAttribute(
      'data-frontmatter-mode',
      'source',
    )
    expect(screen.getByLabelText('Frontmatter YAML source')).toHaveTextContent('title: Demo')
    valid.unmount()

    renderFrontmatter(['---', 'title: [broken', '---'].join('\n'))
    expect(screen.getByRole('region', { name: 'Frontmatter' })).toHaveAttribute(
      'data-frontmatter-mode',
      'source',
    )
    expect(screen.getByRole('radio', { name: 'Structured frontmatter' })).toBeDisabled()
    expect(screen.getByLabelText('Frontmatter YAML source')).toHaveTextContent('title: [broken')
  })

  it('disables structured editing in read-only mode', () => {
    renderFrontmatter(markdown, true)

    expect(screen.getByRole('textbox', { name: 'title frontmatter value' })).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'published frontmatter value' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'tags frontmatter value' })).toBeDisabled()
  })
})
