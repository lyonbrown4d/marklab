import { useI18n } from '@/i18n/useI18n'
import { Skeleton } from '@/components/ui/skeleton'
import { DocumentLoadingState } from '@/components/loading/DocumentLoadingState'

export const settingsDialogContentClassName =
  'settings-dialog-content inset-0 m-auto translate-none transform-none will-change-auto data-[state=open]:[animation-name:settings-dialog-content-in] data-[state=closed]:[animation-name:settings-dialog-content-out] grid h-[calc(100dvh-1rem)] max-h-[680px] w-[calc(100vw-1rem)] max-w-[1000px] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-xl border border-border bg-card p-0 text-card-foreground shadow-[0_24px_80px_-30px_hsl(var(--foreground)/0.42)] sm:max-w-[1000px] md:h-[calc(100dvh-3rem)] md:w-[calc(100vw-3rem)]'

// Preserve the shared native scrollbar; scoped important values override unlayered base rules.
export const settingsScrollViewportClassName =
  'settings-scroll-viewport h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain scroll-auto [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:color-mix(in_srgb,hsl(var(--foreground))_22%,transparent)_transparent] [&::-webkit-scrollbar]:!w-[6px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-[0.1875rem] [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-card [&::-webkit-scrollbar-thumb]:!bg-[color-mix(in_srgb,hsl(var(--foreground))_22%,transparent)]'

export const SettingsDialogLoadingPanel = () => {
  const { t } = useI18n()
  const label = t('settings.loading')

  return <DocumentLoadingState className="min-h-[200px]" label={label} />
}

export const SettingsDialogLoadingTabs = () => (
  <div
    className="flex h-auto min-h-0 flex-row gap-1 overflow-hidden px-2 py-2 md:h-full md:flex-col md:py-3"
    aria-hidden="true"
  >
    {Array.from({ length: 7 }).map((_, index) => (
      <Skeleton className="h-8 w-28 flex-none motion-reduce:animate-none md:w-full" key={index} />
    ))}
  </div>
)
