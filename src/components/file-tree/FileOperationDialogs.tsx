import { useRef, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

const CANCEL_LABEL = 'Cancel'

type FileNameDialogProps = {
  open: boolean
  title: string
  description: string
  defaultValue: string
  confirmLabel: string
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string) => void
}

type FileConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export const FileNameDialog = ({
  open,
  title,
  description,
  defaultValue,
  confirmLabel,
  onOpenChange,
  onSubmit,
}: FileNameDialogProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = inputRef.current?.value ?? ''
    const name = value.trim()
    if (!name) return
    onSubmit(name)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
          inputRef.current?.select()
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Input key={`${open}:${defaultValue}`} ref={inputRef} defaultValue={defaultValue} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {CANCEL_LABEL}
            </Button>
            <Button type="submit">{confirmLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export const FileConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel,
  onOpenChange,
  onConfirm,
}: FileConfirmDialogProps) => {
  const handleConfirm = () => {
    onConfirm()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {CANCEL_LABEL}
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
