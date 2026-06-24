import { forwardRef, useCallback, useImperativeHandle } from 'react'
import '@milkdown/crepe/theme/common/style.css'
import MarkdownEditorStatusOverlay from '@/components/MarkdownEditorStatusOverlay'
import { useDarkMode } from '@/hooks/useDarkMode'
import { useI18n } from '@/i18n/useI18n'
import type {
  MarkdownEditorHandle,
  MarkdownEditorProps,
} from '@/components/milkdown/markdownEditorTypes'
import { useMarkdownPlaygroundController } from '@/components/milkdown/useMarkdownPlaygroundController'

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>((props, ref) => {
  const darkMode = useDarkMode()
  const { t } = useI18n()
  const { focusEditor, getMarkdown, rootRef, scrollAreaRef, status } =
    useMarkdownPlaygroundController({
      ...props,
      darkMode,
    })

  useImperativeHandle(ref, () => ({
    focus: focusEditor,
    getMarkdown,
  }))

  const setPlaygroundRootElement = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node
      scrollAreaRef.current = node
    },
    [rootRef, scrollAreaRef],
  )

  return (
    <div className="relative flex h-full flex-1 flex-col">
      <div
        className="crepe crepe-playground flex h-full flex-1 flex-col"
        ref={setPlaygroundRootElement}
      />
      <MarkdownEditorStatusOverlay
        errorLabel={t('editor.loadFailed')}
        loadingLabel={t('editor.loading')}
        status={status}
      />
    </div>
  )
})

export default MarkdownEditor
