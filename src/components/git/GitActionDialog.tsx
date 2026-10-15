import type { ReactNode } from 'react'
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

type Props = {
  title: string
  description: string
  pending: boolean
  error?: unknown
  confirmDisabled?: boolean
  destructive?: boolean
  onCancel: () => void
  onConfirm: () => void
  children?: ReactNode
}

export const GitActionDialog = ({
  title,
  description,
  pending,
  error,
  confirmDisabled,
  destructive,
  onCancel,
  onConfirm,
  children,
}: Props) => {
  const { t } = useI18n()
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onCancel()
      }}
    >
      <DialogContent
        className="max-h-[85vh] overflow-y-auto border-border sm:max-w-md"
        showCloseButton={false}
        aria-busy={pending}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error instanceof Error ? error.message : String(error)}
          </p>
        ) : null}
        {children}
        <DialogFooter>
          <Button variant="ghost" disabled={pending} onClick={onCancel}>
            {t('scm.cancel')}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending || confirmDisabled}
            onClick={onConfirm}
          >
            {pending ? t('scm.management.working') : t('scm.management.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
