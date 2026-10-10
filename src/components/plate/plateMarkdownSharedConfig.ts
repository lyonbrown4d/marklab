import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { remarkPlateHtml } from '@/components/plate/html/remarkPlateHtml'
import { remarkCalloutMarker } from '@/components/plate/remarkCalloutMarker'
import { remarkInlineLinksPreservingDefinitions } from '@/components/plate/remarkInlineLinksPreservingDefinitions'

export const plateMarkdownPluginOptions = {
  remarkPlugins: [
    remarkMath,
    remarkGfm,
    remarkFrontmatter,
    remarkInlineLinksPreservingDefinitions,
    remarkCalloutMarker,
    remarkPlateHtml,
  ],
  remarkStringifyOptions: {
    bullet: '-' as const,
    emphasis: '*' as const,
  },
}
