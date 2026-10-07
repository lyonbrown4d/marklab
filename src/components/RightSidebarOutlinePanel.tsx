import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/AppScrollArea'
import AppSearchField from '@/components/AppSearchField'
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
            {filteredOutline.map((heading) => (
              <Button
                key={`${heading.slug}-${heading.level}`}
                variant="ghost"
                size="sm"
                className="h-auto min-h-8 w-full justify-start rounded-sm px-2 py-1.5 text-left text-xs font-normal transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:bg-muted/50 focus-visible:text-foreground"
                style={{ paddingLeft: 6 + (heading.level - 1) * 12 }}
                onClick={() => onOpenHeading(heading.slug)}
              >
                <span className="sr-only">H{heading.level} </span>
                <span className="min-w-0 whitespace-normal break-words leading-5">
                  {heading.text}
                </span>
              </Button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
