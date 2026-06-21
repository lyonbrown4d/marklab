import { Search } from 'lucide-react'

import { TitlebarActiveTabBadge } from '@/components/titlebar/TitlebarActiveTabBadge'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { useI18n } from '@/i18n/useI18n'

type TitlebarTabRecord = Record<string, unknown>

type TitlebarCommandCenterProps = {
  activePath: string | null
  activeTab: TitlebarTabRecord | null
  dirtyPaths: Record<string, true>
  saveStates: Record<string, unknown>
  silentSave: boolean
  commandPaletteShortcut: string
  onOpenSearch: () => void
}

const getStringField = (record: TitlebarTabRecord | null, keys: string[]) => {
  for (const key of keys) {
    const value = record?.[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  return null
}

const getFileName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

const isErrorSaveState = (value: unknown) => {
  if (typeof value === 'string') {
    return value.toLowerCase().includes('error')
  }

  if (value && typeof value === 'object') {
    const state = value as Record<string, unknown>
    return Boolean(state.error) || state.status === 'error'
  }

  return false
}

export const TitlebarCommandCenter = ({
  activePath,
  activeTab,
  dirtyPaths,
  saveStates,
  commandPaletteShortcut,
  onOpenSearch,
}: TitlebarCommandCenterProps) => {
  const { t } = useI18n()
  const tabPath = getStringField(activeTab, ['path', 'filePath', 'id']) ?? activePath
  const tabTitle =
    getStringField(activeTab, ['title', 'label', 'name']) ?? (tabPath ? getFileName(tabPath) : null)
  const isDirty = tabPath ? Boolean(dirtyPaths[tabPath]) : false
  const hasError = tabPath ? isErrorSaveState(saveStates[tabPath]) : false

  return (
    <div className="mx-1 hidden min-w-0 flex-1 items-center justify-center md:flex">
      <Button
        variant="outline"
        className="command-trigger group h-8 min-w-0 max-w-2xl flex-1 justify-start rounded-lg border-border/70 bg-muted/35 px-2.5 text-left text-xs font-normal text-muted-foreground shadow-none transition-colors hover:bg-muted/65 hover:text-foreground"
        onClick={onOpenSearch}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {tabTitle ? (
            <>
              <TitlebarActiveTabBadge
                title={tabTitle}
                isDirty={isDirty}
                hasError={hasError}
                unsavedLabel={t('tabs.unsaved')}
                errorLabel={t('tabs.error')}
              />
              <span className="hidden h-4 w-px shrink-0 bg-border/80 lg:block" />
            </>
          ) : null}
          <Search data-icon="inline-start" />
          <span className="hidden truncate text-muted-foreground lg:inline">
            {t('sidebar.search')}
          </span>
          <KbdGroup className="ml-auto hidden shrink-0 sm:flex">
            <Kbd>{commandPaletteShortcut}</Kbd>
          </KbdGroup>
        </span>
      </Button>
    </div>
  )
}
