import { Save, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export type DrawioEditorSaveState = 'clean' | 'dirty' | 'error' | 'saving'

type DrawioEditorToolbarProps = {
  description: string
  disabled: boolean
  message: string
  onSave: () => void
  readonly: boolean
  readOnlyLabel: string
  saveLabel: string
  saveState: DrawioEditorSaveState
  saveStateLabels: Record<DrawioEditorSaveState, string>
}

const DrawioEditorToolbar = ({
  description,
  disabled,
  message,
  onSave,
  readonly,
  readOnlyLabel,
  saveLabel,
  saveState,
  saveStateLabels,
}: DrawioEditorToolbarProps) => (
  <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-border/80 bg-background/80 px-3 py-2 sm:flex-nowrap">
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-medium">{description}</div>
      <div aria-live="polite" className="truncate text-[11px] text-muted-foreground">
        {message}
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      {readonly ? (
        <Badge variant="outline" className="gap-1 rounded-md font-normal">
          <ShieldAlert data-icon="inline-start" />
          {readOnlyLabel}
        </Badge>
      ) : (
        <Badge variant="secondary" className="rounded-md font-normal" data-save-state={saveState}>
          {saveStateLabels[saveState]}
        </Badge>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5"
        disabled={disabled}
        onClick={onSave}
      >
        <Save data-icon="inline-start" />
        {saveLabel}
      </Button>
    </div>
  </div>
)

export default DrawioEditorToolbar
