import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { InspectorEmptyState } from '@/components/RightSidebarPrimitives'
import { useI18n } from '@/i18n/useI18n'
import { ListTree, Search } from 'lucide-react'

export type SidebarHeading = {
  level: number
  text: string
  slug: string
}

type RightSidebarOutlinePanelProps = {
  outline: SidebarHeading[]
  targetLabel: string
  onOpenHeading: (slug: string) => void
}

const normalizeOutlineQuery = (value: string) => value.trim().toLowerCase()

export const RightSidebarOutlinePanel = ({
  outline,
  targetLabel,
  onOpenHeading,
}: RightSidebarOutlinePanelProps) => {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const normalizedQuery = normalizeOutlineQuery(query)
  const filteredOutline = useMemo(() => {
    if (!normalizedQuery) {
      return outline
    }

    return outline.filter((heading) => {
      const searchableText = `${heading.text} ${heading.slug}`.toLowerCase()
      return searchableText.includes(normalizedQuery)
    })
  }, [outline, normalizedQuery])

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
      <div className="relative px-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={t('inspector.outlineSearchPlaceholder')}
          placeholder={t('inspector.outlineSearchPlaceholder')}
          className="h-8 rounded-md border-sidebar-border bg-background/70 pl-7 text-xs shadow-none"
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
          <div className="flex flex-col gap-1.5">
            {filteredOutline.map((heading) => (
              <Button
                key={`${heading.slug}-${heading.level}`}
                variant="ghost"
                size="sm"
                className="h-7 w-full justify-start rounded-md px-2 text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground"
                style={{ paddingLeft: 6 + (heading.level - 1) * 12 }}
                onClick={() => onOpenHeading(heading.slug)}
              >
                <Badge variant="secondary" className="mr-2 rounded px-1 py-0 text-[10px]">
                  H{heading.level}
                </Badge>
                <span className="truncate">{heading.text}</span>
              </Button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
