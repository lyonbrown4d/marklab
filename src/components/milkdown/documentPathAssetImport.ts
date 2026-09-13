import {
  importMarkdownImageSources,
  type MarkdownImageImportSource,
} from '@/components/milkdown/assetEvents'

type ImportOptions = Parameters<typeof importMarkdownImageSources>[1]
type NotificationImportOptions = Omit<ImportOptions, 'subscribeDocumentPath'> & {
  subscribeDocumentPath: (listener: () => void) => () => void
}

// Crepe node views publish invalidations; asset imports subscribe to path values.
export const importMarkdownImageSourcesWithPathNotifications = (
  sources: MarkdownImageImportSource[],
  options: NotificationImportOptions,
) =>
  importMarkdownImageSources(sources, {
    ...options,
    subscribeDocumentPath: (listener) =>
      options.subscribeDocumentPath(() => listener(options.getDocumentPath())),
  })
