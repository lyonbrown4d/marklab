import { Copy, FileText, ListTree } from 'lucide-react'
import { useState, type MouseEvent } from 'react'
import { CommandItem } from '@/components/ui/command'
import SearchResultPreview from '@/components/SearchResultPreview'
import { useI18n } from '@/i18n/useI18n'
import { writeClipboardText } from '@/runtime/clipboard'
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

const escapeMarkdownLinkLabel = (label: string) => label.replace(/\\/g, '\\\\').replace(/]/g, '\\]')

const createMarkdownLink = (label: string, path: string, slug?: string) => {
  const target = slug ? `${path}#${slug}` : path
  return `[${escapeMarkdownLinkLabel(label)}](<${target.replace(/>/g, '%3E')}>)`
}

const stopCommandItemSelection = (event: MouseEvent<HTMLButtonElement>) => {
  event.preventDefault()
  event.stopPropagation()
}

const CopyMarkdownLinkAction = ({
  label,
  markdownLink,
}: {
  label: string
  markdownLink: string
}) => {
  const { t } = useI18n()
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const buttonText =
    status === 'copied'
      ? t('context.copied')
      : status === 'error'
        ? t('context.actionFailed')
        : t('edit.copy')

  const handleCopy = (event: MouseEvent<HTMLButtonElement>) => {
    stopCommandItemSelection(event)
    void writeClipboardText(markdownLink)
      .then(() => setStatus('copied'))
      .catch((error) => {
        console.error('copy markdown link failed', error)
        setStatus('error')
      })
  }

  return (
    <button
      type="button"
      aria-label={`${t('context.copyMarkdownLink')} ${label}`}
      className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md border border-border/80 bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground shadow-sm transition hover:border-primary/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onMouseDown={stopCommandItemSelection}
      onClick={handleCopy}
    >
      <Copy className="size-3" />
      <span>{buttonText}</span>
    </button>
  )
}

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
    <span className="min-w-0 flex-1">
      <span className="block truncate">{kind === 'title-file' ? file.label : file.path}</span>
      <span className="block truncate text-[11px] text-muted-foreground">
        {kind === 'title-file' ? file.path : file.label}
      </span>
    </span>
    <CopyMarkdownLinkAction
      label={file.path}
      markdownLink={createMarkdownLink(file.label, file.path)}
    />
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
        <span className="min-w-0 flex-1">
          <span className="block truncate">
            {'#'.repeat(Math.min(heading.level, 6))} {heading.text}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {heading.label}#{heading.slug}
          </span>
        </span>
        <CopyMarkdownLinkAction
          label={`${heading.path}#${heading.slug}`}
          markdownLink={createMarkdownLink(heading.text, heading.path, heading.slug)}
        />
      </CommandItem>
    )
  }

  return (
    <CommandItem
      value={`${row.result.title} ${row.result.path} ${row.result.snippet}`}
      onSelect={() => onOpenSearchResult(row.result)}
    >
      <SearchResultPreview result={row.result} compact />
      <CopyMarkdownLinkAction
        label={row.result.path}
        markdownLink={createMarkdownLink(row.result.title, row.result.path)}
      />
    </CommandItem>
  )
}
