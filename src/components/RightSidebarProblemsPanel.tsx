import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
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

export const RightSidebarProblemsPanel = ({
  targetPath,
  targetLabel,
  problems,
  errorProblems,
  warningProblems,
  onOpenProblem,
}: RightSidebarProblemsPanelProps) => {
  const { t } = useI18n()

  return (
    <ScrollArea className="h-full" viewportClassName="p-1">
      {!targetPath ? (
        <InspectorEmptyState
          icon={<FileText className="h-4 w-4" />}
          title={t('inspector.none')}
          description={t('editor.empty')}
        />
      ) : problems.length === 0 ? (
        <InspectorEmptyState
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          title={t('inspector.noProblems')}
          description={targetLabel}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {errorProblems.length > 0 && (
            <ProblemGroupHeader
              label={t('inspector.problemError')}
              count={errorProblems.length}
              tone="error"
            />
          )}
          {errorProblems.map((problem, index) => (
            <ProblemRow
              key={`error-${problem.line}-${problem.startColumn}-${index}`}
              problem={problem}
              onOpenProblem={onOpenProblem}
            />
          ))}
          {warningProblems.length > 0 && (
            <ProblemGroupHeader
              label={t('inspector.problemWarning')}
              count={warningProblems.length}
              tone="warning"
            />
          )}
          {warningProblems.map((problem, index) => (
            <ProblemRow
              key={`warning-${problem.line}-${problem.startColumn}-${index}`}
              problem={problem}
              onOpenProblem={onOpenProblem}
            />
          ))}
        </div>
      )}
    </ScrollArea>
  )
}

type ProblemRowProps = {
  problem: MarkdownSourceDiagnostic
  onOpenProblem: (problem: MarkdownSourceDiagnostic) => void
}

const ProblemRow = ({ problem, onOpenProblem }: ProblemRowProps) => {
  const { t } = useI18n()
  const iconClassName = `h-4 w-4 shrink-0 ${problemClasses(problem.severity)}`

  return (
    <Button
      variant="ghost"
      size="sm"
      className="inspector-row h-auto min-h-9 w-full justify-start rounded-md px-2 py-1 text-left"
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
