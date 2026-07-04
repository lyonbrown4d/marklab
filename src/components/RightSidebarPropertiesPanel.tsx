import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import AppEmptyState from '@/components/AppEmptyState'
import { PropertyCell } from '@/components/RightSidebarPrimitives'
import { useI18n } from '@/i18n/useI18n'
import type { FsPathMetadata } from '@/services/fsApi'

type RightSidebarPropertiesPanelProps = {
  outlineCount: number
  backlinksCount: number
  documentStats: {
    lines: number
    words: number
  }
  displayMetadata: FsPathMetadata | null
  loadingMetadata: boolean
}

const formatBytes = (size: number) => {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = size
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

const MetadataSkeleton = ({ label }: { label: string }) => (
  <div aria-busy="true" aria-label={label} className="flex flex-col gap-2" role="status">
    <div className="grid grid-cols-2 gap-2">
      <Skeleton aria-hidden="true" className="h-12" />
      <Skeleton aria-hidden="true" className="h-12" />
      <Skeleton aria-hidden="true" className="h-12" />
      <Skeleton aria-hidden="true" className="h-12" />
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Skeleton aria-hidden="true" className="h-12" />
      <Skeleton aria-hidden="true" className="h-12" />
      <Skeleton aria-hidden="true" className="h-12" />
      <Skeleton aria-hidden="true" className="h-12" />
    </div>
    <Skeleton aria-hidden="true" className="h-11" />
    <Skeleton aria-hidden="true" className="h-11" />
  </div>
)

export const RightSidebarPropertiesPanel = ({
  outlineCount,
  backlinksCount,
  documentStats,
  displayMetadata,
  loadingMetadata,
}: RightSidebarPropertiesPanelProps) => {
  const { t } = useI18n()

  return (
    <ScrollArea className="h-full" viewportClassName="p-2">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('inspector.properties')}
        </div>
        {loadingMetadata && (
          <Badge variant="secondary" className="text-[10px]">
            {t('inspector.loading')}
          </Badge>
        )}
      </div>
      {loadingMetadata && !displayMetadata ? (
        <MetadataSkeleton label={t('inspector.loading')} />
      ) : !displayMetadata ? (
        <AppEmptyState
          compact
          className="min-h-24 flex-none border-sidebar-border/70 bg-muted/20 px-3 py-4 md:p-4"
          role="note"
          title={t('inspector.none')}
          titleClassName="text-[11px] font-normal text-muted-foreground"
          titleLevel={3}
        />
      ) : (
        <div className="flex flex-col gap-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <PropertyCell label={t('status.lines')} value={documentStats.lines} />
            <PropertyCell label={t('status.words')} value={documentStats.words} />
            <PropertyCell label={t('inspector.outline')} value={outlineCount} />
            <PropertyCell label={t('inspector.backlinks')} value={backlinksCount} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <PropertyCell label={t('inspector.kind')} value={displayMetadata.kind} />
            <PropertyCell
              label={t('inspector.size')}
              value={formatBytes(displayMetadata.size_bytes)}
            />
            <PropertyCell
              label={t('inspector.modified')}
              value={
                displayMetadata.modified_ms
                  ? new Date(displayMetadata.modified_ms).toLocaleString()
                  : t('inspector.unknown')
              }
            />
            <PropertyCell
              label={t('inspector.readonly')}
              value={displayMetadata.readonly ? t('common.yes') : t('common.no')}
            />
          </div>
          <div>
            <div className="text-muted-foreground">{t('inspector.path')}</div>
            <div className="break-all font-medium">{displayMetadata.path}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t('inspector.absolutePath')}</div>
            <div className="break-all">{displayMetadata.absolute_path}</div>
          </div>
        </div>
      )}
    </ScrollArea>
  )
}
