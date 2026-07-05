import { FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/i18n/useI18n'
import { getElectronRuntime, isElectronRuntime } from '@/runtime/electron'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const PROMPT_DELAY_MS = 900

const MarkdownDefaultAppPrompt = () => {
  const { t } = useI18n()
  const hidden = usePreferencesStore((state) => state.hideMarkdownDefaultAppPrompt)
  const setHidden = usePreferencesStore((state) => state.setHideMarkdownDefaultAppPrompt)
  const [open, setOpen] = useState(false)
  const [platform, setPlatform] = useState('unknown')

  useEffect(() => {
    if (hidden || !isElectronRuntime()) return undefined

    const timer = setTimeout(() => setOpen(true), PROMPT_DELAY_MS)
    void getElectronRuntime()
      ?.platform.get()
      .then((info) => setPlatform(info.platform))
      .catch(() => setPlatform('unknown'))

    return () => clearTimeout(timer)
  }, [hidden])

  if (hidden || !isElectronRuntime()) return null

  const dismissForSession = () => {
    setOpen(false)
  }

  const dismissPermanently = () => {
    setHidden(true)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md rounded-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-primary" aria-hidden="true" />
            {t('defaultAppPrompt.title')}
          </DialogTitle>
          <DialogDescription>{t('defaultAppPrompt.description')}</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-border bg-muted/35 px-3 py-2 text-sm leading-6 text-muted-foreground">
          {t(`defaultAppPrompt.instructions.${platform}`)}
        </div>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="ghost" onClick={dismissPermanently}>
            {t('defaultAppPrompt.dontShowAgain')}
          </Button>
          <Button type="button" onClick={dismissForSession}>
            {t('defaultAppPrompt.later')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default MarkdownDefaultAppPrompt
