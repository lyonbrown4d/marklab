import { createPlateEditor } from 'platejs/react'
import { describe, expect, it, vi } from 'vitest'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import { markdownEditorSlashCommands } from '@/components/editor/editorCommandCatalog'
import {
  createPlateSlashCommands,
  filterPlateSlashCommands,
  getPlateSlashTrigger,
  runPlateSlashCommand,
} from '@/components/plate/slash/plateSlashCommands'
import { plateSlashTestLabels as labels } from '@/components/plate/slash/testFixtures'

const createEditor = (text: string) => {
  const editor = createPlateEditor({
    plugins: createPlateEditorPlugins(),
    value: [{ type: 'p', children: [{ text }] }],
  })
  editor.selection = {
    anchor: { path: [0, 0], offset: text.length },
    focus: { path: [0, 0], offset: text.length },
  }
  return editor
}

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

describe('Plate slash commands', () => {
  it('preserves the complete shared command catalog and searches aliases', () => {
    const commands = createPlateSlashCommands(labels)

    expect(commands).toHaveLength(markdownEditorSlashCommands.length)
    expect(commands.find((command) => command.key === 'h1')).toMatchObject({
      group: 'text',
      kind: 'block',
      label: 'Heading 1',
    })
    expect(filterPlateSlashCommands(commands, 'diagram').map(({ key }) => key)).toEqual(['mermaid'])
    expect(filterPlateSlashCommands(commands, 'calendar').map(({ key }) => key)).toEqual([
      'calendar-file',
    ])
  })

  it('finds a slash trigger after whitespace in a collapsed block selection', () => {
    const editor = createEditor('/hea')
    expect(getPlateSlashTrigger(editor)).toMatchObject({ query: 'hea', slashText: '/hea' })

    editor.children = [{ type: 'p', children: [{ text: 'before/hea' }] }]
    editor.selection = {
      anchor: { path: [0, 0], offset: 10 },
      focus: { path: [0, 0], offset: 10 },
    }
    expect(getPlateSlashTrigger(editor)).toBeNull()

    editor.children = [{ type: 'p', children: [{ text: '/hea' }] }]
    editor.selection = {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 4 },
    }
    expect(getPlateSlashTrigger(editor)).toBeNull()
  })

  it.each([
    ['h2', { type: 'h2', children: [{ text: '' }] }],
    ['quote', { type: 'blockquote', children: [{ type: 'p', children: [{ text: '' }] }] }],
  ] as const)('runs the %s block command after consuming the slash query', async (key, node) => {
    const editor = createEditor(`/${key}`)
    const command = createPlateSlashCommands(labels).find((item) => item.key === key)!

    await runPlateSlashCommand({ editor, command, trigger: getPlateSlashTrigger(editor)! })

    expect(editor.children[0]).toMatchObject(node)
  })

  it('inserts advanced Markdown templates through Plate deserialization', async () => {
    const editor = createEditor('/mermaid')
    const command = createPlateSlashCommands(labels).find((item) => item.key === 'mermaid')!

    await runPlateSlashCommand({ editor, command, trigger: getPlateSlashTrigger(editor)! })

    expect(editor.children[0]).toMatchObject({
      type: 'code_block',
      lang: 'mermaid',
    })
    expect(editor.api.string([0])).toContain('graph TD')
  })

  it('does not replace prose when a block command follows existing text', async () => {
    const editor = createEditor('Keep this /table')
    const command = createPlateSlashCommands(labels).find((item) => item.key === 'table')!

    await runPlateSlashCommand({ editor, command, trigger: getPlateSlashTrigger(editor)! })

    expect(editor.api.string([])).toBe('Keep this /table')
    expect(editor.children[0]).toMatchObject({ type: 'p' })
  })

  it('preserves prose when inserting an inline Markdown template', async () => {
    const editor = createEditor('Keep this /bold')
    const command = createPlateSlashCommands(labels).find((item) => item.key === 'bold')!

    await runPlateSlashCommand({ editor, command, trigger: getPlateSlashTrigger(editor)! })

    expect(editor.api.string([])).toBe('Keep this Bold')
    expect(editor.children).toHaveLength(1)
    expect(editor.children[0]).toMatchObject({ type: 'p' })
  })

  it('consumes image-import before calling the async importer', async () => {
    const editor = createEditor('/image')
    const onImageImport = vi.fn(async () => true)
    const command = createPlateSlashCommands(labels).find((item) => item.key === 'image-import')!

    await runPlateSlashCommand({
      editor,
      command,
      trigger: getPlateSlashTrigger(editor)!,
      onImageImport,
    })

    expect(editor.api.string([])).toBe('')
    expect(onImageImport).toHaveBeenCalledOnce()
  })

  it('inserts calendar Markdown at the captured slash target', async () => {
    const editor = createEditor('/calendar')
    const command = createPlateSlashCommands(labels).find((item) => item.key === 'calendar-file')!

    await runPlateSlashCommand({
      editor,
      command,
      trigger: getPlateSlashTrigger(editor)!,
      onCalendarFileCreate: async () => '[Event](meeting.ics)',
    })

    expect(editor.api.string([])).toBe('Event')
    expect(editor.children[0]).toMatchObject({
      children: expect.arrayContaining([
        expect.objectContaining({ type: 'a', url: 'meeting.ics' }),
      ]),
    })
  })

  it('tracks the calendar target while the document and selection change', async () => {
    const editor = createEditor('/calendar')
    const calendar = deferred<string | null>()
    const command = createPlateSlashCommands(labels).find((item) => item.key === 'calendar-file')!
    const execution = runPlateSlashCommand({
      editor,
      command,
      trigger: getPlateSlashTrigger(editor)!,
      onCalendarFileCreate: () => calendar.promise,
    })

    expect(editor.api.rangeRefs()).toHaveLength(1)
    editor.tf.select({ path: [0, 0], offset: 0 })
    editor.tf.insertText('Keep ')
    calendar.resolve('[Event](meeting.ics)')
    await execution

    expect(editor.api.string([])).toBe('Keep Event')
    expect(editor.api.rangeRefs()).toHaveLength(0)
  })

  it('releases the calendar target when creation is cancelled', async () => {
    const editor = createEditor('/calendar')
    const calendar = deferred<string | null>()
    const command = createPlateSlashCommands(labels).find((item) => item.key === 'calendar-file')!
    const execution = runPlateSlashCommand({
      editor,
      command,
      trigger: getPlateSlashTrigger(editor)!,
      onCalendarFileCreate: () => calendar.promise,
    })

    expect(editor.api.rangeRefs()).toHaveLength(1)
    calendar.resolve(null)
    await execution

    expect(editor.api.string([])).toBe('/calendar')
    expect(editor.api.rangeRefs()).toHaveLength(0)
  })
})
