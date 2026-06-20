import { clearTextInCurrentBlockCommand } from '@milkdown/kit/preset/commonmark'
import { describe, expect, it, vi } from 'vitest'
import {
  createSlashMenuConfig,
  type SlashCommandLabels,
} from '@/components/milkdown/slashMenuConfig'

const labels: SlashCommandLabels = {
  textGroup: 'Text',
  listGroup: 'List',
  advancedGroup: 'Advanced',
  text: 'Text',
  heading1: 'Heading 1',
  heading2: 'Heading 2',
  heading3: 'Heading 3',
  heading4: 'Heading 4',
  heading5: 'Heading 5',
  heading6: 'Heading 6',
  quote: 'Quote',
  divider: 'Divider',
  bulletList: 'Bullet list',
  orderedList: 'Ordered list',
  taskList: 'Task list',
  image: 'Image',
  codeBlock: 'Code block',
  table: 'Table',
}

describe('createSlashMenuConfig', () => {
  it('builds native slash groups from the shared editor command catalog', () => {
    const config = createSlashMenuConfig(labels, async () => true)

    expect(config.textGroup).toMatchObject({
      label: 'Text',
      text: { label: 'Text' },
      h1: { label: 'Heading 1' },
      h2: { label: 'Heading 2' },
      h3: { label: 'Heading 3' },
      h4: { label: 'Heading 4' },
      h5: { label: 'Heading 5' },
      h6: { label: 'Heading 6' },
      quote: { label: 'Quote' },
      divider: { label: 'Divider' },
    })
    expect(config.listGroup).toMatchObject({
      label: 'List',
      bulletList: { label: 'Bullet list' },
      orderedList: { label: 'Ordered list' },
      taskList: { label: 'Task list' },
    })
    expect(config.advancedGroup).toMatchObject({
      label: 'Advanced',
      image: null,
      codeBlock: { label: 'Code block' },
      table: { label: 'Table' },
      math: null,
    })
  })

  it('clears slash text before running the custom image import command', () => {
    const onImageImport = vi.fn(async () => true)
    const config = createSlashMenuConfig(labels, onImageImport)
    const addItem = vi.fn()
    const builder = {
      getGroup: vi.fn(() => ({ addItem })),
    }

    config.buildMenu(builder)

    const [, item] = addItem.mock.calls[0] as [
      string,
      { onRun: (ctx: { get: () => { call: (key: string) => void } }) => void },
    ]
    const call = vi.fn()
    item.onRun({ get: () => ({ call }) })

    expect(builder.getGroup).toHaveBeenCalledWith('advanced')
    expect(addItem).toHaveBeenCalledWith(
      'image-import',
      expect.objectContaining({
        label: 'Image',
        icon: expect.stringContaining('<svg'),
      }),
    )
    expect(call).toHaveBeenCalledWith(clearTextInCurrentBlockCommand.key)
    expect(onImageImport).toHaveBeenCalledTimes(1)
  })
})
