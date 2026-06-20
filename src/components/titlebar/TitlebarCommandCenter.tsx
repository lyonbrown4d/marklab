import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { useI18n } from '@/i18n/useI18n'
import { TitlebarActiveTabBadge } from '@/components/titlebar/TitlebarActiveTabBadge'
import type { TitlebarProps } from '@/components/titlebar/titlebarTypes'

type TitlebarCommandCenterProps = Pick<
  TitlebarProps,
  'activePath' | 'activeTab' | 'dirtyPaths' | 'saveStates' | 'silentSave'
> & {
  commandPaletteShortcut: string
  onOpenSearch: () => void
}

export const TitlebarCommandCenter = ({
  activePath,
  activeTab,
  dirtyPaths,
  saveStates,
  silentSave,
  commandPaletteShortcut,
  onOpenSearch,
}: TitlebarCommandCenterProps) => {
  const { t } = useI18n()

  return (
    <div className="mx-2 hidden min-w-0 flex-1 items-center justify-center gap-2 md:flex">
      <TitlebarActiveTabBadge
        activePath={activePath}
        activeTab={activeTab}
        dirtyPaths={dirtyPaths}
        saveStates={saveStates}
        silentSave={silentSave}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="command-trigger h-7 min-w-[220px] max-w-md flex-1 justify-start rounded-md px-3 text-left text-xs text-muted-foreground"
        onClick={onOpenSearch}
      >
        <span className="flex w-full items-center gap-2">
          <Search className="h-3.5 w-3.5" />
          <span>{t('sidebar.search')}</span>
          <KbdGroup className="ml-auto">
            <Kbd>{commandPaletteShortcut}</Kbd>
          </KbdGroup>
        </span>
      </Button>
    </div>
  )
}
