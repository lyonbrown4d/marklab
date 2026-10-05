import { useEffect, useState } from 'react'
import {
  highlightSourceLines,
  type SourceHighlightLine,
} from '@/components/previews/sourceHighlight'

type SourceCodeLinesProps = {
  label: string
  languageId: string
  lines: readonly string[]
}

type HighlightState = {
  languageId: string
  source: readonly string[]
  value: readonly SourceHighlightLine[]
}

const plainLine = (text: string): SourceHighlightLine => [{ classNames: [], text }]

const SourceLine = ({ fragments }: { fragments: SourceHighlightLine }) => (
  <code className="select-text whitespace-pre">
    {fragments.length > 0
      ? fragments.map((fragment, index) => (
          <span className={fragment.classNames.join(' ') || undefined} key={index}>
            {fragment.text}
          </span>
        ))
      : '\u00a0'}
  </code>
)

export const SourceCodeLines = ({ label, languageId, lines }: SourceCodeLinesProps) => {
  const [highlightState, setHighlightState] = useState<HighlightState | null>(null)
  const highlighted =
    highlightState?.source === lines && highlightState.languageId === languageId
      ? highlightState.value
      : null

  useEffect(() => {
    let cancelled = false
    const renderHighlight = () => {
      if (cancelled) return
      setHighlightState({
        languageId,
        source: lines,
        value: highlightSourceLines(lines, languageId),
      })
    }
    const timer = window.setTimeout(renderHighlight, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [languageId, lines])

  return (
    <ol
      aria-label={label}
      className="source-preview-code list-decimal space-y-0 pl-12 font-mono text-xs leading-5 marker:select-none marker:text-muted-foreground"
    >
      {lines.map((line, index) => (
        <li className="min-w-max pl-3" key={index}>
          <SourceLine fragments={highlighted?.[index] ?? plainLine(line)} />
        </li>
      ))}
    </ol>
  )
}
