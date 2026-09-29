import { embeddedPreviewPlugin } from '@/components/milkdown/embeddedPreviewPlugin'
import { remarkImageTitleCompatibility } from '@/components/milkdown/markdownImageTitleCompatibility'
import { pasteLinkOnSelection } from '@/components/milkdown/pasteEnhancements'
import { markdownTableEditingPlugin } from '@/components/milkdown/tableEditingPlugin'

export type MarkdownSafePluginOptions = {
  getDocumentPath: () => string | null
  subscribeDocumentPath: (listener: () => void) => () => void
}

export const createMarkdownSafePreviewPlugins = (options: MarkdownSafePluginOptions) => [
  embeddedPreviewPlugin(options),
]

export const createMarkdownSafePlugins = (options: MarkdownSafePluginOptions) => [
  remarkImageTitleCompatibility,
  pasteLinkOnSelection,
  markdownTableEditingPlugin,
  ...createMarkdownSafePreviewPlugins(options),
]
