import {
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Regex,
  WholeWord,
  X,
} from 'lucide-react'
import { type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { useReadOnly, type PlateEditor } from 'platejs/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/i18n/useI18n'
import { usePlateDocumentFind } from '@/components/plate/usePlateDocumentFind'
import { isPlateDocumentFindShortcut } from '@/components/plate/plateDocumentFindShortcut'

export { isPlateDocumentFindShortcut } from '@/components/plate/plateDocumentFindShortcut'

type PlateDocumentFindProps = {
  editableRef: RefObject<HTMLElement | null>
  editor: PlateEditor
  virtualized: boolean
}

export const PlateDocumentFind = ({ editableRef, editor, virtualized }: PlateDocumentFindProps) => {
  const { t } = useI18n()
  const contextReadOnly = useReadOnly()
  const {
    closeFind,
    computing,
    currentIndex,
    error,
    inputRef,
    matches,
    moveMatch,
    open,
    options,
    query,
    readOnly,
    replaceAll,
    replaceCurrent,
    replaceOpen,
    replacement,
    setReplaceOpen,
    setReplacement,
    updateOption,
    updateQuery,
  } = usePlateDocumentFind({ editableRef, editor, readOnly: contextReadOnly, virtualized })

  if (!open) return null
  const countLabel = `${currentIndex < 0 ? 0 : currentIndex + 1} / ${matches.length}`
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => updateQuery(event.target.value)
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.key === 'Process') return
    if (isPlateDocumentFindShortcut(event.nativeEvent)) {
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.select()
      return
    }
    if (event.key !== 'Enter') return
    event.preventDefault()
    event.stopPropagation()
    moveMatch(event.shiftKey ? -1 : 1)
  }
  const handleFindKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing || event.key === 'Process') return
    if (isPlateDocumentFindShortcut(event.nativeEvent)) {
      event.preventDefault()
      event.stopPropagation()
      inputRef.current?.focus()
      inputRef.current?.select()
      return
    }
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    closeFind()
  }
  const canReplace = !readOnly && !error && !computing && matches.length > 0
  const optionButtons = [
    ['matchCase', CaseSensitive, t('editor.findMatchCase')],
    ['wholeWord', WholeWord, t('editor.findWholeWord')],
    ['useRegex', Regex, t('editor.findUseRegex')],
  ] as const

  return (
    <div
      aria-label={t('editor.find')}
      className="absolute right-2 top-2 z-30 w-[min(32rem,calc(100%-1rem))] rounded-md border border-border bg-popover/95 p-1 shadow-md backdrop-blur"
      onKeyDown={handleFindKeyDown}
      role="search"
    >
      <div className="flex items-center gap-1">
        <Button
          aria-expanded={replaceOpen}
          aria-label={t('editor.findToggleReplace')}
          onClick={() => setReplaceOpen(!replaceOpen)}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <ChevronRight
            aria-hidden="true"
            className={replaceOpen ? 'rotate-90 transition-transform' : 'transition-transform'}
          />
        </Button>
        <Input
          aria-invalid={Boolean(error)}
          aria-label={t('editor.find')}
          className="h-7 min-w-28 flex-1 px-2 text-xs"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={t('editor.findPlaceholder')}
          ref={inputRef}
          type="search"
          value={query}
        />
        <span className="flex min-w-12 justify-center text-muted-foreground">
          {computing ? (
            <Spinner aria-label={t('editor.findComputing')} className="size-3.5" />
          ) : (
            <span aria-live="polite" className="text-xs tabular-nums">
              {countLabel}
            </span>
          )}
        </span>
        {optionButtons.map(([key, Icon, label]) => (
          <Button
            aria-label={label}
            aria-pressed={options[key]}
            key={key}
            onClick={() => updateOption(key)}
            size="icon-xs"
            type="button"
            variant={options[key] ? 'secondary' : 'ghost'}
          >
            <Icon aria-hidden="true" />
          </Button>
        ))}
        <Button
          aria-label={t('editor.findPrevious')}
          disabled={matches.length === 0}
          onClick={() => moveMatch(-1)}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <ChevronUp aria-hidden="true" />
        </Button>
        <Button
          aria-label={t('editor.findNext')}
          disabled={matches.length === 0}
          onClick={() => moveMatch(1)}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <ChevronDown aria-hidden="true" />
        </Button>
        <Button
          aria-label={t('editor.findClose')}
          onClick={closeFind}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      {error && (
        <p className="px-8 pt-1 text-xs text-destructive" role="alert">
          {t(error === 'invalidRegex' ? 'editor.findInvalidRegex' : 'editor.findScanFailed')}
        </p>
      )}
      {replaceOpen && (
        <div className="mt-1 flex items-center gap-1 pl-7">
          <Input
            aria-label={t('editor.replace')}
            className="h-7 min-w-28 flex-1 px-2 text-xs"
            disabled={readOnly}
            onChange={(event) => setReplacement(event.target.value)}
            placeholder={t('editor.replacePlaceholder')}
            value={replacement}
          />
          <Button
            disabled={!canReplace}
            onClick={replaceCurrent}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t('editor.replace')}
          </Button>
          <Button
            disabled={!canReplace}
            onClick={replaceAll}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t('editor.replaceAll')}
          </Button>
        </div>
      )}
    </div>
  )
}
