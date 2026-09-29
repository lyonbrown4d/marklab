import { ArrowLeft, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import type { CommandSearchScope } from '@/components/command/commandSearchScope'

type CommandSearchOverviewProps = {
  actionsOnly: boolean
  scope: CommandSearchScope
  onSelectScope: (query: string) => void
  onToggleActions: () => void
}

const CommandSearchOverview = ({
  actionsOnly,
  scope,
  onSelectScope,
  onToggleActions,
}: CommandSearchOverviewProps) => {
  const { t } = useI18n()
  const scopes = [
    { marker: '@', label: t('command.search.scopeFiles') },
    { marker: '#', label: t('command.search.scopeHeadings') },
    { marker: '?', label: t('command.search.scopeText') },
  ]
  const ModeIcon = actionsOnly ? ArrowLeft : Terminal

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
      {!actionsOnly && (
        <div
          role="group"
          aria-label={t('command.search.filters')}
          className="flex min-w-0 items-center gap-1 rounded-full bg-muted/45 p-0.5"
        >
          {scopes.map(({ marker, label }) => {
            const markerScope = marker === '@' ? 'files' : marker === '#' ? 'headings' : 'text'
            const selected = scope === markerScope
            return (
              <Button
                key={marker}
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`${marker} ${label}`}
                aria-pressed={selected}
                className={cn(
                  'h-7 gap-1.5 rounded-full px-2.5 text-xs font-normal text-muted-foreground shadow-none',
                  selected && 'bg-background text-foreground shadow-sm hover:bg-background',
                )}
                onClick={() => onSelectScope(`${marker} `)}
              >
                <span className="font-mono">{marker}</span>
                {label}
              </Button>
            )
          })}
        </div>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="ml-auto h-7 gap-1.5 rounded-full px-2.5 text-xs font-normal text-muted-foreground"
        onClick={onToggleActions}
      >
        <ModeIcon className="size-3.5" />
        {t(actionsOnly ? 'sidebar.search' : 'shortcuts.commandPalette')}
      </Button>
    </div>
  )
}

export default CommandSearchOverview
