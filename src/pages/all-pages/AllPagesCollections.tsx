import { AlertTriangle, FileText, Hash, Link2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MarkdownCollectionSummary } from '@/logic/markdownCollections'

type AllPagesCollectionsProps = {
  activeCollectionId: string
  collections: MarkdownCollectionSummary[]
  onSelect: (id: string) => void
  t: (key: string, options?: Record<string, unknown>) => string
}

const collectionIcons: Record<string, LucideIcon> = {
  all: FileText,
  linked: Link2,
  'needs-attention': AlertTriangle,
  structured: Hash,
}

export const AllPagesCollections = ({
  activeCollectionId,
  collections,
  onSelect,
  t,
}: AllPagesCollectionsProps) => (
  <section aria-label={t('collections.title')} className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
    {collections.map((collection) => {
      const Icon = collectionIcons[collection.id] ?? FileText
      const active = collection.id === activeCollectionId

      return (
        <Button
          key={collection.id}
          type="button"
          variant={active ? 'secondary' : 'outline'}
          className={cn(
            'h-9 cursor-pointer justify-start rounded-lg px-3 text-left',
            active && 'border-primary/30',
          )}
          onClick={() => onSelect(collection.id)}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Icon data-icon="inline-start" />
            <span className="truncate font-medium">{t(collection.labelKey)}</span>
            <Badge variant="outline" className="ml-auto rounded-md font-normal">
              {collection.count}
            </Badge>
          </span>
        </Button>
      )
    })}
  </section>
)
