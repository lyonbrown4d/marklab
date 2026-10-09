import { History } from 'lucide-react'
import { CommandGroup, CommandItem } from '@/components/ui/command'
import { useI18n } from '@/i18n/useI18n'

type CommandRecentCommandsSectionProps = {
  commandLabels: Readonly<Record<string, string>>
  recentCommandIds: readonly string[]
  onAction: (id: string) => void
}

const CommandRecentCommandsSection = ({
  commandLabels,
  recentCommandIds,
  onAction,
}: CommandRecentCommandsSectionProps) => {
  const { t } = useI18n()
  if (recentCommandIds.length === 0) return null

  return (
    <CommandGroup heading={t('command.recentCommands')}>
      {recentCommandIds.map((id) => (
        <CommandItem key={id} value={`recent-command:${id}`} onSelect={() => onAction(id)}>
          <History aria-hidden="true" className="size-4" />
          <span className="truncate">{commandLabels[id] ?? id}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

export default CommandRecentCommandsSection
