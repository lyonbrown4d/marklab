import { useLayoutEffect, useRef, useState } from 'react'
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

export const ProblemQuickFixMenu = (props: ProblemQuickFixMenuProps) => (
  <ProblemQuickFixMenuSession
    key={JSON.stringify([
      props.problem.id,
      props.problem.code,
      props.problem.source,
      props.problem.line,
      props.problem.startColumn,
      props.problem.endColumn,
      props.problem.message,
      props.problem.severity,
    ])}
    {...props}
  />
)

const ProblemQuickFixMenuSession = ({
  problem,
  onApply,
  onGetActions,
}: ProblemQuickFixMenuProps) => {
  const { t } = useI18n()
  const requestRef = useRef(0)
  const busyRef = useRef(false)
  const [actions, setActions] = useState<MarkdownLanguageCodeAction[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  useLayoutEffect(
    () => () => {
      requestRef.current += 1
    },
    [],
  )

  const beginRequest = () => {
    busyRef.current = true
    setActions([])
    setError(null)
    setLoading(true)
    return ++requestRef.current
  }

  const finishRequest = (request: number) => {
    if (request !== requestRef.current) return
    busyRef.current = false
    setLoading(false)
  }

  const loadActions = () => {
    const request = beginRequest()
    void Promise.resolve()
      .then(() => (request === requestRef.current ? onGetActions(problem) : []))
      .then((nextActions) => {
        if (request !== requestRef.current) return
        setActions(nextActions)
        if (nextActions.length === 0) setOpen(false)
      })
      .catch((reason: unknown) => {
        if (request !== requestRef.current) return
        setError(reason instanceof Error ? reason.message : t('context.actionFailed'))
      })
      .finally(() => finishRequest(request))
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) loadActions()
    else {
      requestRef.current += 1
      busyRef.current = false
      setLoading(false)
      setActions([])
      setError(null)
    }
  }

  const apply = (action: MarkdownLanguageCodeAction) => {
    if (busyRef.current || !open || !actions.includes(action)) return
    const request = beginRequest()
    void Promise.resolve()
      .then(() => (request === requestRef.current ? onApply(problem, action) : false))
      .then((applied) => {
        if (request !== requestRef.current) return
        if (applied) setOpen(false)
        else setError(t('context.actionFailed'))
      })
      .catch((reason: unknown) => {
        if (request !== requestRef.current) return
        setError(reason instanceof Error ? reason.message : t('context.actionFailed'))
      })
      .finally(() => finishRequest(request))
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
      <DropdownMenuContent align="end" aria-busy={loading} className="max-w-80">
        {error ? <DropdownMenuItem disabled>{error}</DropdownMenuItem> : null}
        {actions.map((action) => (
          <DropdownMenuItem
            disabled={loading}
            key={`${action.kind}:${action.title}`}
            onSelect={(event) => {
              event.preventDefault()
              apply(action)
            }}
          >
            <span className="whitespace-normal">{action.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
