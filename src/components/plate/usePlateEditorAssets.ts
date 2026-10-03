import { useCallback, type RefObject } from 'react'
import type { PlateEditor } from 'platejs/react'
import {
  importMarkdownImages,
  pickMarkdownImageSource,
  type MarkdownImageImportSource,
} from '@/components/editor/assets'
import { usePlateAssetDrop } from '@/components/plate/usePlateAssetDrop'
import type { MarkdownAssetImportStrategy } from '@/store/appTypes'

export const usePlateEditorAssets = ({
  activePath,
  canEdit,
  editor,
  getMarkdown,
  readOnly,
  shellRef,
  strategy,
}: {
  activePath: string | null
  canEdit: () => boolean
  editor: PlateEditor
  getMarkdown: () => Promise<string>
  readOnly: boolean
  shellRef: RefObject<HTMLDivElement | null>
  strategy: MarkdownAssetImportStrategy
}) => {
  const importSources = useCallback(
    (
      sources: readonly MarkdownImageImportSource[],
      insertImage: (url: string, alt?: string) => boolean,
      signal: AbortSignal,
    ) => {
      return getMarkdown().then((markdown) =>
        importMarkdownImages(sources, {
          activePath,
          getDocumentPath: () => activePath,
          getEditorIdentity: () => editor,
          insertImage,
          markdown,
          signal,
          strategy,
        }),
      )
    },
    [activePath, editor, getMarkdown, strategy],
  )
  const assetDrop = usePlateAssetDrop({
    canEdit,
    className: 'relative flex h-full min-h-0 flex-1 flex-col',
    editor,
    enabled: !readOnly,
    importSources,
    shellRef,
  })
  const { importImageSources } = assetDrop
  const pickAndImportImage = useCallback(async () => {
    if (!canEdit()) return false
    const source = await pickMarkdownImageSource()
    return source ? importImageSources([source]) : false
  }, [canEdit, importImageSources])

  return { assetDrop, pickAndImportImage }
}
