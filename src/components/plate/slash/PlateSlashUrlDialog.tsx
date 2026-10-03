import { useId } from 'react'
import { FileText } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import type { MarkdownLinkCompletionClient } from '@/components/editor/markdownLinkCompletionSession'
import { useMarkdownLinkSuggestions } from '@/components/editor/useMarkdownLinkSuggestions'
import type { PlateSlashCommandLabels, PlateSlashUrlValues } from '@/components/plate/slash/types'
import type { PlateSlashUrlDialogState } from '@/components/plate/slash/usePlateSlashUrlDialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { isImeKeyboardEvent } from '@/logic/ime'
import { languageIntelligenceApi } from '@/services/languageIntelligenceApi'

type PlateSlashUrlDialogProps = {
  activePath: string | null
  completionClient?: MarkdownLinkCompletionClient | null
  labels: PlateSlashCommandLabels
  state: PlateSlashUrlDialogState
}

export const PlateSlashUrlDialog = ({
  activePath,
  completionClient,
  labels,
  state,
}: PlateSlashUrlDialogProps) => {
  const id = useId()
  const { cancel, failed, request, submit } = state
  const client = completionClient === undefined ? languageIntelligenceApi : completionClient
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setFocus,
    setValue,
  } = useForm<PlateSlashUrlValues>({
    defaultValues: { text: request?.initialText ?? '', url: '' },
  })
  const url = useWatch({ control, name: 'url' })
  const suggestions = useMarkdownLinkSuggestions({
    activePath,
    client: client ?? undefined,
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
    <Dialog open onOpenChange={(open) => !open && cancel(request)}>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-md"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          request.restoreFocus()
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          setFocus('url')
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submitForm}>
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(errors.url)}>
              <FieldLabel htmlFor={`${id}-url`}>{urlLabel}</FieldLabel>
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
                      aria-describedby={errors.url ? `${id}-error` : undefined}
                      aria-invalid={Boolean(errors.url)}
                      aria-label={urlLabel}
                      autoComplete="off"
                      id={`${id}-url`}
                      name={field.name}
                      onBlur={field.onBlur}
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
                      onValueChange={field.onChange}
                      ref={field.ref}
                      spellCheck={false}
                      value={field.value}
                    />
                    {suggestions.length > 0 && (
                      <CommandList className="max-h-48 p-1">
                        <CommandGroup>
                          {suggestions.map((suggestion) => (
                            <CommandItem
                              key={`${suggestion.url}:${suggestion.label}`}
                              onSelect={() => {
                                setValue('url', suggestion.url, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                })
                                setFocus('text')
                              }}
                              value={`${suggestion.label} ${suggestion.detail ?? ''} ${suggestion.url}`}
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
              <FieldError id={`${id}-error`}>{errors.url?.message}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-text`}>{textLabel}</FieldLabel>
              <Input autoComplete="off" id={`${id}-text`} {...register('text')} />
            </Field>
            {failed && (
              <Alert variant="destructive">
                <AlertDescription>{labels.insertionError}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => cancel(request)}>
                {labels.cancel}
              </Button>
              <Button disabled={isSubmitting} type="submit">
                {title}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}
