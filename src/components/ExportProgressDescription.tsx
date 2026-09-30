import { Progress } from '@/components/ui/progress'

type ExportProgressDescriptionProps = {
  label: string
  message?: string | null
  outputName: string
  progress?: number | null
}

const progressPercent = (progress: number | null | undefined): number | null => {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return null
  return Math.round(Math.min(Math.max(progress, 0), 1) * 100)
}

export const ExportProgressDescription = ({
  label,
  message,
  outputName,
  progress,
}: ExportProgressDescriptionProps) => {
  const percent = progressPercent(progress)

  return (
    <div className="flex min-w-52 flex-col gap-1.5">
      <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
        <span className="truncate">{message || outputName}</span>
        {percent !== null && <span className="tabular-nums text-muted-foreground">{percent}%</span>}
      </div>
      <Progress
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent ?? undefined}
        className="h-1 bg-muted [&_[data-state]]:duration-300 motion-reduce:[&_[data-state]]:transition-none"
        value={percent ?? 0}
      />
      {message && <span className="truncate text-[11px] text-muted-foreground">{outputName}</span>}
    </div>
  )
}
