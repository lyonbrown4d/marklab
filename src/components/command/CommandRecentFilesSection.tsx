import { FileClock } from 'lucide-react'
import { CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command'
import { useI18n } from '@/i18n/useI18n'
import type { CommandFile } from '@/components/command/CommandSearchResults'

type CommandRecentFilesSectionProps = {
  files: CommandFile[]
  query: string
  onOpenFile: (path: string) => void
}

const RECENT_FILES_LIMIT = 5

const CommandRecentFilesSection = ({
  files,
  query,
  onOpenFile,
}: CommandRecentFilesSectionProps) => {
  const { t } = useI18n()
  const normalizedQuery = query.trim().toLowerCase()
  const visibleFiles = files
    .filter((file) => {
      if (!normalizedQuery) return true
      return (
        file.path.toLowerCase().includes(normalizedQuery) ||
        file.label.toLowerCase().includes(normalizedQuery)
      )
    })
    .slice(0, RECENT_FILES_LIMIT)

  if (visibleFiles.length === 0) return null

  return (
    <CommandGroup heading={t('command.recentFiles')}>
      {visibleFiles.map((file) => (
        <CommandItem
          key={file.path}
          value={`recent open file ${file.label} ${file.path}`}
          onSelect={() => onOpenFile(file.path)}
        >
          <FileClock className="h-4 w-4" />
          <span className="min-w-0">
            <span className="block truncate">{file.label}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{file.path}</span>
          </span>
          <CommandShortcut>{t('command.recent')}</CommandShortcut>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

export default CommandRecentFilesSection
