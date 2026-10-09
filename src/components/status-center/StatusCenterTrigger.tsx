import { Activity, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PopoverTrigger } from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'

type StatusCenterTriggerProps = {
  activeCount: number
  buttonLabel: string
  issueCount: number
  open: boolean
  triggerLabel: string
}

export const StatusCenterTrigger = ({
  activeCount,
  buttonLabel,
  issueCount,
  open,
  triggerLabel,
}: StatusCenterTriggerProps) => (
  <PopoverTrigger asChild>
    <Button
      type="button"
      variant={open || issueCount > 0 ? 'secondary' : 'ghost'}
      size="sm"
      className="h-6 gap-1.5 rounded px-2 text-[11px] font-normal text-muted-foreground"
      aria-label={triggerLabel}
      title={triggerLabel}
    >
      {issueCount > 0 ? (
        <AlertTriangle aria-hidden="true" className="size-3.5 text-destructive" />
      ) : activeCount > 0 ? (
        <Spinner aria-hidden="true" role="presentation" className="size-3.5" />
      ) : (
        <Activity aria-hidden="true" className="size-3.5" />
      )}
      <span className="hidden sm:inline">{buttonLabel}</span>
    </Button>
  </PopoverTrigger>
)
