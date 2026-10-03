import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

type LocalHistoryPreviewFallbackProps = {
  description: string
  loadingLabel: string
  path: string
  title: string
  onOpenChange: (open: boolean) => void
}

const LocalHistoryPreviewFallback = ({
  description,
  loadingLabel,
  path,
  title,
  onOpenChange,
}: LocalHistoryPreviewFallbackProps) => (
  <Dialog open onOpenChange={onOpenChange}>
    <DialogContent className="flex h-[min(78vh,760px)] max-w-[min(94vw,1120px)] flex-col gap-0 overflow-hidden p-0">
      <DialogHeader className="shrink-0 border-b border-border/70 px-5 py-4 pr-12">
        <DialogTitle className="text-base">{title}</DialogTitle>
        <DialogDescription className="truncate">
          {description} · {path}
        </DialogDescription>
      </DialogHeader>
      <div role="status" aria-label={loadingLabel} className="min-h-0 flex-1 space-y-3 p-6">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </DialogContent>
  </Dialog>
)

export default LocalHistoryPreviewFallback
