import { memo, useEffect, useRef } from 'react'
import type { WorkspaceGraphPreview } from '@/services/fsApiSchemas'

type WorkspaceMapStaticMarkdownPreviewProps = {
  markdown: string
  preview?: WorkspaceGraphPreview
}

export const WorkspaceMapStaticMarkdownPreview = memo(
  ({ markdown, preview }: WorkspaceMapStaticMarkdownPreviewProps) => {
    const containerRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
      const container = containerRef.current
      if (!container || !preview || preview.math.length === 0) return
      let cancelled = false
      void import('@platejs/math')
        .then(({ getEquationHtml }) => {
          if (cancelled || containerRef.current !== container) return
          for (const equation of preview.math) {
            const slot = container.querySelector<HTMLElement>(
              `[data-graph-math-id="${equation.id}"]`,
            )
            if (!slot) continue
            slot.innerHTML = getEquationHtml({
              element: {
                type: 'equation',
                texExpression: equation.expression,
                children: [{ text: '' }],
              },
              options: {
                displayMode: equation.displayMode,
                output: 'htmlAndMathml',
                throwOnError: false,
                trust: false,
                maxSize: 10,
                maxExpand: 1_000,
              },
            })
            slot.querySelector('math')?.setAttribute('aria-label', equation.expression)
          }
        })
        .catch(() => {
          // The native formula text remains readable if loading or rendering KaTeX fails.
        })
      return () => {
        cancelled = true
      }
    }, [preview])

    // Only the native, sanitized summary HTML enters this sink. Older node details remain
    // readable as escaped text without constructing a Markdown parser or editor per node.
    return preview?.html ? (
      <div
        ref={containerRef}
        className="h-full overflow-hidden break-words [&_p]:my-2 [&_p]:leading-6 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:text-base [&_h3]:font-semibold [&_h4]:my-2 [&_h4]:font-semibold [&_h5]:my-1 [&_h5]:font-semibold [&_h6]:my-1 [&_h6]:text-xs [&_h6]:font-semibold [&_h6]:uppercase [&_hr]:my-3 [&_hr]:border-border [&_ul]:my-2 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:ps-5 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_pre]:my-3 [&_pre]:overflow-hidden [&_pre]:rounded [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/50 [&_pre]:p-3 [&_pre]:text-xs [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top [&_th]:border [&_th]:border-border [&_th]:bg-muted/60 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_details]:my-3 [&_details]:rounded [&_details]:border [&_details]:border-border [&_details]:px-3 [&_details]:py-2 [&_summary]:font-medium [&_kbd]:rounded [&_kbd]:border [&_kbd]:border-border [&_kbd]:bg-muted [&_kbd]:px-1 [&_kbd]:font-mono [&_sup]:text-xs [&_sup]:text-primary [&_aside]:my-3 [&_aside]:border-t [&_aside]:border-border/60 [&_aside]:pt-2 [&_aside]:text-muted-foreground [&_.graph-preview-link]:text-primary [&_.graph-preview-link]:underline [&_.graph-preview-link]:decoration-primary/40 [&_.graph-preview-link]:underline-offset-2 [&_.graph-preview-image]:my-2 [&_.graph-preview-image]:block [&_.graph-preview-image]:rounded [&_.graph-preview-image]:border [&_.graph-preview-image]:border-dashed [&_.graph-preview-image]:border-border [&_.graph-preview-image]:px-3 [&_.graph-preview-image]:py-2 [&_.graph-preview-image]:text-muted-foreground [&_.graph-preview-display-math]:my-4 [&_.graph-preview-display-math]:block [&_.graph-preview-display-math]:overflow-hidden [&_.graph-preview-display-math]:py-2 [&_.graph-preview-display-math]:text-center [&_.graph-preview-inline-math]:mx-0.5 [&_.graph-preview-inline-math]:inline-block [&_.graph-preview-inline-math]:align-baseline"
        data-testid="workspace-map-document-preview"
        dangerouslySetInnerHTML={{ __html: preview.html }}
      />
    ) : (
      <div
        className="h-full overflow-hidden whitespace-pre-wrap break-words"
        data-testid="workspace-map-document-preview"
      >
        {markdown}
      </div>
    )
  },
)
