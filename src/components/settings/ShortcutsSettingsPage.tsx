import { useMemo, useState, type ReactElement } from 'react'
import { RotateCcw } from 'lucide-react'
import AppSearchField from '@/components/AppSearchField'
import { useI18n } from '@/i18n/useI18n'
import {
  defaultShortcutBindings,
  detectShortcutConflicts,
  resolveShortcutBindings,
  shortcutActions,
  shortcutCategories,
  type ShortcutActionId,
} from '@/logic/shortcuts'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import {
  SettingsActionButton,
  SettingsEmptyState,
  SettingsPageStack,
  SettingsSection,
} from '@/components/settings/SettingsRow'
import ShortcutRecorderRow from '@/components/settings/ShortcutRecorderRow'

const ShortcutsSettingsPage = () => {
  const { t } = useI18n()
  const [keyword, setKeyword] = useState('')
  const shortcutOverrides = usePreferencesStore((state) => state.shortcutOverrides)
  const setShortcutOverride = usePreferencesStore((state) => state.setShortcutOverride)
  const resetShortcutOverrides = usePreferencesStore((state) => state.resetShortcutOverrides)
  const hasOverrides = Object.keys(shortcutOverrides).length > 0
  const shortcutBindings = useMemo(
    () => resolveShortcutBindings(shortcutOverrides),
    [shortcutOverrides],
  )
  const shortcutConflicts = useMemo(
    () => detectShortcutConflicts(shortcutBindings),
    [shortcutBindings],
  )
  const actionLabelMap = useMemo(
    () =>
      shortcutActions.reduce(
        (result, action) => {
          result[action.id] = t(action.labelKey)
          return result
        },
        {} as Record<ShortcutActionId, string>,
      ),
    [t],
  )
  const conflictLabels = useMemo(() => {
    const result: Partial<Record<ShortcutActionId, string[]>> = {}
    for (const action of shortcutActions) {
      const conflicts = shortcutConflicts[action.id]
      if (!conflicts || conflicts.length === 0) continue
      result[action.id] = conflicts
        .map((conflictAction) => actionLabelMap[conflictAction])
        .filter(Boolean)
    }
    return result
  }, [actionLabelMap, shortcutConflicts])
  const normalizedKeyword = keyword.trim().toLowerCase()
  const filteredSections = useMemo(() => {
    return shortcutCategories
      .map((category) => {
        const rows: ReactElement[] = []
        for (const action of category.actions) {
          const label = actionLabelMap[action]
          if (!label) continue
          const bindingSearchText = shortcutBindings[action].join(' ').toLowerCase()
          if (
            normalizedKeyword.length > 0 &&
            !label.toLowerCase().includes(normalizedKeyword) &&
            !bindingSearchText.includes(normalizedKeyword)
          ) {
            continue
          }

          rows.push(
            <ShortcutRecorderRow
              key={action}
              action={action}
              label={label}
              bindings={shortcutBindings[action]}
              defaultBindings={defaultShortcutBindings[action]}
              conflictLabels={conflictLabels[action]}
              overrides={shortcutOverrides}
              onChange={setShortcutOverride}
            />,
          )
        }

        return { ...category, rows }
      })
      .filter((category) => category.rows.length > 0)
  }, [
    actionLabelMap,
    conflictLabels,
    normalizedKeyword,
    shortcutBindings,
    shortcutOverrides,
    setShortcutOverride,
  ])

  return (
    <SettingsPageStack className="gap-5">
      <SettingsSection
        targetId="settings-shortcuts"
        description={t('settings.shortcutsDescription')}
        bodyClassName="gap-2"
      >
        <div className="flex flex-wrap items-center gap-2">
          <AppSearchField
            containerClassName="min-w-40 flex-1"
            value={keyword}
            aria-label={t('shortcuts.searchPlaceholder')}
            onChange={(event) => setKeyword(event.target.value)}
            onClear={() => setKeyword('')}
            clearLabel={t('shortcuts.clearSearch')}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setKeyword('')
              }
            }}
            placeholder={t('shortcuts.searchPlaceholder')}
          />
          <SettingsActionButton
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 rounded-md"
            disabled={!hasOverrides}
            onClick={resetShortcutOverrides}
          >
            <RotateCcw data-icon="inline-start" />
            {t('shortcuts.resetAll')}
          </SettingsActionButton>
        </div>
      </SettingsSection>

      {filteredSections.length === 0 && (
        <SettingsEmptyState>{t('shortcuts.noMatches')}</SettingsEmptyState>
      )}
      {filteredSections.map((category) => (
        <section key={category.id} className="flex flex-col gap-1">
          <h3 className="text-xs font-medium text-muted-foreground">{t(category.labelKey)}</h3>
          <div className="divide-y divide-border/60">{category.rows}</div>
        </section>
      ))}
    </SettingsPageStack>
  )
}

export default ShortcutsSettingsPage
