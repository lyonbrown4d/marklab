import { FindReplacePlugin } from '@platejs/find-replace'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react'
import { useValueVersion, type PlateEditor } from 'platejs/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  collectPlateDocumentFindMatches,
  getPlateDocumentFindBlockId,
  getPlateDocumentFindInitialQuery,
  selectPlateDocumentFindMatch,
} from '@/components/plate/plateDocumentFindModel'
import {
  revealPlateVirtualChunk,
  type PlateVirtualChunkRevealToken,
} from '@/components/plate/PlateVirtualChunk'
import { useI18n } from '@/i18n/useI18n'

type PlateDocumentFindProps = {
  editableRef: RefObject<HTMLDivElement | null>
  editor: PlateEditor
  virtualized: boolean
}

export const isPlateDocumentFindShortcut = (
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
) =>
  (event.ctrlKey || event.metaKey) &&
  !event.altKey &&
  !event.shiftKey &&
  event.key.toLowerCase() === 'f'

export const PlateDocumentFind = ({ editableRef, editor, virtualized }: PlateDocumentFindProps) => {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const revealTokenRef = useRef<PlateVirtualChunkRevealToken | null>(null)
  const selectedQueryRef = useRef<string | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [currentIndex, setCurrentIndex] = useState(-1)
  const valueVersion = useValueVersion()
  const matches = useMemo(() => {
    void valueVersion
    return query ? collectPlateDocumentFindMatches(editor, query) : []
  }, [editor, query, valueVersion])
  const visibleIndex =
    matches.length === 0 ? -1 : Math.min(Math.max(currentIndex, 0), matches.length - 1)

  const cancelPendingScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current)
      scrollFrameRef.current = null
    }
    revealTokenRef.current?.release()
    revealTokenRef.current = null
  }, [])
  const resetFind = useCallback(() => {
    cancelPendingScroll()
    selectedQueryRef.current = null
    setOpen(false)
    setQuery('')
    setCurrentIndex(-1)
  }, [cancelPendingScroll])
  const scrollToMatch = useCallback(
    (range: (typeof matches)[number]) => {
      cancelPendingScroll()
      if (!virtualized) {
        editor.api.scrollIntoView(range.anchor)
        return
      }
      const editable = editableRef.current
      const blockId = getPlateDocumentFindBlockId(editor, range)
      if (!editable || !blockId) return
      const revealToken = revealPlateVirtualChunk(editable, blockId)
      if (!revealToken) return
      revealTokenRef.current = revealToken
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null
        editor.api.scrollIntoView(range.anchor)
      })
    },
    [cancelPendingScroll, editableRef, editor, virtualized],
  )
  const updateQuery = useCallback(
    (nextQuery: string) => {
      cancelPendingScroll()
      setQuery(nextQuery)
      setCurrentIndex(nextQuery ? 0 : -1)
    },
    [cancelPendingScroll],
  )
  const openFind = useCallback(() => {
    selectedQueryRef.current = null
    setOpen(true)
    updateQuery(getPlateDocumentFindInitialQuery(editor))
  }, [editor, updateQuery])
  const closeFind = useCallback(() => {
    resetFind()
    editableRef.current?.focus()
  }, [editableRef, resetFind])
  const navigateToMatch = useCallback(
    (index: number) => {
      const range = matches[index]
      if (!range) return
      setCurrentIndex(index)
      selectPlateDocumentFindMatch(editor, range)
      scrollToMatch(range)
    },
    [editor, matches, scrollToMatch],
  )
  const moveMatch = useCallback(
    (direction: 1 | -1) => {
      if (matches.length === 0) return
      const baseIndex = visibleIndex < 0 ? (direction > 0 ? -1 : 0) : visibleIndex
      navigateToMatch((baseIndex + direction + matches.length) % matches.length)
    },
    [matches.length, navigateToMatch, visibleIndex],
  )

  useEffect(() => {
    const editable = editableRef.current
    if (!editable) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isPlateDocumentFindShortcut(event)) return
      event.preventDefault()
      event.stopPropagation()
      openFind()
    }
    editable.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => editable.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [editableRef, openFind])
  useEffect(() => {
    editor.setOption(FindReplacePlugin, 'search', open ? query : '')
    editor.api.redecorate()
  }, [editor, open, query])
  useEffect(
    () => () => {
      cancelPendingScroll()
      editor.setOption(FindReplacePlugin, 'search', '')
      editor.api.redecorate()
    },
    [cancelPendingScroll, editor],
  )
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])
  useEffect(() => {
    return () => cancelPendingScroll()
  }, [cancelPendingScroll, matches])
  useEffect(() => {
    if (!open || selectedQueryRef.current === query) return
    selectedQueryRef.current = query
    if (visibleIndex < 0) return
    const range = matches[visibleIndex]
    if (!range) return
    selectPlateDocumentFindMatch(editor, range)
    scrollToMatch(range)
  }, [editor, matches, open, query, scrollToMatch, visibleIndex])

  if (!open) return null
  const countLabel = `${visibleIndex < 0 ? 0 : visibleIndex + 1} / ${matches.length}`
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => updateQuery(event.target.value)
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
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

  return (
    <div
      aria-label={t('editor.find')}
      className="absolute right-2 top-2 z-30 flex items-center gap-1 rounded-md border border-border bg-popover/95 p-1 shadow-md backdrop-blur"
      onKeyDown={handleFindKeyDown}
      role="search"
    >
      <Input
        aria-label={t('editor.find')}
        className="h-7 w-44 px-2 text-xs"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={t('editor.findPlaceholder')}
        ref={inputRef}
        type="search"
        value={query}
      />
      <span
        aria-live="polite"
        className="min-w-12 text-center text-xs tabular-nums text-muted-foreground"
      >
        {countLabel}
      </span>
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
  )
}
