import { forwardRef, useCallback, useImperativeHandle, useMemo } from 'react'
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
import { useInlineAiComposer } from '@/components/milkdown/useInlineAiComposer'
import type { InlineAiComposerMessages } from '@/components/milkdown/inlineAiComposerPrompt'
import { AiInlineComposer, type AiComposerLabels } from '@/components/ai/AiInlineComposer'
import { useMarkdownInlineCompletionOptions } from '@/components/milkdown/useMarkdownInlineCompletionOptions'
import { languageIntelligenceApi } from '@/services/languageIntelligenceApi'

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>((props, ref) => {
  const darkMode = useDarkMode()
  const { t } = useI18n()
  const shortcutOverrides = usePreferencesStore((state) => state.shortcutOverrides)
  const aiDefaultProviderId = usePreferencesStore((state) => state.aiDefaultProviderId)
  const inlineCompletionOptions = useMarkdownInlineCompletionOptions({
    activePath: props.activePath,
    readOnly: props.readOnly ?? false,
    value: props.value,
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
  const {
    contextMenu,
    focusEditor,
    getEditorView,
    getMarkdown,
    rootRef,
    scrollAreaRef,
    status,
    urlDialog,
  } = useMarkdownPlaygroundController({
    ...props,
    darkMode,
    inlineCompletionOptions,
    shortcutOverrides,
  })
  const aiComposer = useInlineAiComposer({
    activePath: props.activePath,
    defaultProviderId: aiDefaultProviderId,
    getEditorView,
    messages: aiMessages,
    readOnly: props.readOnly ?? false,
    ready: status.phase === 'ready',
    rootRef,
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
            props.variant === 'embedded' && 'crepe-playground--embedded',
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
        {urlDialog?.request && (
          <SlashUrlDialog
            activePath={props.activePath}
            completionClient={languageIntelligenceApi}
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
