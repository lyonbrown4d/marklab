import {
  ExternalLink,
  FileCode2,
  FileText,
  ImageIcon,
  Maximize2,
  Music,
  PanelsTopLeft,
  Video,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { PreviewFileKind } from '@/logic/fileTypes'
import { cn } from '@/lib/utils'

type EmbeddedPreviewHeaderProps = {
  failed: boolean
  dragHandle?: boolean
  kind: PreviewFileKind
  onExpand: () => void
  onOpenInSystem: () => void
  onOpenInTab: () => void
  pathAvailable: boolean
  title: string
  labels: {
    expand: string
    kind: string
    openInSystem: string
    openInTab: string
  }
}

const previewIcons: Record<string, typeof FileText> = {
  audio: Music,
  docx: FileText,
  drawio: PanelsTopLeft,
  excalidraw: PanelsTopLeft,
  image: ImageIcon,
  pdf: FileText,
  source: FileCode2,
  video: Video,
}

const ActionLabel = ({ children }: { children: string }) => (
  <span className="sr-only">{children}</span>
)

export const EmbeddedPreviewHeader = ({
  failed,
  dragHandle = false,
  kind,
  labels,
  onExpand,
  onOpenInSystem,
  onOpenInTab,
  pathAvailable,
  title,
}: EmbeddedPreviewHeaderProps) => {
  const Icon = previewIcons[kind] ?? FileText

  return (
    <header
      className={cn(
        'flex min-h-10 items-center gap-2 border-b border-border/70 bg-card/80 px-2.5 py-1.5',
        dragHandle && 'embedded-preview-drag-handle cursor-grab active:cursor-grabbing',
      )}
      data-slot="embedded-preview-header"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-xs font-medium">{title}</span>
        <Badge className="h-5 shrink-0 rounded px-1.5 text-[10px]" variant="secondary">
          {labels.kind}
        </Badge>
      </div>
      <div className="nodrag nopan flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {pathAvailable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={labels.openInSystem}
            onClick={onOpenInSystem}
          >
            <ExternalLink aria-hidden="true" />
            <ActionLabel>{labels.openInSystem}</ActionLabel>
          </Button>
        ) : null}
        {pathAvailable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={labels.openInTab}
            onClick={onOpenInTab}
          >
            <FileCode2 aria-hidden="true" />
            <ActionLabel>{labels.openInTab}</ActionLabel>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={labels.expand}
          disabled={failed}
          onClick={onExpand}
        >
          <Maximize2 aria-hidden="true" />
          <ActionLabel>{labels.expand}</ActionLabel>
        </Button>
      </div>
    </header>
  )
}
