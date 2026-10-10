import { BaseBasicBlocksPlugin, BaseBasicMarksPlugin } from '@platejs/basic-nodes'
import { BaseCodeBlockPlugin } from '@platejs/code-block'
import { BaseFootnoteDefinitionPlugin, BaseFootnoteReferencePlugin } from '@platejs/footnote'
import { BaseLinkPlugin } from '@platejs/link'
import { BaseListPlugin } from '@platejs/list-classic'
import { MarkdownPlugin, serializeMd } from '@platejs/markdown'
import { BaseEquationPlugin, BaseInlineEquationPlugin } from '@platejs/math'
import { BaseImagePlugin } from '@platejs/media'
import { BaseTablePlugin } from '@platejs/table'
import { createPlateHtmlMarkdownRules } from '@/components/plate/html/plateHtmlMarkdownRules'
import { createPlateMarkdownRules } from '@/components/plate/plateMarkdownRules'
import { plateMarkdownPluginOptions } from '@/components/plate/plateMarkdownSharedConfig'

const plateMarkdownRules = createPlateMarkdownRules(
  createPlateHtmlMarkdownRules((editor, value) => serializeMd(editor, { value })),
)

export const plateMarkdownPlugin = MarkdownPlugin.configure({
  options: { ...plateMarkdownPluginOptions, rules: plateMarkdownRules },
})

export const plateMarkdownPlugins = [
  BaseBasicBlocksPlugin,
  BaseBasicMarksPlugin,
  BaseListPlugin,
  BaseTablePlugin,
  BaseCodeBlockPlugin,
  BaseFootnoteReferencePlugin,
  BaseFootnoteDefinitionPlugin,
  BaseInlineEquationPlugin,
  BaseEquationPlugin,
  BaseLinkPlugin,
  BaseImagePlugin,
  plateMarkdownPlugin,
] as const
