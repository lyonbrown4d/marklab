import type { AiComposerLabels } from '@/components/ai/AiInlineComposer'
import type { AiComposerOutputKind } from '@/components/ai/inlineAiComposerPrompt'
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type AiComposerHeaderProps = {
  disabled: boolean
  labels: AiComposerLabels
  modelLabel: string
  onOutputKindChange: (kind: AiComposerOutputKind) => void
  outputKind: AiComposerOutputKind
  sourceText: string | null
}

export const AiComposerHeader = ({
  disabled,
  labels,
  modelLabel,
  onOutputKindChange,
  outputKind,
  sourceText,
}: AiComposerHeaderProps) => (
  <DialogHeader className="px-4 pt-4 text-left">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <DialogTitle className="text-base">{labels.dialog}</DialogTitle>
      {modelLabel && <span className="text-xs text-muted-foreground">{modelLabel}</span>}
    </div>
    <DialogDescription className="text-xs">{labels.privacy}</DialogDescription>
    {sourceText !== null && (
      <>
        <blockquote className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {sourceText}
        </blockquote>
        <ToggleGroup
          aria-label={labels.mode}
          className="self-start"
          disabled={disabled}
          onValueChange={(kind) => {
            if (kind === 'replacement' || kind === 'explanation') onOutputKindChange(kind)
          }}
          size="sm"
          type="single"
          value={outputKind}
        >
          <ToggleGroupItem value="replacement">{labels.editSelection}</ToggleGroupItem>
          <ToggleGroupItem value="explanation">{labels.ask}</ToggleGroupItem>
        </ToggleGroup>
      </>
    )}
  </DialogHeader>
)
