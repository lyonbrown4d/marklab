import { useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { isImeKeyboardEvent } from '@/logic/ime'

export type AiComposerPhase =
  'loading-provider' | 'prompt' | 'starting' | 'streaming' | 'proposal' | 'error'

export type AiQuickAction = 'rewrite' | 'concise' | 'explain'

export type AiComposerLabels = {
  accept: string
  abandon: string
  concise: string
  dialog: string
  diff: string
  explain: string
  findingModel: string
  generate: string
  instruction: string
  placeholder: string
  retry: string
  rewrite: string
  stop: string
}

type AiInlineComposerProps = {
  anchor: { left: number; top: number }
  error: string | null
  instruction: string
  labels: AiComposerLabels
  modelLabel: string
  onAccept: () => void
  onDismiss: () => void
  onInstructionChange: (value: string) => void
  onQuickAction: (action: AiQuickAction) => void
  onRetry: () => void
  onStop: () => void
  onSubmit: (instruction: string) => void
  phase: AiComposerPhase
  proposal: string
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
  anchor,
  error,
  instruction,
  labels,
  modelLabel,
  onAccept,
  onDismiss,
  onInstructionChange,
  onQuickAction,
  onRetry,
  onStop,
  onSubmit,
  phase,
  proposal,
  sourceText,
}: AiInlineComposerProps) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const stopRef = useRef<HTMLButtonElement>(null)
  const pending = phase === 'starting' || phase === 'streaming'
  const inputDisabled = pending || phase === 'loading-provider'

  useEffect(() => {
    if (pending) stopRef.current?.focus()
    else if (!inputDisabled) inputRef.current?.focus()
  }, [inputDisabled, pending])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const nextInstruction = instruction.trim()
    if (!nextInstruction || inputDisabled) return
    onSubmit(nextInstruction)
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || isImeKeyboardEvent(event.nativeEvent)) return
    event.preventDefault()
    const nextInstruction = instruction.trim()
    if (nextInstruction && !inputDisabled) onSubmit(nextInstruction)
  }

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !isImeKeyboardEvent(event.nativeEvent)) {
      event.preventDefault()
      event.stopPropagation()
      onDismiss()
    }
  }

  return (
    <section
      aria-label={labels.dialog}
      className="absolute z-50 w-[min(36rem,calc(100%-1rem))] overflow-hidden rounded-xl border border-border/80 bg-background/95 shadow-xl backdrop-blur"
      role="dialog"
      style={{ left: anchor.left, top: anchor.top }}
      onKeyDown={handlePanelKeyDown}
    >
      <form className="flex items-center gap-2 p-2" onSubmit={handleSubmit}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-primary/5 text-primary">
          <Sparkles aria-hidden="true" className="size-4" />
        </span>
        <Input
          aria-label={labels.instruction}
          className="h-9 min-w-0 flex-1 shadow-none"
          disabled={inputDisabled}
          onChange={(event) => onInstructionChange(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={labels.placeholder}
          ref={inputRef}
          value={instruction}
        />
        <span className="max-w-40 truncate text-xs text-muted-foreground" title={modelLabel}>
          {phase === 'loading-provider' ? labels.findingModel : modelLabel}
        </span>
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
            disabled={!instruction.trim() || phase === 'loading-provider'}
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
      {phase === 'proposal' && (
        <AiProposalDiff label={labels.diff} original={sourceText} proposal={proposal} />
      )}
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
            <Button onClick={onAccept} size="sm" type="button">
              <Check aria-hidden="true" /> {labels.accept}
            </Button>
            <Button onClick={onDismiss} size="sm" type="button" variant="outline">
              <X aria-hidden="true" /> {labels.abandon}
            </Button>
            <Button onClick={onRetry} size="sm" type="button" variant="outline">
              <RotateCcw aria-hidden="true" /> {labels.retry}
            </Button>
          </>
        ) : (
          quickActions.map(({ id, icon: Icon }) => (
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
          ))
        )}
      </div>
    </section>
  )
}
