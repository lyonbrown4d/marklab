import { useMemo } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import {
  defaultShortcutBindings,
  resolveShortcutBindings,
  shortcutActions,
  shortcutCategories,
} from '@/logic/shortcuts'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import ShortcutRecorderRow from '@/components/settings/ShortcutRecorderRow'

const ShortcutsSettingsPage = () => {
  const { t } = useI18n()
  const shortcutOverrides = usePreferencesStore((state) => state.shortcutOverrides)
  const setShortcutOverride = usePreferencesStore((state) => state.setShortcutOverride)
  const resetShortcutOverrides = usePreferencesStore((state) => state.resetShortcutOverrides)
  const shortcutBindings = useMemo(
    () => resolveShortcutBindings(shortcutOverrides),
    [shortcutOverrides],
  )

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium">{t('settings.shortcuts')}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            {t('settings.shortcutsDescription')}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 rounded-md"
          onClick={resetShortcutOverrides}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('shortcuts.resetAll')}
        </Button>
      </div>

      {shortcutCategories.map((category) => (
        <section key={category.id} className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(category.labelKey)}
          </div>
          <div className="divide-y divide-border rounded-md border border-border">
            {category.actions.map((action) => {
              const item = shortcutActions.find((shortcut) => shortcut.id === action)
              if (!item) return null
              return (
                <ShortcutRecorderRow
                  key={action}
                  action={action}
                  label={t(item.labelKey)}
                  bindings={shortcutBindings[action]}
                  defaultBindings={defaultShortcutBindings[action]}
                  overrides={shortcutOverrides}
                  onChange={setShortcutOverride}
                />
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

export default ShortcutsSettingsPage
