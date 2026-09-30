import { forwardRef, useCallback, useImperativeHandle } from 'react'
import '@milkdown/crepe/theme/common/style.css'
import MarkdownEditorStatusOverlay from '@/components/MarkdownEditorStatusOverlay'
import { useDarkMode } from '@/hooks/useDarkMode'
import { useI18n } from '@/i18n/useI18n'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import type {
  MarkdownEditorHandle,
  MarkdownEditorProps,
} from '@/components/milkdown/markdownEditorTypes'
import { useMarkdownPlaygroundController } from '@/components/milkdown/useMarkdownPlaygroundController'
import { SlashUrlDialog } from '@/components/milkdown/SlashUrlDialog'
import { EditorContextMenu } from '@/components/EditorContextMenu'
import { cn } from '@/lib/utils'

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>((props, ref) => {
  const darkMode = useDarkMode()
  const { t } = useI18n()
  const shortcutOverrides = usePreferencesStore((state) => state.shortcutOverrides)
  const { contextMenu, focusEditor, getMarkdown, rootRef, scrollAreaRef, status, urlDialog } =
    useMarkdownPlaygroundController({
      ...props,
      darkMode,
      shortcutOverrides,
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
    <EditorContextMenu
      getCapabilities={contextMenu.getCapabilities}
      onAction={contextMenu.onAction}
      shortcutOverrides={shortcutOverrides}
    >
      <div className="relative flex h-full flex-1 flex-col">
        <div
          className={cn(
            'crepe crepe-playground flex h-full flex-1 flex-col',
            props.readOnly && 'is-readonly-editor is-typewriter-editor',
          )}
          data-readonly={props.readOnly ? 'true' : undefined}
          tabIndex={props.readOnly ? 0 : undefined}
          ref={setPlaygroundRootElement}
        />
        <MarkdownEditorStatusOverlay
          errorLabel={t('editor.loadFailed')}
          loadingLabel={t('editor.loading')}
          status={status}
        />
        {urlDialog?.request && (
          <SlashUrlDialog
            state={urlDialog}
            labels={props.slashLabels}
            cancelLabel={t('scm.cancel')}
            errorLabel={t('editor.loadFailed')}
          />
        )}
      </div>
    </EditorContextMenu>
  )
})

export default MarkdownEditor
