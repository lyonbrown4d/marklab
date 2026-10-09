import { Monitor, Moon, Sun } from 'lucide-react'
import { CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command'
import {
  currentCommandItemClassName,
  CurrentItemCheck,
} from '@/components/command/CommandActionHelpers'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import { builtInThemes, themeActionId, themeModeActionId } from '@/logic/themes'
import { usePreferencesStore } from '@/store/usePreferencesStore'

type CommandThemeSectionProps = {
  onAction: (id: string) => void
}

const CommandThemeSection = ({ onAction }: CommandThemeSectionProps) => {
  const { t } = useI18n()
  const themeMode = usePreferencesStore((state) => state.themeMode)
  const currentTheme = usePreferencesStore((state) => state.theme)
  const customThemeId = usePreferencesStore((state) => state.customThemeId)
  const builtInThemeIsCurrent = customThemeId === null

  return (
    <CommandGroup heading={t('menu.theme')}>
      <CommandItem
        aria-current={themeMode === 'system' ? 'true' : undefined}
        className={cn(themeMode === 'system' && currentCommandItemClassName)}
        value="theme mode system follow system"
        onSelect={() => onAction(themeModeActionId('system'))}
      >
        <Monitor className="size-4" />
        <span className="truncate">{t('themeMode.system')}</span>
        {themeMode === 'system' && <CurrentItemCheck />}
      </CommandItem>
      <CommandItem
        aria-current={themeMode === 'light' ? 'true' : undefined}
        className={cn(themeMode === 'light' && currentCommandItemClassName)}
        value="theme mode light"
        onSelect={() => onAction(themeModeActionId('light'))}
      >
        <Sun className="size-4" />
        <span className="truncate">{t('themeMode.light')}</span>
        {themeMode === 'light' && <CurrentItemCheck />}
      </CommandItem>
      <CommandItem
        aria-current={themeMode === 'dark' ? 'true' : undefined}
        className={cn(themeMode === 'dark' && currentCommandItemClassName)}
        value="theme mode dark"
        onSelect={() => onAction(themeModeActionId('dark'))}
      >
        <Moon className="size-4" />
        <span className="truncate">{t('themeMode.dark')}</span>
        {themeMode === 'dark' && <CurrentItemCheck />}
      </CommandItem>
      <CommandSeparator />
      {builtInThemes.map((item) => {
        const isCurrentTheme = builtInThemeIsCurrent && currentTheme === item.value
        return (
          <CommandItem
            aria-current={isCurrentTheme ? 'true' : undefined}
            className={cn(isCurrentTheme && currentCommandItemClassName)}
            key={item.value}
            value={`theme ${item.value} ${t(item.labelKey)}`}
            onSelect={() => onAction(themeActionId(item.value))}
          >
            <span
              aria-hidden="true"
              className={cn(
                'theme-swatch block size-4 shrink-0 overflow-hidden rounded-sm border border-border',
                item.swatchClass,
              )}
            >
              <span className="theme-swatch-preview relative block h-full w-full" />
            </span>
            <span className="truncate">{t(item.labelKey)}</span>
            {isCurrentTheme && <CurrentItemCheck />}
          </CommandItem>
        )
      })}
    </CommandGroup>
  )
}

export default CommandThemeSection
