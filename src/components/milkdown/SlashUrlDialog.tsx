import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SlashCommandLabels } from '@/components/milkdown/slashMenuConfig'
import type { SlashUrlValues } from '@/components/milkdown/slashUrlInsertion'
import type { useSlashUrlDialog } from '@/components/milkdown/useSlashUrlDialog'

type SlashUrlDialogProps = {
  state: ReturnType<typeof useSlashUrlDialog>
  labels: SlashCommandLabels
  cancelLabel: string
  errorLabel: string
}

export const SlashUrlDialog = ({ state, labels, cancelLabel, errorLabel }: SlashUrlDialogProps) => {
  const id = useId()
  const { request, failed, cancel, submit } = state
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<SlashUrlValues>({
    defaultValues: { url: '', text: request?.initialText ?? '' },
  })
  if (!request) return null
  const image = request.kind === 'image-url'
  const title = image ? labels.imageUrl : labels.link
  const urlLabel = image ? labels.imageUrlPrompt : labels.linkUrlPrompt
  const textLabel = image ? labels.imageAltPrompt : labels.linkTextPrompt

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) cancel(request)
      }}
    >
      <DialogContent
        className="max-w-md"
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          setFocus('url')
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          request.restoreFocus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit((values) => submit(request, values))}
        >
          <Label htmlFor={`${id}-url`}>{urlLabel}</Label>
          <Input
            id={`${id}-url`}
            {...register('url', { validate: (value) => Boolean(value.trim()) || urlLabel })}
            aria-invalid={Boolean(errors.url)}
            aria-describedby={errors.url ? `${id}-error` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          {errors.url && (
            <p id={`${id}-error`} role="alert">
              {errors.url.message}
            </p>
          )}
          <Label htmlFor={`${id}-text`}>{textLabel}</Label>
          <Input id={`${id}-text`} {...register('text')} autoComplete="off" />
          {failed && (
            <Alert variant="destructive">
              <AlertDescription>{errorLabel}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => cancel(request)}>
              {cancelLabel}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {title}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
