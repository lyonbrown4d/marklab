import { AlertCircle, Database, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import AppAlert from '@/components/AppAlert'
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

const statusToneClassName = {
  muted: 'bg-muted/35 text-muted-foreground',
  info: 'border-primary/20 bg-primary/5',
  danger: '',
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
    <AppAlert
      aria-atomic="true"
      aria-live={aria.live}
      className={cn('mx-2 mt-2 px-2 py-1.5', statusToneClassName[tone])}
      descriptionClassName="text-xs"
      icon={icon}
      role={aria.role}
      tone={tone === 'danger' ? 'destructive' : 'default'}
    >
      {children}
    </AppAlert>
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
      <StatusNotice
        icon={<Spinner aria-hidden="true" className="size-3.5" role="presentation" />}
        tone="info"
      >
        {t('command.search.status.rebuilding')}
      </StatusNotice>
    )
  }

  if (!workspaceIndexed) {
    return (
      <StatusNotice icon={<Database aria-hidden="true" className="size-3.5" />}>
        {t('command.search.status.warming')}
      </StatusNotice>
    )
  }

  if (fullTextError) {
    return (
      <StatusNotice icon={<AlertCircle aria-hidden="true" className="size-3.5" />} tone="danger">
        {t('command.search.status.fullTextError')}
      </StatusNotice>
    )
  }

  if (fullTextFetching) {
    return (
      <StatusNotice icon={<Spinner aria-hidden="true" className="size-3.5" role="presentation" />}>
        {t('command.search.status.searching')}
      </StatusNotice>
    )
  }

  if (trimmedQuery.length > 0 && trimmedQuery.length < 2) {
    return (
      <StatusNotice icon={<Search aria-hidden="true" className="size-3.5" />}>
        {t('command.search.status.minQuery')}
      </StatusNotice>
    )
  }

  if (!trimmedQuery) {
    return (
      <StatusNotice icon={<Database aria-hidden="true" className="size-3.5" />}>
        {t('command.search.status.ready', { count: indexedFileCount })}
      </StatusNotice>
    )
  }

  return null
}

export default CommandSearchStatus
