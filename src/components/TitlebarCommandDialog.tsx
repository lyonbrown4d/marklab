import {
  CircleHelp,
  FileText,
  FolderOpen,
  GitGraph,
  ListTree,
  PanelLeft,
  PanelRight,
  PenLine,
  Search,
  Settings2,
} from 'lucide-react'
import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useDebounce } from 'ahooks'
import AppCommandDialog from '@/components/AppCommandDialog'
import {
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useI18n } from '@/i18n/useI18n'
import { fsApi, type FsSearchResult } from '@/services/fsApi'
import { isDesktopRuntime } from '@/runtime/environment'
import SearchResultPreview from '@/components/SearchResultPreview'

type CommandFile = {
  path: string
  label: string
}

type CommandHeading = {
  path: string
  slug: string
  text: string
  level: number
  label: string
}

type TitlebarCommandDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  files: CommandFile[]
  headings: CommandHeading[]
  onOpenFile: (path: string) => void
  onOpenHeading: (path: string, slug: string) => void
  onOpenSearchResult: (result: FsSearchResult) => void
  onAction: (id: string) => void
}

const TitlebarCommandDialog = ({
  open,
  onOpenChange,
  files,
  headings,
  onOpenFile,
  onOpenHeading,
  onOpenSearchResult,
  onAction,
}: TitlebarCommandDialogProps) => {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query.trim(), { wait: 160 })
  const fullTextSearch = useQuery({
    queryKey: ['command-workspace-search', debouncedQuery],
    queryFn: () => fsApi.searchWorkspace(debouncedQuery, 8),
    enabled: open && isDesktopRuntime() && debouncedQuery.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  })

  return (
    <AppCommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput value={query} onValueChange={setQuery} placeholder={t('sidebar.search')} />
      <CommandList>
        <CommandEmpty>{t('center.noFile')}</CommandEmpty>
        {fullTextSearch.data && fullTextSearch.data.length > 0 && (
          <>
            <CommandGroup heading={t('search.fullText')}>
              {fullTextSearch.data.map((result) => (
                <CommandItem
                  key={`${result.path}:${result.line}:${result.column}`}
                  value={`${result.title} ${result.path} ${result.snippet}`}
                  onSelect={() => onOpenSearchResult(result)}
                >
                  <SearchResultPreview result={result} compact />
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        {files.length > 0 && (
          <>
            <CommandGroup heading={t('command.files')}>
              {files.map((file) => (
                <CommandItem
                  key={file.path}
                  value={`${file.label} ${file.path}`}
                  onSelect={() => onOpenFile(file.path)}
                >
                  <FileText className="h-4 w-4" />
                  <span className="min-w-0">
                    <span className="block truncate">{file.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {file.path}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        {headings.length > 0 && (
          <>
            <CommandGroup heading={t('command.headings')}>
              {headings.map((heading) => (
                <CommandItem
                  key={`${heading.path}#${heading.slug}`}
                  value={`${heading.text} ${heading.slug} ${heading.path}`}
                  onSelect={() => onOpenHeading(heading.path, heading.slug)}
                >
                  <ListTree className="h-4 w-4" />
                  <span className="min-w-0">
                    <span className="block truncate">
                      {'#'.repeat(Math.min(heading.level, 6))} {heading.text}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {heading.label}#{heading.slug}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        <CommandGroup heading="File">
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
            {t('tabs.workspaceGraph')}
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
      </CommandList>
    </AppCommandDialog>
  )
}

export default TitlebarCommandDialog
