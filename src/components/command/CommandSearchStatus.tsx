import { AlertCircle, Database, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'

type CommandSearchStatusProps = {
  query: string
  fullTextFetching: boolean
  fullTextError: boolean
  workspaceIndexed: boolean
  indexedFileCount: number
  searchIndexRebuilding: boolean
}

const statusClassName = 'mx-2 mt-2 flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs'

const statusToneClassName = {
  muted: 'border-border bg-muted/35 text-muted-foreground',
  info: 'border-primary/20 bg-primary/5 text-foreground',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
}

const StatusNotice = ({
  children,
  icon,
  tone = 'muted',
}: {
  children: ReactNode
  icon: ReactNode
  tone?: keyof typeof statusToneClassName
}) => (
  <div className={cn(statusClassName, statusToneClassName[tone])}>
    {icon}
    <span>{children}</span>
  </div>
)

const CommandSearchStatus = ({
  query,
  fullTextFetching,
  fullTextError,
  workspaceIndexed,
  indexedFileCount,
  searchIndexRebuilding,
}: CommandSearchStatusProps) => {
  const { t } = useI18n()
  const trimmedQuery = query.trim()

  if (searchIndexRebuilding) {
    return (
      <StatusNotice icon={<Spinner className="mt-0.5 size-3.5 shrink-0" />} tone="info">
        {t('command.search.status.rebuilding')}
      </StatusNotice>
    )
  }

  if (!workspaceIndexed) {
    return (
      <StatusNotice icon={<Database className="mt-0.5 size-3.5 shrink-0" />}>
        {t('command.search.status.warming')}
      </StatusNotice>
    )
  }

  if (fullTextError) {
    return (
      <StatusNotice icon={<AlertCircle className="mt-0.5 size-3.5 shrink-0" />} tone="danger">
        {t('command.search.status.fullTextError')}
      </StatusNotice>
    )
  }

  if (fullTextFetching) {
    return (
      <StatusNotice icon={<Spinner className="mt-0.5 size-3.5 shrink-0" />}>
        {t('command.search.status.searching')}
      </StatusNotice>
    )
  }

  if (trimmedQuery.length > 0 && trimmedQuery.length < 2) {
    return (
      <StatusNotice icon={<Search className="mt-0.5 size-3.5 shrink-0" />}>
        {t('command.search.status.minQuery')}
      </StatusNotice>
    )
  }

  if (!trimmedQuery) {
    return (
      <StatusNotice icon={<Database className="mt-0.5 size-3.5 shrink-0" />}>
        {t('command.search.status.ready', { count: indexedFileCount })}
      </StatusNotice>
    )
  }

  return null
}

export default CommandSearchStatus
