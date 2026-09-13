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
        <DialogHeader className="px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-sm font-medium">{t('settings.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('settings.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden md:grid-cols-[152px_minmax(0,1fr)] md:grid-rows-1">
          <SettingsDialogLoadingTabs />
          <div className="h-full min-h-0 min-w-0 overflow-hidden bg-card">
            <div className="settings-scroll-viewport h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-0 [scrollbar-gutter:stable] [scrollbar-width:thin]">
              <div className="mx-auto min-h-full w-full max-w-2xl px-5 pb-8 pt-2 md:px-7">
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
