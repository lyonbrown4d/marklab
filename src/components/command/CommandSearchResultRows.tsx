import { FileText, ListTree } from 'lucide-react'
import { CommandItem } from '@/components/ui/command'
import SearchResultPreview from '@/components/SearchResultPreview'
import type { FsSearchResult } from '@/services/fsApi'
import type { CommandFile, CommandHeading } from '@/components/command/CommandSearchResults'

export type CommandResultRow =
  | {
      id: string
      kind: 'title-file'
      file: CommandFile
    }
  | {
      id: string
      kind: 'path-file'
      file: CommandFile
    }
  | {
      id: string
      kind: 'heading'
      heading: CommandHeading
    }
  | {
      id: string
      kind: 'full-text'
      result: FsSearchResult
    }

type CommandResultRowItemProps = {
  row: CommandResultRow
  onOpenFile: (path: string) => void
  onOpenHeading: (path: string, slug: string) => void
  onOpenSearchResult: (result: FsSearchResult) => void
}

export const toFileRows = (
  files: CommandFile[],
  kind: 'title-file' | 'path-file',
): CommandResultRow[] =>
  files.map((file) => ({
    id: `${kind}:${file.path}`,
    kind,
    file,
  }))

export const toHeadingRows = (headings: CommandHeading[]): CommandResultRow[] =>
  headings.map((heading) => ({
    id: `heading:${heading.path}#${heading.slug}`,
    kind: 'heading',
    heading,
  }))

export const toFullTextRows = (results: FsSearchResult[]): CommandResultRow[] =>
  results.map((result) => ({
    id: `full-text:${result.path}:${result.line}:${result.column}`,
    kind: 'full-text',
    result,
  }))

const FileResultRow = ({
  file,
  kind,
  onOpenFile,
}: {
  file: CommandFile
  kind: 'title-file' | 'path-file'
  onOpenFile: (path: string) => void
}) => (
  <CommandItem
    value={kind === 'title-file' ? `${file.label} ${file.path}` : `${file.path} ${file.label}`}
    onSelect={() => onOpenFile(file.path)}
  >
    <FileText className="h-4 w-4" />
    <span className="min-w-0">
      <span className="block truncate">{kind === 'title-file' ? file.label : file.path}</span>
      <span className="block truncate text-[11px] text-muted-foreground">
        {kind === 'title-file' ? file.path : file.label}
      </span>
    </span>
  </CommandItem>
)

export const CommandResultRowItem = ({
  row,
  onOpenFile,
  onOpenHeading,
  onOpenSearchResult,
}: CommandResultRowItemProps) => {
  if (row.kind === 'title-file' || row.kind === 'path-file') {
    return <FileResultRow file={row.file} kind={row.kind} onOpenFile={onOpenFile} />
  }

  if (row.kind === 'heading') {
    const { heading } = row

    return (
      <CommandItem
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
    )
  }

  return (
    <CommandItem
      value={`${row.result.title} ${row.result.path} ${row.result.snippet}`}
      onSelect={() => onOpenSearchResult(row.result)}
    >
      <SearchResultPreview result={row.result} compact />
    </CommandItem>
  )
}
