import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/AppScrollArea'
import AppSearchField from '@/components/AppSearchField'
import { InspectorEmptyState } from '@/components/RightSidebarPrimitives'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, ListTree, Search } from 'lucide-react'

export type SidebarHeading = {
  level: number
  text: string
  slug: string
}

type RightSidebarOutlinePanelProps = {
  activeHeadingSlug: string | null
  outline: SidebarHeading[]
  targetLabel: string
  onOpenHeading: (slug: string) => void
}

const normalizeOutlineQuery = (value: string) => value.trim().toLowerCase()

const getActiveAncestorSlugs = (outline: SidebarHeading[], activeSlug: string | null) => {
  const activeIndex = outline.findIndex((heading) => heading.slug === activeSlug)
  if (activeIndex < 0) return new Set<string>()

  const ancestors = new Set<string>()
  let parentLevel = outline[activeIndex].level
  for (let index = activeIndex - 1; index >= 0; index -= 1) {
    const heading = outline[index]
    if (heading.level >= parentLevel) continue
    ancestors.add(heading.slug)
    parentLevel = heading.level
  }
  return ancestors
}

const getVisibleOutline = (outline: SidebarHeading[], collapsedSlugs: Set<string>) => {
  let collapsedLevel: number | null = null
  return outline.filter((heading) => {
    if (collapsedLevel !== null) {
      if (heading.level > collapsedLevel) return false
      collapsedLevel = null
    }
    if (collapsedSlugs.has(heading.slug)) collapsedLevel = heading.level
    return true
  })
}

export const RightSidebarOutlinePanel = ({
  activeHeadingSlug,
  outline,
  targetLabel,
  onOpenHeading,
}: RightSidebarOutlinePanelProps) => {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [collapsedSlugs, setCollapsedSlugs] = useState<Set<string>>(() => new Set())
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())
  const normalizedQuery = normalizeOutlineQuery(query)
  const collapsibleSlugs = useMemo(
    () =>
      new Set(
        outline.flatMap((heading, index) =>
          outline[index + 1]?.level > heading.level ? [heading.slug] : [],
        ),
      ),
    [outline],
  )
  const activeAncestorSlugs = useMemo(
    () => getActiveAncestorSlugs(outline, activeHeadingSlug),
    [activeHeadingSlug, outline],
  )
  const visibleCollapsedSlugs = useMemo(
    () =>
      new Set(
        [...collapsedSlugs].filter(
          (slug) => collapsibleSlugs.has(slug) && !activeAncestorSlugs.has(slug),
        ),
      ),
    [activeAncestorSlugs, collapsedSlugs, collapsibleSlugs],
  )
  const filteredOutline = useMemo(() => {
    if (!normalizedQuery) {
      return getVisibleOutline(outline, visibleCollapsedSlugs)
    }

    return outline.filter((heading) => {
      const searchableText = `${heading.text} ${heading.slug}`.toLowerCase()
      return searchableText.includes(normalizedQuery)
    })
  }, [normalizedQuery, outline, visibleCollapsedSlugs])

  useEffect(() => {
    if (!activeHeadingSlug) return
    rowRefs.current.get(activeHeadingSlug)?.scrollIntoView({ block: 'nearest' })
  }, [activeHeadingSlug, filteredOutline])

  const toggleCollapsed = (slug: string) => {
    setCollapsedSlugs((current) => {
      const next = new Set([...current].filter((value) => collapsibleSlugs.has(value)))
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  if (outline.length === 0) {
    return (
      <ScrollArea className="h-full" viewportClassName="p-1">
        <InspectorEmptyState
          icon={<ListTree className="size-4" aria-hidden="true" />}
          title={t('inspector.noOutline')}
          description={targetLabel}
        />
      </ScrollArea>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div className="px-1">
        <AppSearchField
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery('')}
          clearLabel={t('search.clear')}
          aria-label={t('inspector.outlineSearchPlaceholder')}
          placeholder={t('inspector.outlineSearchPlaceholder')}
        />
      </div>

      <ScrollArea className="min-h-0 flex-1" viewportClassName="p-1">
        {filteredOutline.length === 0 ? (
          <InspectorEmptyState
            icon={<Search className="size-4" aria-hidden="true" />}
            title={t('inspector.noOutlineMatches')}
            description={t('inspector.noOutlineMatchesDescription')}
          />
        ) : (
          <div className="flex flex-col gap-0.5">
            {filteredOutline.map((heading) => {
              const hasChildren = collapsibleSlugs.has(heading.slug)
              const isCollapsed = visibleCollapsedSlugs.has(heading.slug)
              const isActive = heading.slug === activeHeadingSlug
              return (
                <div
                  key={`${heading.slug}-${heading.level}`}
                  className="flex min-w-0 items-start"
                  style={{ paddingLeft: 2 + (heading.level - 1) * 12 }}
                >
                  {!normalizedQuery && hasChildren ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="mt-1 shrink-0 rounded-sm text-muted-foreground"
                      aria-label={`${t(isCollapsed ? 'context.expand' : 'context.collapse')} ${heading.text}`}
                      aria-expanded={!isCollapsed}
                      onClick={() => toggleCollapsed(heading.slug)}
                    >
                      {isCollapsed ? (
                        <ChevronRight aria-hidden="true" />
                      ) : (
                        <ChevronDown aria-hidden="true" />
                      )}
                    </Button>
                  ) : (
                    <span className="w-6 shrink-0" aria-hidden="true" />
                  )}
                  <Button
                    ref={(node) => {
                      if (node) rowRefs.current.set(heading.slug, node)
                      else rowRefs.current.delete(heading.slug)
                    }}
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-current={isActive ? 'location' : undefined}
                    className={cn(
                      'h-auto min-h-8 min-w-0 flex-1 justify-start rounded-sm px-1.5 py-1.5 text-left text-xs font-normal transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:bg-muted/50 focus-visible:text-foreground',
                      isActive && 'bg-muted font-medium text-foreground',
                    )}
                    onClick={() => onOpenHeading(heading.slug)}
                  >
                    <span className="sr-only">H{heading.level} </span>
                    <span className="min-w-0 whitespace-normal break-words leading-5">
                      {heading.text}
                    </span>
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
