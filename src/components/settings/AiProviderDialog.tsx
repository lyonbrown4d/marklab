import { Cloud, PencilLine, Server } from 'lucide-react'
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
  mode: 'ollama' | 'compatible' | 'cloud'
  provider?: PublicAiProvider
  open: boolean
  pending: boolean
  error?: string
  onOpenChange: (open: boolean) => void
  onSave: (input: AiProviderUpdate) => Promise<void>
}

const dialogMetadata = {
  ollama: {
    description: 'settings.aiOllamaDialogDescription',
    icon: Server,
    title: 'settings.aiConfigureOllama',
  },
  compatible: {
    description: 'settings.aiCompatibleDialogDescription',
    icon: Server,
    title: 'settings.aiAddCompatible',
  },
  cloud: {
    description: 'settings.aiCloudDialogDescription',
    icon: Cloud,
    title: 'settings.aiAddCloudProvider',
  },
} as const

export const AiProviderDialog = ({
  mode,
  provider,
  open,
  pending,
  error,
  onOpenChange,
  onSave,
}: AiProviderDialogProps) => {
  const { t } = useI18n()
  const metadata = dialogMetadata[mode]
  const Icon = provider ? PencilLine : metadata.icon

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
                {t(provider ? 'settings.aiEditProvider' : metadata.title)}
              </DialogTitle>
              <DialogDescription className="mt-1 leading-5">
                {t(metadata.description)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="px-6 py-5">
          <AiProviderForm
            mode={mode}
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
