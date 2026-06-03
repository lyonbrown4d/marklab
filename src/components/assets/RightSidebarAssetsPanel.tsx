import { useEffect, useRef, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { InspectorEmptyState } from '@/components/RightSidebarPrimitives'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AssetSection } from '@/components/assets/AssetList'
import { copyText } from '@/components/file-tree/fileTreeActions'
import type { MarkdownAssetReference, MarkdownAssetReport } from '@/logic/assets'
import { revealPathInSystem } from '@/runtime/opener'
import { fsApi } from '@/services/fsApi'

type RightSidebarAssetsPanelProps = {
  report: MarkdownAssetReport
}

type AssetAction = 'copy' | 'open' | 'reveal'

export const RightSidebarAssetsPanel = ({ report }: RightSidebarAssetsPanelProps) => {
  const mountedRef = useRef(true)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const runAssetAction = async (
    asset: MarkdownAssetReference,
    action: AssetAction,
    task: () => Promise<void>,
  ) => {
    const actionId = `${asset.id}:${action}`
    setPendingAction(actionId)
    setError(null)

    try {
      await task()
    } catch (error) {
      if (!mountedRef.current) return
      setError(error instanceof Error ? error.message : `Failed to ${action} asset`)
    } finally {
      if (mountedRef.current) {
        setPendingAction((current) => (current === actionId ? null : current))
      }
    }
  }

  const handleCopyPath = (asset: MarkdownAssetReference) =>
    runAssetAction(asset, 'copy', () => copyText(asset.targetPath ?? asset.target))

  const handleOpenAsset = (asset: MarkdownAssetReference) => {
    if (!asset.targetPath) return
    return runAssetAction(asset, 'open', () => fsApi.openPathInSystem(asset.targetPath ?? ''))
  }

  const handleRevealAsset = (asset: MarkdownAssetReference) => {
    if (!asset.targetPath) return
    return runAssetAction(asset, 'reveal', async () => {
      const metadata = await fsApi.getPathMetadata(asset.targetPath ?? '')
      await revealPathInSystem(metadata.absolute_path)
    })
  }

  return (
    <ScrollArea className="h-full" viewportClassName="p-2">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Assets</div>
            <div className="text-[11px] text-muted-foreground">
              Markdown image and attachment references
            </div>
          </div>
          {report.indexed && (
            <Badge
              variant="secondary"
              className={
                report.workspaceMissingCount > 0 ? 'bg-destructive/10 text-destructive' : ''
              }
            >
              {report.workspaceMissingCount} missing
            </Badge>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
            {error}
          </div>
        )}

        {!report.indexed ? (
          <InspectorEmptyState
            icon={<ImageOff className="h-4 w-4" />}
            title="Workspace index unavailable"
            description="Assets will appear after indexing finishes."
          />
        ) : (
          <>
            <AssetSection
              title={`Current file assets (${report.currentMissingCount} missing)`}
              count={report.currentAssetCount}
              emptyTitle={report.currentPath ? 'No local assets' : 'No active file'}
              emptyDescription={report.currentPath ?? 'Open a Markdown file to inspect assets.'}
              limit={report.limit}
              assets={report.currentAssets}
              pendingAction={pendingAction}
              onCopyPath={handleCopyPath}
              onOpenAsset={handleOpenAsset}
              onRevealAsset={handleRevealAsset}
            />

            <AssetSection
              title="Workspace missing assets"
              count={report.workspaceMissingCount}
              emptyTitle="No missing assets"
              emptyDescription="All indexed local asset references resolve in this workspace."
              limit={report.limit}
              assets={report.workspaceMissingAssets}
              pendingAction={pendingAction}
              showSourcePath
              onCopyPath={handleCopyPath}
              onOpenAsset={handleOpenAsset}
              onRevealAsset={handleRevealAsset}
            />
          </>
        )}
      </div>
    </ScrollArea>
  )
}
