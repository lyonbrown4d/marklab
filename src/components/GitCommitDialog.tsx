import { useEffect, useId, useRef } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { GitCommitHorizontal } from 'lucide-react'
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/i18n/useI18n'

type GitCommitDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  branch: string
  changedFilesCount: number
  message: string
  onMessageChange: (message: string) => void
  onCommit: () => void
  canCommit: boolean
  isCommitting: boolean
  error: unknown
  disabledReason?: string
}

const gitCommitFormSchema = z.object({
  message: z.string().refine((value) => value.trim().length > 0, 'Commit message is required.'),
})

type GitCommitFormValues = z.input<typeof gitCommitFormSchema>

export const GitCommitDialog = ({
  open,
  onOpenChange,
  branch,
  changedFilesCount,
  message,
  onMessageChange,
  onCommit,
  canCommit,
  isCommitting,
  error,
  disabledReason,
}: GitCommitDialogProps) => {
  const { t } = useI18n()
  const messageId = useId()
  const messageDescriptionId = `${messageId}-description`
  const messageErrorId = `${messageId}-error`
  const disabledReasonId = `${messageId}-disabled-reason`
  const commitErrorId = `${messageId}-commit-error`
  const wasOpenRef = useRef(open)
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, touchedFields },
  } = useForm<GitCommitFormValues>({
    resolver: zodResolver(gitCommitFormSchema),
    defaultValues: { message },
    mode: 'onChange',
  })
  const messageValue = useWatch({ control, name: 'message' }) ?? ''
  const canSubmit = canCommit && messageValue.trim().length > 0
  const hasMessageError = Boolean(touchedFields.message && errors.message)
  const messageDescribedBy = hasMessageError
    ? `${messageDescriptionId} ${messageErrorId}`
    : messageDescriptionId
  const commitButtonDescribedBy = [
    disabledReason ? disabledReasonId : null,
    error ? commitErrorId : null,
  ]
    .filter(Boolean)
    .join(' ')
  const messageField = register('message', {
    onChange: (event) => onMessageChange(event.target.value),
  })

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      reset({ message })
    }
    wasOpenRef.current = open
  }, [message, open, reset])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-busy={isCommitting} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('scm.commitDialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('scm.commitDialogDescription', {
              count: String(changedFilesCount),
              branch,
            })}
          </DialogDescription>
        </DialogHeader>
        <form
          aria-busy={isCommitting}
          className="flex flex-col gap-3"
          onSubmit={handleSubmit(() => {
            if (!canSubmit) return
            onCommit()
          })}
        >
          <FieldGroup className="gap-3">
            <Field
              data-disabled={isCommitting ? true : undefined}
              data-invalid={hasMessageError ? true : undefined}
            >
              <FieldLabel htmlFor={messageId}>{t('scm.commitMessage')}</FieldLabel>
              <Input
                id={messageId}
                {...messageField}
                placeholder={t('scm.commitPlaceholder')}
                disabled={isCommitting}
                aria-describedby={messageDescribedBy}
                aria-invalid={hasMessageError}
                autoFocus
              />
              <FieldDescription id={messageDescriptionId} className="text-xs">
                {t('scm.commitPlaceholder')}
              </FieldDescription>
              {hasMessageError ? (
                <FieldError id={messageErrorId} className="text-xs" errors={[errors.message]} />
              ) : null}
            </Field>
          </FieldGroup>
          {disabledReason && (
            <AppAlert
              id={disabledReasonId}
              role="alert"
              tone="destructive"
              className="px-2 py-1.5 text-xs"
            >
              {disabledReason}
            </AppAlert>
          )}
          {error ? (
            <AppAlert
              id={commitErrorId}
              role="alert"
              tone="destructive"
              className="px-2 py-1.5 text-xs"
            >
              {String(error)}
            </AppAlert>
          ) : null}
          <DialogFooter>
            <AppButton
              type="button"
              variant="ghost"
              disabled={isCommitting}
              onClick={() => onOpenChange(false)}
            >
              {t('scm.cancel')}
            </AppButton>
            <AppButton
              type="submit"
              disabled={!canSubmit}
              aria-describedby={commitButtonDescribedBy || undefined}
              title={disabledReason ?? t('scm.commitAll')}
            >
              {isCommitting ? (
                <Spinner aria-hidden="true" role="presentation" data-icon="inline-start" />
              ) : (
                <GitCommitHorizontal data-icon="inline-start" />
              )}
              {isCommitting ? t('scm.committing') : t('scm.commitAll')}
            </AppButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
