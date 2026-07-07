import AppCommandDialog from '@/components/AppCommandDialog'
import { CommandInput, CommandList } from '@/components/ui/command'
import { useI18n } from '@/i18n/useI18n'

type TitlebarCommandDialogFallbackProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const CommandDialogLoadingBody = () => {
  const { t } = useI18n()
  const label = t('command.loading')

  return (
    <CommandList>
      <div
        aria-busy="true"
        aria-label={label}
        className="flex h-[300px] flex-col gap-3 p-3"
        role="status"
      >
        <span className="sr-only">{label}</span>
        <div className="space-y-2" aria-hidden="true">
          <div className="h-9 animate-pulse rounded-md bg-muted/70" />
          <div className="h-9 animate-pulse rounded-md bg-muted/50" />
          <div className="h-9 animate-pulse rounded-md bg-muted/40" />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2" aria-hidden="true">
          <div className="h-16 animate-pulse rounded-md border border-border bg-muted/30" />
          <div className="h-16 animate-pulse rounded-md border border-border bg-muted/30" />
          <div className="h-16 animate-pulse rounded-md border border-border bg-muted/30" />
        </div>
      </div>
    </CommandList>
  )
}

const TitlebarCommandDialogFallback = ({
  open,
  onOpenChange,
}: TitlebarCommandDialogFallbackProps) => {
  const { t } = useI18n()

  return (
    <AppCommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        disabled
        placeholder={t('sidebar.search')}
        value=""
        onValueChange={() => undefined}
      />
      <CommandDialogLoadingBody />
    </AppCommandDialog>
  )
}

export default TitlebarCommandDialogFallback
