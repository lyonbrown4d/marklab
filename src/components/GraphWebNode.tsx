import { MousePointer2, X } from 'lucide-react'
import { useCallback, useMemo, type SyntheticEvent } from 'react'

import { Button } from '@/components/ui/button'
import { ExternalWebPreviewSurface } from '@/components/previews/ExternalWebPreviewSurface'
import { useNativeSurfaceOccluded } from '@/app/nativeSurfaceOcclusion'
import { useOpenWebTab } from '@/app/useOpenWebTab'
import { useI18n } from '@/i18n/useI18n'
import { useWebTabNativeView } from '@/pages/web/useWebTabNativeView'
import { useWebTabActions } from '@/pages/web/useWebTabActions'
import { WebTabStatusOverlay } from '@/pages/web/WebTabStatusOverlay'

export type GraphWebNodeProps = {
  active: boolean
  dragHandleClassName?: string
  id: string
  label: string
  onActivate: (nodeId: string) => void
  onDeactivate: () => void
  selected: boolean
  subtitle?: string
  url: string
}

export const GraphWebNode = (props: GraphWebNodeProps) => {
  const { t } = useI18n()
  const stopNodeEvent = useCallback((event: SyntheticEvent) => event.stopPropagation(), [])

  if (props.active) {
    return <LiveGraphWebNode {...props} stopNodeEvent={stopNodeEvent} />
  }

  return (
    <div
      className="size-full min-h-[180px] min-w-[300px] overflow-hidden"
      data-selected={props.selected}
    >
      <ExternalWebPreviewSurface
        action={
          <Button
            aria-label={t('graph.web.interact')}
            className="nodrag nopan absolute bottom-2 right-2 h-7 gap-1.5 rounded-md bg-background/90 px-2 text-[11px] shadow-sm backdrop-blur"
            size="sm"
            type="button"
            variant="outline"
            onClick={(event) => {
              stopNodeEvent(event)
              props.onActivate(props.id)
            }}
            onPointerDown={stopNodeEvent}
          >
            <MousePointer2 aria-hidden className="size-3" />
            {t('graph.web.interact')}
          </Button>
        }
        dragHandleClassName={props.dragHandleClassName}
        interactionClassName="nodrag nopan"
        requested
        title={props.label}
        url={props.url}
        variant="graph"
      />
    </div>
  )
}

type LiveGraphWebNodeProps = GraphWebNodeProps & {
  stopNodeEvent: (event: SyntheticEvent) => void
}

const LiveGraphWebNode = ({
  label,
  dragHandleClassName,
  onDeactivate,
  stopNodeEvent,
  subtitle,
  url,
}: LiveGraphWebNodeProps) => {
  const { t } = useI18n()
  const openWebTab = useOpenWebTab()
  const actions = useWebTabActions('graph-web-node')
  const suspended = useNativeSurfaceOccluded()
  const tab = useMemo(
    () => ({ id: 'graph-web-node', kind: 'web' as const, title: label, url }),
    [label, url],
  )
  const openRequestedTab = useCallback(
    (requestedUrl: string) => openWebTab(requestedUrl, label),
    [label, openWebTab],
  )
  const { hostRef, state } = useWebTabNativeView({
    onOpenRequested: openRequestedTab,
    suspended,
    tab,
  })
  const loading = state.status === 'idle' || state.status === 'loading'
  const failed = state.status === 'error' || state.status === 'crashed'

  return (
    <div
      className="flex size-full min-h-[180px] min-w-[300px] flex-col overflow-hidden"
      data-live-web-node="true"
    >
      <div
        className={`flex h-9 shrink-0 items-center gap-2 border-b border-border/70 bg-background/95 px-2.5 ${dragHandleClassName ?? ''}`}
      >
        <span className="size-1.5 rounded-full bg-amber-500 shadow-[0_0_0_3px_color-mix(in_srgb,currentColor_12%,transparent)]" />
        <GraphWebNodeHeader label={label} subtitle={subtitle} compact />
        <Button
          aria-label={t('graph.web.stop')}
          className="nodrag nopan ml-auto size-6 rounded-md"
          size="icon"
          type="button"
          variant="ghost"
          onClick={(event) => {
            stopNodeEvent(event)
            onDeactivate()
          }}
          onPointerDown={stopNodeEvent}
        >
          <X aria-hidden className="size-3.5" />
        </Button>
      </div>
      <div
        ref={hostRef}
        aria-busy={loading}
        className="nowheel relative m-2 min-h-0 flex-1 overflow-hidden bg-muted/20"
      >
        <WebTabStatusOverlay
          errorDescription={state.error?.description}
          failed={failed}
          interactionClassName="nodrag nopan"
          loading={loading}
          onRetry={() => void Promise.resolve(actions.reload()).catch(() => undefined)}
        />
      </div>
    </div>
  )
}

const GraphWebNodeHeader = ({
  compact = false,
  label,
  subtitle,
}: {
  compact?: boolean
  label: string
  subtitle?: string
}) => (
  <div className={compact ? 'min-w-0 flex-1' : 'shrink-0 border-b border-border/70 px-2.5 py-2'}>
    <div className="truncate text-xs font-semibold text-foreground">{label}</div>
    {subtitle ? <div className="truncate text-[10px] text-muted-foreground">{subtitle}</div> : null}
  </div>
)
