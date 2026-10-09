import { PanelBottomClose, PanelBottomOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import type { StatusCenterSummary } from '@/components/status-center/statusCenterModel'
import { useStatusCenterSummaryStore } from '@/store/useStatusCenterSummaryStore'

type AppStatusBarEdgeHandleProps = {
  open: boolean
  summary?: StatusCenterSummary
  onToggle: () => void
}

export const AppStatusBarEdgeHandle = ({
  open,
  summary,
  onToggle,
}: AppStatusBarEdgeHandleProps) => {
  const { t } = useI18n()
  const storedActiveCount = useStatusCenterSummaryStore((state) => state.activeCount)
  const storedIssueCount = useStatusCenterSummaryStore((state) => state.issueCount)
  const storedSummary = { activeCount: storedActiveCount, issueCount: storedIssueCount }
  const effectiveSummary = summary ?? storedSummary
  const status =
    effectiveSummary.issueCount > 0 ? 'error' : effectiveSummary.activeCount > 0 ? 'active' : 'idle'
  const statusCount =
    status === 'error' ? effectiveSummary.issueCount : effectiveSummary.activeCount
  const label = open
    ? t('statusBar.hide')
    : status === 'error'
      ? t('statusBar.showWithIssues', { count: statusCount })
      : status === 'active'
        ? t('statusBar.showWithActiveTasks', { count: statusCount })
        : t('statusBar.show')
  const Icon = open ? PanelBottomClose : PanelBottomOpen

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-controls="app-status-bar"
        aria-expanded={open}
        aria-label={label}
        data-edge="bottom"
        data-state={open ? 'open' : 'closed'}
        data-status={open ? 'idle' : status}
        data-status-bar-edge-handle
        className={`absolute left-1/2 z-40 h-5 w-14 -translate-x-1/2 rounded-b-none rounded-t-lg border border-b-0 border-border/60 bg-background/90 text-muted-foreground shadow-[0_-2px_10px_-6px_hsl(var(--foreground)/0.28)] backdrop-blur transition-[bottom,background-color,color] duration-[180ms] ease-out hover:bg-background hover:text-foreground motion-reduce:transition-none ${open ? 'bottom-7' : 'bottom-0'}`}
        onClick={onToggle}
      >
        <Icon aria-hidden="true" className="size-3.5" />
        {!open && status !== 'idle' ? (
          <span
            aria-hidden="true"
            className={`absolute -right-1 -top-1 min-w-3.5 rounded-full px-1 text-[9px] font-semibold leading-3.5 text-white ${status === 'error' ? 'bg-destructive' : 'bg-status-info'}`}
          >
            {statusCount > 99 ? '99+' : statusCount}
          </span>
        ) : null}
      </Button>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {!open && status !== 'idle' ? label : ''}
      </span>
    </>
  )
}
