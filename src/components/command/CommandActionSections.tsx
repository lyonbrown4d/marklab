import {
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
  Search,
  Settings2,
  Sun,
  X,
} from 'lucide-react'
import { useMemo } from 'react'
import { CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command'
import CommandWorkspaceSection from '@/components/command/CommandWorkspaceSection'
import {
  CommandActionShortcut,
  commandActionShortcutIds,
  createShortcutLabels,
  currentCommandItemClassName,
  CurrentItemCheck,
} from '@/components/command/CommandActionHelpers'
import { useI18n } from '@/i18n/useI18n'
import { builtInThemes, themeActionId, themeModeActionId } from '@/logic/themes'
import { preloadGraphView, preloadSourceEditor, preloadWysiwygEditor } from '@/lib/preloadFeatures'
import { cn } from '@/lib/utils'
import type { MarkdownCollectionSummary } from '@/logic/markdownCollections'
import { usePreferencesStore } from '@/store/usePreferencesStore'

type CommandActionSectionsProps = {
  canCreateWorkspaceEntries: boolean
  collections: MarkdownCollectionSummary[]
  searchIndexRebuilding: boolean
  onCommandPaletteAction: () => void
  onAction: (id: string) => void
}

const CommandActionSections = ({
  canCreateWorkspaceEntries,
  collections,
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
        <CommandItem value="command palette quick open search" onSelect={onCommandPaletteAction}>
          <Search className="size-4" />
          <span className="truncate">{t('shortcuts.commandPalette')}</span>
          <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.commandPalette]} />
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading={t('menu.file')}>
        {canCreateWorkspaceEntries ? (
          <>
            <CommandItem
              value="new file create note markdown"
              onSelect={() => onAction('file.new')}
            >
              <FilePlus2 className="size-4" />
              <span className="truncate">{t('sidebar.newFile')}</span>
              <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.newFile]} />
            </CommandItem>
            <CommandItem
              value="new folder create directory"
              onSelect={() => onAction('file.new_folder')}
            >
              <FolderPlus className="size-4" />
              {t('sidebar.newFolder')}
            </CommandItem>
          </>
        ) : (
          <CommandItem value="single file mode create unavailable" disabled>
            <FileText className="size-4" />
            <span className="truncate">{t('command.singleFileCreateUnavailable')}</span>
          </CommandItem>
        )}
        <CommandItem
          value="new window open current workspace"
          onSelect={() => onAction('window.open_current_workspace_in_new_window')}
        >
          <PanelRight className="size-4" />
          {t('actions.newWindow')}
        </CommandItem>
        <CommandItem
          value="open project folder workspace"
          onSelect={() => onAction('file.open_project')}
        >
          <FolderOpen className="size-4" />
          <span className="truncate">{t('actions.openProject')}</span>
          <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.openProject]} />
        </CommandItem>
        <CommandItem value="open file select file" onSelect={() => onAction('file.open_file')}>
          <FileText className="size-4" />
          <span className="truncate">{t('actions.openFile')}</span>
          <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.openFile]} />
        </CommandItem>
        <CommandItem
          value="search files focus file search"
          onSelect={() => onAction('view.focus_file_search')}
        >
          <Search className="size-4" />
          {t('sidebar.searchAction')}
        </CommandItem>
        <CommandItem value="close tab close active file" onSelect={() => onAction('tab.close')}>
          <X className="size-4" />
          <span className="truncate">{t('actions.closeTab')}</span>
          <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.closeTab]} />
        </CommandItem>
        <CommandItem value="export pdf" onSelect={() => onAction('file.export_pdf')}>
          <FileText className="size-4" />
          {t('actions.exportPdf')}
        </CommandItem>
        <CommandItem value="export docx word" onSelect={() => onAction('file.export_docx')}>
          <FileText className="size-4" />
          {t('actions.exportDocx')}
        </CommandItem>
        <CommandItem value="export html" onSelect={() => onAction('file.export_html')}>
          <FileText className="size-4" />
          {t('actions.exportHtml')}
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandWorkspaceSection
        collections={collections}
        projectWorkspace={canCreateWorkspaceEntries}
        searchIndexRebuilding={searchIndexRebuilding}
        onAction={onAction}
      />
      <CommandSeparator />
      <CommandGroup heading={t('menu.view')}>
        <CommandItem
          onFocus={preloadWysiwygEditor}
          onMouseEnter={preloadWysiwygEditor}
          value="wysiwyg editor rich text visual editor"
          onSelect={() => onAction('view.wysiwyg')}
        >
          <PenLine className="size-4" />
          <span className="truncate">{t('editor.modeWysiwyg')}</span>
          <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.viewWysiwyg]} />
        </CommandItem>
        <CommandItem
          onFocus={preloadSourceEditor}
          onMouseEnter={preloadSourceEditor}
          value="source editor markdown source code"
          onSelect={() => onAction('view.source')}
        >
          <FileText className="size-4" />
          <span className="truncate">{t('editor.modeSource')}</span>
          <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.viewSource]} />
        </CommandItem>
        <CommandItem
          onFocus={preloadGraphView}
          onMouseEnter={preloadGraphView}
          value="graph view mindmap react flow workspace graph"
          onSelect={() => onAction('view.graph')}
        >
          <GitGraph className="size-4" />
          <span className="truncate">{t('tabs.graph')}</span>
          <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.viewGraph]} />
        </CommandItem>
        <CommandItem
          value="toggle left sidebar explorer"
          onSelect={() => onAction('view.toggle_sidebar')}
        >
          <PanelLeft className="size-4" />
          <span className="truncate">{t('actions.toggleSidebar')}</span>
          <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.toggleSidebar]} />
        </CommandItem>
        <CommandItem
          value="toggle right sidebar inspector details"
          onSelect={() => onAction('view.toggle_right_sidebar')}
        >
          <PanelRight className="size-4" />
          <span className="truncate">{t('actions.toggleRightSidebar')}</span>
          <CommandActionShortcut
            label={shortcutLabels[commandActionShortcutIds.toggleRightSidebar]}
          />
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading={t('menu.settings')}>
        <CommandItem
          value="settings preferences options"
          onSelect={() => onAction('settings.open')}
        >
          <Settings2 className="size-4" />
          <span className="truncate">{t('menu.settings')}</span>
          <CommandActionShortcut label={shortcutLabels[commandActionShortcutIds.settings]} />
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
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
      <CommandSeparator />
      <CommandGroup heading={t('menu.help')}>
        <CommandItem value="help about version" onSelect={() => onAction('help.about')}>
          <CircleHelp className="size-4" />
          {t('actions.about')}
        </CommandItem>
      </CommandGroup>
    </>
  )
}

export default CommandActionSections
