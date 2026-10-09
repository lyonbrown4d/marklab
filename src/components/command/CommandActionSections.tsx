import {
  CircleHelp,
  FileText,
  FilePlus2,
  FolderPlus,
  FolderOpen,
  LockKeyhole,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PenLine,
  Search,
  Settings2,
  X,
} from 'lucide-react'
import { useMemo } from 'react'
import { CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command'
import CommandWorkspaceSection from '@/components/command/CommandWorkspaceSection'
import { CommandActionShortcut } from '@/components/command/CommandActionHelpers'
import CommandThemeSection from '@/components/command/CommandThemeSection'
import { useI18n } from '@/i18n/useI18n'
import { preloadSourceEditor, preloadWysiwygEditor } from '@/lib/preloadFeatures'
import type { MarkdownCollectionSummary } from '@/logic/markdownCollections'
import { createAppActionPresentations } from '@/logic/appActionCatalog'
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
  const shortcutOverrides = usePreferencesStore((state) => state.shortcutOverrides)
  const actions = useMemo(
    () =>
      createAppActionPresentations({
        canCreateWorkspaceEntries,
        shortcutOverrides,
        translate: t,
      }),
    [canCreateWorkspaceEntries, shortcutOverrides, t],
  )
  const createActionsEnabled = actions['file.new'].enabled && actions['file.new_folder'].enabled

  return (
    <>
      <CommandGroup>
        <CommandItem
          value={actions['app.command_palette'].searchValue}
          onSelect={onCommandPaletteAction}
        >
          <Search className="size-4" />
          <span className="truncate">{actions['app.command_palette'].label}</span>
          <CommandActionShortcut label={actions['app.command_palette'].shortcut} />
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading={t('menu.file')}>
        {createActionsEnabled ? (
          <>
            <CommandItem
              value={actions['file.new'].searchValue}
              onSelect={() => onAction(actions['file.new'].id)}
            >
              <FilePlus2 className="size-4" />
              <span className="truncate">{actions['file.new'].label}</span>
              <CommandActionShortcut label={actions['file.new'].shortcut} />
            </CommandItem>
            <CommandItem
              value={actions['file.new_folder'].searchValue}
              onSelect={() => onAction(actions['file.new_folder'].id)}
            >
              <FolderPlus className="size-4" />
              {actions['file.new_folder'].label}
            </CommandItem>
          </>
        ) : (
          <CommandItem value="single file mode create unavailable" disabled>
            <FileText className="size-4" />
            <span className="truncate">{t('command.singleFileCreateUnavailable')}</span>
          </CommandItem>
        )}
        <CommandItem
          value={actions['window.open_current_workspace_in_new_window'].searchValue}
          onSelect={() => onAction(actions['window.open_current_workspace_in_new_window'].id)}
        >
          <PanelRight className="size-4" />
          {actions['window.open_current_workspace_in_new_window'].label}
        </CommandItem>
        <CommandItem
          value={actions['file.open_project'].searchValue}
          onSelect={() => onAction(actions['file.open_project'].id)}
        >
          <FolderOpen className="size-4" />
          <span className="truncate">{actions['file.open_project'].label}</span>
          <CommandActionShortcut label={actions['file.open_project'].shortcut} />
        </CommandItem>
        <CommandItem
          value={actions['file.open_file'].searchValue}
          onSelect={() => onAction(actions['file.open_file'].id)}
        >
          <FileText className="size-4" />
          <span className="truncate">{actions['file.open_file'].label}</span>
          <CommandActionShortcut label={actions['file.open_file'].shortcut} />
        </CommandItem>
        <CommandItem
          value={actions['view.focus_file_search'].searchValue}
          onSelect={() => onAction(actions['view.focus_file_search'].id)}
        >
          <Search className="size-4" />
          {actions['view.focus_file_search'].label}
        </CommandItem>
        <CommandItem
          value={actions['tab.close'].searchValue}
          onSelect={() => onAction(actions['tab.close'].id)}
        >
          <X className="size-4" />
          <span className="truncate">{actions['tab.close'].label}</span>
          <CommandActionShortcut label={actions['tab.close'].shortcut} />
        </CommandItem>
        <CommandItem
          value={actions['file.export_pdf'].searchValue}
          onSelect={() => onAction(actions['file.export_pdf'].id)}
        >
          <FileText className="size-4" />
          {actions['file.export_pdf'].label}
        </CommandItem>
        <CommandItem
          value={actions['file.export_docx'].searchValue}
          onSelect={() => onAction(actions['file.export_docx'].id)}
        >
          <FileText className="size-4" />
          {actions['file.export_docx'].label}
        </CommandItem>
        <CommandItem
          value={actions['file.export_html'].searchValue}
          onSelect={() => onAction(actions['file.export_html'].id)}
        >
          <FileText className="size-4" />
          {actions['file.export_html'].label}
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
          value={actions['view.wysiwyg'].searchValue}
          onSelect={() => onAction(actions['view.wysiwyg'].id)}
        >
          <PenLine className="size-4" />
          <span className="truncate">{actions['view.wysiwyg'].label}</span>
          <CommandActionShortcut label={actions['view.wysiwyg'].shortcut} />
        </CommandItem>
        <CommandItem
          value={actions['view.toggle_readonly'].searchValue}
          onSelect={() => onAction(actions['view.toggle_readonly'].id)}
        >
          <LockKeyhole className="size-4" />
          <span className="truncate">{actions['view.toggle_readonly'].label}</span>
          <CommandActionShortcut label={actions['view.toggle_readonly'].shortcut} />
        </CommandItem>
        <CommandItem
          value={actions['view.toggle_status_bar'].searchValue}
          onSelect={() => onAction(actions['view.toggle_status_bar'].id)}
        >
          <PanelBottom className="size-4" />
          <span className="truncate">{actions['view.toggle_status_bar'].label}</span>
          <CommandActionShortcut label={actions['view.toggle_status_bar'].shortcut} />
        </CommandItem>
        <CommandItem
          onFocus={preloadSourceEditor}
          onMouseEnter={preloadSourceEditor}
          value={actions['view.source'].searchValue}
          onSelect={() => onAction(actions['view.source'].id)}
        >
          <FileText className="size-4" />
          <span className="truncate">{actions['view.source'].label}</span>
          <CommandActionShortcut label={actions['view.source'].shortcut} />
        </CommandItem>
        <CommandItem
          value={actions['view.toggle_sidebar'].searchValue}
          onSelect={() => onAction(actions['view.toggle_sidebar'].id)}
        >
          <PanelLeft className="size-4" />
          <span className="truncate">{actions['view.toggle_sidebar'].label}</span>
          <CommandActionShortcut label={actions['view.toggle_sidebar'].shortcut} />
        </CommandItem>
        <CommandItem
          value={actions['view.toggle_right_sidebar'].searchValue}
          onSelect={() => onAction(actions['view.toggle_right_sidebar'].id)}
        >
          <PanelRight className="size-4" />
          <span className="truncate">{actions['view.toggle_right_sidebar'].label}</span>
          <CommandActionShortcut label={actions['view.toggle_right_sidebar'].shortcut} />
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading={t('menu.settings')}>
        <CommandItem
          value={actions['settings.open'].searchValue}
          onSelect={() => onAction(actions['settings.open'].id)}
        >
          <Settings2 className="size-4" />
          <span className="truncate">{actions['settings.open'].label}</span>
          <CommandActionShortcut label={actions['settings.open'].shortcut} />
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandThemeSection onAction={onAction} />
      <CommandSeparator />
      <CommandGroup heading={t('menu.help')}>
        <CommandItem
          value={actions['help.about'].searchValue}
          onSelect={() => onAction(actions['help.about'].id)}
        >
          <CircleHelp className="size-4" />
          {actions['help.about'].label}
        </CommandItem>
      </CommandGroup>
    </>
  )
}

export default CommandActionSections
