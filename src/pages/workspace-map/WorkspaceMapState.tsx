import { AlertCircle, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

type WorkspaceMapStateProps = {
  actionLabel?: string
  label: string
  loading?: boolean
  onAction?: () => void
}

export const WorkspaceMapState = ({
  actionLabel,
  label,
  loading = false,
  onAction,
}: WorkspaceMapStateProps) => (
  <div className="flex h-full flex-col items-center justify-center gap-3 bg-background p-6 text-center text-sm text-muted-foreground">
    {loading ? (
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
    ) : (
      <AlertCircle aria-hidden="true" className="size-5" />
    )}
    <p>{label}</p>
    {actionLabel && onAction ? (
      <Button type="button" variant="outline" size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    ) : null}
  </div>
)
