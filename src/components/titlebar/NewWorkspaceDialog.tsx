import { useRef, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'

type NewWorkspaceDialogProps = {
  onOpenChange: (open: boolean) => void
  onCreate: (name: string) => Promise<boolean>
}

export const NewWorkspaceDialog = ({ onOpenChange, onCreate }: NewWorkspaceDialogProps) => {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  useNativeSurfaceOcclusion('new-workspace-dialog', true, { blocksCommandPalette: true })
  const submit = async () => {
    if (submitting.current || !name.trim()) return
    submitting.current = true
    setBusy(true)
    try {
      if (await onCreate(name)) onOpenChange(false)
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!busy) onOpenChange(open)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('actions.newWorkspace')}</DialogTitle>
          <DialogDescription>{t('dialog.newWorkspaceDescription')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="space-y-4"
        >
          <label className="grid gap-2 text-sm">
            {t('dialog.workspaceName')}
            <Input
              autoFocus
              value={name}
              disabled={busy}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {t(busy ? 'dialog.creatingWorkspace' : 'dialog.selectWorkspaceParent')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
