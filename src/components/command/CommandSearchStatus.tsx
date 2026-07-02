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

type StatusTone = keyof typeof statusToneClassName

const statusClassName = 'mx-2 mt-2 flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs'

const statusToneClassName = {
  muted: 'border-border bg-muted/35 text-muted-foreground',
  info: 'border-primary/20 bg-primary/5 text-foreground',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
}

const statusAriaByTone: Record<
  StatusTone,
  { live: 'polite' | 'assertive'; role: 'status' | 'alert' }
> = {
  muted: { live: 'polite', role: 'status' },
  info: { live: 'polite', role: 'status' },
  danger: { live: 'assertive', role: 'alert' },
}

const StatusNotice = ({
  children,
  icon,
  tone = 'muted',
}: {
  children: ReactNode
  icon: ReactNode
  tone?: StatusTone
}) => {
  const aria = statusAriaByTone[tone]

  return (
    <div
      aria-atomic="true"
      aria-live={aria.live}
      className={cn(statusClassName, statusToneClassName[tone])}
      role={aria.role}
    >
      <span aria-hidden="true" className="shrink-0">
        {icon}
      </span>
      <span>{children}</span>
    </div>
  )
}

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
