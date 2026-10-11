import { FindReplacePlugin } from '@platejs/find-replace'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useValueVersion, type PlateEditor } from 'platejs/react'
import {
  defaultPlateDocumentFindOptions,
  getPlateDocumentFindBlockId,
  getPlateDocumentFindInitialQuery,
  replaceAllPlateDocumentFindMatches,
  replacePlateDocumentFindMatch,
  selectPlateDocumentFindMatch,
  type PlateDocumentFindOptions,
} from '@/components/plate/plateDocumentFindModel'
import { usePlateDocumentFindMatches } from '@/components/plate/usePlateDocumentFindMatches'
import {
  revealPlateVirtualChunk,
  type PlateVirtualChunkRevealToken,
} from '@/components/plate/PlateVirtualChunk'
import { isPlateDocumentFindShortcut } from '@/components/plate/plateDocumentFindShortcut'

type UsePlateDocumentFindOptions = {
  editableRef: RefObject<HTMLElement | null>
  editor: PlateEditor
  readOnly: boolean
  virtualized: boolean
}

export const usePlateDocumentFind = ({
  editableRef,
  editor,
  readOnly,
  virtualized,
}: UsePlateDocumentFindOptions) => {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const revealTokenRef = useRef<PlateVirtualChunkRevealToken | null>(null)
  const selectedQueryRef = useRef<string | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [effectiveReadOnly, setEffectiveReadOnly] = useState(readOnly)
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [options, setOptions] = useState<PlateDocumentFindOptions>(defaultPlateDocumentFindOptions)
  const valueVersion = useValueVersion()
  const { computing, error, matches } = usePlateDocumentFindMatches(
    editor,
    query,
    options,
    valueVersion,
    open,
  )
  const visibleIndex =
    matches.length === 0 ? -1 : Math.min(Math.max(currentIndex, 0), matches.length - 1)

  const cancelPendingScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current)
    scrollFrameRef.current = null
    revealTokenRef.current?.release()
    revealTokenRef.current = null
  }, [])
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
      selectedQueryRef.current = null
      setQuery(nextQuery)
      setCurrentIndex(nextQuery ? 0 : -1)
    },
    [cancelPendingScroll],
  )
  const updateOption = useCallback(
    (key: keyof PlateDocumentFindOptions) => {
      cancelPendingScroll()
      selectedQueryRef.current = null
      setCurrentIndex(query ? 0 : -1)
      setOptions((current) => ({ ...current, [key]: !current[key] }))
    },
    [cancelPendingScroll, query],
  )
  const closeFind = useCallback(() => {
    cancelPendingScroll()
    selectedQueryRef.current = null
    setOpen(false)
    setQuery('')
    setReplacement('')
    setCurrentIndex(-1)
    editableRef.current?.focus()
  }, [cancelPendingScroll, editableRef])
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
  const replaceCurrent = useCallback(() => {
    if (readOnly || editableRef.current?.dataset.readonly === 'true' || error || computing) return
    replacePlateDocumentFindMatch(editor, matches[visibleIndex], replacement)
  }, [computing, editableRef, editor, error, matches, readOnly, replacement, visibleIndex])
  const replaceAll = useCallback(() => {
    if (readOnly || editableRef.current?.dataset.readonly === 'true' || error || computing) return
    replaceAllPlateDocumentFindMatches(editor, matches, replacement)
  }, [computing, editableRef, editor, error, matches, readOnly, replacement])

  useEffect(() => {
    const editable = editableRef.current
    if (!editable) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isPlateDocumentFindShortcut(event)) return
      event.preventDefault()
      event.stopPropagation()
      setEffectiveReadOnly(readOnly || editable.dataset.readonly === 'true')
      selectedQueryRef.current = null
      setOpen(true)
      updateQuery(getPlateDocumentFindInitialQuery(editor))
    }
    editable.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => editable.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [editableRef, editor, readOnly, updateQuery])
  useEffect(() => {
    const useNativeHighlight = !options.matchCase && !options.useRegex && !options.wholeWord
    editor.setOption(FindReplacePlugin, 'search', open && useNativeHighlight ? query : '')
    editor.api.redecorate()
  }, [editor, open, options, query])
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])
  useEffect(() => {
    if (!open) return
    setEffectiveReadOnly(readOnly || editableRef.current?.dataset.readonly === 'true')
  }, [editableRef, open, readOnly])
  useEffect(() => {
    if (
      !open ||
      error ||
      computing ||
      selectedQueryRef.current === `${query}:${JSON.stringify(options)}`
    )
      return
    selectedQueryRef.current = `${query}:${JSON.stringify(options)}`
    const range = matches[visibleIndex]
    if (!range) return
    selectPlateDocumentFindMatch(editor, range)
    scrollToMatch(range)
  }, [computing, editor, error, matches, open, options, query, scrollToMatch, visibleIndex])
  useEffect(
    () => () => {
      cancelPendingScroll()
      editor.setOption(FindReplacePlugin, 'search', '')
      editor.api.redecorate()
    },
    [cancelPendingScroll, editor],
  )

  return {
    closeFind,
    computing,
    currentIndex: visibleIndex,
    error,
    inputRef,
    matches,
    moveMatch,
    open,
    options,
    query,
    readOnly: readOnly || effectiveReadOnly,
    replaceAll,
    replaceCurrent,
    replaceOpen,
    replacement,
    setReplaceOpen,
    setReplacement,
    updateOption,
    updateQuery,
  }
}
