import type { KeyboardEvent, SubmitEvent } from 'react'
import {
  AlignLeft,
  Check,
  LoaderCircle,
  PencilLine,
  RotateCcw,
  Sparkles,
  Square,
  WandSparkles,
  X,
} from 'lucide-react'
import { AiProposalDiff } from '@/components/ai/AiProposalDiff'
import { AiComposerConfiguration } from '@/components/ai/AiComposerConfiguration'
import { AiComposerHeader } from '@/components/ai/AiComposerHeader'
import { useAiComposerFocus } from '@/components/ai/useAiComposerFocus'
import type { InlineAiProvider } from '@/components/ai/aiProviderSelection'
import type { AiComposerOutputKind } from '@/components/ai/inlineAiComposerPrompt'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/AppTooltip'
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'
import { isImeKeyboardEvent } from '@/logic/ime'

export type AiComposerPhase =
  'loading-provider' | 'prompt' | 'starting' | 'streaming' | 'proposal' | 'error'

export type AiQuickAction = 'rewrite' | 'concise' | 'explain'

export type AiComposerLabels = {
  accept: string
  ask: string
  askPlaceholder: string
  abandon: string
  concise: string
  configuration: string
  dialog: string
  diff: string
  done: string
  explain: string
  explanation: string
  editSelection: string
  findingModel: string
  generate: string
  instruction: string
  mode: string
  privacy: string
  placeholder: string
  provider: string
  retry: string
  rewrite: string
  stop: string
}

type AiInlineComposerProps = {
  error: string | null
  instruction: string
  labels: AiComposerLabels
  modelLabel: string
  onProviderChange: (providerId: string) => void
  onAccept: () => void
  onDismiss: () => void
  onInstructionChange: (value: string) => void
  onQuickAction: (action: AiQuickAction) => void
  onRetry: () => void
  onRestoreFocus: () => void
  onStop: () => void
  onSubmit: (instruction: string, outputKind?: AiComposerOutputKind) => void
  onOutputKindChange: (kind: AiComposerOutputKind) => void
  outputKind: AiComposerOutputKind
  phase: AiComposerPhase
  proposal: string
  providerId: string
  providers: InlineAiProvider[]
  sourceText: string
}

const quickActions: Array<{
  id: AiQuickAction
  icon: typeof PencilLine
}> = [
  { id: 'rewrite', icon: PencilLine },
  { id: 'concise', icon: AlignLeft },
  { id: 'explain', icon: WandSparkles },
]

export const AiInlineComposer = ({
  error,
  instruction,
  labels,
  modelLabel,
  onProviderChange,
  onAccept,
  onDismiss,
  onInstructionChange,
  onQuickAction,
  onRetry,
  onRestoreFocus,
  onStop,
  onSubmit,
  onOutputKindChange,
  outputKind,
  phase,
  proposal,
  providerId,
  providers,
  sourceText,
}: AiInlineComposerProps) => {
  useNativeSurfaceOcclusion('ai-inline-composer', true, { blocksCommandPalette: true })
  const pending = phase === 'starting' || phase === 'streaming'
  const inputDisabled = pending || phase === 'loading-provider'
  const { dismissOnEscape, inputRef, stopRef } = useAiComposerFocus({
    inputDisabled,
    onDismiss,
    pending,
  })
  const isExplanation = outputKind === 'explanation'
  const submitInstruction = (instruction: string) =>
    isExplanation ? onSubmit(instruction, 'explanation') : onSubmit(instruction)

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextInstruction = instruction.trim()
    if (!nextInstruction || inputDisabled) return
    submitInstruction(nextInstruction)
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || isImeKeyboardEvent(event.nativeEvent)) return
    event.preventDefault()
    const nextInstruction = instruction.trim()
    if (nextInstruction && !inputDisabled) submitInstruction(nextInstruction)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onDismiss()
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-2xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onRestoreFocus()
        }}
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          dismissOnEscape(event)
        }}
        onKeyDown={(event) => {
          // A tooltip may consume Radix's top-layer Escape before this dialog.
          // Focused dialog controls still close it; nested portalled menus own theirs.
          if (event.key !== 'Escape' || !event.currentTarget.contains(event.target as Node)) return
          event.preventDefault()
          event.stopPropagation()
          dismissOnEscape(event.nativeEvent)
        }}
        showCloseButton={false}
      >
        <AiComposerHeader
          disabled={inputDisabled}
          labels={labels}
          modelLabel={modelLabel}
          onOutputKindChange={onOutputKindChange}
          outputKind={outputKind}
          sourceText={phase === 'proposal' ? null : sourceText}
        />
        <form className="flex items-center gap-2 p-3" onSubmit={handleSubmit}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-primary/5 text-primary">
            <Sparkles aria-hidden="true" className="size-4" />
          </span>
          <Input
            aria-label={labels.instruction}
            className="h-9 min-w-0 flex-1 shadow-none"
            disabled={inputDisabled}
            onChange={(event) => onInstructionChange(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={isExplanation ? labels.askPlaceholder : labels.placeholder}
            ref={inputRef}
            value={instruction}
          />
          {phase === 'loading-provider' && (
            <span className="max-w-40 truncate text-xs text-muted-foreground">
              {labels.findingModel}
            </span>
          )}
          {pending ? (
            <Button
              aria-label={labels.stop}
              onClick={onStop}
              size="icon"
              type="button"
              variant="outline"
              ref={stopRef}
            >
              <Square aria-hidden="true" className="fill-current" />
            </Button>
          ) : (
            <Button
              aria-label={labels.generate}
              disabled={!instruction.trim() || !modelLabel || phase === 'loading-provider'}
              size="icon"
              type="submit"
            >
              {phase === 'loading-provider' ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Sparkles aria-hidden="true" />
              )}
            </Button>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={`${labels.abandon} (Esc)`}
                  onClick={onDismiss}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="flex items-center gap-2" side="bottom">
                <span>{labels.abandon}</span>
                <Kbd>Esc</Kbd>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </form>

        {phase === 'streaming' && proposal && (
          <div aria-live="polite" className="max-h-40 overflow-y-auto px-4 pb-3 text-sm leading-6">
            {proposal}
          </div>
        )}
        {phase === 'proposal' &&
          (isExplanation ? (
            <div
              aria-label={labels.explanation}
              className="max-h-52 overflow-y-auto whitespace-pre-wrap border-l-2 border-primary/25 px-4 py-3 text-sm leading-7"
              role="region"
            >
              {proposal}
            </div>
          ) : (
            <AiProposalDiff label={labels.diff} original={sourceText} proposal={proposal} />
          ))}
        {error && (
          <p
            className="mx-3 mb-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t bg-muted/20 p-2">
          {phase === 'proposal' ? (
            <>
              {!isExplanation && (
                <Button onClick={onAccept} size="sm" type="button">
                  <Check aria-hidden="true" /> {labels.accept}
                </Button>
              )}
              <Button onClick={onDismiss} size="sm" type="button" variant="outline">
                <X aria-hidden="true" /> {isExplanation ? labels.done : labels.abandon}
              </Button>
              <Button onClick={onRetry} size="sm" type="button" variant="outline">
                <RotateCcw aria-hidden="true" /> {labels.retry}
              </Button>
            </>
          ) : (
            <>
              {quickActions.map(({ id, icon: Icon }) => (
                <Button
                  disabled={inputDisabled || !modelLabel}
                  key={id}
                  onClick={() => onQuickAction(id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Icon aria-hidden="true" /> {labels[id]}
                </Button>
              ))}
              <span className="ml-auto">
                <AiComposerConfiguration
                  disabled={inputDisabled}
                  labels={labels}
                  onProviderChange={onProviderChange}
                  providerId={providerId}
                  providers={providers}
                />
              </span>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
