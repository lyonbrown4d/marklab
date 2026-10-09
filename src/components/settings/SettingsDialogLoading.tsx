import { useI18n } from '@/i18n/useI18n'
import { Skeleton } from '@/components/ui/skeleton'

export const settingsDialogContentClassName =
  'settings-dialog-content bottom-0 left-0 right-0 top-0 m-auto translate-x-0 translate-y-0 transform-none will-change-auto grid h-[calc(100dvh-1rem)] max-h-none w-[calc(100vw-1rem)] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-xl border border-border bg-card p-0 text-card-foreground shadow-[0_24px_80px_-30px_hsl(var(--foreground)/0.42)] sm:max-w-none md:h-[84dvh] md:max-h-[780px] md:w-[86vw] md:max-w-[1180px]'

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
      <div className="flex flex-col gap-6" aria-hidden="true">
        <Skeleton className="h-5 w-1/3 motion-reduce:animate-none" />
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-1/2 motion-reduce:animate-none" />
              <Skeleton className="h-3 w-3/4 motion-reduce:animate-none" />
            </div>
            <Skeleton className="h-7 w-12 motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    </div>
  )
}

export const SettingsDialogLoadingTabs = () => (
  <div
    className="flex h-auto flex-row gap-1 overflow-hidden px-3 pb-3 md:h-full md:flex-col"
    aria-hidden="true"
  >
    {Array.from({ length: 7 }).map((_, index) => (
      <Skeleton className="h-9 w-28 flex-none motion-reduce:animate-none md:w-full" key={index} />
    ))}
  </div>
)
