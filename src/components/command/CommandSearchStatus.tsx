import { AlertCircle, Database, Loader2, Search } from 'lucide-react'

type CommandSearchStatusProps = {
  query: string
  fullTextFetching: boolean
  fullTextError: boolean
  workspaceIndexed: boolean
  indexedFileCount: number
  searchIndexRebuilding: boolean
}

const statusClassName = 'mx-2 mt-2 flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs'

const CommandSearchStatus = ({
  query,
  fullTextFetching,
  fullTextError,
  workspaceIndexed,
  indexedFileCount,
  searchIndexRebuilding,
}: CommandSearchStatusProps) => {
  const trimmedQuery = query.trim()
  const indexedFileLabel = indexedFileCount === 1 ? 'file' : 'files'

  if (searchIndexRebuilding) {
    return (
      <div
        className={`${statusClassName} border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300`}
      >
        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
        <span>Search index is rebuilding. Title and path results stay available.</span>
      </div>
    )
  }

  if (!workspaceIndexed) {
    return (
      <div className={`${statusClassName} border-border bg-muted/35 text-muted-foreground`}>
        <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Index is warming up. Path results use the current workspace snapshot for now.</span>
      </div>
    )
  }

  if (fullTextError) {
    return (
      <div
        className={`${statusClassName} border-destructive/30 bg-destructive/10 text-destructive`}
      >
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Full-text search could not complete. Title and path search are still available.</span>
      </div>
    )
  }

  if (fullTextFetching) {
    return (
      <div className={`${statusClassName} border-border bg-muted/35 text-muted-foreground`}>
        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
        <span>Searching indexed content...</span>
      </div>
    )
  }

  if (trimmedQuery.length > 0 && trimmedQuery.length < 2) {
    return (
      <div className={`${statusClassName} border-border bg-muted/35 text-muted-foreground`}>
        <Search className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Type at least 2 characters to include full-text results.</span>
      </div>
    )
  }

  if (!trimmedQuery) {
    return (
      <div className={`${statusClassName} border-border bg-muted/35 text-muted-foreground`}>
        <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Index ready - {indexedFileCount} indexed {indexedFileLabel}. Type to search titles, paths,
          headings, and full text.
        </span>
      </div>
    )
  }

  return null
}

export default CommandSearchStatus
