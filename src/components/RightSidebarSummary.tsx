import { useI18n } from '@/i18n/useI18n'

type RightSidebarSummaryProps = {
  targetPath: string | null
  targetLabel: string
}

export const RightSidebarSummary = ({ targetPath, targetLabel }: RightSidebarSummaryProps) => {
  const { t } = useI18n()
  if (!targetPath) return null

  return (
    <section
      className="flex h-10 min-w-0 shrink-0 items-center px-1"
      aria-label={t('inspector.title')}
    >
      <span className="truncate text-xs font-medium text-muted-foreground" title={targetPath}>
        {targetLabel}
      </span>
    </section>
  )
}
