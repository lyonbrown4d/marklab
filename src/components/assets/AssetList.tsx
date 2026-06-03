import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, FolderOpen, ImageOff } from 'lucide-react'
import { InspectorEmptyState } from '@/components/RightSidebarPrimitives'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { MarkdownAssetReference } from '@/logic/assets'
import { createFileLabel } from '@/logic/paths'

type AssetSectionProps = {
  title: string
  count: number
  assets: MarkdownAssetReference[]
  emptyTitle: string
  emptyDescription: string
  limit: number
  pendingAction: string | null
  showSourcePath?: boolean
  onCopyPath: (asset: MarkdownAssetReference) => void
  onOpenAsset: (asset: MarkdownAssetReference) => void
  onRevealAsset: (asset: MarkdownAssetReference) => void
}

type AssetRowProps = {
  asset: MarkdownAssetReference
  pendingAction: string | null
  showSourcePath: boolean
  onCopyPath: (asset: MarkdownAssetReference) => void
  onOpenAsset: (asset: MarkdownAssetReference) => void
  onRevealAsset: (asset: MarkdownAssetReference) => void
}

export const AssetSection = ({
  title,
  count,
  assets,
  emptyTitle,
  emptyDescription,
  limit,
  pendingAction,
  showSourcePath = false,
  onCopyPath,
  onOpenAsset,
  onRevealAsset,
}: AssetSectionProps) => (
  <section className="space-y-1.5">
    <div className="flex items-center justify-between text-xs font-medium">
      <span>{title}</span>
      <Badge variant="outline" className="text-[10px]">
        {count}
      </Badge>
    </div>

    {assets.length === 0 ? (
      <InspectorEmptyState
        icon={<ImageOff className="h-4 w-4" />}
        title={emptyTitle}
        description={emptyDescription}
      />
    ) : (
      <div className="space-y-1.5">
        {assets.map((asset) => (
          <AssetRow
            key={asset.id}
            asset={asset}
            pendingAction={pendingAction}
            showSourcePath={showSourcePath}
            onCopyPath={onCopyPath}
            onOpenAsset={onOpenAsset}
            onRevealAsset={onRevealAsset}
          />
        ))}
        {count > limit && (
          <div className="rounded-md border border-sidebar-border/70 bg-background/45 px-2 py-1 text-[11px] text-muted-foreground">
            Showing first {limit} of {count} assets.
          </div>
        )}
      </div>
    )}
  </section>
)

const AssetRow = ({
  asset,
  pendingAction,
  showSourcePath,
  onCopyPath,
  onOpenAsset,
  onRevealAsset,
}: AssetRowProps) => {
  const canOpen = asset.status === 'available' && Boolean(asset.targetPath)
  const targetLabel = asset.targetPath ? createFileLabel(asset.targetPath) : asset.target

  return (
    <div className="rounded-md border border-sidebar-border/70 bg-background/55 p-2">
      <div className="flex min-w-0 gap-2">
        <span className="mt-0.5 shrink-0 text-muted-foreground">
          {asset.status === 'missing' ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-xs font-medium">{targetLabel}</span>
            <AssetStatusBadge status={asset.status} />
          </div>
          <div className="mt-0.5 break-all text-[11px] text-muted-foreground">
            {asset.targetPath ?? asset.target}
          </div>
          {showSourcePath && (
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
              {asset.sourcePath}:{asset.line}:{asset.column}
            </div>
          )}
          {asset.context && (
            <div className="mt-1 max-h-8 overflow-hidden text-[11px] leading-4 text-muted-foreground/80">
              {asset.context}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            <AssetActionButton
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              label="Open"
              disabled={!canOpen}
              loading={pendingAction === `${asset.id}:open`}
              onClick={() => onOpenAsset(asset)}
            />
            <AssetActionButton
              icon={<FolderOpen className="h-3.5 w-3.5" />}
              label="Reveal"
              disabled={!canOpen}
              loading={pendingAction === `${asset.id}:reveal`}
              onClick={() => onRevealAsset(asset)}
            />
            <AssetActionButton
              icon={<Copy className="h-3.5 w-3.5" />}
              label="Copy path"
              loading={pendingAction === `${asset.id}:copy`}
              onClick={() => onCopyPath(asset)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

const AssetStatusBadge = ({ status }: { status: MarkdownAssetReference['status'] }) => {
  if (status === 'missing') {
    return (
      <Badge variant="destructive" className="shrink-0 text-[10px]">
        missing
      </Badge>
    )
  }

  if (status === 'unverified') {
    return (
      <Badge variant="outline" className="shrink-0 text-[10px]">
        unverified
      </Badge>
    )
  }

  return (
    <Badge variant="secondary" className="shrink-0 text-[10px]">
      ready
    </Badge>
  )
}

const AssetActionButton = ({
  icon,
  label,
  disabled = false,
  loading = false,
  onClick,
}: {
  icon: ReactNode
  label: string
  disabled?: boolean
  loading?: boolean
  onClick: () => void
}) => (
  <Button
    variant="outline"
    size="sm"
    className="h-6 gap-1 px-1.5 text-[11px]"
    disabled={disabled || loading}
    onClick={onClick}
  >
    {icon}
    {loading ? 'Working' : label}
  </Button>
)
