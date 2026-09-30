import { useEffect } from 'react'
import { toast } from 'sonner'
import { useI18n } from '@/i18n/useI18n'
import { isMarkdownFilePath } from '@/logic/fileTypes'
import { onRuntimeWebviewFileDrop } from '@/runtime/webview'

export const useMarkdownFileDrop = (openPath: (path: string) => Promise<void>): void => {
  const { t } = useI18n()

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | null = null

    const subscribe = async () => {
      const nextUnsubscribe = await onRuntimeWebviewFileDrop(({ paths }) => {
        const markdownPaths = paths.filter(isMarkdownFilePath)
        const firstPath = markdownPaths[0]
        if (!firstPath) return

        void openPath(firstPath)
        if (markdownPaths.length > 1) {
          toast.info(
            t('projectLoader.multipleMarkdownFilesDropped', {
              count: markdownPaths.length - 1,
            }),
          )
        }
      })

      if (disposed) {
        nextUnsubscribe?.()
        return
      }
      unsubscribe = nextUnsubscribe
    }

    void subscribe()
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [openPath, t])
}
