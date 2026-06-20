import { useEffect, useRef } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import AppAlert from '@/components/AppAlert'
import AppButton from '@/components/AppButton'
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
const REQUIRED_NAME_MESSAGE = 'Enter a name to continue.'

const fileNameFormSchema = z.object({
  name: z.string().refine((value) => value.trim().length > 0, REQUIRED_NAME_MESSAGE),
})

type FileNameFormValues = z.input<typeof fileNameFormSchema>

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
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, touchedFields },
  } = useForm<FileNameFormValues>({
    resolver: zodResolver(fileNameFormSchema),
    defaultValues: { name: defaultValue },
    mode: 'onChange',
  })
  const nameValue = useWatch({ control, name: 'name' }) ?? ''
  const nameField = register('name')

  useEffect(() => {
    if (!open) return
    reset({ name: defaultValue })
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [defaultValue, open, reset])

  const handleFormSubmit = handleSubmit((values) => {
    const name = values.name.trim()
    onSubmit(name)
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleFormSubmit}>
          <div className="flex flex-col gap-1.5">
            <Input
              {...nameField}
              ref={(node) => {
                nameField.ref(node)
                inputRef.current = node
              }}
              aria-invalid={Boolean(errors.name)}
            />
            {touchedFields.name && errors.name ? (
              <AppAlert tone="destructive" className="px-2 py-1.5 text-xs">
                {errors.name.message}
              </AppAlert>
            ) : null}
          </div>
          <DialogFooter>
            <AppButton type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {CANCEL_LABEL}
            </AppButton>
            <AppButton type="submit" disabled={nameValue.trim().length === 0}>
              {confirmLabel}
            </AppButton>
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
          <AppButton type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {CANCEL_LABEL}
          </AppButton>
          <AppButton type="button" variant="destructive" onClick={handleConfirm}>
            {confirmLabel}
          </AppButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
