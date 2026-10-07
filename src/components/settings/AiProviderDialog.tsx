import { Bot, PencilLine } from 'lucide-react'
import { AiProviderForm } from '@/components/settings/AiProviderForm'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/i18n/useI18n'
import type { AiProviderUpdate, PublicAiProvider } from '@/services/aiApi'

type AiProviderDialogProps = {
  provider?: PublicAiProvider
  open: boolean
  pending: boolean
  error?: string
  onOpenChange: (open: boolean) => void
  onSave: (input: AiProviderUpdate) => Promise<void>
}

export const AiProviderDialog = ({
  provider,
  open,
  pending,
  error,
  onOpenChange,
  onSave,
}: AiProviderDialogProps) => {
  const { t } = useI18n()
  const Icon = provider ? PencilLine : Bot

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[34rem]">
        <DialogHeader className="border-b border-border/70 px-6 py-5 pr-12">
          <div className="flex items-start gap-3 text-left">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-base">
                {t(provider ? 'settings.aiEditProvider' : 'settings.aiAddProvider')}
              </DialogTitle>
              <DialogDescription className="mt-1 leading-5">
                {t('settings.aiProviderDialogDescription')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="px-6 py-5">
          <AiProviderForm
            provider={provider}
            pending={pending}
            error={error}
            onCancel={() => onOpenChange(false)}
            onSave={onSave}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
