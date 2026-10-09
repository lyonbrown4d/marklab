import { FileClock, GitFork, Hash, TextCursorInput } from 'lucide-react'
import { CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command'
import { useI18n } from '@/i18n/useI18n'
import type { NavigationLocation } from '@/features/navigation/navigationHistory'

type CommandRecentLocationsSectionProps = {
  locations: NavigationLocation[]
  onOpen: (location: NavigationLocation) => void
}

const locationPresentation = (location: NavigationLocation) => {
  if (location.kind === 'heading') {
    return { Icon: Hash, label: `${location.path} · #${location.slug}` }
  }
  if (location.kind === 'source') {
    return {
      Icon: TextCursorInput,
      label: `${location.path} · ${location.line}:${location.column}`,
    }
  }
  if (location.kind === 'graph') {
    return { Icon: GitFork, label: location.nodeId }
  }
  return { Icon: FileClock, label: location.path }
}

const CommandRecentLocationsSection = ({
  locations,
  onOpen,
}: CommandRecentLocationsSectionProps) => {
  const { t } = useI18n()
  if (locations.length === 0) return null

  return (
    <CommandGroup heading={t('command.recentLocations')}>
      {locations.map((location, index) => {
        const { Icon, label } = locationPresentation(location)
        return (
          <CommandItem
            key={`${location.kind}:${label}:${index}`}
            value={`recent location ${label}`}
            onSelect={() => onOpen(location)}
          >
            <Icon aria-hidden="true" className="size-4" />
            <span className="truncate">{label}</span>
            <CommandShortcut>{t('command.recent')}</CommandShortcut>
          </CommandItem>
        )
      })}
    </CommandGroup>
  )
}

export default CommandRecentLocationsSection
