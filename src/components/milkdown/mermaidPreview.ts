import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language'
import { languages as codemirrorLanguages } from '@codemirror/language-data'
import type { CodeBlockConfig } from '@milkdown/kit/component/code-block'
import escape from 'lodash-es/escape'
import i18n from '@/i18n/setup'
import { isDarkThemeMode, isThemeMode } from '@/logic/themes'

const MERMAID_ALIASES = new Set(['mermaid', 'mmd'])
let mermaidRenderSequence = 0
let mermaidLoader: Promise<(typeof import('mermaid'))['default']> | null = null
const MERMAID_PREVIEW_ROOT_MARGIN = '360px'
const mountedPreviewRefreshers = new WeakMap<Element, () => void>()

export const refreshMermaidPreviews = (root: HTMLElement) => {
  root.querySelectorAll('.milkdown-mermaid-preview').forEach((preview) => {
    mountedPreviewRefreshers.get(preview)?.()
  })
}

const mermaidSupport = new LanguageSupport(
  StreamLanguage.define({
    token: (stream) => {
      stream.skipToEnd()
      return null
    },
  }),
)

const mermaidLanguage = LanguageDescription.of({
  name: 'Mermaid',
  alias: ['mermaid', 'mmd'],
  extensions: ['mmd', 'mermaid'],
  support: mermaidSupport,
})

const hasMermaidLanguage = (language: LanguageDescription) => {
  if (language.name.toLowerCase() === 'mermaid') return true
  return language.alias.some((alias) => MERMAID_ALIASES.has(alias.toLowerCase()))
}

const ensureMermaidLanguage = (languages: LanguageDescription[]) => {
  if (languages.some(hasMermaidLanguage)) return languages
  return [...languages, mermaidLanguage]
}

const isMermaidLanguage = (language: string) => {
  return MERMAID_ALIASES.has(language.trim().toLowerCase())
}

const loadMermaid = () => {
  mermaidLoader ??= import('mermaid').then((module) => module.default)
  return mermaidLoader
}

const resolveMermaidTheme = () => {
  const theme = document.documentElement.dataset.theme?.toLowerCase() ?? ''
  if (isThemeMode(theme)) return isDarkThemeMode(theme) ? 'dark' : 'default'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default'
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  return String(error)
}

const createMermaidPlaceholder = () => {
  const placeholder = document.createElement('div')
  placeholder.className = 'milkdown-mermaid-preview'
  placeholder.textContent = i18n.t('preview.mermaidLoading')
  return placeholder
}

const observeMermaidPreview = (target: HTMLElement, render: () => void) => {
  if (!('IntersectionObserver' in window)) {
    render()
    return
  }

  let rendered = false
  const runOnce = () => {
    if (rendered) return
    rendered = true
    observer.disconnect()
    render()
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (!target.isConnected) {
        observer.disconnect()
        return
      }
      if (entries.some((entry) => entry.isIntersecting)) {
        runOnce()
      }
    },
    { rootMargin: MERMAID_PREVIEW_ROOT_MARGIN },
  )

  observer.observe(target)
}

type RenderPreview = CodeBlockConfig['renderPreview']

const renderMountedMermaidPreview = (
  id: string,
  source: string,
  applyPreview: Parameters<RenderPreview>[2],
) => {
  let generation = 0
  const render = () => {
    const target = document.getElementById(id)
    if (!target) return
    mountedPreviewRefreshers.set(target, render)
    const request = ++generation
    const theme = resolveMermaidTheme()
    const isCurrent = () => request === generation && target.isConnected
    void loadMermaid()
      .then((mermaid) => {
        if (!isCurrent()) return null
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme })
        return mermaid.render(`marklab-mermaid-${++mermaidRenderSequence}`, source)
      })
      .then((result) => {
        if (!result || !isCurrent()) return
        if (theme !== resolveMermaidTheme()) {
          render()
          return
        }
        const preview = document.createElement('div')
        preview.id = id
        preview.className = 'milkdown-mermaid-preview'
        preview.innerHTML = result.svg
        applyPreview(preview)
        // Milkdown replaces the element with a sanitized copy after every update.
        window.requestAnimationFrame(() => {
          const mounted = document.getElementById(id)
          if (!mounted || request !== generation) return
          mountedPreviewRefreshers.set(mounted, render)
          if (theme !== resolveMermaidTheme()) render()
        })
      })
      .catch((error) => {
        if (!isCurrent()) return
        const message = escape(getErrorMessage(error))
        applyPreview(`<pre class="milkdown-mermaid-error">${message}</pre>`)
      })
  }
  render()
}

const renderMermaidPreview = (
  fallback: RenderPreview,
  language: string,
  content: string,
  applyPreview: Parameters<RenderPreview>[2],
) => {
  if (!isMermaidLanguage(language)) {
    return fallback(language, content, applyPreview)
  }

  const source = content.trim()
  if (!source) return null

  const placeholder = createMermaidPlaceholder()
  const currentRender = ++mermaidRenderSequence
  placeholder.id = `marklab-mermaid-preview-${currentRender}`
  applyPreview(placeholder)

  // Milkdown sanitizes previews into HTML, so the supplied element is not mounted.
  // Wait for its DOM update and observe the actual copy instead.
  window.requestAnimationFrame(() => {
    const target = document.getElementById(placeholder.id)
    if (!target) return
    observeMermaidPreview(target, () => {
      renderMountedMermaidPreview(placeholder.id, source, applyPreview)
    })
  })
}

export const configureMermaidPreview = (prev: CodeBlockConfig): CodeBlockConfig => ({
  ...prev,
  languages: ensureMermaidLanguage(prev.languages),
  renderPreview: (language, content, applyPreview) =>
    renderMermaidPreview(prev.renderPreview, language, content, applyPreview),
})

export const mermaidCodeBlockConfig = {
  languages: ensureMermaidLanguage(codemirrorLanguages),
  renderPreview: (language, content, applyPreview) =>
    renderMermaidPreview(() => null, language, content, applyPreview),
} satisfies Partial<CodeBlockConfig>
