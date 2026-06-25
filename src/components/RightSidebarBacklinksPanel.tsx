import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { InspectorEmptyState } from '@/components/RightSidebarPrimitives'
import { useI18n } from '@/i18n/useI18n'
import type { BacklinkReference } from '@/logic/backlinks'
import { createFileLabel } from '@/logic/paths'
import { FileText, Link2 } from 'lucide-react'

type RightSidebarBacklinksPanelProps = {
  backlinks: BacklinkReference[]
  targetLabel: string
  onOpenBacklink: (backlink: BacklinkReference) => void
}

type BacklinkGroup = {
  title: string
  references: BacklinkReference[]
}

const normalizeSearchText = (value?: string | null) => value?.trim().toLowerCase() ?? ''

const getBacklinkAnchor = (backlink: BacklinkReference) =>
  backlink.targetAnchor || backlink.targetHeadingSlug || null

const doesBacklinkMatchQuery = (backlink: BacklinkReference, query: string) => {
  if (!query) return true

  return [
    backlink.sourcePath,
    createFileLabel(backlink.sourcePath),
    backlink.text,
    backlink.context,
    getBacklinkAnchor(backlink),
  ].some((value) => normalizeSearchText(value).includes(query))
}

const BacklinkReferenceButton = ({
  backlink,
  onOpenBacklink,
}: {
  backlink: BacklinkReference
  onOpenBacklink: (backlink: BacklinkReference) => void
}) => {
  const anchor = getBacklinkAnchor(backlink)

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-auto min-h-11 w-full items-start justify-start rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground"
      onClick={() => onOpenBacklink(backlink)}
    >
      <FileText
        data-icon="inline-start"
        className="shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">
          {createFileLabel(backlink.sourcePath)}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[11px] text-muted-foreground">{backlink.text}</span>
          <Badge variant="secondary" className="shrink-0 rounded px-1 py-0 text-[10px]">
            L{backlink.line}:{backlink.column}
          </Badge>
        </span>
        {anchor && (
          <span className="block truncate text-[10px] text-muted-foreground/70">#{anchor}</span>
        )}
        {backlink.context && (
          <span className="mt-0.5 block whitespace-normal text-[11px] leading-4 text-muted-foreground/80">
            {backlink.context}
          </span>
        )}
      </span>
    </Button>
  )
}

export const RightSidebarBacklinksPanel = ({
  backlinks,
  targetLabel,
  onOpenBacklink,
}: RightSidebarBacklinksPanelProps) => {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const normalizedQuery = normalizeSearchText(query)

  const filteredBacklinks = useMemo(
    () => backlinks.filter((backlink) => doesBacklinkMatchQuery(backlink, normalizedQuery)),
    [backlinks, normalizedQuery],
  )

  const groups = useMemo<BacklinkGroup[]>(() => {
    const anchorReferences = filteredBacklinks.filter((backlink) => getBacklinkAnchor(backlink))
    const fileReferences = filteredBacklinks.filter((backlink) => !getBacklinkAnchor(backlink))

    return [
      { title: t('inspector.anchorReferences'), references: anchorReferences },
      { title: t('inspector.fileReferences'), references: fileReferences },
    ].filter((group) => group.references.length > 0)
  }, [filteredBacklinks, t])

  if (backlinks.length === 0) {
    return (
      <div className="h-full p-1">
        <InspectorEmptyState
          icon={<Link2 className="size-4" aria-hidden="true" />}
          title={t('inspector.noBacklinks')}
          description={targetLabel}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 p-1">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('inspector.backlinksSearchPlaceholder')}
        aria-label={t('inspector.backlinksSearchPlaceholder')}
        className="h-8 text-xs"
      />

      <ScrollArea className="min-h-0 flex-1" viewportClassName="pr-1">
        {filteredBacklinks.length === 0 ? (
          <InspectorEmptyState
            icon={<Link2 className="size-4" aria-hidden="true" />}
            title={t('inspector.noBacklinkMatches')}
            description={t('inspector.noBacklinkMatchesDescription')}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map((group) => (
              <section key={group.title} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span className="truncate">{group.title}</span>
                  <Badge variant="secondary" className="h-4 min-w-4 rounded px-1 text-[10px]">
                    {group.references.length}
                  </Badge>
                </div>
                <div className="flex flex-col gap-1.5">
                  {group.references.map((backlink, index) => (
                    <BacklinkReferenceButton
                      key={`${backlink.sourcePath}-${backlink.line}-${backlink.column}-${getBacklinkAnchor(backlink) ?? 'file'}-${index}`}
                      backlink={backlink}
                      onOpenBacklink={onOpenBacklink}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
