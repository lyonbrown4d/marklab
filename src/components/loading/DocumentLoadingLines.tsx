import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type DocumentLoadingLinesProps = {
  compact?: boolean
}

export const DocumentLoadingLines = ({ compact = false }: DocumentLoadingLinesProps) => (
  <div
    aria-hidden="true"
    className={cn(
      'document-loading-lines flex-none',
      compact ? 'document-loading-lines--compact w-12' : 'w-full',
    )}
    data-document-loading
  >
    {[
      { marker: '#', width: 'w-[42%]' },
      { marker: '—', width: 'w-[76%] [animation-delay:120ms]' },
      { marker: '·', width: 'w-[58%] [animation-delay:240ms]' },
    ].map(({ marker, width }, index) => (
      <div
        className={cn('flex items-center', compact ? 'h-2 gap-1 pl-0' : 'h-[15px] gap-[7px] pl-2')}
        key={marker}
      >
        <span
          className={cn(
            "font-[family-name:'Cascadia_Code','SFMono-Regular',Consolas,monospace] font-bold text-muted-foreground",
            compact ? 'w-[5px] text-[7px]' : 'w-2 text-[10px]',
          )}
        >
          {marker}
        </span>
        <Skeleton
          className={cn(
            'origin-left [transform:scaleX(0)] animate-[splash-compose_1.8s_cubic-bezier(0.22,1,0.36,1)_infinite]',
            compact ? 'h-0.5' : 'h-[3px]',
            width,
          )}
          data-splash-line
        />
        {index === 2 ? (
          <span
            className={cn(
              'splash-caret -ml-[3px] w-px animate-[splash-caret_900ms_steps(1,end)_infinite] rounded-[1px] bg-muted-foreground',
              compact ? 'h-1.5' : 'h-[9px]',
            )}
          />
        ) : null}
      </div>
    ))}
  </div>
)
