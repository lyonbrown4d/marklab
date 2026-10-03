import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, Globe2, RotateCw, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n/useI18n'
import { normalizeNavigableWebUrl } from '@/pages/web/webTabUrl'

type ToolbarAction = () => Promise<unknown> | void

type WebTabToolbarProps = {
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
  url: string
  onBack: ToolbarAction
  onClose: ToolbarAction
  onForward: ToolbarAction
  onNavigate: (url: string) => Promise<unknown> | void
  onReload: ToolbarAction
  onStop: ToolbarAction
}

const ToolbarButton = ({
  label,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button aria-label={label} size="icon" variant="ghost" {...props} />
    </TooltipTrigger>
    <TooltipContent side="top">{label}</TooltipContent>
  </Tooltip>
)

export const WebTabToolbar = ({
  canGoBack,
  canGoForward,
  loading,
  url,
  onBack,
  onClose,
  onForward,
  onNavigate,
  onReload,
  onStop,
}: WebTabToolbarProps) => {
  const { t } = useI18n()
  const [addressDraft, setAddressDraft] = useState({ sourceUrl: url, value: url })
  const [actionError, setActionError] = useState<string | null>(null)
  const address = addressDraft.sourceUrl === url ? addressDraft.value : url
  const setAddress = (value: string) => setAddressDraft({ sourceUrl: url, value })
  const run = (action: ToolbarAction) => {
    setActionError(null)
    void Promise.resolve(action()).catch(() => setActionError(t('webTab.actionFailed')))
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const safeUrl = normalizeNavigableWebUrl(address)
    if (!safeUrl) {
      setActionError(t('webTab.invalidUrl'))
      return
    }
    setAddress(safeUrl)
    run(() => onNavigate(safeUrl))
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div
        aria-label={t('webTab.navigation')}
        className="flex h-10 shrink-0 items-center gap-1 border-b border-border/70 bg-background/94 px-2 backdrop-blur-xl"
        role="toolbar"
      >
        <ToolbarButton label={t('webTab.back')} disabled={!canGoBack} onClick={() => run(onBack)}>
          <ArrowLeft aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label={t('webTab.forward')}
          disabled={!canGoForward}
          onClick={() => run(onForward)}
        >
          <ArrowRight aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label={t(loading ? 'webTab.stop' : 'webTab.reload')}
          onClick={() => run(loading ? onStop : onReload)}
        >
          {loading ? <Square aria-hidden /> : <RotateCw aria-hidden />}
        </ToolbarButton>
        <form className="mx-1 flex min-w-0 flex-1" onSubmit={submit}>
          <div className="relative min-w-0 flex-1">
            <Globe2
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label={t('webTab.address')}
              aria-invalid={Boolean(actionError)}
              className="h-7 rounded-full border-border/70 bg-muted/45 pl-8 font-mono text-[11px] shadow-none focus-visible:bg-background"
              onChange={(event) => setAddress(event.target.value)}
              spellCheck={false}
              value={address}
            />
          </div>
        </form>
        {actionError ? (
          <span className="max-w-40 truncate text-[10px] text-destructive" role="alert">
            {actionError}
          </span>
        ) : null}
        <ToolbarButton asChild label={t('webTab.openSystem')}>
          <a href={url} rel="noopener noreferrer" target="_blank">
            <ExternalLink aria-hidden />
          </a>
        </ToolbarButton>
        <ToolbarButton label={t('actions.closeTab')} onClick={() => run(onClose)}>
          <X aria-hidden />
        </ToolbarButton>
      </div>
    </TooltipProvider>
  )
}
