import { BaseBasicBlocksPlugin, BaseBasicMarksPlugin } from '@platejs/basic-nodes'
import { BaseCodeBlockPlugin } from '@platejs/code-block'
import { BaseLinkPlugin } from '@platejs/link'
import { BaseListPlugin } from '@platejs/list-classic'
import { MarkdownPlugin } from '@platejs/markdown'
import { BaseImagePlugin } from '@platejs/media'
import { BaseTablePlugin } from '@platejs/table'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import { plateMarkdownRules } from '@/components/plate/plateMarkdownRules'
import { remarkCalloutMarker } from '@/components/plate/remarkCalloutMarker'
import { remarkInlineLinksPreservingDefinitions } from '@/components/plate/remarkInlineLinksPreservingDefinitions'

export const plateMarkdownPlugin = MarkdownPlugin.configure({
  options: {
    remarkPlugins: [
      remarkGfm,
      remarkFrontmatter,
      remarkInlineLinksPreservingDefinitions,
      remarkCalloutMarker,
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
  BaseLinkPlugin,
  BaseImagePlugin,
  plateMarkdownPlugin,
] as const
