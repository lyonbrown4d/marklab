import { commandsCtx, editorViewCtx } from '@milkdown/kit/core'
import {
  blockquoteSchema,
  bulletListSchema,
  codeBlockSchema,
  headingSchema,
  orderedListSchema,
  paragraphSchema,
  setBlockTypeCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  wrapInBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark'
import { insertTableCommand, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm'
import { describe, expect, it, vi } from 'vitest'
import { runMarkdownEditorShortcut } from '@/components/milkdown/editorShortcuts'
import type { ShortcutActionId } from '@/logic/shortcuts'

const coreMock = vi.hoisted(() => ({
  commandsCtx: Symbol('commandsCtx'),
  editorViewCtx: Symbol('editorViewCtx'),
}))

const commonmarkMock = vi.hoisted(() => ({
  blockquoteNode: { name: 'blockquote' },
  bulletListNode: { name: 'bulletList' },
  codeBlockNode: { name: 'codeBlock' },
  headingNode: { name: 'heading' },
  orderedListNode: { name: 'orderedList' },
  paragraphNode: { name: 'paragraph' },
  blockquoteSchema: { type: vi.fn(() => commonmarkMock.blockquoteNode) },
  bulletListSchema: { type: vi.fn(() => commonmarkMock.bulletListNode) },
  codeBlockSchema: { type: vi.fn(() => commonmarkMock.codeBlockNode) },
  headingSchema: { type: vi.fn(() => commonmarkMock.headingNode) },
  orderedListSchema: { type: vi.fn(() => commonmarkMock.orderedListNode) },
  paragraphSchema: { type: vi.fn(() => commonmarkMock.paragraphNode) },
  setBlockTypeCommand: { key: 'setBlockType' },
  toggleEmphasisCommand: { key: 'toggleEmphasis' },
  toggleInlineCodeCommand: { key: 'toggleInlineCode' },
  toggleLinkCommand: { key: 'toggleLink' },
  toggleStrongCommand: { key: 'toggleStrong' },
  wrapInBlockTypeCommand: { key: 'wrapInBlockType' },
}))

const gfmMock = vi.hoisted(() => ({
  insertTableCommand: { key: 'insertTable' },
  toggleStrikethroughCommand: { key: 'toggleStrikethrough' },
}))

vi.mock('@milkdown/kit/core', () => coreMock)
vi.mock('@milkdown/kit/preset/commonmark', () => commonmarkMock)
vi.mock('@milkdown/kit/preset/gfm', () => gfmMock)

type FakeCommands = {
  call: ReturnType<typeof vi.fn>
}

type FakeTransaction = {
  removeMark: ReturnType<typeof vi.fn>
}

const createShortcutHarness = () => {
  const commands: FakeCommands = {
    call: vi.fn(() => true),
  }
  const transaction: FakeTransaction = {
    removeMark: vi.fn(() => transaction),
  }
  const view = {
    state: {
      selection: { from: 2, to: 8 },
      schema: {
        marks: {
          emphasis: { name: 'emphasis' },
          strong: { name: 'strong' },
        },
      },
      tr: transaction,
    },
    dispatch: vi.fn(),
  }
  const ctx = {
    get: vi.fn((token: unknown) => {
      if (token === commandsCtx) return commands
      if (token === editorViewCtx) return view
      return null
    }),
  }
  const crepe = {
    editor: {
      action: vi.fn((runner: (context: typeof ctx) => void) => runner(ctx)),
    },
  }

  return { commands, crepe, transaction, view }
}

const runShortcut = (
  action: ShortcutActionId,
  options: Parameters<typeof runMarkdownEditorShortcut>[2] = {},
) => {
  const harness = createShortcutHarness()
  const handled = runMarkdownEditorShortcut(harness.crepe as never, action, options)
  return { ...harness, handled }
}

const keyOf = (command: { key: unknown }) => command.key

const nodeTypeOf = (schema: { type: (ctx: never) => unknown }) => schema.type(null as never)

describe('runMarkdownEditorShortcut', () => {
  it('returns false when the editor is not ready', () => {
    expect(runMarkdownEditorShortcut(null, 'editor.paragraph')).toBe(false)
  })

  it('maps heading shortcuts to setBlockType with markdown levels', () => {
    const headingActions: Array<[ShortcutActionId, number]> = [
      ['editor.heading1', 1],
      ['editor.heading2', 2],
      ['editor.heading3', 3],
      ['editor.heading4', 4],
      ['editor.heading5', 5],
      ['editor.heading6', 6],
    ]

    headingActions.forEach(([action, level]) => {
      const { commands, handled } = runShortcut(action)

      expect(handled).toBe(true)
      expect(commands.call).toHaveBeenCalledWith(keyOf(setBlockTypeCommand), {
        attrs: { level },
        nodeType: nodeTypeOf(headingSchema),
      })
    })
  })

  it('runs block transform and insert shortcuts through Milkdown commands', () => {
    const cases: Array<[ShortcutActionId, unknown, unknown]> = [
      ['editor.paragraph', keyOf(setBlockTypeCommand), { nodeType: nodeTypeOf(paragraphSchema) }],
      ['editor.codeBlock', keyOf(setBlockTypeCommand), { nodeType: nodeTypeOf(codeBlockSchema) }],
      ['editor.quote', keyOf(wrapInBlockTypeCommand), { nodeType: nodeTypeOf(blockquoteSchema) }],
      [
        'editor.bulletList',
        keyOf(wrapInBlockTypeCommand),
        { nodeType: nodeTypeOf(bulletListSchema) },
      ],
      [
        'editor.orderedList',
        keyOf(wrapInBlockTypeCommand),
        { nodeType: nodeTypeOf(orderedListSchema) },
      ],
      ['editor.table', keyOf(insertTableCommand), { col: 3, row: 3 }],
    ]

    cases.forEach(([action, commandKey, payload]) => {
      const { commands, handled } = runShortcut(action)

      expect(handled).toBe(true)
      expect(commands.call).toHaveBeenCalledWith(commandKey, payload)
    })
  })

  it('runs inline mark shortcuts through Milkdown commands', () => {
    const cases: Array<[ShortcutActionId, unknown]> = [
      ['editor.bold', keyOf(toggleStrongCommand)],
      ['editor.italic', keyOf(toggleEmphasisCommand)],
      ['editor.inlineCode', keyOf(toggleInlineCodeCommand)],
      ['editor.strike', keyOf(toggleStrikethroughCommand)],
    ]

    cases.forEach(([action, commandKey]) => {
      const { commands, handled } = runShortcut(action)

      expect(handled).toBe(true)
      expect(commands.call).toHaveBeenCalledWith(commandKey)
    })
  })

  it('prompts before toggling links and treats cancelled prompts as handled', () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce('https://marklab.local')

    const linked = runShortcut('editor.link')

    expect(linked.handled).toBe(true)
    expect(linked.commands.call).toHaveBeenCalledWith(keyOf(toggleLinkCommand), {
      href: 'https://marklab.local',
    })

    prompt.mockReturnValueOnce(null)

    const cancelled = runShortcut('editor.link')

    expect(cancelled.handled).toBe(true)
    expect(cancelled.commands.call).not.toHaveBeenCalled()
  })

  it('delegates image import to the provided callback without running a Milkdown command', () => {
    const onImageImport = vi.fn(async () => true)
    const { commands, handled } = runShortcut('editor.image', { onImageImport })

    expect(handled).toBe(true)
    expect(commands.call).not.toHaveBeenCalled()
    expect(onImageImport).toHaveBeenCalledTimes(1)
  })

  it('removes active marks before resetting clear format to a paragraph', () => {
    const { commands, handled, transaction, view } = runShortcut('editor.clearFormat')

    expect(handled).toBe(true)
    expect(transaction.removeMark).toHaveBeenCalledWith(2, 8, { name: 'emphasis' })
    expect(transaction.removeMark).toHaveBeenCalledWith(2, 8, { name: 'strong' })
    expect(view.dispatch).toHaveBeenCalledWith(transaction)
    expect(commands.call).toHaveBeenCalledWith(keyOf(setBlockTypeCommand), {
      nodeType: nodeTypeOf(paragraphSchema),
    })
  })
})
