import { useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Button } from '@/components/ui/button'
import { InspectorEmptyState, ProblemGroupHeader } from '@/components/RightSidebarPrimitives'
import { useI18n } from '@/i18n/useI18n'
import type { MarkdownSourceDiagnostic } from '@/logic/markdownDiagnostics'
import { CheckCircle2, CircleAlert, CircleX, FileText } from 'lucide-react'

type RightSidebarProblemsPanelProps = {
  targetPath: string | null
  targetLabel: string
  problems: MarkdownSourceDiagnostic[]
  errorProblems: MarkdownSourceDiagnostic[]
  warningProblems: MarkdownSourceDiagnostic[]
  onOpenProblem: (problem: MarkdownSourceDiagnostic) => void
}

const problemClasses = (severity: MarkdownSourceDiagnostic['severity']) => {
  return severity === 'error' ? 'text-destructive' : 'text-amber-500'
}

type ProblemListItem =
  | {
      kind: 'header'
      severity: MarkdownSourceDiagnostic['severity']
      count: number
    }
  | {
      kind: 'problem'
      problem: MarkdownSourceDiagnostic
      key: string
    }

const VIRTUALIZE_PROBLEM_THRESHOLD = 80

export const RightSidebarProblemsPanel = ({
  targetPath,
  targetLabel,
  problems,
  errorProblems,
  warningProblems,
  onOpenProblem,
}: RightSidebarProblemsPanelProps) => {
  const { t } = useI18n()
  const scrollParentRef = useRef<HTMLDivElement | null>(null)
  const problemItems = useMemo<ProblemListItem[]>(() => {
    const items: ProblemListItem[] = []
    if (errorProblems.length > 0) {
      items.push({ kind: 'header', severity: 'error', count: errorProblems.length })
      errorProblems.forEach((problem, index) => {
        items.push({
          kind: 'problem',
          problem,
          key: `error-${problem.line}-${problem.startColumn}-${index}`,
        })
      })
    }
    if (warningProblems.length > 0) {
      items.push({ kind: 'header', severity: 'warning', count: warningProblems.length })
      warningProblems.forEach((problem, index) => {
        items.push({
          kind: 'problem',
          problem,
          key: `warning-${problem.line}-${problem.startColumn}-${index}`,
        })
      })
    }
    return items
  }, [errorProblems, warningProblems])
  // TanStack Virtual exposes imperative helpers that React Compiler cannot memoize safely.
  // The virtualizer stays local to this component and is not passed into memoized children.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: problemItems.length,
    initialRect: { height: 640, width: 320 },
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => (problemItems[index]?.kind === 'header' ? 30 : 58),
    overscan: 8,
  })
  const shouldVirtualize = problemItems.length > VIRTUALIZE_PROBLEM_THRESHOLD
  const renderProblemItem = (item: ProblemListItem) =>
    item.kind === 'header' ? (
      <ProblemGroupHeader
        label={
          item.severity === 'error' ? t('inspector.problemError') : t('inspector.problemWarning')
        }
        count={item.count}
        tone={item.severity}
      />
    ) : (
      <ProblemRow problem={item.problem} onOpenProblem={onOpenProblem} />
    )

  return (
    <div ref={scrollParentRef} className="h-full overflow-auto p-1">
      {!targetPath ? (
        <InspectorEmptyState
          icon={<FileText className="size-4" />}
          title={t('inspector.none')}
          description={t('editor.empty')}
        />
      ) : problems.length === 0 ? (
        <InspectorEmptyState
          icon={<CheckCircle2 className="size-4 text-emerald-500" />}
          title={t('inspector.noProblems')}
          description={targetLabel}
        />
      ) : !shouldVirtualize ? (
        <div className="flex flex-col gap-2">
          {problemItems.map((item, index) => (
            <div key={item.kind === 'problem' ? item.key : `${item.severity}-${index}`}>
              {renderProblemItem(item)}
            </div>
          ))}
        </div>
      ) : (
        <div
          className="relative"
          style={{
            height: virtualizer.getTotalSize(),
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = problemItems[virtualItem.index]
            if (!item) return null

            return (
              <div
                key={virtualItem.key}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                className="absolute left-0 top-0 w-full pb-2"
                style={{
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {renderProblemItem(item)}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

type ProblemRowProps = {
  problem: MarkdownSourceDiagnostic
  onOpenProblem: (problem: MarkdownSourceDiagnostic) => void
}

const ProblemRow = ({ problem, onOpenProblem }: ProblemRowProps) => {
  const { t } = useI18n()
  const iconClassName = `size-4 shrink-0 ${problemClasses(problem.severity)}`

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-auto min-h-9 w-full justify-start rounded-md px-2 py-1 text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground"
      onClick={() => onOpenProblem(problem)}
    >
      {problem.severity === 'error' ? (
        <CircleX className={iconClassName} />
      ) : (
        <CircleAlert className={iconClassName} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">
          {problem.severity === 'error'
            ? t('inspector.problemError')
            : t('inspector.problemWarning')}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">{problem.message}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/80">
          {t('tabs.editor')} · line {problem.line}:{problem.startColumn}
        </span>
      </span>
    </Button>
  )
}
