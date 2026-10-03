import { useState, type SyntheticEvent } from 'react'
import { FileText } from 'lucide-react'
import FilePreviewSurface from '@/components/previews/FilePreviewSurface'
import type { EmbeddedPreviewResolvedTarget } from '@/components/previews/embeddedPreviewSource'
import { Button } from '@/components/ui/button'

type GraphPdfPreviewGateProps = {
  label: string
  path: string
  readonly: boolean
  refreshTarget: () => Promise<EmbeddedPreviewResolvedTarget | null>
  src: string
  title: string
}

const stopGraphEvent = (event: SyntheticEvent) => event.stopPropagation()

export const GraphPdfPreviewGate = ({
  label,
  path,
  readonly,
  refreshTarget,
  src,
  title,
}: GraphPdfPreviewGateProps) => {
  const [active, setActive] = useState(false)
  const [activatedTarget, setActivatedTarget] = useState<EmbeddedPreviewResolvedTarget | null>(null)
  const [loading, setLoading] = useState(false)

  if (active) {
    const current = activatedTarget ?? { path, readonly, src }
    return (
      <FilePreviewSurface
        kind="pdf"
        path={current.path ?? path}
        presentation="graph"
        readonly={current.readonly}
        src={current.src}
        title={title}
      />
    )
  }

  return (
    <div
      className="flex h-full min-h-24 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-center"
      data-slot="graph-pdf-preview-gate"
      onPointerDown={stopGraphEvent}
    >
      <FileText aria-hidden="true" className="size-6 text-muted-foreground" />
      <Button
        className="h-7 px-2"
        disabled={loading}
        onClick={(event) => {
          event.stopPropagation()
          setLoading(true)
          void refreshTarget()
            .then((target) => {
              if (!target) return
              setActivatedTarget(target)
              setActive(true)
            })
            .finally(() => setLoading(false))
        }}
        size="sm"
        type="button"
        variant="secondary"
      >
        {label}
      </Button>
    </div>
  )
}
