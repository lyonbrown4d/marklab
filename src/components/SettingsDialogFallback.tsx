import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  SettingsDialogLoadingPanel,
  SettingsDialogLoadingTabs,
  settingsDialogContentClassName,
  settingsScrollViewportClassName,
} from '@/components/settings/SettingsDialogLoading'
import { useI18n } from '@/i18n/useI18n'

type SettingsDialogFallbackProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SettingsDialogFallback = ({ open, onOpenChange }: SettingsDialogFallbackProps) => {
  const { t } = useI18n()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={settingsDialogContentClassName}>
        <DialogHeader className="border-b border-border/60 px-4 py-3 pr-12 text-left">
          <DialogTitle className="text-sm font-semibold">{t('settings.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('settings.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden md:grid-cols-[176px_minmax(0,1fr)] md:grid-rows-1">
          <SettingsDialogLoadingTabs />
          <div className="h-full min-h-0 min-w-0 overflow-hidden bg-card">
            <div className={settingsScrollViewportClassName}>
              <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-3 md:px-6">
                <SettingsDialogLoadingPanel />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default SettingsDialogFallback
