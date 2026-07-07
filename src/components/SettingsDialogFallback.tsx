import { SlidersHorizontal } from 'lucide-react'
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
        <DialogHeader className="border-b border-border/80 bg-card px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base tracking-[0.01em]">
            <SlidersHorizontal className="size-4 text-primary" aria-hidden="true" />
            {t('settings.title')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t('settings.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-card sm:grid-cols-[176px_minmax(0,1fr)] sm:grid-rows-1">
          <SettingsDialogLoadingTabs />
          <div className="h-full min-h-0 min-w-0 overflow-hidden bg-card">
            <div className="settings-scroll-viewport h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-0 [scrollbar-gutter:stable] [scrollbar-width:thin]">
              <div className="mx-auto min-h-full w-full max-w-3xl p-5">
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
