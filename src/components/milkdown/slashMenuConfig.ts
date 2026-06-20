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

const imageIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="M19 5v14H5V5h14Zm0-2H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2Zm-4.86 8.86-3 3.87L9 13.14 6 17h12l-3.86-5.14Z" />
  </svg>
`

const codeIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="m8.7 16.7-4-4a1 1 0 0 1 0-1.4l4-4 1.4 1.4L6.8 12l3.3 3.3-1.4 1.4Zm6.6 0-1.4-1.4 3.3-3.3-3.3-3.3 1.4-1.4 4 4a1 1 0 0 1 0 1.4l-4 4Z" />
  </svg>
`

const calloutIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm1 13h-2v-2h2v2Zm0-4h-2V7h2v5Z" />
  </svg>
`

const diagramIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="M7 3h4v4H7V3Zm6 0h4v4h-4V3ZM7 17h4v4H7v-4Zm6 0h4v4h-4v-4ZM9 8h2v3h2V8h2v3h3v2h-3v3h-2v-3h-2v3H9v-3H6v-2h3V8Z" />
  </svg>
`

const linkIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="M3.9 12a5 5 0 0 1 5-5h3v2h-3a3 3 0 1 0 0 6h3v2h-3a5 5 0 0 1-5-5Zm6-1h4v2h-4v-2Zm2-4h3a5 5 0 0 1 0 10h-3v-2h3a3 3 0 1 0 0-6h-3V7Z" />
  </svg>
`

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
}

type CustomSlashCommand = {
  icon: string
  onRun: (ctx: Ctx, labels: SlashCommandLabels, onImageImport: () => Promise<boolean>) => void
}

const markdownTemplates: Record<string, string> = {
  mermaid: '```mermaid\ngraph TD\n  A --> B\n```\n',
  'code-typescript': '```typescript\n\n```\n',
  'code-javascript': '```javascript\n\n```\n',
  'code-json': '```json\n{\n  \n}\n```\n',
  'code-bash': '```bash\n\n```\n',
  'code-html': '```html\n\n```\n',
  'callout-note': '> [!NOTE]\n> \n',
  'callout-tip': '> [!TIP]\n> \n',
  'callout-important': '> [!IMPORTANT]\n> \n',
  'callout-warning': '> [!WARNING]\n> \n',
  'callout-caution': '> [!CAUTION]\n> \n',
  footnote: 'Text[^1]\n\n[^1]: Footnote\n',
  frontmatter: '---\ntitle: Untitled\ntags: []\n---\n\n',
  details: '<details>\n<summary>Title</summary>\n\nContent\n\n</details>\n',
  toc: '## Contents\n\n- [Section](#section)\n',
  bold: '**Bold**\n',
  italic: '*Italic*\n',
  'inline-code': '`code`\n',
  strike: '~~Strikethrough~~\n',
}

const templateSlashCommand = (key: string, icon: string): CustomSlashCommand => ({
  icon,
  onRun: (ctx) => insertMarkdownTemplate(ctx, markdownTemplates[key] ?? ''),
})

const customSlashCommands: Record<string, CustomSlashCommand> = {
  'image-import': {
    icon: imageIcon,
    onRun: (ctx, _labels, onImageImport) => {
      clearSlashText(ctx)
      void onImageImport()
    },
  },
  'image-url': {
    icon: imageIcon,
    onRun: (ctx, labels) => {
      const src = window.prompt(labels.imageUrlPrompt)?.trim()
      if (!src) return
      const alt = window.prompt(labels.imageAltPrompt)?.trim() ?? ''
      clearSlashText(ctx)
      ctx.get(commandsCtx).call(insertImageCommand.key, { src, alt, title: '' })
      ctx.get(editorViewCtx).focus()
    },
  },
  link: {
    icon: linkIcon,
    onRun: (ctx, labels) => {
      const href = window.prompt(labels.linkUrlPrompt)?.trim()
      if (!href) return
      const text = window.prompt(labels.linkTextPrompt)?.trim() || href
      insertMarkdownTemplate(ctx, `[${escapeLinkText(text)}](${escapeLinkHref(href)})\n`)
    },
  },
  bold: templateSlashCommand('bold', calloutIcon),
  italic: templateSlashCommand('italic', calloutIcon),
  'inline-code': templateSlashCommand('inline-code', codeIcon),
  strike: templateSlashCommand('strike', calloutIcon),
  'clear-format': {
    icon: calloutIcon,
    onRun: (ctx) => clearCurrentFormat(ctx),
  },
  mermaid: templateSlashCommand('mermaid', diagramIcon),
  'code-typescript': templateSlashCommand('code-typescript', codeIcon),
  'code-javascript': templateSlashCommand('code-javascript', codeIcon),
  'code-json': templateSlashCommand('code-json', codeIcon),
  'code-bash': templateSlashCommand('code-bash', codeIcon),
  'code-html': templateSlashCommand('code-html', codeIcon),
  'callout-note': templateSlashCommand('callout-note', calloutIcon),
  'callout-tip': templateSlashCommand('callout-tip', calloutIcon),
  'callout-important': templateSlashCommand('callout-important', calloutIcon),
  'callout-warning': templateSlashCommand('callout-warning', calloutIcon),
  'callout-caution': templateSlashCommand('callout-caution', calloutIcon),
  footnote: templateSlashCommand('footnote', calloutIcon),
  frontmatter: templateSlashCommand('frontmatter', calloutIcon),
  details: templateSlashCommand('details', calloutIcon),
  toc: templateSlashCommand('toc', calloutIcon),
}

export const createSlashMenuConfig = (
  labels: SlashCommandLabels,
  onImageImport: () => Promise<boolean>,
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
          onRun: (ctx) => item.onRun(ctx, labels, onImageImport),
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
