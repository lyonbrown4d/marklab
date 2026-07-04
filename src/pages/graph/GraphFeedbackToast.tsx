import { Badge } from '@/components/ui/badge'

type GraphFeedbackToastProps = {
  message: string
}

export const GraphFeedbackToast = ({ message }: GraphFeedbackToastProps) => (
  <div
    className="graph-feedback-toast pointer-events-none absolute bottom-56 left-1/2 z-10 md:bottom-5"
    role="status"
    aria-live="polite"
  >
    <Badge
      variant="outline"
      className="rounded-md border-border bg-popover/95 px-2.5 py-1.5 font-normal text-popover-foreground shadow-md backdrop-blur"
    >
      {message}
    </Badge>
  </div>
)
