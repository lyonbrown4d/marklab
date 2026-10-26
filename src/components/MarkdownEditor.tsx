import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useKeepAliveContext } from 'keepalive-for-react'
import { AiInlineComposer, type AiComposerLabels } from '@/components/ai/AiInlineComposer'
import { useAiProvidersQuery } from '@/components/ai/aiProviderQuery'
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
import type { PlateSelectionToolbarLabels } from '@/components/plate/selection/PlateSelectionToolbar'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import { usePreferencesStore } from '@/store/usePreferencesStore'

type ScopedEditorStatus = {
  activePath: string | null
  status: MarkdownEditorStatus
}

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>((props, ref) => {
  const { t } = useI18n()
  const keepAlive = useKeepAliveContext()
  const interactionActive =
    (props.interactionActive ?? true) && (!keepAlive.cacheKey || keepAlive.active)
  const shortcutOverrides = usePreferencesStore((state) => state.shortcutOverrides)
  const aiDefaultProviderId = usePreferencesStore((state) => state.aiDefaultProviderId)
  const markdownAssetImportStrategy = usePreferencesStore(
    (state) => state.markdownAssetImportStrategy,
  )
  const immersiveFocusMode = usePreferencesStore((state) => state.immersiveFocusMode)
  const immersiveFocusScope = usePreferencesStore((state) => state.immersiveFocusScope) ?? 'block'
  const immersiveFocusIntensity =
    usePreferencesStore((state) => state.immersiveFocusIntensity) ?? 'standard'
  const immersiveTypewriterMode = usePreferencesStore((state) => state.immersiveTypewriterMode)
  const immersiveZenMode = usePreferencesStore((state) => state.immersiveZenMode)
  const motionSmoothScrolling = usePreferencesStore((state) => state.motionSmoothScrolling)
  const markdownContentWidth = usePreferencesStore((state) => state.markdownContentWidth)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const surfaceRef = useRef<PlateEditorSurfaceHandle | null>(null)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [scopedStatus, setScopedStatus] = useState<ScopedEditorStatus>({
    activePath: props.activePath,
    status: { phase: 'loading' },
  })
  const status =
    scopedStatus.activePath === props.activePath
      ? scopedStatus.status
      : ({ phase: 'loading' } as const)
  const activePath = props.activePath
  const onStatusChange = props.onStatusChange
  const handleStatusChange = useCallback(
    (nextStatus: MarkdownEditorStatus) => {
      setScopedStatus({ activePath, status: nextStatus })
      onStatusChange?.(nextStatus)
    },
    [activePath, onStatusChange],
  )
  const getEditor = useCallback(() => surfaceRef.current?.getEditor() ?? null, [])
  const { data: aiProviders } = useAiProvidersQuery(interactionActive && !props.readOnly)
  const aiAvailable = aiProviders?.some((provider) => provider.available) ?? false
  const restoreEditorFocus = useCallback(() => surfaceRef.current?.focus(), [])
  usePlateFocusHeading(props.activePath, getEditor, props.workspaceKey)
  const openLinkInput = useCallback(() => surfaceRef.current?.openLinkInput(), [])
  const contextMenu = usePlateEditorContextMenu({
    activePath: props.activePath,
    getEditor,
    interactionActive,
    onLinkInsert: openLinkInput,
    readOnly: props.readOnly || status.phase !== 'ready',
    workspaceKey: props.workspaceKey,
  })
  const aiLabels = useMemo<AiComposerLabels>(
    () => ({
      accept: t('ai.composer.accept'),
      ask: t('ai.composer.ask'),
      askPlaceholder: t('ai.composer.askPlaceholder'),
      abandon: t('ai.composer.abandon'),
      concise: t('ai.composer.actionConcise'),
      configuration: t('ai.composer.configuration'),
      dialog: t('ai.composer.label'),
      diff: t('ai.composer.diffLabel'),
      done: t('ai.composer.done'),
      explain: t('ai.composer.actionExplain'),
      explanation: t('ai.composer.explanationLabel'),
      editSelection: t('ai.composer.editSelection'),
      findingModel: t('ai.composer.findingModel'),
      generate: t('ai.composer.generate'),
      instruction: t('ai.composer.instructionLabel'),
      mode: t('ai.composer.mode'),
      privacy: t('ai.composer.privacySelection'),
      placeholder: t('ai.composer.placeholder'),
      provider: t('ai.composer.provider'),
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
    ready: aiAvailable && interactionActive && status.phase === 'ready',
    rootRef,
    shortcutOverrides,
  })
  const selectionToolbarLabels = useMemo<PlateSelectionToolbarLabels>(
    () => ({
      ai: t('ai.composer.label'),
      blockStyle: t('editor.selectionBlockStyle'),
      bold: t('slash.bold'),
      bulletList: t('slash.bulletList'),
      clear: t('slash.clearFormat'),
      code: t('slash.inlineCode'),
      copyError: t('editor.selectionCopyFailed'),
      copyMarkdown: t('edit.copyAsMarkdown'),
      heading1: t('slash.heading1'),
      heading2: t('slash.heading2'),
      heading3: t('slash.heading3'),
      italic: t('slash.italic'),
      link: t('slash.link'),
      more: t('editor.selectionMore'),
      orderedList: t('slash.orderedList'),
      paragraph: t('slash.text'),
      quote: t('slash.quote'),
      strike: t('slash.strike'),
      toolbar: t('slash.textGroup'),
    }),
    [t],
  )

  useImperativeHandle(ref, () => ({
    focus: () => surfaceRef.current?.focus(),
    getMarkdown: () => surfaceRef.current?.getMarkdown() ?? Promise.resolve(props.value),
  }))

  return (
    <EditorContextMenu
      getCapabilities={contextMenu.getCapabilities}
      onAction={contextMenu.onAction}
      onOpenChange={setContextMenuOpen}
      shortcutOverrides={shortcutOverrides}
    >
      <div className="relative flex h-full flex-1 flex-col" ref={rootRef}>
        <PlateEditorSurface
          activePath={props.activePath}
          assetImportStrategy={markdownAssetImportStrategy}
          autoFocus={props.autoFocus}
          className={cn(
            'markdown-editor flex-1',
            props.variant !== 'embedded' &&
              markdownContentWidth === 'full' &&
              '[--markdown-content-width:100%]',
            props.variant === 'embedded' && 'markdown-editor--embedded',
            props.readOnly && 'is-readonly-editor',
            !props.readOnly && immersiveFocusMode && 'is-focus-editor',
            !props.readOnly && immersiveFocusMode && `is-focus-scope-${immersiveFocusScope}`,
            !props.readOnly &&
              immersiveFocusMode &&
              `is-focus-intensity-${immersiveFocusIntensity}`,
            immersiveTypewriterMode && 'is-typewriter-editor',
            !props.readOnly && immersiveZenMode && 'is-zen-editor',
            motionSmoothScrolling && 'is-smooth-editor',
          )}
          contentVisible={status.phase === 'ready'}
          completionEnabled={!contextMenuOpen}
          interactionActive={interactionActive}
          onAi={aiAvailable ? aiComposer.open : undefined}
          onChange={props.onChange}
          onCalendarFileCreate={props.onCalendarFileCreate}
          onWorkspaceLink={props.onWorkspaceLink}
          onStatusChange={handleStatusChange}
          placeholder={props.placeholder}
          readOnly={props.readOnly}
          selectionToolbarLabels={selectionToolbarLabels}
          ref={surfaceRef}
          shortcutOverrides={shortcutOverrides}
          slashLabels={props.slashLabels}
          smoothScrolling={motionSmoothScrolling}
          typewriterScroll={immersiveTypewriterMode}
          value={props.value}
          workspaceKey={props.workspaceKey}
        />
        <MarkdownEditorStatusOverlay
          errorLabel={t('editor.loadFailed')}
          loadingLabel={t('editor.loading')}
          status={status}
        />
        {interactionActive && aiAvailable && aiComposer.isOpen && (
          <AiInlineComposer
            error={aiComposer.error}
            instruction={aiComposer.instruction}
            labels={aiLabels}
            modelLabel={aiComposer.modelLabel}
            onProviderChange={aiComposer.setProviderId}
            onAccept={aiComposer.accept}
            onDismiss={aiComposer.dismiss}
            onInstructionChange={aiComposer.setInstruction}
            onOutputKindChange={aiComposer.setOutputKind}
            onQuickAction={aiComposer.quickAction}
            onRetry={aiComposer.retry}
            onRestoreFocus={restoreEditorFocus}
            onStop={aiComposer.stop}
            onSubmit={aiComposer.submit}
            outputKind={aiComposer.outputKind}
            phase={aiComposer.phase}
            proposal={aiComposer.proposal}
            providerId={aiComposer.providerId}
            providers={aiComposer.providers}
            sourceText={aiComposer.sourceText}
          />
        )}
      </div>
    </EditorContextMenu>
  )
})

MarkdownEditor.displayName = 'MarkdownEditor'

export default MarkdownEditor
