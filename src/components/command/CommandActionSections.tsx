import {
  CircleHelp,
  FileText,
  FilePlus2,
  FolderPlus,
  FolderOpen,
  GitGraph,
  PanelLeft,
  PanelRight,
  PenLine,
  RefreshCw,
  Search,
  Settings2,
  Terminal,
  X,
} from 'lucide-react'
import { CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command'
import { useI18n } from '@/i18n/useI18n'

type CommandActionSectionsProps = {
  canCreateWorkspaceEntries: boolean
  searchIndexRebuilding: boolean
  onAction: (id: string) => void
}

const CommandActionSections = ({
  canCreateWorkspaceEntries,
  searchIndexRebuilding,
  onAction,
}: CommandActionSectionsProps) => {
  const { t } = useI18n()

  return (
    <>
      <CommandGroup heading="File">
        <CommandItem disabled={!canCreateWorkspaceEntries} onSelect={() => onAction('file.new')}>
          <FilePlus2 className="h-4 w-4" />
          New File
        </CommandItem>
        <CommandItem
          disabled={!canCreateWorkspaceEntries}
          onSelect={() => onAction('file.new_folder')}
        >
          <FolderPlus className="h-4 w-4" />
          New Folder
        </CommandItem>
        <CommandItem onSelect={() => onAction('window.open_current_workspace_in_new_window')}>
          <PanelRight className="h-4 w-4" />
          New Window
        </CommandItem>
        <CommandItem onSelect={() => onAction('file.open_project')}>
          <FolderOpen className="h-4 w-4" />
          {t('actions.openProject')}
        </CommandItem>
        <CommandItem onSelect={() => onAction('file.open_file')}>
          <FileText className="h-4 w-4" />
          {t('actions.openFile')}
        </CommandItem>
        <CommandItem onSelect={() => onAction('view.focus_file_search')}>
          <Search className="h-4 w-4" />
          {t('sidebar.searchAction')}
        </CommandItem>
        <CommandItem onSelect={() => onAction('tab.close')}>
          <X className="h-4 w-4" />
          Close Current Tab
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
      <CommandGroup heading="Workspace">
        <CommandItem onSelect={() => onAction('workspace.open_graph')}>
          <GitGraph className="h-4 w-4" />
          Workspace Graph
        </CommandItem>
        <CommandItem onSelect={() => onAction('terminal.open')}>
          <Terminal className="h-4 w-4" />
          Open Terminal
        </CommandItem>
        <CommandItem
          disabled={searchIndexRebuilding}
          onSelect={() => onAction('workspace.rebuild_search_index')}
        >
          <RefreshCw className="h-4 w-4" />
          {searchIndexRebuilding ? 'Rebuilding Search Index...' : 'Rebuild Search Index'}
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading="View">
        <CommandItem onSelect={() => onAction('view.wysiwyg')}>
          <PenLine className="h-4 w-4" />
          {t('editor.modeWysiwyg')}
        </CommandItem>
        <CommandItem onSelect={() => onAction('view.source')}>
          <FileText className="h-4 w-4" />
          {t('editor.modeSource')}
        </CommandItem>
        <CommandItem onSelect={() => onAction('view.graph')}>
          <GitGraph className="h-4 w-4" />
          Graph View
        </CommandItem>
        <CommandItem onSelect={() => onAction('view.toggle_sidebar')}>
          <PanelLeft className="h-4 w-4" />
          {t('actions.toggleSidebar')}
        </CommandItem>
        <CommandItem onSelect={() => onAction('view.toggle_right_sidebar')}>
          <PanelRight className="h-4 w-4" />
          {t('actions.toggleRightSidebar')}
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading={t('menu.settings')}>
        <CommandItem onSelect={() => onAction('settings.open')}>
          <Settings2 className="h-4 w-4" />
          {t('menu.settings')}
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading={t('menu.theme')}>
        <CommandItem onSelect={() => onAction('theme.light')}>{t('theme.light')}</CommandItem>
        <CommandItem onSelect={() => onAction('theme.dark')}>{t('theme.dark')}</CommandItem>
        <CommandItem onSelect={() => onAction('theme.marko-light')}>
          {t('theme.markoLight')}
        </CommandItem>
        <CommandItem onSelect={() => onAction('theme.marko-dark')}>
          {t('theme.markoDark')}
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading="Help">
        <CommandItem onSelect={() => onAction('help.about')}>
          <CircleHelp className="h-4 w-4" />
          About marklab
        </CommandItem>
      </CommandGroup>
    </>
  )
}

export default CommandActionSections
