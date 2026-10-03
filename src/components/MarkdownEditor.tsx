import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { AiInlineComposer, type AiComposerLabels } from '@/components/ai/AiInlineComposer'
import { EditorContextMenu } from '@/components/EditorContextMenu'
import MarkdownEditorStatusOverlay from '@/components/MarkdownEditorStatusOverlay'
import type { InlineAiComposerMessages } from '@/components/ai/inlineAiComposerPrompt'
import type {
  MarkdownEditorHandle,
  MarkdownEditorProps,
  MarkdownEditorStatus,
} from '@/components/editor/markdownEditorTypes'
import {
  PlateEditorSurface,
  type PlateEditorSurfaceHandle,
} from '@/components/plate/PlateEditorSurface'
import { usePlateEditorContextMenu } from '@/components/plate/usePlateEditorContextMenu'
import { usePlateFocusHeading } from '@/components/plate/usePlateFocusHeading'
import { usePlateInlineAiComposer } from '@/components/plate/usePlateInlineAiComposer'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>((props, ref) => {
  const { t } = useI18n()
  const shortcutOverrides = usePreferencesStore((state) => state.shortcutOverrides)
  const aiDefaultProviderId = usePreferencesStore((state) => state.aiDefaultProviderId)
  const markdownAssetImportStrategy = usePreferencesStore(
    (state) => state.markdownAssetImportStrategy,
  )
  const immersiveFocusMode = usePreferencesStore((state) => state.immersiveFocusMode)
  const immersiveTypewriterMode = usePreferencesStore((state) => state.immersiveTypewriterMode)
  const immersiveZenMode = usePreferencesStore((state) => state.immersiveZenMode)
  const motionSmoothScrolling = usePreferencesStore((state) => state.motionSmoothScrolling)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const surfaceRef = useRef<PlateEditorSurfaceHandle | null>(null)
  const [status, setStatus] = useState<MarkdownEditorStatus>({ phase: 'loading' })
  const getEditor = useCallback(() => surfaceRef.current?.getEditor() ?? null, [])
  usePlateFocusHeading(props.activePath, getEditor)
  const openLinkDialog = useCallback(() => surfaceRef.current?.openLinkDialog(), [])
  const contextMenu = usePlateEditorContextMenu({
    getEditor,
    onLinkInsert: openLinkDialog,
    readOnly: props.readOnly,
  })
  const aiLabels = useMemo<AiComposerLabels>(
    () => ({
      accept: t('ai.composer.accept'),
      abandon: t('ai.composer.abandon'),
      concise: t('ai.composer.actionConcise'),
      dialog: t('ai.composer.label'),
      diff: t('ai.composer.diffLabel'),
      explain: t('ai.composer.actionExplain'),
      findingModel: t('ai.composer.findingModel'),
      generate: t('ai.composer.generate'),
      instruction: t('ai.composer.instructionLabel'),
      placeholder: t('ai.composer.placeholder'),
      retry: t('ai.composer.retry'),
      rewrite: t('ai.composer.actionRewrite'),
      stop: t('ai.composer.stop'),
    }),
    [t],
  )
  const aiMessages = useMemo<InlineAiComposerMessages>(
    () => ({
      defaultProviderUnavailable: t('ai.composer.errorDefaultProviderUnavailable'),
      noProvider: t('ai.composer.errorNoProvider'),
      quickActionInstructions: {
        concise: t('ai.composer.instructionConcise'),
        explain: t('ai.composer.instructionExplain'),
        rewrite: t('ai.composer.instructionRewrite'),
      },
      staleSelection: t('ai.composer.errorStaleSelection'),
    }),
    [t],
  )
  const aiComposer = usePlateInlineAiComposer({
    activePath: props.activePath,
    defaultProviderId: aiDefaultProviderId,
    getEditor,
    messages: aiMessages,
    readOnly: props.readOnly ?? false,
    ready: status.phase === 'ready',
    rootRef,
  })

  useImperativeHandle(ref, () => ({
    focus: () => surfaceRef.current?.focus(),
    getMarkdown: () => surfaceRef.current?.getMarkdown() ?? Promise.resolve(props.value),
  }))

  return (
    <EditorContextMenu
      getCapabilities={contextMenu.getCapabilities}
      onAction={contextMenu.onAction}
      shortcutOverrides={shortcutOverrides}
    >
      <div className="relative flex h-full flex-1 flex-col" ref={rootRef}>
        <PlateEditorSurface
          activePath={props.activePath}
          assetImportStrategy={markdownAssetImportStrategy}
          autoFocus={props.autoFocus}
          className={cn(
            'markdown-editor flex-1',
            props.variant === 'embedded' && 'markdown-editor--embedded',
            props.readOnly && 'is-readonly-editor is-typewriter-editor',
            !props.readOnly && immersiveFocusMode && 'is-focus-editor',
            !props.readOnly && immersiveTypewriterMode && 'is-typewriter-editor',
            !props.readOnly && immersiveZenMode && 'is-zen-editor',
            motionSmoothScrolling && 'is-smooth-editor',
          )}
          onChange={props.onChange}
          onCalendarFileCreate={props.onCalendarFileCreate}
          onStatusChange={setStatus}
          placeholder={props.placeholder}
          readOnly={props.readOnly}
          ref={surfaceRef}
          shortcutOverrides={shortcutOverrides}
          slashLabels={props.slashLabels}
          smoothScrolling={motionSmoothScrolling}
          typewriterScroll={immersiveTypewriterMode}
          value={props.value}
        />
        <MarkdownEditorStatusOverlay
          errorLabel={t('editor.loadFailed')}
          loadingLabel={t('editor.loading')}
          status={status}
        />
        {aiComposer.isOpen && (
          <AiInlineComposer
            anchor={aiComposer.anchor}
            error={aiComposer.error}
            instruction={aiComposer.instruction}
            labels={aiLabels}
            modelLabel={aiComposer.modelLabel}
            onAccept={aiComposer.accept}
            onDismiss={aiComposer.dismiss}
            onInstructionChange={aiComposer.setInstruction}
            onQuickAction={aiComposer.quickAction}
            onRetry={aiComposer.retry}
            onStop={aiComposer.stop}
            onSubmit={aiComposer.submit}
            phase={aiComposer.phase}
            proposal={aiComposer.proposal}
            sourceText={aiComposer.sourceText}
          />
        )}
      </div>
    </EditorContextMenu>
  )
})

MarkdownEditor.displayName = 'MarkdownEditor'

export default MarkdownEditor
