import { Badge } from '@/components/ui/badge'

type StatusCenterHeaderProps = {
  activeCount: number
  buttonLabel: string
  issueCount: number
  summary: string
  title: string
  titleId: string
}

export const StatusCenterHeader = ({
  activeCount,
  buttonLabel,
  issueCount,
  summary,
  title,
  titleId,
}: StatusCenterHeaderProps) => (
  <div className="border-b border-border/80 px-4 py-3">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground" id={titleId}>
          {title}
        </h2>
        <p className="text-xs text-muted-foreground">{summary}</p>
      </div>
      <Badge
        variant={issueCount > 0 ? 'outline' : 'secondary'}
        className={issueCount > 0 ? 'border-destructive/30 text-destructive' : undefined}
        data-active-count={activeCount}
      >
        {buttonLabel}
      </Badge>
    </div>
  </div>
)
