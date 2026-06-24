import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Crepe } from '@milkdown/crepe'
import { editorViewCtx, parserCtx } from '@milkdown/kit/core'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { Slice } from '@milkdown/kit/prose/model'
import { Selection } from '@milkdown/kit/prose/state'
import { getMarkdown } from '@milkdown/kit/utils'
import { eclipse } from '@uiw/codemirror-theme-eclipse'
import type {
  MarkdownEditorProps,
  MarkdownEditorStatus,
} from '@/components/milkdown/markdownEditorTypes'

type UseMarkdownPlaygroundControllerOptions = MarkdownEditorProps & {
  darkMode: boolean
}

type ThrottledMarkdownUpdate = ((markdown: string) => void) & {
  cancel: () => void
}

const createThrottledMarkdownUpdate = (
  callback: (markdown: string) => void,
  delay: number,
): ThrottledMarkdownUpdate => {
  let timer: number | null = null
  let latestMarkdown = ''

  const flush = () => {
    timer = null
    callback(latestMarkdown)
  }

  const throttled = ((markdown: string) => {
    latestMarkdown = markdown
    if (timer !== null) return
    timer = window.setTimeout(flush, delay)
  }) as ThrottledMarkdownUpdate

  throttled.cancel = () => {
    if (timer === null) return
    window.clearTimeout(timer)
    timer = null
  }

  return throttled
}

const relocateFixedDropIndicatorToViewportRoot = (root: HTMLElement) => {
  const indicators = root.querySelectorAll<HTMLElement>('.milkdown-drop-indicator')
  indicators.forEach((indicator) => {
    indicator.dataset.marklabPlaygroundOverlay = 'drop-cursor'
    document.body.appendChild(indicator)
  })
}

const replaceMarkdownLikePlayground = (crepe: Crepe, markdown: string) => {
  if (crepe.getMarkdown() === markdown) return

  crepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const parser = ctx.get(parserCtx)
    const doc = parser(markdown)
    if (!doc) return

    const state = view.state
    const { from } = state.selection
    let tr = state.tr
    tr = tr.replace(0, state.doc.content.size, new Slice(doc.content, 0, 0))

    const docSize = doc.content.size
    const safeFrom = Math.max(0, Math.min(from, Math.max(0, docSize - 2)))
    tr = tr.setSelection(Selection.near(tr.doc.resolve(safeFrom)))
    view.dispatch(tr)
  })
}

export const useMarkdownPlaygroundController = ({
  darkMode,
  onChange,
  value,
}: UseMarkdownPlaygroundControllerOptions) => {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const crepeRef = useRef<Crepe | null>(null)
  const latestValueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const applyingExternalValueRef = useRef(false)
  const [status, setStatus] = useState<MarkdownEditorStatus>({ phase: 'loading' })

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useLayoutEffect(() => {
    latestValueRef.current = value
  }, [value])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    let destroyed = false
    let crepe: Crepe | null = null
    const updateMarkdown = createThrottledMarkdownUpdate((markdown) => {
      if (applyingExternalValueRef.current) {
        latestValueRef.current = markdown
        return
      }
      if (markdown === latestValueRef.current) return
      latestValueRef.current = markdown
      onChangeRef.current(markdown)
    }, 200)

    setStatus({ phase: 'loading' })

    crepe = new Crepe({
      root,
      defaultValue: latestValueRef.current,
      featureConfigs: {
        [Crepe.Feature.CodeMirror]: {
          theme: darkMode ? undefined : eclipse,
        },
        [Crepe.Feature.LinkTooltip]: {
          onCopyLink: () => {},
        },
      },
    })

    crepe.editor
      .config((ctx) => {
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          updateMarkdown(markdown)
        })
      })
      .use(listener)

    crepe
      .create()
      .then(() => {
        if (destroyed) {
          crepe?.destroy()
          return
        }
        relocateFixedDropIndicatorToViewportRoot(root)
        crepeRef.current = crepe
        setStatus({ phase: 'ready' })
      })
      .catch((error: unknown) => {
        if (destroyed) return
        const message = error instanceof Error ? error.message : String(error)
        setStatus({ phase: 'error', message })
        console.error('Failed to initialize Milkdown playground editor', error)
      })

    return () => {
      destroyed = true
      updateMarkdown.cancel()
      if (crepeRef.current === crepe) {
        latestValueRef.current = crepe?.getMarkdown() ?? latestValueRef.current
        crepeRef.current = null
      }
      try {
        crepe?.destroy()
      } catch {
        // Crepe can be half-initialized during React dev teardown.
      }
    }
  }, [darkMode])

  useEffect(() => {
    const crepe = crepeRef.current
    if (!crepe) {
      latestValueRef.current = value
      return
    }
    if (value === latestValueRef.current) return

    applyingExternalValueRef.current = true
    try {
      replaceMarkdownLikePlayground(crepe, value)
      latestValueRef.current = value
    } finally {
      applyingExternalValueRef.current = false
    }
  }, [value])

  const focusEditor = useCallback(() => {
    crepeRef.current?.editor.action((ctx) => {
      ctx.get(editorViewCtx).focus()
    })
  }, [])

  const getCurrentMarkdown = useCallback(() => {
    const crepe = crepeRef.current
    if (!crepe) return latestValueRef.current
    return crepe.editor.action(getMarkdown())
  }, [])

  return {
    focusEditor,
    getMarkdown: getCurrentMarkdown,
    rootRef,
    scrollAreaRef,
    status,
  }
}
