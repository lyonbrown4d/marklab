import { memo, useId, useMemo } from 'react'
import { AlignLeft, FolderOpen, Heading2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { GraphNodeDetails } from '@/logic/graphViewModel'
import { serializeMarkdownBlocks } from '@/logic/markdownBlocks'
import type { GraphContentMode } from '@/store/appTypes'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { getMindmapShortcutHints } from '@/pages/graph/mindmapPresentation'

type MindmapToolbarProps = {
  contentMode: GraphContentMode
  editable?: boolean
  details: GraphNodeDetails | null
  onContentModeChange?: (mode: GraphContentMode) => void
  onOpenPath: (path: string) => void
  t: (key: string) => string
}

export const MindmapToolbar = memo(
  ({
    contentMode,
    editable = false,
    details,
    onContentModeChange,
    onOpenPath,
    t,
  }: MindmapToolbarProps) => {
    const titleId = useId()
    const shortcutOverrides = usePreferencesStore((state) => state.shortcutOverrides)
    const hints = useMemo(() => getMindmapShortcutHints(shortcutOverrides), [shortcutOverrides])
    const content =
      details?.node.data.content ||
      (details?.node.data.contentBlocks
        ? serializeMarkdownBlocks(details.node.data.contentBlocks)
        : '')

    return (
      <div
        role="group"
        aria-label={t('graph.canvasLabel')}
        className="pointer-events-auto absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-1 shadow-sm"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <ToggleGroup
          type="single"
          size="sm"
          value={contentMode === 'none' ? 'none' : 'full'}
          disabled={!onContentModeChange}
          aria-label={t('editor.modeToggle')}
          onValueChange={(value) => {
            if (value === 'none' || value === 'full') onContentModeChange?.(value)
          }}
        >
          <ToggleGroupItem value="none" aria-label={t('graph.filterHeadings')}>
            <Heading2 className="size-4" aria-hidden="true" />
            <span>{t('graph.filterHeadings')}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="full" aria-label={t('shortcuts.paragraph')}>
            <AlignLeft className="size-4" aria-hidden="true" />
            <span>{t('shortcuts.paragraph')}</span>
          </ToggleGroupItem>
        </ToggleGroup>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" aria-label={t('graph.inspectorTitle')}>
              <Info aria-hidden="true" />
              <span className="hidden sm:inline">{t('graph.inspectorTitle')}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            aria-labelledby={titleId}
            className="flex max-h-[min(70vh,32rem)] w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-3 overflow-y-auto"
          >
            <h2 id={titleId} className="break-words text-sm font-medium">
              {details?.label ?? t('graph.inspectorTitle')}
            </h2>
            {details ? (
              <>
                {details.path && (
                  <p className="break-all text-xs text-muted-foreground">{details.path}</p>
                )}
                {content && (
                  <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {content}
                  </div>
                )}
                {details.openPath && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenPath(details.openPath!)}
                  >
                    <FolderOpen aria-hidden="true" />
                    {t('graph.openNode')}
                  </Button>
                )}
                {editable && details.kind === 'heading' && hints.length > 0 && (
                  <dl className="flex flex-col gap-2 text-xs">
                    {hints.map((hint) => (
                      <div key={hint.action} className="flex items-center justify-between gap-3">
                        <dt className="text-muted-foreground">{t(hint.labelKey)}</dt>
                        <dd>
                          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">
                            {hint.shortcut}
                          </kbd>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('graph.selectNodeDescription')}
              </p>
            )}
          </PopoverContent>
        </Popover>
      </div>
    )
  },
)
MindmapToolbar.displayName = 'MindmapToolbar'
