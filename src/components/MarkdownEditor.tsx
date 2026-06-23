import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { useHotkeys, type RegisterableHotkey } from '@tanstack/react-hotkeys'
import { useLatest } from 'ahooks'
import { ProsemirrorAdapterProvider, useNodeViewFactory } from '@prosemirror-adapter/react'
import '@milkdown/crepe/theme/common/style.css'
import MarkdownEditorStatusOverlay from '@/components/MarkdownEditorStatusOverlay'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDarkMode } from '@/hooks/useDarkMode'
import { useI18n } from '@/i18n/useI18n'
import type {
  MarkdownEditorHandle,
  MarkdownEditorProps,
} from '@/components/milkdown/markdownEditorTypes'
import { useMarkdownEditorDrop } from '@/components/milkdown/useMarkdownEditorDrop'
import { useMarkdownEditorDropIndicator } from '@/components/milkdown/useMarkdownEditorDropIndicator'
import { useMarkdownCrepeController } from '@/components/milkdown/useMarkdownCrepeController'
import { editorShortcutActionIds } from '@/components/milkdown/editorShortcuts'
import { resolveShortcutBindings } from '@/logic/shortcuts'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const MarkdownEditorInner = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>((props, ref) => {
  const darkMode = useDarkMode()
  const { t } = useI18n()
  const shellRef = useRef<HTMLDivElement | null>(null)
  const nodeViewFactory = useNodeViewFactory()
  const isEditorEmpty = !/\S/.test(props.value)
  const shortcutOverrides = usePreferencesStore((state) => state.shortcutOverrides)
  const markdownAssetImportStrategy = usePreferencesStore(
    (state) => state.markdownAssetImportStrategy,
  )
  const immersiveZenMode = usePreferencesStore((state) => state.immersiveZenMode)
  const immersiveFocusMode = usePreferencesStore((state) => state.immersiveFocusMode)
  const immersiveTypewriterMode = usePreferencesStore((state) => state.immersiveTypewriterMode)
  const motionSmoothScrolling = usePreferencesStore((state) => state.motionSmoothScrolling)
  const {
    focusEditor,
    getMarkdown,
    handlers,
    importImageSources,
    placeSelectionAtClientPoint,
    rootRef,
    runShortcutAction,
    scrollAreaRef,
    status,
  } = useMarkdownCrepeController({
    ...props,
    darkMode,
    markdownAssetImportStrategy,
    nodeViewFactory,
  })
  const runShortcutActionRef = useLatest(runShortcutAction)

  const shortcutDefinitions = useMemo(() => {
    const bindings = resolveShortcutBindings(shortcutOverrides)
    return editorShortcutActionIds.flatMap((action) =>
      bindings[action].map((hotkey) => ({
        hotkey: hotkey as RegisterableHotkey,
        callback: () => {
          runShortcutActionRef.current(action)
        },
        options: {
          meta: { name: action },
        },
      })),
    )
  }, [runShortcutActionRef, shortcutOverrides])

  useHotkeys(shortcutDefinitions, {
    conflictBehavior: 'replace',
    ignoreInputs: false,
    preventDefault: true,
    stopPropagation: true,
    target: shellRef,
  })

  useImperativeHandle(ref, () => ({
    focus: focusEditor,
    getMarkdown,
  }))

  const { dropzoneRootProps, setShellElement } = useMarkdownEditorDrop({
    immersiveFocusMode,
    immersiveTypewriterMode,
    immersiveZenMode,
    importImageSources,
    isEditorEmpty,
    motionSmoothScrolling,
    placeSelectionAtClientPoint,
    shellRef,
    statusPhase: status.phase,
  })
  const dropIndicatorRef = useMarkdownEditorDropIndicator({
    editorRootRef: rootRef,
    shellRef,
  })

  return (
    <div {...dropzoneRootProps} ref={setShellElement} {...handlers}>
      <div
        aria-hidden="true"
        className="marklab-editor-drop-indicator"
        data-visible="false"
        ref={dropIndicatorRef}
      />
      <MarkdownEditorStatusOverlay
        errorLabel={t('editor.loadFailed')}
        loadingLabel={t('editor.loading')}
        status={status}
      />
      <ScrollArea
        ref={scrollAreaRef}
        className="h-full flex-1"
        smoothWheel={motionSmoothScrolling}
        viewportClassName="editor-scroll-viewport"
      >
        <div
          className="milkdown min-h-full"
          data-drop-hint={t('editor.dropImages')}
          data-empty-hint={t('editor.emptyHint')}
          data-import-hint={t('editor.importingImages')}
          ref={rootRef}
        />
      </ScrollArea>
    </div>
  )
})

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>((props, ref) => {
  return (
    <ProsemirrorAdapterProvider>
      <MarkdownEditorInner {...props} ref={ref} />
    </ProsemirrorAdapterProvider>
  )
})

export default MarkdownEditor
