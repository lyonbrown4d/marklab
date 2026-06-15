import { useMemo, useState, type ReactElement } from 'react'
import { Search, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setKeyword('')
              }
            }}
            placeholder={t('shortcuts.searchPlaceholder')}
            className="h-9 pl-8"
          />
          {keyword.trim().length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-md"
              aria-label={t('shortcuts.clearSearch')}
              onClick={() => setKeyword('')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
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
          disabled={!hasOverrides}
          onClick={resetShortcutOverrides}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('shortcuts.resetAll')}
        </Button>
      </div>

      {filteredSections.length === 0 && (
        <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          {t('shortcuts.noMatches')}
        </div>
      )}
      {filteredSections.map((category) => (
        <section key={category.id} className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(category.labelKey)}
          </div>
          <div className="divide-y divide-border rounded-md border border-border">
            {category.rows}
          </div>
        </section>
      ))}
    </div>
  )
}

export default ShortcutsSettingsPage
