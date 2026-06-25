import type { BlockEditFeatureConfig } from '@milkdown/crepe/feature/block-edit'
import { commandsCtx, editorViewCtx, parserCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import {
  clearTextInCurrentBlockCommand,
  insertImageCommand,
  paragraphSchema,
  setBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark'
import { Slice } from '@milkdown/kit/prose/model'
import {
  markdownEditorSlashCommands,
  type SlashCommandGroupId,
} from '@/components/milkdown/editorCommandCatalog'
import { slashMenuIcons } from '@/components/milkdown/slashMenuIcons'
import { markdownTemplates } from '@/components/milkdown/slashMenuTemplates'

export type SlashCommandLabels = {
  textGroup: string
  listGroup: string
  advancedGroup: string
  text: string
  heading1: string
  heading2: string
  heading3: string
  heading4: string
  heading5: string
  heading6: string
  quote: string
  divider: string
  link: string
  linkUrlPrompt: string
  linkTextPrompt: string
  bold: string
  italic: string
  inlineCode: string
  strike: string
  clearFormat: string
  bulletList: string
  orderedList: string
  taskList: string
  image: string
  imageUrl: string
  imageUrlPrompt: string
  imageAltPrompt: string
  codeBlock: string
  codeTypeScript: string
  codeJavaScript: string
  codeJson: string
  codeBash: string
  codeHtml: string
  mermaid: string
  table: string
  footnote: string
  frontmatter: string
  details: string
  toc: string
  calloutNote: string
  calloutTip: string
  calloutImportant: string
  calloutWarning: string
  calloutCaution: string
  calendarFile: string
  calendarFilePrompt: string
}

type CustomSlashCommand = {
  icon: string
  onRun: (
    ctx: Ctx,
    labels: SlashCommandLabels,
    onImageImport: () => Promise<boolean>,
    onCalendarFileCreate: () => Promise<string | null>,
  ) => void
}

type MarkdownPlaygroundSlashConfigOptions = {
  labels: SlashCommandLabels
  onCalendarFileCreate: () => Promise<string | null>
  onImageImport: () => Promise<boolean>
}

const templateSlashCommand = (key: string, icon: string): CustomSlashCommand => ({
  icon,
  onRun: (ctx) => insertMarkdownTemplate(ctx, markdownTemplates[key] ?? ''),
})

const customSlashCommands: Record<string, CustomSlashCommand> = {
  'image-import': {
    icon: slashMenuIcons.image,
    onRun: (ctx, _labels, onImageImport) => {
      clearSlashText(ctx)
      void onImageImport()
    },
  },
  'image-url': {
    icon: slashMenuIcons.image,
    onRun: (ctx, labels) => {
      const src = window.prompt(labels.imageUrlPrompt)?.trim()
      if (!src) return
      const alt = window.prompt(labels.imageAltPrompt)?.trim() ?? ''
      clearSlashText(ctx)
      ctx.get(commandsCtx).call(insertImageCommand.key, { src, alt, title: '' })
      ctx.get(editorViewCtx).focus()
    },
  },
  'calendar-file': {
    icon: slashMenuIcons.calendar,
    onRun: (ctx, _labels, _onImageImport, onCalendarFileCreate) => {
      void onCalendarFileCreate().then((markdown) => {
        if (markdown) {
          insertMarkdownTemplate(ctx, markdown)
        }
      })
    },
  },
  link: {
    icon: slashMenuIcons.link,
    onRun: (ctx, labels) => {
      const href = window.prompt(labels.linkUrlPrompt)?.trim()
      if (!href) return
      const text = window.prompt(labels.linkTextPrompt)?.trim() || href
      insertMarkdownTemplate(ctx, `[${escapeLinkText(text)}](${escapeLinkHref(href)})\n`)
    },
  },
  bold: templateSlashCommand('bold', slashMenuIcons.callout),
  italic: templateSlashCommand('italic', slashMenuIcons.callout),
  'inline-code': templateSlashCommand('inline-code', slashMenuIcons.code),
  strike: templateSlashCommand('strike', slashMenuIcons.callout),
  'clear-format': {
    icon: slashMenuIcons.callout,
    onRun: (ctx) => clearCurrentFormat(ctx),
  },
  mermaid: templateSlashCommand('mermaid', slashMenuIcons.diagram),
  'code-typescript': templateSlashCommand('code-typescript', slashMenuIcons.code),
  'code-javascript': templateSlashCommand('code-javascript', slashMenuIcons.code),
  'code-json': templateSlashCommand('code-json', slashMenuIcons.code),
  'code-bash': templateSlashCommand('code-bash', slashMenuIcons.code),
  'code-html': templateSlashCommand('code-html', slashMenuIcons.code),
  'callout-note': templateSlashCommand('callout-note', slashMenuIcons.callout),
  'callout-tip': templateSlashCommand('callout-tip', slashMenuIcons.callout),
  'callout-important': templateSlashCommand('callout-important', slashMenuIcons.callout),
  'callout-warning': templateSlashCommand('callout-warning', slashMenuIcons.callout),
  'callout-caution': templateSlashCommand('callout-caution', slashMenuIcons.callout),
  footnote: templateSlashCommand('footnote', slashMenuIcons.callout),
  frontmatter: templateSlashCommand('frontmatter', slashMenuIcons.callout),
  details: templateSlashCommand('details', slashMenuIcons.callout),
  toc: templateSlashCommand('toc', slashMenuIcons.callout),
}

export const createSlashMenuConfig = (
  labels: SlashCommandLabels,
  onImageImport: () => Promise<boolean>,
  onCalendarFileCreate: () => Promise<string | null>,
) => ({
  textGroup: {
    label: labels.textGroup,
    ...createNativeSlashItems(labels, 'text'),
  },
  listGroup: {
    label: labels.listGroup,
    ...createNativeSlashItems(labels, 'list'),
  },
  advancedGroup: {
    label: labels.advancedGroup,
    image: null,
    ...createNativeSlashItems(labels, 'advanced'),
    math: null,
  },
  buildMenu: (builder: {
    getGroup: (key: string) => {
      addItem: (
        key: string,
        item: {
          label: string
          icon: string
          onRun: (ctx: Ctx) => void
        },
      ) => unknown
    }
  }) => {
    markdownEditorSlashCommands
      .filter((command) => command.mode === 'custom')
      .forEach((command) => {
        const item = customSlashCommands[command.key]
        if (!item) return

        builder.getGroup(command.group).addItem(command.key, {
          label: slashLabel(labels[command.labelKey], command.aliases),
          icon: item.icon,
          onRun: (ctx) => item.onRun(ctx, labels, onImageImport, onCalendarFileCreate),
        })
      })
  },
})

const createNativeSlashItems = (labels: SlashCommandLabels, group: SlashCommandGroupId) => {
  return Object.fromEntries(
    markdownEditorSlashCommands
      .filter((command) => command.group === group && command.mode === 'native')
      .map((command) => [
        command.key,
        { label: slashLabel(labels[command.labelKey], command.aliases) },
      ]),
  )
}

export const createMarkdownPlaygroundSlashConfig = ({
  labels,
  onCalendarFileCreate,
  onImageImport,
}: MarkdownPlaygroundSlashConfigOptions): BlockEditFeatureConfig =>
  createSlashMenuConfig(labels, onImageImport, onCalendarFileCreate)

export const slashLabel = (label: string, aliases?: readonly string[]) => {
  if (!aliases?.length) return label
  return `${label} · ${aliases.join(' ')}`
}

const clearSlashText = (ctx: Ctx) => {
  ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key)
}

const insertMarkdownTemplate = (ctx: Ctx, markdown: string) => {
  if (!markdown) return

  clearSlashText(ctx)

  const view = ctx.get(editorViewCtx)
  const parser = ctx.get(parserCtx)
  const doc = parser(markdown)
  if (!doc) return

  const { selection } = view.state
  const depth = selection.$from.depth
  const from = depth > 0 ? selection.$from.before(depth) : selection.from
  const to = depth > 0 ? selection.$from.after(depth) : selection.to
  const tr = view.state.tr.replaceRange(from, to, new Slice(doc.content, 0, 0)).scrollIntoView()
  view.dispatch(tr)
  view.focus()
}

const clearCurrentFormat = (ctx: Ctx) => {
  clearSlashText(ctx)

  const view = ctx.get(editorViewCtx)
  const commands = ctx.get(commandsCtx)
  const { selection } = view.state
  const from = selection.from === selection.to ? selection.$from.start() : selection.from
  const to = selection.from === selection.to ? selection.$from.end() : selection.to
  let tr = view.state.tr

  Object.values(view.state.schema.marks).forEach((mark) => {
    tr = tr.removeMark(from, to, mark)
  })

  view.dispatch(tr.scrollIntoView())
  commands.call(setBlockTypeCommand.key, { nodeType: paragraphSchema.type(ctx) })
  view.focus()
}

const escapeLinkText = (text: string) => text.replace(/\\/g, '\\\\').replace(/\]/g, '\\]')

const escapeLinkHref = (href: string) => href.replace(/\)/g, '%29')
