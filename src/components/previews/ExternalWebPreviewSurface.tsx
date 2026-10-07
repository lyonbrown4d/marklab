import { ArrowUpRight, Globe2, ImageIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { useOpenWebTab } from '@/app/useOpenWebTab'
import {
  PreviewFailure,
  PreviewFooter,
  PreviewOpenAction,
} from '@/components/previews/ExternalWebPreviewActions'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import { normalizeNavigableWebUrl } from '@/pages/web/webTabUrl'
import type { PreviewCapturePriority } from '@/components/previews/previewCaptureQueue'
import { useExternalWebPreviewData } from '@/components/previews/useExternalWebPreviewData'

type ExternalWebPreviewSurfaceProps = {
  action?: ReactNode
  capturePriority?: PreviewCapturePriority
  captureRequested?: boolean
  className?: string
  dragHandleClassName?: string
  interactionClassName?: string
  requested: boolean
  title?: string
  url: string
  variant: 'editor' | 'graph'
}

const siteLabel = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export const ExternalWebPreviewSurface = ({
  action,
  capturePriority = 'background',
  className,
  dragHandleClassName,
  interactionClassName,
  requested,
  captureRequested = requested,
  title,
  url,
  variant,
}: ExternalWebPreviewSurfaceProps) => {
  const openWebTab = useOpenWebTab()
  const { capture, metadata, retryPreview } = useExternalWebPreviewData({
    capturePriority,
    captureRequested,
    metadataRequested: requested,
    url,
  })
  const fallbackTitle = title?.trim() || siteLabel(url)
  const result = metadata.data
  const webpageUrl = result?.kind === 'webpage' ? result.url : url
  const appUrl = normalizeNavigableWebUrl(webpageUrl)
  const hostname = siteLabel(webpageUrl)
  const failed = metadata.isError && capture.isError

  return (
    <div
      className={cn(
        'group/link-card relative overflow-hidden rounded-xl border border-border/70 bg-background/90 text-foreground shadow-[0_1px_2px_hsl(var(--foreground)/0.04)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-primary/30 hover:shadow-[0_10px_28px_hsl(var(--foreground)/0.08)] motion-reduce:transform-none',
        variant === 'editor' ? 'my-3' : 'size-full min-h-0',
        className,
      )}
      data-external-web-preview={url}
    >
      {result?.kind === 'image' ? (
        <>
          <a
            className={cn(
              'relative block size-full no-underline',
              !dragHandleClassName && interactionClassName,
            )}
            href={result.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            <img
              alt={fallbackTitle}
              className={cn(
                'w-full bg-muted/15 transition-transform duration-300 group-hover/link-card:scale-[1.005] motion-reduce:transform-none',
                variant === 'graph' ? 'size-full object-cover' : 'max-h-[28rem] object-contain',
              )}
              loading="lazy"
              referrerPolicy="no-referrer"
              src={result.src}
            />
            {variant === 'editor' ? (
              <PreviewFooter
                icon={<ImageIcon aria-hidden className="size-3.5" />}
                label={siteLabel(result.url)}
              />
            ) : (
              <span
                className={cn(
                  'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-3 pt-10 text-xs font-medium text-white/80',
                  dragHandleClassName,
                )}
              >
                {siteLabel(result.url)}
              </span>
            )}
          </a>
          {action}
        </>
      ) : (
        <WebpagePreview
          action={action}
          appUrl={appUrl}
          capture={capture.data}
          description={result?.kind === 'webpage' ? result.description : undefined}
          dragHandleClassName={dragHandleClassName}
          failed={failed}
          fallbackTitle={fallbackTitle}
          hostname={hostname}
          interactionClassName={interactionClassName}
          loading={requested && metadata.isPending}
          requested={requested}
          retryPreview={retryPreview}
          siteName={result?.kind === 'webpage' ? result.site_name || hostname : hostname}
          title={result?.kind === 'webpage' ? result.title || fallbackTitle : fallbackTitle}
          url={result?.kind === 'webpage' ? result.url : url}
          variant={variant}
          onOpenInApp={() =>
            openWebTab(
              appUrl ?? webpageUrl,
              result?.kind === 'webpage' ? result.title || fallbackTitle : fallbackTitle,
            )
          }
        />
      )}
    </div>
  )
}

type WebpagePreviewProps = {
  action?: ReactNode
  appUrl: string | null
  capture?: { height: number; src: string; width: number }
  description?: string | null
  dragHandleClassName?: string
  failed: boolean
  fallbackTitle: string
  hostname: string
  interactionClassName?: string
  loading: boolean
  onOpenInApp: () => void
  requested: boolean
  retryPreview: () => void
  siteName: string
  title: string
  url: string
  variant: 'editor' | 'graph'
}

const WebpagePreview = (props: WebpagePreviewProps) => {
  const { t } = useI18n()
  return (
    <div
      className={cn(
        'relative overflow-hidden',
        props.variant === 'graph'
          ? 'size-full min-h-0'
          : props.capture
            ? 'h-[clamp(11rem,32vw,20rem)]'
            : 'min-h-28',
      )}
    >
      <a
        className={cn(
          'absolute inset-0 block overflow-hidden bg-muted/25 no-underline outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          !props.dragHandleClassName && props.interactionClassName,
        )}
        href={props.url}
        rel="noopener noreferrer"
        target="_blank"
      >
        {props.capture ? (
          <img
            alt={t('preview.externalVisualAlt', { title: props.fallbackTitle })}
            className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover/link-card:scale-[1.025] motion-reduce:transform-none"
            height={props.capture.height}
            loading="lazy"
            src={props.capture.src}
            width={props.capture.width}
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center overflow-hidden text-muted-foreground">
            <span className="select-none font-mono text-5xl font-semibold uppercase opacity-[0.07]">
              {props.hostname.charAt(0)}
            </span>
            <Globe2 aria-hidden className="absolute size-4 opacity-45" />
          </span>
        )}
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-x-0 bottom-0 h-3/4',
            props.capture
              ? 'bg-gradient-to-t from-black/85 via-black/35 to-transparent'
              : 'bg-gradient-to-t from-background via-background/90 to-transparent',
          )}
        />
        <span
          className={cn(
            'absolute inset-x-0 bottom-0 block min-w-0 px-4 pb-3.5 pr-12',
            props.dragHandleClassName,
            props.capture ? 'text-white' : 'text-foreground',
          )}
        >
          <PreviewCaption {...props} />
        </span>
      </a>
      {props.failed ? (
        <PreviewFailure
          interactionClassName={props.interactionClassName}
          onRetry={props.retryPreview}
        />
      ) : null}
      {props.appUrl ? (
        <PreviewOpenAction
          interactionClassName={props.interactionClassName}
          onOpen={props.onOpenInApp}
        />
      ) : null}
      {props.action}
    </div>
  )
}

const PreviewCaption = (props: WebpagePreviewProps) => {
  const { t } = useI18n()
  return (
    <>
      <span
        className={cn(
          'flex items-center gap-1.5 text-[11px] font-medium tracking-[0.01em]',
          props.capture ? 'text-white/70' : 'text-muted-foreground',
        )}
      >
        <Globe2 aria-hidden className="size-3" />
        <span className="truncate">{props.siteName}</span>
        <ArrowUpRight aria-hidden className="size-3 shrink-0 opacity-70" />
      </span>
      <span className="mt-1 block truncate text-[15px] font-semibold leading-5 tracking-[-0.01em]">
        {props.title}
      </span>
      {props.description ? (
        <span
          className={cn(
            'mt-0.5 line-clamp-1 block text-xs leading-5',
            props.capture ? 'text-white/70' : 'text-muted-foreground',
          )}
        >
          {props.description}
        </span>
      ) : null}
      {!props.requested || props.loading ? (
        <span
          className={cn(
            'mt-1 block text-[11px]',
            props.capture ? 'text-white/65' : 'text-muted-foreground/80',
          )}
        >
          {props.requested ? t('preview.externalLoading') : t('preview.externalPending')}
        </span>
      ) : null}
    </>
  )
}
