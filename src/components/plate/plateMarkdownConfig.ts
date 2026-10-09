import { BaseBasicBlocksPlugin, BaseBasicMarksPlugin } from '@platejs/basic-nodes'
import { BaseCodeBlockPlugin } from '@platejs/code-block'
import { BaseFootnoteDefinitionPlugin, BaseFootnoteReferencePlugin } from '@platejs/footnote'
import { BaseLinkPlugin } from '@platejs/link'
import { BaseListPlugin } from '@platejs/list-classic'
import { MarkdownPlugin } from '@platejs/markdown'
import { BaseEquationPlugin, BaseInlineEquationPlugin } from '@platejs/math'
import { BaseImagePlugin } from '@platejs/media'
import { BaseTablePlugin } from '@platejs/table'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { plateMarkdownRules } from '@/components/plate/plateMarkdownRules'
import { remarkPlateHtml } from '@/components/plate/html/remarkPlateHtml'
import { remarkCalloutMarker } from '@/components/plate/remarkCalloutMarker'
import { remarkInlineLinksPreservingDefinitions } from '@/components/plate/remarkInlineLinksPreservingDefinitions'

export const plateMarkdownPlugin = MarkdownPlugin.configure({
  options: {
    remarkPlugins: [
      remarkMath,
      remarkGfm,
      remarkFrontmatter,
      remarkInlineLinksPreservingDefinitions,
      remarkCalloutMarker,
      remarkPlateHtml,
    ],
    remarkStringifyOptions: {
      bullet: '-',
      emphasis: '*',
    },
    rules: plateMarkdownRules,
  },
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
