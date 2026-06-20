import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { InspectorMetric } from '@/components/RightSidebarPrimitives'
import { useI18n } from '@/i18n/useI18n'
import type { ViewMode } from '@/store/appTypes'
import { CircleAlert, FileText, Hash, Link2 } from 'lucide-react'

type RightSidebarSummaryProps = {
  activePath: string | null
  targetPath: string | null
  targetLabel: string
  viewMode: ViewMode
  outlineCount: number
  backlinksCount: number
  problemsCount: number
  lineCount: number
}

export const RightSidebarSummary = ({
  activePath,
  targetPath,
  targetLabel,
  viewMode,
  outlineCount,
  backlinksCount,
  problemsCount,
  lineCount,
}: RightSidebarSummaryProps) => {
  const { t } = useI18n()

  return (
    <section
      className="sticky top-1 shrink-0 rounded-lg border border-sidebar-border/70 bg-sidebar/95 p-2 shadow-sm backdrop-blur"
      aria-label={t('inspector.title')}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="grid size-8 shrink-0 place-items-center rounded-md border border-sidebar-border bg-background/75 text-primary">
          <FileText className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-5">{targetLabel}</div>
          <div
            className="mt-0.5 truncate text-[11px] text-muted-foreground"
            title={targetPath ?? ''}
          >
            {targetPath ?? t('editor.empty')}
          </div>
        </div>
        <Badge variant="secondary" className="rounded px-2 py-0.5 text-[10px]">
          {viewMode === 'graph'
            ? t('tabs.workspaceGraph')
            : activePath
              ? t('inspector.currentFile')
              : t('inspector.none')}
        </Badge>
      </div>
      <Separator className="my-2 bg-sidebar-border/70" />
      <div className="grid grid-cols-2 gap-1">
        <InspectorMetric
          icon={<Hash className="size-3.5" aria-hidden="true" />}
          label={t('inspector.outline')}
          value={outlineCount}
        />
        <InspectorMetric
          icon={<Link2 className="size-3.5" aria-hidden="true" />}
          label={t('inspector.backlinks')}
          value={backlinksCount}
        />
        <InspectorMetric
          icon={<CircleAlert className="size-3.5" aria-hidden="true" />}
          label={t('inspector.problems')}
          value={problemsCount}
          tone={problemsCount > 0 ? 'warning' : 'normal'}
        />
        <InspectorMetric
          icon={<FileText className="size-3.5" aria-hidden="true" />}
          label={t('status.lines')}
          value={lineCount}
        />
      </div>
    </section>
  )
}
