import { memo, useEffect, useRef } from 'react'
import { createSafeMermaidSvgNode } from '@/components/plate/code/mermaidSvg'
import { useMermaidPreview } from '@/components/plate/code/useMermaidPreview'
import { useI18n } from '@/i18n/useI18n'

type MermaidPreviewProps = {
  source: string
}

const MermaidPreview = memo(({ source }: MermaidPreviewProps) => {
  const { t } = useI18n()
  const containerRef = useRef<HTMLElement | null>(null)
  const outputRef = useRef<HTMLDivElement | null>(null)
  const state = useMermaidPreview(source, containerRef)

  useEffect(() => {
    const output = outputRef.current
    if (!output) return
    output.replaceChildren()
    if (state.status !== 'ready') return
    const svg = createSafeMermaidSvgNode(state.svg)
    if (svg) output.append(document.importNode(svg, true))
  }, [state])

  return (
    <aside
      ref={containerRef}
      aria-label={t('slash.mermaid')}
      aria-busy={state.status === 'loading'}
      className="mt-3 overflow-auto rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground"
      contentEditable={false}
      data-plate-preview="mermaid"
    >
      {state.status === 'loading' ? <div>{t('preview.mermaidLoading')}</div> : null}
      {state.status === 'error' ? (
        <pre role="alert" className="whitespace-pre-wrap text-destructive">
          {state.error}
        </pre>
      ) : null}
      <div ref={outputRef} className="[&_svg]:mx-auto [&_svg]:max-w-full" />
    </aside>
  )
})

MermaidPreview.displayName = 'MermaidPreview'

export default MermaidPreview
