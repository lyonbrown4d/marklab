import type { Crepe } from '@milkdown/crepe'
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
import type { ShortcutActionId } from '@/logic/shortcuts'
import { callMilkdownCommand } from '@/components/milkdown/commandCompat'
import {
  markdownEditorHeadingShortcutLevels,
  markdownEditorShortcutActionIds,
} from '@/components/milkdown/editorCommandCatalog'

type MarkdownEditorShortcutOptions = {
  onImageImport?: () => Promise<boolean>
}

export const runMarkdownEditorShortcut = (
  crepe: Crepe | null,
  action: ShortcutActionId,
  options: MarkdownEditorShortcutOptions = {},
) => {
  if (!crepe) return false
  let handled = false

  crepe.editor.action((ctx) => {
    const commands = ctx.get(commandsCtx)

    const setParagraph = () =>
      callMilkdownCommand(commands, setBlockTypeCommand, {
        nodeType: paragraphSchema.type(ctx),
      })

    const setHeading = (level: number) =>
      callMilkdownCommand(commands, setBlockTypeCommand, {
        nodeType: headingSchema.type(ctx),
        attrs: { level },
      })

    const setCodeBlock = () =>
      callMilkdownCommand(commands, setBlockTypeCommand, {
        nodeType: codeBlockSchema.type(ctx),
      })

    const wrapInBulletList = () =>
      callMilkdownCommand(commands, wrapInBlockTypeCommand, {
        nodeType: bulletListSchema.type(ctx),
      })

    const wrapInOrderedList = () =>
      callMilkdownCommand(commands, wrapInBlockTypeCommand, {
        nodeType: orderedListSchema.type(ctx),
      })

    const wrapInBlockquote = () =>
      callMilkdownCommand(commands, wrapInBlockTypeCommand, {
        nodeType: blockquoteSchema.type(ctx),
      })

    const clearFormat = () => {
      const view = ctx.get(editorViewCtx)
      const { from, to } = view.state.selection
      let tr = view.state.tr
      Object.values(view.state.schema.marks).forEach((mark) => {
        tr = tr.removeMark(from, to, mark)
      })
      view.dispatch(tr)
      return setParagraph()
    }

    const headingLevel = markdownEditorHeadingShortcutLevels[action]
    if (headingLevel) {
      handled = setHeading(headingLevel)
      return
    }

    switch (action) {
      case 'editor.paragraph':
        handled = setParagraph()
        break
      case 'editor.bold':
        handled = callMilkdownCommand(commands, toggleStrongCommand)
        break
      case 'editor.italic':
        handled = callMilkdownCommand(commands, toggleEmphasisCommand)
        break
      case 'editor.inlineCode':
        handled = callMilkdownCommand(commands, toggleInlineCodeCommand)
        break
      case 'editor.strike':
        handled = callMilkdownCommand(commands, toggleStrikethroughCommand)
        break
      case 'editor.link': {
        const href = window.prompt('Link URL')
        handled = href ? commands.call(toggleLinkCommand.key, { href }) : true
        break
      }
      case 'editor.image': {
        handled = true
        void options.onImageImport?.()
        break
      }
      case 'editor.codeBlock':
        handled = setCodeBlock()
        break
      case 'editor.quote':
        handled = wrapInBlockquote()
        break
      case 'editor.orderedList':
        handled = wrapInOrderedList()
        break
      case 'editor.bulletList':
        handled = wrapInBulletList()
        break
      case 'editor.table':
        handled = callMilkdownCommand(commands, insertTableCommand, { row: 3, col: 3 })
        break
      case 'editor.clearFormat':
        handled = clearFormat()
        break
    }
  })

  return handled
}

export const editorShortcutActionIds = markdownEditorShortcutActionIds
