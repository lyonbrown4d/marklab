import { Badge } from '@/components/ui/badge'
import { InspectorMetric } from '@/components/RightSidebarPrimitives'
import { useI18n } from '@/i18n/useI18n'
import type { ViewMode } from '@/store/useAppStore'
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
    <div className="sidebar-section rounded-md p-2">
      <div className="flex min-w-0 items-start gap-2">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-sidebar-border bg-background/70">
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{targetLabel}</div>
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
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <InspectorMetric
          icon={<Hash className="h-3.5 w-3.5" />}
          label={t('inspector.outline')}
          value={outlineCount}
        />
        <InspectorMetric
          icon={<Link2 className="h-3.5 w-3.5" />}
          label={t('inspector.backlinks')}
          value={backlinksCount}
        />
        <InspectorMetric
          icon={<CircleAlert className="h-3.5 w-3.5" />}
          label={t('inspector.problems')}
          value={problemsCount}
          tone={problemsCount > 0 ? 'warning' : 'normal'}
        />
        <InspectorMetric
          icon={<FileText className="h-3.5 w-3.5" />}
          label={t('status.lines')}
          value={lineCount}
        />
      </div>
    </div>
  )
}
