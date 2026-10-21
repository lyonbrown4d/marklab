import { useId, useRef, useState } from 'react'
import { ArrowRight, FileText } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'
import type {
  MarkdownLinkCompletionClient,
  MarkdownLinkSuggestion,
} from '@/components/editor/markdownLinkCompletionSession'
import { useMarkdownLinkSuggestions } from '@/components/editor/useMarkdownLinkSuggestions'
import type { PlateSlashCommandLabels, PlateSlashUrlValues } from '@/components/plate/slash/types'
import type { PlateSlashUrlInputState } from '@/components/plate/slash/usePlateSlashUrlInput'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { isImeKeyboardEvent } from '@/logic/ime'
import { languageIntelligenceApi } from '@/services/languageIntelligenceApi'
import { useI18n } from '@/i18n/useI18n'

type PlateSlashUrlInputProps = {
  activePath: string | null
  completionClient?: MarkdownLinkCompletionClient | null
  labels: PlateSlashCommandLabels
  state: PlateSlashUrlInputState
}

const isUrlInputImeKey = (event: KeyboardEvent) => {
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Match cmdk's legacy IME guard when the final key omits isComposing.
  return isImeKeyboardEvent(event) || event.keyCode === 229
}

// Links and image addresses share the same nonmodal, selection-anchored input.
export const PlateSlashUrlInput = ({
  activePath,
  completionClient,
  labels,
  state,
}: PlateSlashUrlInputProps) => {
  const id = useId()
  const { t } = useI18n()
  const { cancel, failed, request, submit } = state
  const returnFocus = useRef(true)
  const composing = useRef(false)
  const [selected, setSelected] = useState('')
  useNativeSurfaceOcclusion('plate-url-input', Boolean(request))
  const client = completionClient === undefined ? languageIntelligenceApi : completionClient
  const {
    control,
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    register,
    setFocus,
  } = useForm<PlateSlashUrlValues>({
    defaultValues: { text: request?.initialText ?? '', url: '' },
  })
  const url = useWatch({ control, name: 'url' })
  const { suggestions, status } = useMarkdownLinkSuggestions({
    activePath,
    client: client ?? undefined,
    enabled: Boolean(request),
    query: url,
  })
  const selectedUrl = suggestions.some((item) => item.url === selected)
    ? selected
    : (suggestions[0]?.url ?? '')
  if (!request) return null

  const image = request.kind === 'image-url'
  const title = image ? labels.imageUrl : labels.link
  const urlLabel = image ? labels.imageUrlPrompt : labels.linkUrlPrompt
  const textLabel = image ? labels.imageAltPrompt : labels.linkTextPrompt
  const submitForm = handleSubmit((values) => submit(request, values))
  const choose = (suggestion: MarkdownLinkSuggestion) => {
    submit(request, {
      text: getValues('text') || (image ? '' : suggestion.label),
      url: suggestion.url,
    })
  }
  return (
    <Popover
      open
      modal={false}
      onOpenChange={(open) => !open && cancel(request, returnFocus.current)}
    >
      <PopoverAnchor virtualRef={{ current: request.anchor ?? null }} />
      <PopoverContent
        align="start"
        aria-label={title}
        className="w-[min(24rem,calc(100vw-1rem))] p-1 motion-reduce:animate-none"
        collisionPadding={8}
        contentEditable={false}
        onEscapeKeyDown={(event) => {
          if (composing.current || isUrlInputImeKey(event)) event.preventDefault()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
        }}
        onInteractOutside={() => {
          returnFocus.current = false
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          setFocus('url')
        }}
        side="bottom"
        sideOffset={6}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submitForm()
          }}
        >
          <Controller
            control={control}
            name="url"
            rules={{ validate: (value) => Boolean(value.trim()) || urlLabel }}
            render={({ field }) => (
              <Command
                label={urlLabel}
                loop
                shouldFilter={false}
                onValueChange={setSelected}
                value={selectedUrl}
                className="h-auto rounded-none bg-transparent"
              >
                <div className="flex items-center [&_[cmdk-input-wrapper]]:min-w-0 [&_[cmdk-input-wrapper]]:flex-1 [&_[cmdk-input-wrapper]]:border-0">
                  <CommandInput
                    aria-describedby={errors.url ? `${id}-error` : undefined}
                    aria-invalid={Boolean(errors.url)}
                    aria-label={urlLabel}
                    autoComplete="off"
                    name={field.name}
                    onBlur={field.onBlur}
                    onCompositionStart={() => {
                      composing.current = true
                    }}
                    onCompositionEnd={() => {
                      composing.current = false
                    }}
                    onKeyDown={(event) => {
                      if (composing.current || isUrlInputImeKey(event.nativeEvent)) {
                        event.stopPropagation()
                        if (event.key === 'Enter') event.preventDefault()
                        return
                      }
                      if (
                        event.key === 'Tab' &&
                        !event.shiftKey &&
                        !event.altKey &&
                        !event.ctrlKey &&
                        !event.metaKey
                      ) {
                        const suggestion = suggestions.find((item) => item.url === selectedUrl)
                        if (suggestion) {
                          event.preventDefault()
                          choose(suggestion)
                        }
                      }
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        event.stopPropagation()
                        const suggestion = suggestions.find((item) => item.url === selectedUrl)
                        if (suggestion) choose(suggestion)
                        else void submitForm()
                      }
                    }}
                    onValueChange={field.onChange}
                    placeholder={urlLabel}
                    ref={field.ref}
                    spellCheck={false}
                    value={field.value}
                  />
                  <Button
                    aria-label={title}
                    disabled={isSubmitting}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
                    }}
                    size="icon"
                    type="submit"
                    variant="ghost"
                  >
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Button>
                </div>
                {suggestions.length > 0 && (
                  <CommandList className="max-h-48">
                    <CommandGroup>
                      {suggestions.map((suggestion) => (
                        <CommandItem
                          key={`${suggestion.url}:${suggestion.label}`}
                          onMouseDown={(event) => event.preventDefault()}
                          onSelect={() => choose(suggestion)}
                          value={suggestion.url}
                        >
                          <FileText aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{suggestion.label}</span>
                          <span className="max-w-48 truncate text-xs text-muted-foreground">
                            {suggestion.detail ?? suggestion.url}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                )}
              </Command>
            )}
          />
          {(image || !request.initialText) && (
            <Input
              aria-label={textLabel}
              autoComplete="off"
              className="h-8 border-0 bg-transparent text-xs shadow-none"
              placeholder={textLabel}
              {...register('text')}
            />
          )}
          {status === 'error' ? (
            <p className="px-2 py-1 text-xs text-muted-foreground" role="status">
              {t('command.analysis.error')}
            </p>
          ) : (
            <span aria-live="polite" className="sr-only" role="status">
              {status === 'loading'
                ? t('command.analysis.loading')
                : status === 'empty'
                  ? t('search.noResults')
                  : ''}
            </span>
          )}
          {errors.url && (
            <p className="px-2 py-1 text-xs text-destructive" id={`${id}-error`} role="alert">
              {errors.url.message}
            </p>
          )}
          {failed && (
            <p className="px-2 py-1 text-xs text-destructive" role="alert">
              {labels.insertionError}
            </p>
          )}
        </form>
      </PopoverContent>
    </Popover>
  )
}
