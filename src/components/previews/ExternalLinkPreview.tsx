import { useQuery } from '@tanstack/react-query'
import { AppWindow, ExternalLink, Globe2, ImageIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react'

import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import { linkPreviewApi } from '@/services/linkPreviewApi'
import { Button } from '@/components/ui/button'
import { useOpenWebTab } from '@/app/useOpenWebTab'
import { normalizeNavigableWebUrl } from '@/pages/web/webTabUrl'

type ExternalLinkPreviewProps = {
  className?: string
  title?: string
  url: string
}

const siteLabel = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export const ExternalLinkPreview = ({ className, title, url }: ExternalLinkPreviewProps) => {
  const { t } = useI18n()
  const openWebTab = useOpenWebTab()
  const cardRef = useRef<HTMLElement | null>(null)
  const [requested, setRequested] = useState(false)
  const requestPreview = useCallback(() => setRequested(true), [])
  const query = useQuery({
    enabled: requested,
    queryFn: () => linkPreviewApi.fetch(url),
    queryKey: ['link-preview', url],
    staleTime: 30 * 60 * 1000,
  })
  const fallbackTitle = title?.trim() || siteLabel(url)

  useEffect(() => {
    const card = cardRef.current
    if (!card || requested || typeof IntersectionObserver !== 'function') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        requestPreview()
        observer.disconnect()
      },
      { rootMargin: '180px' },
    )
    observer.observe(card)
    return () => observer.disconnect()
  }, [requestPreview, requested])

  const stopEditorEvent = useCallback((event: SyntheticEvent) => event.stopPropagation(), [])
  const result = query.data
  const webpageUrl = result?.kind === 'webpage' ? result.url : url
  const appUrl = normalizeNavigableWebUrl(webpageUrl)

  return (
    <article
      ref={cardRef}
      aria-label={fallbackTitle}
      className={cn(
        'group my-3 overflow-hidden rounded-lg border border-border/80 bg-background/85 text-foreground shadow-sm transition-colors hover:border-primary/35',
        className,
      )}
      contentEditable={false}
      data-marklab-editor-chrome="external-link-preview"
      onClick={stopEditorEvent}
      onFocusCapture={requestPreview}
      onPointerDown={stopEditorEvent}
      onPointerEnter={requestPreview}
      role="article"
    >
      {result?.kind === 'image' ? (
        <a href={result.url} rel="noopener noreferrer" target="_blank">
          <img
            alt={fallbackTitle}
            className="max-h-[28rem] w-full bg-muted/20 object-contain"
            loading="lazy"
            referrerPolicy="no-referrer"
            src={result.src}
          />
          <PreviewFooter
            icon={<ImageIcon aria-hidden className="size-3.5" />}
            label={siteLabel(result.url)}
          />
        </a>
      ) : (
        <div className="flex min-h-24 items-stretch gap-3 p-3">
          <a
            className="flex min-w-0 flex-1 items-stretch gap-3 no-underline"
            href={result?.url ?? url}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Globe2 aria-hidden className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                {result?.kind === 'webpage'
                  ? result.site_name || siteLabel(result.url)
                  : siteLabel(url)}
                <ExternalLink aria-hidden className="size-3" />
              </span>
              <span className="mt-1 block truncate text-sm font-semibold">
                {result?.kind === 'webpage' ? result.title || fallbackTitle : fallbackTitle}
              </span>
              {result?.kind === 'webpage' && result.description ? (
                <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                  {result.description}
                </span>
              ) : null}
              {!requested || query.isPending ? (
                <span className="mt-1 block text-xs text-muted-foreground">
                  {requested ? t('preview.externalLoading') : t('preview.externalPending')}
                </span>
              ) : null}
              {query.isError ? (
                <span className="mt-1 block text-xs text-muted-foreground" role="alert">
                  {t('preview.externalFailed')}
                </span>
              ) : null}
            </span>
          </a>
          {appUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start text-xs text-muted-foreground opacity-80 transition-opacity group-hover:opacity-100"
              onClick={() =>
                openWebTab(
                  appUrl,
                  result?.kind === 'webpage' ? result.title || fallbackTitle : fallbackTitle,
                )
              }
            >
              <AppWindow aria-hidden className="size-3.5" />
              {t('preview.openInApp')}
            </Button>
          ) : null}
        </div>
      )}
    </article>
  )
}

const PreviewFooter = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
  <span className="flex items-center gap-1.5 border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
    {icon}
    <span className="truncate">{label}</span>
  </span>
)

export default ExternalLinkPreview
