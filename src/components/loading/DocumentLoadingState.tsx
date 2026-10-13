import { DocumentLoadingLines } from '@/components/loading/DocumentLoadingLines'
import { cn } from '@/lib/utils'

type DocumentLoadingStateProps = {
  className?: string
  compact?: boolean
  description?: string | null
  label: string
}

export const DocumentLoadingState = ({
  className,
  compact = false,
  description,
  label,
}: DocumentLoadingStateProps) => (
  <div
    aria-busy="true"
    aria-label={label}
    aria-live="polite"
    className={cn(
      'flex items-center justify-center text-sm text-muted-foreground',
      compact ? 'gap-3' : 'flex-col gap-4 text-center',
      className,
    )}
    role="status"
  >
    <div
      className={cn(
        !compact &&
          'w-[min(15rem,65vw)] rounded-lg border border-border bg-card px-4 py-5 shadow-sm',
      )}
    >
      <DocumentLoadingLines compact={compact} />
    </div>
    <div className="min-w-0 max-w-full">
      <span>{label}</span>
      {description ? (
        <p className="mt-1 max-w-full truncate text-xs" title={description}>
          {description}
        </p>
      ) : null}
    </div>
  </div>
)
