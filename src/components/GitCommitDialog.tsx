import { useEffect, useRef } from 'react'
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
      <DialogContent className="max-w-md">
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
          className="flex flex-col gap-3"
          onSubmit={handleSubmit(() => {
            if (!canSubmit) return
            onCommit()
          })}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="git-commit-message" className="text-sm font-medium">
              {t('scm.commitMessage')}
            </label>
            <Input
              id="git-commit-message"
              {...messageField}
              placeholder={t('scm.commitPlaceholder')}
              disabled={isCommitting}
              aria-invalid={Boolean(errors.message)}
              autoFocus
            />
            {touchedFields.message && errors.message ? (
              <AppAlert tone="destructive" className="px-2 py-1.5 text-xs">
                {errors.message.message}
              </AppAlert>
            ) : null}
          </div>
          {disabledReason && (
            <AppAlert tone="destructive" className="px-2 py-1.5 text-xs">
              {disabledReason}
            </AppAlert>
          )}
          {error ? (
            <AppAlert tone="destructive" className="px-2 py-1.5 text-xs">
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
            <AppButton type="submit" disabled={!canSubmit}>
              {isCommitting ? (
                <Spinner data-icon="inline-start" />
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
