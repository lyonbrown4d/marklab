import { useI18n } from '@/i18n/useI18n'

export const settingsDialogContentClassName =
  'grid h-[calc(100vh-1.5rem)] max-h-[calc(100vh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-md border border-border bg-card p-0 text-card-foreground shadow-[0_16px_40px_-30px_hsl(var(--foreground)/0.34)] sm:h-[min(740px,calc(100vh-2rem))] sm:max-h-[calc(100vh-2rem)] sm:w-[min(960px,calc(100vw-2rem))]'

export const SettingsDialogLoadingPanel = () => {
  const { t } = useI18n()
  const label = t('settings.loading')

  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="flex min-h-[320px] flex-col gap-4"
      role="status"
    >
      <span className="sr-only">{label}</span>
      <div className="space-y-3" aria-hidden="true">
        <div className="h-10 w-2/3 animate-pulse rounded-md bg-muted/70" />
        <div className="h-16 animate-pulse rounded-lg border border-border bg-muted/35" />
        <div className="h-16 animate-pulse rounded-lg border border-border bg-muted/30" />
        <div className="h-16 animate-pulse rounded-lg border border-border bg-muted/25" />
      </div>
    </div>
  )
}

export const SettingsDialogLoadingTabs = () => (
  <div
    className="flex h-auto flex-row gap-1 overflow-hidden border-b border-border bg-muted/30 p-2 sm:h-full sm:flex-col sm:border-b-0 sm:border-r"
    aria-hidden="true"
  >
    {Array.from({ length: 7 }).map((_, index) => (
      <div
        className="h-9 w-28 flex-none animate-pulse rounded-md bg-muted/60 sm:w-full"
        key={index}
      />
    ))}
  </div>
)
