import { ArrowLeft, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'

type CommandSearchOverviewProps = {
  actionsOnly: boolean
  onSelectScope: (query: string) => void
  onToggleActions: () => void
}

const CommandSearchOverview = ({
  actionsOnly,
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
    <div className="flex flex-wrap items-center gap-1 px-2 py-1.5">
      {!actionsOnly &&
        scopes.map(({ marker, label }) => (
          <Button
            key={marker}
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
            onClick={() => onSelectScope(`${marker} `)}
          >
            <span className="font-mono">{marker}</span>
            {label}
          </Button>
        ))}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="ml-auto h-7 gap-1.5 px-2 text-xs text-muted-foreground"
        onClick={onToggleActions}
      >
        <ModeIcon className="size-3.5" />
        {t(actionsOnly ? 'sidebar.search' : 'shortcuts.commandPalette')}
      </Button>
    </div>
  )
}

export default CommandSearchOverview
