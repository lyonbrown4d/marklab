import { forwardRef, type ComponentProps } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type AppSearchFieldProps = Omit<ComponentProps<typeof Input>, 'type'> & {
  clearLabel: string
  containerClassName?: string
  onClear?: () => void
}

const AppSearchField = forwardRef<HTMLInputElement, AppSearchFieldProps>(
  ({ className, clearLabel, containerClassName, onClear, value, ...props }, ref) => {
    const hasValue = typeof value === 'string' ? value.trim().length > 0 : value != null

    return (
      <div
        className={cn('group/search-field relative min-w-0', containerClassName)}
        data-slot="app-search-field"
      >
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within/search-field:text-foreground"
        />
        <Input
          {...props}
          ref={ref}
          type="search"
          value={value}
          className={cn(
            'h-8 rounded-lg border-border/70 bg-background/70 pl-8 pr-8 text-xs shadow-sm shadow-foreground/[0.03] transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/80 hover:border-border hover:bg-background focus-visible:border-ring/50 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/20',
            '[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden',
            className,
          )}
        />
        {hasValue && onClear ? (
          <Button
            aria-label={clearLabel}
            className="absolute right-0.5 top-1/2 size-7 -translate-y-1/2 rounded-md text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100"
            onClick={onClear}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    )
  },
)

AppSearchField.displayName = 'AppSearchField'

export default AppSearchField
