import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type DocumentLoadingLinesProps = {
  compact?: boolean
}

export const DocumentLoadingLines = ({ compact = false }: DocumentLoadingLinesProps) => (
  <div
    aria-hidden="true"
    className={cn('document-loading-lines', compact && 'document-loading-lines--compact')}
    data-document-loading
  >
    {[
      { marker: '#', width: 'splash-line-title' },
      { marker: '—', width: 'splash-line-body' },
      { marker: '·', width: 'splash-line-short' },
    ].map(({ marker, width }, index) => (
      <div className="splash-document-row" key={marker}>
        <span className="splash-syntax">{marker}</span>
        <Skeleton className={width} data-splash-line />
        {index === 2 ? <span className="splash-caret" /> : null}
      </div>
    ))}
  </div>
)
