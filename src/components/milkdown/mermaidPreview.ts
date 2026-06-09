import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language'
import type { CodeBlockConfig } from '@milkdown/kit/component/code-block'
import escape from 'lodash-es/escape'

const MERMAID_ALIASES = new Set(['mermaid', 'mmd'])
let mermaidRenderSequence = 0
let mermaidLoader: Promise<(typeof import('mermaid'))['default']> | null = null

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
  if (theme.includes('dark')) return 'dark'
  if (theme.includes('light')) return 'default'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default'
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  return String(error)
}

export const configureMermaidPreview = (prev: CodeBlockConfig): CodeBlockConfig => ({
  ...prev,
  languages: ensureMermaidLanguage(prev.languages),
  renderPreview: (language, content, applyPreview) => {
    if (!isMermaidLanguage(language)) {
      return prev.renderPreview(language, content, applyPreview)
    }

    const source = content.trim()
    if (!source) return null

    const currentRender = ++mermaidRenderSequence
    void loadMermaid()
      .then((mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: resolveMermaidTheme(),
        })
        return mermaid.render(`marklab-mermaid-${currentRender}`, source)
      })
      .then((result) => {
        if (currentRender !== mermaidRenderSequence) return
        const preview = document.createElement('div')
        preview.className = 'milkdown-mermaid-preview'
        preview.innerHTML = result.svg
        applyPreview(preview)
      })
      .catch((error) => {
        if (currentRender !== mermaidRenderSequence) return
        const message = escape(getErrorMessage(error))
        applyPreview(`<pre class="milkdown-mermaid-error">${message}</pre>`)
      })
  },
})
