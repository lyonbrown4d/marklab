import { embeddedPreviewPlugin } from '@/components/milkdown/embeddedPreviewPlugin'
import { pasteLinkOnSelection } from '@/components/milkdown/pasteEnhancements'

export type MarkdownSafePluginOptions = {
  getDocumentPath: () => string | null
  subscribeDocumentPath: (listener: () => void) => () => void
}

export const createMarkdownSafePreviewPlugins = (options: MarkdownSafePluginOptions) => [
  embeddedPreviewPlugin(options),
]

export const createMarkdownSafePlugins = (options: MarkdownSafePluginOptions) => [
  pasteLinkOnSelection,
  ...createMarkdownSafePreviewPlugins(options),
]
