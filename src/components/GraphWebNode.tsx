import { useQuery } from '@tanstack/react-query'
import { Globe2, LoaderCircle, MousePointer2, X } from 'lucide-react'
import { useCallback, useMemo, type SyntheticEvent } from 'react'

import { Button } from '@/components/ui/button'
import { useNativeSurfaceOccluded } from '@/app/nativeSurfaceOcclusion'
import { useOpenWebTab } from '@/app/useOpenWebTab'
import { useI18n } from '@/i18n/useI18n'
import { useWebTabNativeView } from '@/pages/web/useWebTabNativeView'
import { linkPreviewApi } from '@/services/linkPreviewApi'

export type GraphWebNodeProps = {
  active: boolean
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
  const capture = useQuery({
    enabled: !props.active,
    queryFn: () => linkPreviewApi.capture(props.url),
    queryKey: ['link-preview-capture', props.url],
    staleTime: 30 * 60 * 1000,
  })
  const stopNodeEvent = useCallback((event: SyntheticEvent) => event.stopPropagation(), [])

  if (props.active) {
    return <LiveGraphWebNode {...props} stopNodeEvent={stopNodeEvent} />
  }

  return (
    <div className="flex h-[210px] flex-col overflow-hidden" data-selected={props.selected}>
      <GraphWebNodeHeader label={props.label} subtitle={props.subtitle} />
      <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/25">
        {capture.data ? (
          <img
            alt={props.label}
            className="size-full object-cover"
            draggable={false}
            height={capture.data.height}
            src={capture.data.src}
            width={capture.data.width}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            {capture.isPending ? (
              <LoaderCircle
                aria-hidden
                className="size-4 animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Globe2 aria-hidden className="size-5" />
            )}
          </div>
        )}
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
      </div>
    </div>
  )
}

type LiveGraphWebNodeProps = GraphWebNodeProps & {
  stopNodeEvent: (event: SyntheticEvent) => void
}

const LiveGraphWebNode = ({
  label,
  onDeactivate,
  stopNodeEvent,
  subtitle,
  url,
}: LiveGraphWebNodeProps) => {
  const { t } = useI18n()
  const openWebTab = useOpenWebTab()
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

  return (
    <div className="flex h-[210px] flex-col overflow-hidden" data-live-web-node="true">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/70 bg-background/95 px-2.5">
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
        aria-busy={state.status === 'loading' || state.status === 'idle'}
        className="nowheel min-h-0 flex-1 bg-muted/20"
      />
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
