import {
  Bold,
  CalendarPlus,
  Code,
  FileImage,
  FileText,
  Heading,
  Image,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  RemoveFormatting,
  Strikethrough,
  Table,
  TextQuote,
  type LucideIcon,
} from 'lucide-react'
import { deserializeMd } from '@platejs/markdown'
import type { TRange } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import {
  markdownEditorCommandCatalog,
  markdownEditorSlashCommands,
} from '@/components/editor/editorCommandCatalog'
import { markdownTemplates } from '@/components/editor/slashMenuTemplates'
import { runPlateEditorShortcut } from '@/components/plate/plateEditorShortcuts'
import { capturePlateSlashUrlInsertion } from '@/components/plate/slash/plateSlashUrlInsertion'
import type {
  PlateSlashCommand,
  PlateSlashCommandLabels,
  PlateSlashTrigger,
  RunPlateSlashCommandOptions,
} from '@/components/plate/slash/types'

const iconByKey: Record<string, LucideIcon> = {
  bold: Bold,
  bulletList: List,
  'calendar-file': CalendarPlus,
  'clear-format': RemoveFormatting,
  codeBlock: Code,
  divider: Minus,
  h1: Heading,
  h2: Heading,
  h3: Heading,
  h4: Heading,
  h5: Heading,
  h6: Heading,
  'image-import': Image,
  'image-url': FileImage,
  'inline-code': Code,
  italic: Italic,
  link: Link,
  orderedList: ListOrdered,
  quote: Quote,
  strike: Strikethrough,
  table: Table,
  taskList: ListChecks,
  text: Pilcrow,
}

const groupLabelKeys = {
  advanced: 'advancedGroup',
  list: 'listGroup',
  text: 'textGroup',
} as const

const fallbackIcon = (key: string) =>
  key.startsWith('callout') ? TextQuote : key.startsWith('code') ? Code : FileText

const commandKindById = new Map(
  markdownEditorCommandCatalog.map(({ id, kind }) => [id, kind] as const),
)

export const createPlateSlashCommands = (labels: PlateSlashCommandLabels): PlateSlashCommand[] =>
  markdownEditorSlashCommands.map((command) => ({
    ...(command.actionId ? { actionId: command.actionId } : {}),
    aliases: command.aliases ?? [],
    commandId: command.commandId,
    group: command.group,
    icon: iconByKey[command.key] ?? fallbackIcon(command.key),
    key: command.key,
    kind: commandKindById.get(command.commandId) ?? 'insert',
    label: labels[command.labelKey],
  }))

export const getPlateSlashGroupLabel = (
  group: PlateSlashCommand['group'],
  labels: PlateSlashCommandLabels,
) => labels[groupLabelKeys[group]]

export const filterPlateSlashCommands = (commands: readonly PlateSlashCommand[], query: string) => {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return [...commands]
  return commands.filter((command) =>
    [command.label, command.key, ...command.aliases].join(' ').toLocaleLowerCase().includes(needle),
  )
}

const isSamePoint = (first: TRange['anchor'], second: TRange['anchor']) =>
  first.offset === second.offset &&
  first.path.length === second.path.length &&
  first.path.every((part, index) => part === second.path[index])

export const isSamePlateSlashTrigger = (first: PlateSlashTrigger, second: PlateSlashTrigger) =>
  first.slashText === second.slashText &&
  isSamePoint(first.range.anchor, second.range.anchor) &&
  isSamePoint(first.range.focus, second.range.focus)

export const getPlateSlashTrigger = (editor: PlateEditor): PlateSlashTrigger | null => {
  if (!editor.selection || editor.api.isExpanded()) return null
  const block = editor.api.block()
  if (!block) return null
  const start = editor.api.start(block[1])
  if (!start) return null
  const prefixRange: TRange = { anchor: start, focus: editor.selection.focus }
  const prefix = editor.api.string(prefixRange)
  const slash = /(?:^|\s)(\/[^\s/]*)$/.exec(prefix)?.[1]
  if (!slash) return null
  const anchor = editor.api.before(editor.selection.focus, {
    distance: slash.length,
    unit: 'character',
  })
  if (!anchor) return null
  return {
    query: slash.slice(1),
    range: { anchor, focus: editor.selection.focus },
    slashText: slash,
  }
}

const consumeTrigger = (editor: PlateEditor, trigger: PlateSlashTrigger) => {
  editor.tf.select(trigger.range)
  editor.tf.delete()
}

const isBlockCommand = (command: PlateSlashCommand) =>
  command.kind === 'block' || command.kind === 'insert'

export const canRunPlateSlashCommand = (
  editor: PlateEditor,
  command: PlateSlashCommand,
  trigger: PlateSlashTrigger,
) => {
  if (!isBlockCommand(command)) return true
  const block = editor.api.block()
  const start = block ? editor.api.start(block[1]) : undefined
  if (!start) return false
  const prefix = editor.api.string({ anchor: start, focus: trigger.range.anchor })
  return prefix.trim().length === 0
}

const insertMarkdown = (editor: PlateEditor, trigger: PlateSlashTrigger, markdown: string) => {
  consumeTrigger(editor, trigger)
  const block = editor.api.block()
  const nodes = deserializeMd(editor, markdown)
  if (!block || nodes.length === 0) return
  const path = block[1]
  editor.tf.withoutNormalizing(() => {
    editor.tf.removeNodes({ at: path })
    editor.tf.insertNodes(nodes, { at: path })
  })
  const lastPath = [...path.slice(0, -1), path.at(-1)! + nodes.length - 1]
  editor.tf.select(editor.api.end(lastPath))
}

const insertInlineMarkdown = (
  editor: PlateEditor,
  trigger: PlateSlashTrigger,
  markdown: string,
) => {
  const nodes = deserializeMd(editor, markdown)
  const firstNode = nodes[0]
  if (!firstNode || !('children' in firstNode)) return
  consumeTrigger(editor, trigger)
  editor.tf.insertNodes(firstNode.children)
}

const markdownByKey: Record<string, string> = {
  divider: '---\n',
  taskList: '- [ ] Task\n',
  ...markdownTemplates,
}

export const runPlateSlashCommand = async ({
  command,
  editor,
  onCalendarFileCreate,
  onError,
  onImageImport,
  onUrlInsert,
  trigger,
}: RunPlateSlashCommandOptions): Promise<void> => {
  try {
    if (!canRunPlateSlashCommand(editor, command, trigger)) return
    if (command.key === 'link' || command.key === 'image-url') {
      onUrlInsert?.(
        capturePlateSlashUrlInsertion(
          editor,
          command.key === 'link' ? 'link' : 'image-url',
          trigger,
        ),
      )
      return
    }
    if (command.key === 'image-import') {
      consumeTrigger(editor, trigger)
      await onImageImport?.()
      return
    }
    if (command.key === 'calendar-file') {
      const target = editor.api.rangeRef(trigger.range)
      try {
        const markdown = await onCalendarFileCreate?.()
        const range = target.current
        if (markdown && range) insertInlineMarkdown(editor, { ...trigger, range }, markdown)
      } finally {
        target.unref()
      }
      return
    }
    const markdown = markdownByKey[command.key]
    if (markdown) {
      if (command.kind === 'inline') insertInlineMarkdown(editor, trigger, markdown)
      else insertMarkdown(editor, trigger, markdown)
      return
    }
    consumeTrigger(editor, trigger)
    if (command.actionId) runPlateEditorShortcut(editor, command.actionId)
  } catch (error) {
    onError?.(error)
  } finally {
    editor.tf.focus()
  }
}
