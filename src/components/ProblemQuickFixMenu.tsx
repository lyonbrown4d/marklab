import { useRef, useState } from 'react'
import { LoaderCircle, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/AppTooltip'
import type { MarkdownSourceDiagnostic } from '@/logic/markdownDiagnostics'
import type { MarkdownLanguageCodeAction } from '@/services/markdownLanguageApi'
import { useI18n } from '@/i18n/useI18n'

type ProblemQuickFixMenuProps = {
  problem: MarkdownSourceDiagnostic
  onApply: (
    problem: MarkdownSourceDiagnostic,
    action: MarkdownLanguageCodeAction,
  ) => Promise<boolean>
  onGetActions: (problem: MarkdownSourceDiagnostic) => Promise<MarkdownLanguageCodeAction[]>
}

export const ProblemQuickFixMenu = ({
  problem,
  onApply,
  onGetActions,
}: ProblemQuickFixMenuProps) => {
  const { t } = useI18n()
  const requestRef = useRef(0)
  const [actions, setActions] = useState<MarkdownLanguageCodeAction[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const loadActions = () => {
    const request = ++requestRef.current
    setError(null)
    setLoading(true)
    void onGetActions(problem)
      .then((nextActions) => {
        if (request !== requestRef.current) return
        setActions(nextActions)
        if (nextActions.length === 0) setOpen(false)
      })
      .catch((reason: unknown) => {
        if (request !== requestRef.current) return
        setError(reason instanceof Error ? reason.message : t('inspector.problems'))
      })
      .finally(() => {
        if (request === requestRef.current) setLoading(false)
      })
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) loadActions()
    else requestRef.current += 1
  }

  const apply = (action: MarkdownLanguageCodeAction) => {
    setLoading(true)
    void onApply(problem, action)
      .then((applied) => {
        if (applied) setOpen(false)
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : t('inspector.problems'))
      })
      .finally(() => setLoading(false))
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`${t('actions.more')}: ${problem.message}`}
                className="size-8 shrink-0 p-0"
                size="icon"
                type="button"
                variant="ghost"
              >
                {loading ? (
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Wrench className="size-3.5" aria-hidden="true" />
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="left">{t('actions.more')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="end" className="max-w-80">
        {error ? <DropdownMenuItem disabled>{error}</DropdownMenuItem> : null}
        {actions.map((action) => (
          <DropdownMenuItem key={`${action.kind}:${action.title}`} onSelect={() => apply(action)}>
            <span className="whitespace-normal">{action.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
