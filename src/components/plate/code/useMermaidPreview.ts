import { useEffect, useRef, useState } from 'react'

type PreviewState =
  | { status: 'loading'; error: null; svg: null }
  | { status: 'ready'; error: null; svg: string }
  | { status: 'error'; error: string; svg: null }

const initialState: PreviewState = { status: 'loading', error: null, svg: null }
const DEBOUNCE_MS = 250
let renderSequence = 0
let mermaidLoader: Promise<(typeof import('mermaid'))['default']> | null = null

const loadMermaid = () => {
  mermaidLoader ??= import('mermaid').then((module) => module.default)
  return mermaidLoader
}

const resolveTheme = () => {
  const explicit = document.documentElement.dataset.theme?.toLowerCase()
  if (explicit === 'dark') return 'dark' as const
  if (explicit === 'light') return 'default' as const
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default'
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const useMermaidPreview = (
  source: string,
  targetRef: React.RefObject<HTMLElement | null>,
) => {
  const [visible, setVisible] = useState(() => typeof IntersectionObserver !== 'function')
  const [theme, setTheme] = useState(resolveTheme)
  const [state, setState] = useState<PreviewState>(initialState)
  const requestRef = useRef(0)

  useEffect(() => {
    const target = targetRef.current
    if (!target || visible) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setVisible(true)
        observer.disconnect()
      },
      { rootMargin: '360px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [targetRef, visible])

  useEffect(() => {
    const updateTheme = () => setTheme(resolveTheme())
    const observer = new MutationObserver(updateTheme)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    media.addEventListener('change', updateTheme)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', updateTheme)
    }
  }, [])

  useEffect(() => {
    if (!visible || !source.trim()) return
    const request = ++requestRef.current
    const timer = window.setTimeout(() => {
      setState(initialState)
      void loadMermaid()
        .then((mermaid) => {
          if (request !== requestRef.current) return null
          mermaid.initialize({
            htmlLabels: false,
            securityLevel: 'strict',
            startOnLoad: false,
            theme,
          })
          return mermaid.render(`marklab-plate-mermaid-${++renderSequence}`, source)
        })
        .then((result) => {
          if (result && request === requestRef.current) {
            setState({ status: 'ready', error: null, svg: result.svg })
          }
        })
        .catch((error: unknown) => {
          if (request === requestRef.current) {
            setState({ status: 'error', error: errorMessage(error), svg: null })
          }
        })
    }, DEBOUNCE_MS)
    return () => {
      requestRef.current += 1
      window.clearTimeout(timer)
    }
  }, [source, theme, visible])

  return state
}
