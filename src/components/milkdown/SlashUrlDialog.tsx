import { useId } from 'react'
import { FileText } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
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
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import type { SlashCommandLabels } from '@/components/milkdown/slashMenuConfig'
import type { SlashUrlValues } from '@/components/milkdown/slashUrlInsertion'
import type { useSlashUrlDialog } from '@/components/milkdown/useSlashUrlDialog'
import type { MarkdownLinkCompletionClient } from '@/components/milkdown/markdownLinkCompletionSession'
import { useMarkdownLinkSuggestions } from '@/components/milkdown/useMarkdownLinkSuggestions'
import { cn } from '@/lib/utils'
import { isImeKeyboardEvent } from '@/logic/ime'

type SlashUrlDialogProps = {
  activePath: string | null
  completionClient?: MarkdownLinkCompletionClient
  state: ReturnType<typeof useSlashUrlDialog>
  labels: SlashCommandLabels
  cancelLabel: string
  errorLabel: string
}

export const SlashUrlDialog = ({
  activePath,
  completionClient,
  state,
  labels,
  cancelLabel,
  errorLabel,
}: SlashUrlDialogProps) => {
  const id = useId()
  const { request, failed, cancel, submit } = state
  const {
    control,
    register,
    handleSubmit,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<SlashUrlValues>({
    defaultValues: { url: '', text: request?.initialText ?? '' },
  })
  const url = useWatch({ control, name: 'url' })
  const suggestions = useMarkdownLinkSuggestions({
    activePath,
    client: completionClient,
    enabled: Boolean(request),
    query: url,
  })
  if (!request) return null
  const image = request.kind === 'image-url'
  const title = image ? labels.imageUrl : labels.link
  const urlLabel = image ? labels.imageUrlPrompt : labels.linkUrlPrompt
  const textLabel = image ? labels.imageAltPrompt : labels.linkTextPrompt
  const submitForm = handleSubmit((values) => submit(request, values))

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
        <form className="flex flex-col gap-4" onSubmit={submitForm}>
          <Label htmlFor={`${id}-url`}>{urlLabel}</Label>
          <Controller
            control={control}
            name="url"
            rules={{ validate: (value) => Boolean(value.trim()) || urlLabel }}
            render={({ field }) => (
              <Command
                className={cn(
                  'h-auto rounded-md border border-input bg-transparent shadow-sm',
                  suggestions.length === 0 && '[&_[cmdk-input-wrapper]]:border-b-0',
                )}
                shouldFilter={false}
              >
                <CommandInput
                  id={`${id}-url`}
                  ref={field.ref}
                  name={field.name}
                  value={field.value}
                  onBlur={field.onBlur}
                  onValueChange={field.onChange}
                  onKeyDown={(event) => {
                    if (
                      event.key !== 'Enter' ||
                      isImeKeyboardEvent(event.nativeEvent) ||
                      suggestions.length > 0
                    )
                      return
                    event.preventDefault()
                    event.stopPropagation()
                    void submitForm()
                  }}
                  aria-label={urlLabel}
                  aria-invalid={Boolean(errors.url)}
                  aria-describedby={errors.url ? `${id}-error` : undefined}
                  autoComplete="off"
                  spellCheck={false}
                />
                {suggestions.length > 0 && (
                  <CommandList className="max-h-48 border-t-0 p-1">
                    <CommandGroup>
                      {suggestions.map((suggestion) => (
                        <CommandItem
                          key={`${suggestion.url}:${suggestion.detail ?? suggestion.label}`}
                          value={`${suggestion.label} ${suggestion.detail ?? ''} ${suggestion.url}`}
                          onSelect={() => {
                            setValue('url', suggestion.url, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                            setFocus('text')
                          }}
                        >
                          <FileText aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{suggestion.label}</span>
                            {suggestion.detail && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {suggestion.detail}
                              </span>
                            )}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                )}
              </Command>
            )}
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
