import { PathApi, PointApi, TextApi, type NodeEntry } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isImeKeyboardEvent } from '@/logic/ime'
import { isDesktopRuntime } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'
import { languageIntelligenceApi } from '@/services/languageIntelligenceApi'
import { markdownLanguageApi } from '@/services/markdownLanguageApi'
import {
  applyPlateWorkspaceLinkItem,
  getPlateWorkspaceLinkTrigger,
  isSamePlateWorkspaceLinkTrigger,
  type PlateWorkspaceLinkItem,
  type PlateWorkspaceLinkTrigger,
} from '@/components/plate/workspaceLink/plateWorkspaceLinkCompletion'
import {
  createPlateWorkspaceLinkCompletionSession,
  createPlateWorkspaceLinkSessionUri,
} from '@/components/plate/workspaceLink/plateWorkspaceLinkCompletionSession'

const COMPLETION_DELAY_MS = 250
const MAX_ITEMS = 8

type WorkspaceLinkState = {
  index: number
  items: PlateWorkspaceLinkItem[]
  trigger: PlateWorkspaceLinkTrigger
}

type UsePlateWorkspaceLinkCompletionOptions = {
  activePath: string | null
  editor: PlateEditor
  enabled: boolean
  getMarkdown: () => Promise<string>
  readOnly: boolean
}

export const usePlateWorkspaceLinkCompletion = ({
  activePath,
  editor,
  enabled,
  getMarkdown,
  readOnly,
}: UsePlateWorkspaceLinkCompletionOptions) => {
  const available = enabled && !readOnly && isDesktopRuntime() && Boolean(activePath)
  const composingRef = useRef(false)
  const generationRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerRef = useRef<PlateWorkspaceLinkTrigger | null>(null)
  const [state, setState] = useState<WorkspaceLinkState | null>(null)
  const session = useMemo(
    () =>
      available && activePath
        ? createPlateWorkspaceLinkCompletionSession({
            codeActions: markdownLanguageApi,
            completion: languageIntelligenceApi,
            path: activePath,
            uri: createPlateWorkspaceLinkSessionUri(),
          })
        : null,
    [activePath, available],
  )

  const cancel = useCallback(() => {
    generationRef.current += 1
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    triggerRef.current = null
    setState(null)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      void session?.close().catch(() => undefined)
    }
  }, [session])

  const sync = useCallback(() => {
    const trigger = available && !composingRef.current ? getPlateWorkspaceLinkTrigger(editor) : null
    triggerRef.current = trigger
    const generation = ++generationRef.current
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    if (!trigger || !session) {
      setState(null)
      return
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void getMarkdown()
        .then((content) => session.complete(content, trigger.query))
        .then((items) => {
          if (
            generation !== generationRef.current ||
            !isSamePlateWorkspaceLinkTrigger(trigger, getPlateWorkspaceLinkTrigger(editor))
          ) {
            return
          }
          setState(items.length ? { index: 0, items: items.slice(0, MAX_ITEMS), trigger } : null)
        })
        .catch((error: unknown) => {
          if (generation !== generationRef.current) return
          setState(null)
          console.warn('Rich editor workspace-link completion failed', error)
        })
    }, COMPLETION_DELAY_MS)
  }, [available, editor, getMarkdown, session])

  useEffect(() => {
    return cancel
  }, [available, cancel])

  useEffect(() => editor.api.redecorate(), [editor, state])

  const isCurrent = useCallback(
    (candidate: WorkspaceLinkState | null = state) =>
      Boolean(
        candidate &&
        editor.selection &&
        PointApi.equals(candidate.trigger.focus, editor.selection.anchor) &&
        PointApi.equals(candidate.trigger.focus, editor.selection.focus) &&
        isSamePlateWorkspaceLinkTrigger(candidate.trigger, getPlateWorkspaceLinkTrigger(editor)),
      ),
    [editor, state],
  )

  const accept = useCallback(
    (index = state?.index ?? 0) => {
      const current = state
      const item = current?.items[index]
      if (!current || !item || !isCurrent(current)) return false
      const apply = () => {
        if (!isCurrent(current)) return
        applyPlateWorkspaceLinkItem(editor, current.trigger, item)
        cancel()
      }
      if (item.action?.kind === 'create-file') {
        cancel()
        void fsApi
          .createFile(item.action.path, item.action.content)
          .then(apply)
          .catch((error: unknown) => console.warn('Failed to create workspace-link target', error))
      } else {
        apply()
      }
      return true
    },
    [cancel, editor, isCurrent, state],
  )

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (isImeKeyboardEvent(event)) return false
      if (event.key === 'Escape' && (state || getPlateWorkspaceLinkTrigger(editor))) {
        event.preventDefault()
        cancel()
        return true
      }
      if (!state || !isCurrent()) return false
      if (
        (event.key === 'Enter' || event.key === 'Tab') &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        event.preventDefault()
        return accept()
      }
      if (
        (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        event.preventDefault()
        const offset = event.key === 'ArrowUp' ? -1 : 1
        setState({
          ...state,
          index: (state.index + offset + state.items.length) % state.items.length,
        })
        return true
      }
      return false
    },
    [accept, cancel, editor, isCurrent, state],
  )

  const decorate = useCallback(
    ({ entry: [node, path] }: { entry: NodeEntry }) => {
      if (
        !available ||
        !state ||
        !isCurrent() ||
        !TextApi.isText(node) ||
        !PathApi.equals(path, state.trigger.focus.path)
      ) {
        return []
      }
      const range = { anchor: state.trigger.focus, focus: state.trigger.focus }
      return [
        {
          ...range,
          plateWorkspaceLinkAccept: accept,
          plateWorkspaceLinkIndex: state.index,
          plateWorkspaceLinkItems: state.items,
        },
      ]
    },
    [accept, available, isCurrent, state],
  )

  return {
    decorate,
    onBlur: cancel,
    onCompositionEnd: () => {
      composingRef.current = false
      sync()
    },
    onCompositionStart: () => {
      composingRef.current = true
      cancel()
    },
    onEditorChange: sync,
    onKeyDown,
    onSelectionChange: () => {
      if (
        !isSamePlateWorkspaceLinkTrigger(triggerRef.current, getPlateWorkspaceLinkTrigger(editor))
      ) {
        cancel()
      }
    },
  }
}

export type PlateWorkspaceLinkCompletionBindings = ReturnType<
  typeof usePlateWorkspaceLinkCompletion
>
