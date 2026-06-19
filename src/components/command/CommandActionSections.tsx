import {
  Check,
  CircleHelp,
  FileText,
  FilePlus2,
  FolderPlus,
  FolderOpen,
  GitGraph,
  Monitor,
  Moon,
  PanelLeft,
  PanelRight,
  PenLine,
  RefreshCw,
  Search,
  Settings2,
  Sun,
  Terminal,
  X,
} from 'lucide-react'
import { useMemo } from 'react'
import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { useI18n } from '@/i18n/useI18n'
import {
  formatShortcutList,
  resolveShortcutBindings,
  type ShortcutActionId,
  type ShortcutBindings,
} from '@/logic/shortcuts'
import { builtInThemes, themeActionId, themeModeActionId } from '@/logic/themes'
import { preloadGraphView, preloadSourceEditor, preloadWysiwygEditor } from '@/lib/preloadFeatures'
import { cn } from '@/lib/utils'
import { usePreferencesStore } from '@/store/usePreferencesStore'

type CommandActionSectionsProps = {
  canCreateWorkspaceEntries: boolean
  searchIndexRebuilding: boolean
  onCommandPaletteAction: () => void
  onAction: (id: string) => void
}

const commandActionShortcutIds = {
  commandPalette: 'app.commandPalette',
  settings: 'app.settings',
  newFile: 'file.new',
  openProject: 'file.openProject',
  openFile: 'file.openFile',
  closeTab: 'tab.close',
  viewWysiwyg: 'view.wysiwyg',
  viewSource: 'view.source',
  viewGraph: 'view.graph',
  toggleSidebar: 'view.toggleSidebar',
  toggleRightSidebar: 'view.toggleRightSidebar',
} as const satisfies Record<string, ShortcutActionId>

const shortcutActionIds = Object.values(commandActionShortcutIds)

const currentCommandItemClassName = 'bg-accent text-accent-foreground'

const createShortcutLabels = (shortcutOverrides: ShortcutBindings) => {
  const bindings = resolveShortcutBindings(shortcutOverrides)
  return shortcutActionIds.reduce(
    (labels, actionId) => {
      const actionBindings = bindings[actionId]
      if (actionBindings.length > 0) labels[actionId] = formatShortcutList(actionBindings)
      return labels
    },
    {} as Partial<Record<ShortcutActionId, string>>,
  )
}

const CommandActionShortcut = ({ label }: { label?: string }) => {
  if (!label) return null
  return <CommandShortcut>{label}</CommandShortcut>
}

const CurrentItemCheck = () => {
  return <Check aria-hidden="true" className="ml-auto text-primary" />
}

const CommandActionSections = ({
  canCreateWorkspaceEntries,
  searchIndexRebuilding,
  onCommandPaletteAction,
  onAction,
}: CommandActionSectionsProps) => {
  const { t } = useI18n()
  const themeMode = usePreferencesStore((state) => state.themeMode)
  const currentTheme = usePreferencesStore((state) => state.theme)
  const customThemeId = usePreferencesStore((state) => state.customThemeId)
  const shortcutOverrides = usePreferencesStore((state) => state.shortcutOverrides)
  const shortcutLabels = useMemo(() => createShortcutLabels(shortcutOverrides), [shortcutOverrides])
  const builtInThemeIsCurrent = customThemeId === null

  return (
    <>
      <CommandGroup>
        <CommandItem onSelect={onCommandPaletteAction}>
          <Search className="h-4 w-4" />
          <span className="truncate">{t('shortcuts.commandPalette')}</span>
          <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.commandPalette]} />
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading={t('menu.file')}>
        <CommandItem disabled={!canCreateWorkspaceEntries} onSelect={() => onAction('file.new')}>
          <FilePlus2 className="h-4 w-4" />
          <span className="truncate">{t('sidebar.newFile')}</span>
          <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.newFile]} />
        </CommandItem>
        <CommandItem
          disabled={!canCreateWorkspaceEntries}
          onSelect={() => onAction('file.new_folder')}
        >
          <FolderPlus className="h-4 w-4" />
          {t('sidebar.newFolder')}
        </CommandItem>
        <CommandItem onSelect={() => onAction('window.open_current_workspace_in_new_window')}>
          <PanelRight className="h-4 w-4" />
          {t('actions.newWindow')}
        </CommandItem>
        <CommandItem onSelect={() => onAction('file.open_project')}>
          <FolderOpen className="h-4 w-4" />
          <span className="truncate">{t('actions.openProject')}</span>
          <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.openProject]} />
        </CommandItem>
        <CommandItem onSelect={() => onAction('file.open_file')}>
          <FileText className="h-4 w-4" />
          <span className="truncate">{t('actions.openFile')}</span>
          <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.openFile]} />
        </CommandItem>
        <CommandItem onSelect={() => onAction('view.focus_file_search')}>
          <Search className="h-4 w-4" />
          {t('sidebar.searchAction')}
        </CommandItem>
        <CommandItem onSelect={() => onAction('tab.close')}>
          <X className="h-4 w-4" />
          <span className="truncate">{t('actions.closeTab')}</span>
          <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.closeTab]} />
        </CommandItem>
        <CommandItem onSelect={() => onAction('file.export_pdf')}>
          <FileText className="h-4 w-4" />
          {t('actions.exportPdf')}
        </CommandItem>
        <CommandItem onSelect={() => onAction('file.export_docx')}>
          <FileText className="h-4 w-4" />
          {t('actions.exportDocx')}
        </CommandItem>
        <CommandItem onSelect={() => onAction('file.export_html')}>
          <FileText className="h-4 w-4" />
          {t('actions.exportHtml')}
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading={t('menu.workspace')}>
        <CommandItem
          onFocus={preloadGraphView}
          onMouseEnter={preloadGraphView}
          onSelect={() => onAction('workspace.open_graph')}
        >
          <GitGraph className="h-4 w-4" />
          {t('actions.openWorkspaceGraph')}
        </CommandItem>
        <CommandItem onSelect={() => onAction('terminal.open')}>
          <Terminal className="h-4 w-4" />
          {t('actions.openTerminal')}
        </CommandItem>
        <CommandItem
          disabled={searchIndexRebuilding}
          onSelect={() => onAction('workspace.rebuild_search_index')}
        >
          <RefreshCw className="h-4 w-4" />
          {searchIndexRebuilding
            ? t('actions.rebuildingSearchIndex')
            : t('actions.rebuildSearchIndex')}
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading={t('menu.view')}>
        <CommandItem
          onFocus={preloadWysiwygEditor}
          onMouseEnter={preloadWysiwygEditor}
          onSelect={() => onAction('view.wysiwyg')}
        >
          <PenLine className="h-4 w-4" />
          <span className="truncate">{t('editor.modeWysiwyg')}</span>
          <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.viewWysiwyg]} />
        </CommandItem>
        <CommandItem
          onFocus={preloadSourceEditor}
          onMouseEnter={preloadSourceEditor}
          onSelect={() => onAction('view.source')}
        >
          <FileText className="h-4 w-4" />
          <span className="truncate">{t('editor.modeSource')}</span>
          <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.viewSource]} />
        </CommandItem>
        <CommandItem
          onFocus={preloadGraphView}
          onMouseEnter={preloadGraphView}
          onSelect={() => onAction('view.graph')}
        >
          <GitGraph className="h-4 w-4" />
          <span className="truncate">{t('tabs.graph')}</span>
          <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.viewGraph]} />
        </CommandItem>
        <CommandItem onSelect={() => onAction('view.toggle_sidebar')}>
          <PanelLeft className="h-4 w-4" />
          <span className="truncate">{t('actions.toggleSidebar')}</span>
          <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.toggleSidebar]} />
        </CommandItem>
        <CommandItem onSelect={() => onAction('view.toggle_right_sidebar')}>
          <PanelRight className="h-4 w-4" />
          <span className="truncate">{t('actions.toggleRightSidebar')}</span>
          <CommandActionShortcut
            label={shortcutLabels[commandActionShortcutIds.toggleRightSidebar]}
          />
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading={t('menu.settings')}>
        <CommandItem onSelect={() => onAction('settings.open')}>
          <Settings2 className="h-4 w-4" />
          <span className="truncate">{t('menu.settings')}</span>
          <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.settings]} />
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading={t('menu.theme')}>
        <CommandItem
          aria-current={themeMode === 'system' ? 'true' : undefined}
          className={cn(themeMode === 'system' && currentCommandItemClassName)}
          onSelect={() => onAction(themeModeActionId('system'))}
        >
          <Monitor className="h-4 w-4" />
          <span className="truncate">{t('themeMode.system')}</span>
          {themeMode === 'system' && <CurrentItemCheck />}
        </CommandItem>
        <CommandItem
          aria-current={themeMode === 'light' ? 'true' : undefined}
          className={cn(themeMode === 'light' && currentCommandItemClassName)}
          onSelect={() => onAction(themeModeActionId('light'))}
        >
          <Sun className="h-4 w-4" />
          <span className="truncate">{t('themeMode.light')}</span>
          {themeMode === 'light' && <CurrentItemCheck />}
        </CommandItem>
        <CommandItem
          aria-current={themeMode === 'dark' ? 'true' : undefined}
          className={cn(themeMode === 'dark' && currentCommandItemClassName)}
          onSelect={() => onAction(themeModeActionId('dark'))}
        >
          <Moon className="h-4 w-4" />
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
      <CommandSeparator />
      <CommandGroup heading={t('menu.help')}>
        <CommandItem onSelect={() => onAction('help.about')}>
          <CircleHelp className="h-4 w-4" />
          {t('actions.about')}
        </CommandItem>
      </CommandGroup>
    </>
  )
}

export default CommandActionSections
