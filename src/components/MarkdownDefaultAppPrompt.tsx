import { FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useI18n } from '@/i18n/useI18n'
import { getElectronRuntime, isElectronRuntime } from '@/runtime/electron'

const MarkdownDefaultAppPrompt = () => {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [platform, setPlatform] = useState('unknown')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !isElectronRuntime()) return undefined
    let cancelled = false
    void getElectronRuntime()
      .platform.get()
      .then((info) => {
        if (!cancelled) setPlatform(info.platform)
      })
      .catch(() => {
        if (!cancelled) setPlatform('unknown')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  if (!isElectronRuntime()) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          setPlatform('unknown')
          setLoading(true)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="self-start px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          <FileText aria-hidden="true" />
          {t('defaultAppPrompt.title')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
            {t('defaultAppPrompt.title')}
          </DialogTitle>
          <DialogDescription>{t('defaultAppPrompt.description')}</DialogDescription>
        </DialogHeader>
        <p aria-busy={loading} className="text-sm leading-6 text-muted-foreground">
          {t(`defaultAppPrompt.instructions.${platform}`)}
        </p>
      </DialogContent>
    </Dialog>
  )
}
export default MarkdownDefaultAppPrompt
