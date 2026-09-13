import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
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
import { useI18n } from '@/i18n/useI18n'

const fileNameFormSchema = z.object({
  name: z.string().refine((value) => value.trim().length > 0),
})
type FileNameFormValues = z.input<typeof fileNameFormSchema>

type FileNameDialogProps = {
  open: boolean
  title: string
  description: string
  defaultValue: string
  confirmLabel: string
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus?: (event: Event) => void
  onSubmit: (name: string) => void | Promise<void>
}

type FileConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus?: (event: Event) => void
  onConfirm: () => void | Promise<void>
}

export const FileNameDialog = ({
  open,
  title,
  description,
  defaultValue,
  confirmLabel,
  onOpenChange,
  onCloseAutoFocus,
  onSubmit,
}: FileNameDialogProps) => {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const inFlight = useRef(false)
  const errorId = useId()
  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    clearErrors,
    formState: { errors, touchedFields, isSubmitting },
  } = useForm<FileNameFormValues>({
    resolver: zodResolver(fileNameFormSchema),
    defaultValues: { name: defaultValue },
    mode: 'onChange',
  })
  const name = useWatch({ control, name: 'name' })
  const nameField = register('name')

  useEffect(() => {
    if (!open) return
    reset({ name: defaultValue })
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [defaultValue, open, reset])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!inFlight.current) onOpenChange(nextOpen)
  }

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    try {
      await handleSubmit(async (values) => {
        clearErrors('root')
        try {
          await onSubmit(values.name.trim())
          onOpenChange(false)
        } catch (error) {
          setError('root', { message: error instanceof Error ? error.message : String(error) })
        }
      })(event)
    } finally {
      inFlight.current = false
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        onCloseAutoFocus={onCloseAutoFocus}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleFormSubmit} aria-busy={isSubmitting}>
          <Input
            {...nameField}
            ref={(element) => {
              nameField.ref(element)
              inputRef.current = element
            }}
            aria-label={description}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={
              errors.root || (touchedFields.name && errors.name) ? errorId : undefined
            }
            disabled={isSubmitting}
          />
          {errors.root ? (
            <AppAlert
              id={errorId}
              role="alert"
              tone="destructive"
              title={t('context.actionFailed')}
            >
              {errors.root.message}
            </AppAlert>
          ) : touchedFields.name && errors.name ? (
            <AppAlert id={errorId} role="alert" tone="destructive" className="px-2 py-1.5 text-xs">
              {t('fileOperation.nameRequired')}
            </AppAlert>
          ) : null}
          <DialogFooter>
            <AppButton
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
            >
              {t('fileOperation.cancel')}
            </AppButton>
            <AppButton type="submit" disabled={isSubmitting || name.trim().length === 0}>
              {isSubmitting ? t('fileOperation.working') : confirmLabel}
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
  onCloseAutoFocus,
  onConfirm,
}: FileConfirmDialogProps) => {
  const { t } = useI18n()
  const inFlight = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpenChange = (nextOpen: boolean) => {
    if (!inFlight.current) onOpenChange(nextOpen)
  }

  const handleConfirm = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setError(null)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={onCloseAutoFocus}
        aria-busy={pending}
        onOpenAutoFocus={() => setError(null)}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error !== null ? (
          <AppAlert role="alert" tone="destructive" title={t('context.actionFailed')}>
            {error}
          </AppAlert>
        ) : null}
        <DialogFooter>
          <AppButton
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => handleOpenChange(false)}
          >
            {t('fileOperation.cancel')}
          </AppButton>
          <AppButton type="button" variant="destructive" disabled={pending} onClick={handleConfirm}>
            {pending ? t('fileOperation.working') : confirmLabel}
          </AppButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
