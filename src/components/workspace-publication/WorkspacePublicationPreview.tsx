import { useMemo, useRef, useState } from 'react'
import { usePinch } from '@use-gesture/react'
import {
  AlertCircle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  Minus,
  Plus,
  Rows2,
  Square,
} from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import type { WorkspacePublicationOptions } from '@/types/workspacePublication'
import type { PublicationPreviewPage } from '@/components/workspace-publication/workspacePublicationModel'

type WorkspacePublicationPreviewProps = {
  orphanCount: number
  options: WorkspacePublicationOptions
  pages: PublicationPreviewPage[]
  selectedPath: string | null
}

const MIN_ZOOM = 0.65
const MAX_ZOOM = 1.15
const ZOOM_STEP = 0.1
const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

export const WorkspacePublicationPreview = ({
  orphanCount,
  options,
  pages,
  selectedPath,
}: WorkspacePublicationPreviewProps) => {
  const { t } = useI18n()
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const zoomRef = useRef(0.85)
  const [navigation, setNavigation] = useState({ index: 0, selectedPath: null as string | null })
  const [spread, setSpread] = useState(true)
  const [zoom, setZoom] = useState(0.85)

  const selectedIndex = pages.findIndex((page) => page.path === selectedPath)
  const requestedIndex =
    navigation.selectedPath === selectedPath ? navigation.index : Math.max(0, selectedIndex)
  const pageIndex = Math.min(requestedIndex, Math.max(0, pages.length - 1))

  const activePages = useMemo(
    () => pages.slice(pageIndex, pageIndex + (spread ? 2 : 1)),
    [pageIndex, pages, spread],
  )
  const goTo = (next: number) =>
    setNavigation({
      index: Math.min(Math.max(next, 0), pages.length - 1),
      selectedPath,
    })

  const updateZoom = (next: number) => {
    const clamped = clampZoom(next)
    zoomRef.current = clamped
    setZoom(clamped)
  }
  usePinch(({ offset: [scale] }) => updateZoom(scale), {
    eventOptions: { passive: false },
    from: () => [zoomRef.current, 0],
    modifierKey: ['ctrlKey', 'metaKey'],
    preventDefault: true,
    scaleBounds: { min: MIN_ZOOM, max: MAX_ZOOM },
    target: viewportRef,
  })

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col bg-background"
      aria-label={t('workspaceExport.preview')}
    >
      <div className="flex h-12 shrink-0 items-center justify-center gap-2 border-b px-3">
        <Button
          aria-label={t('workspaceExport.previousPage')}
          disabled={pageIndex <= 0}
          onClick={() => goTo(pageIndex - 1)}
          size="icon"
          type="button"
          variant="outline"
        >
          <ChevronLeft />
        </Button>
        <div className="flex h-9 min-w-20 items-center justify-center rounded-md border bg-background px-3 text-xs tabular-nums">
          {t('workspaceExport.pageOf', {
            current: pages.length > 0 ? pageIndex + 1 : 0,
            total: pages.length,
          })}
        </div>
        <Button
          aria-label={t('workspaceExport.nextPage')}
          disabled={pageIndex >= pages.length - 1}
          onClick={() => goTo(pageIndex + 1)}
          size="icon"
          type="button"
          variant="outline"
        >
          <ChevronRight />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button
          aria-label={t('workspaceExport.zoomOut')}
          disabled={zoom <= MIN_ZOOM}
          onClick={() => updateZoom(zoomRef.current - ZOOM_STEP)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Minus />
        </Button>
        <output
          aria-label={t('workspaceExport.zoomLevel')}
          className="w-10 text-center text-xs tabular-nums text-muted-foreground"
        >
          {Math.round(zoom * 100)}%
        </output>
        <Button
          aria-label={t('workspaceExport.zoomIn')}
          disabled={zoom >= MAX_ZOOM}
          onClick={() => updateZoom(zoomRef.current + ZOOM_STEP)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Plus />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button
          aria-label={spread ? t('workspaceExport.singlePage') : t('workspaceExport.twoPages')}
          onClick={() => setSpread((value) => !value)}
          size="icon"
          type="button"
          variant={spread ? 'secondary' : 'ghost'}
        >
          {spread ? <Rows2 /> : <Square />}
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/35">
        <div
          ref={viewportRef}
          aria-label={t('workspaceExport.previewPages')}
          className="flex min-h-0 flex-1 items-center justify-center overflow-auto overscroll-contain p-5 [touch-action:pan-x_pan-y]"
          role="region"
        >
          {activePages.length > 0 ? (
            <div
              className="flex w-full origin-center items-start justify-center gap-2"
              style={{ transform: `scale(${zoom})` }}
            >
              {activePages.map((page, index) => (
                <PreviewPage
                  key={`${page.kind}-${page.number}`}
                  options={options}
                  page={page}
                  className={cn(index > 0 && !spread && 'hidden')}
                />
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">{t('workspaceExport.empty')}</div>
          )}
        </div>
        {orphanCount > 0 ? (
          <div className="mx-4 mb-2 flex shrink-0 items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertCircle className="size-4 shrink-0" />
            <span className="truncate">
              {t('workspaceExport.unlinkedNotice', { count: orphanCount })}
            </span>
          </div>
        ) : null}
        <div className="flex h-28 shrink-0 gap-3 overflow-x-auto border-t bg-background/80 px-4 py-3">
          {pages.map((page, index) => (
            <button
              aria-label={`${page.title}, ${page.number}`}
              className={cn(
                'group relative h-full w-16 shrink-0 overflow-hidden rounded-sm border bg-white text-left shadow-sm outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring',
                index === pageIndex
                  ? 'border-primary ring-1 ring-primary'
                  : 'hover:border-foreground/40',
              )}
              key={`${page.kind}-${page.number}`}
              onClick={() => goTo(index)}
              type="button"
            >
              <div className="px-2 pt-3 text-[5px] font-semibold leading-tight text-slate-900">
                {page.title}
              </div>
              <div className="absolute inset-x-0 bottom-1 text-center text-[7px] text-slate-500">
                {page.number}
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

const PreviewPage = ({
  className,
  options,
  page,
}: {
  className?: string
  options: WorkspacePublicationOptions
  page: PublicationPreviewPage
}) => {
  const { t } = useI18n()
  return (
    <article
      className={cn(
        'relative w-[min(42%,330px)] min-w-56 shrink-0 overflow-hidden border border-slate-300 bg-white text-slate-900 shadow-xl',
        options.orientation === 'portrait' ? 'aspect-[210/297]' : 'aspect-[297/210]',
        className,
      )}
    >
      {page.kind === 'cover' ? (
        <div className="flex size-full flex-col justify-between p-[12%]">
          <span className="text-[9px] font-bold tracking-[0.18em] text-blue-600">MARKLAB</span>
          <div>
            <h3 className="text-xl font-semibold leading-tight">{page.title}</h3>
            <p className="mt-3 text-[9px] text-slate-500">
              {t('workspaceExport.coverDescription')}
            </p>
          </div>
          <div className="h-1 w-12 bg-blue-600" />
        </div>
      ) : page.kind === 'contents' ? (
        <div className="size-full p-[10%]">
          <BookOpen className="mb-4 size-4 text-blue-600" />
          <h3 className="mb-5 text-lg font-semibold">{t('workspaceExport.contentsPage')}</h3>
          <div className="space-y-2">
            {page.excerpt
              .split('\n')
              .slice(0, 9)
              .map((title, index) => (
                <div className="flex gap-2 text-[8px]" key={`${title}-${index}`}>
                  <span className="font-medium tabular-nums">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1 truncate border-b border-dotted border-slate-300 pb-1">
                    {title}
                  </span>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <div className="size-full p-[10%]">
          <div className="mb-5 flex items-center justify-between border-b border-slate-200 pb-2 text-[7px] text-slate-500">
            <span>{options.title}</span>
            <FileText className="size-3" />
          </div>
          <span className="text-xs font-bold text-blue-600">
            {String(page.number).padStart(2, '0')}
          </span>
          <h3 className="mt-1 text-xl font-semibold leading-tight">{page.title}</h3>
          <p className="mt-4 text-[9px] leading-[1.7] text-slate-600">{page.excerpt}</p>
          <div className="mt-5 h-16 rounded border border-slate-200 bg-slate-50 p-2">
            <div className="h-1 w-1/2 rounded bg-slate-300" />
            <div className="mt-2 h-1 w-full rounded bg-slate-200" />
            <div className="mt-2 h-1 w-4/5 rounded bg-slate-200" />
          </div>
        </div>
      )}
      {options.pageNumbers ? (
        <span className="absolute inset-x-0 bottom-3 text-center text-[8px] text-slate-400">
          {page.number}
        </span>
      ) : null}
    </article>
  )
}
