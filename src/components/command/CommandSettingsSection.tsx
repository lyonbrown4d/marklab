import { Settings2 } from 'lucide-react'
import { CommandGroup, CommandItem } from '@/components/ui/command'
import { useI18n } from '@/i18n/useI18n'
import { settingsRoutes, type SettingsSelection } from '@/components/settings/settingsRoutes'

type CommandSettingsSectionProps = {
  query: string
  onOpen: (selection: SettingsSelection) => void
}

const CommandSettingsSection = ({ query, onOpen }: CommandSettingsSectionProps) => {
  const { t } = useI18n()
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return null

  const results = settingsRoutes.flatMap((route) =>
    route.searchEntries.flatMap((entry) => {
      const routeLabel = t(route.labelKey)
      const label = t(entry.labelKey)
      const searchable = `${label} ${routeLabel} ${t(route.descriptionKey)}`.toLocaleLowerCase()
      return terms.every((term) => searchable.includes(term))
        ? [{ label, routeLabel, route: route.value, targetId: entry.targetId }]
        : []
    }),
  )

  if (results.length === 0) return null

  return (
    <CommandGroup heading={t('command.settings')}>
      {results.slice(0, 8).map((result) => (
        <CommandItem
          key={`${result.route}:${result.targetId}:${result.label}`}
          value={`setting ${result.label} ${result.routeLabel}`}
          onSelect={() => onOpen({ route: result.route, targetId: result.targetId })}
        >
          <Settings2 aria-hidden="true" className="size-4" />
          <span className="min-w-0">
            <span className="block truncate">{result.label}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {result.routeLabel}
            </span>
          </span>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

export default CommandSettingsSection
