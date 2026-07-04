import { useEffect, useRef, useState } from 'react'
import { ImageOff } from 'lucide-react'
import AppAlert from '@/components/AppAlert'
import { InspectorEmptyState } from '@/components/RightSidebarPrimitives'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AssetSection } from '@/components/assets/AssetList'
import { useI18n } from '@/i18n/useI18n'
import { copyText } from '@/components/file-tree/fileTreeActions'
import { cn } from '@/lib/utils'
import type { MarkdownAssetReference, MarkdownAssetReport } from '@/logic/assets'
import { revealPathInSystem } from '@/runtime/opener'
import { fsApi } from '@/services/fsApi'

type RightSidebarAssetsPanelProps = {
  report: MarkdownAssetReport
}

type AssetAction = 'copy' | 'open' | 'reveal'

export const RightSidebarAssetsPanel = ({ report }: RightSidebarAssetsPanelProps) => {
  const { t } = useI18n()
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
      setError(
        error instanceof Error
          ? error.message
          : t('assets.actionFailed', { action: t(`assets.action.${action}`) }),
      )
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
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('assets.title')}
            </div>
            <div className="text-[11px] text-muted-foreground">{t('assets.description')}</div>
          </div>
          {report.indexed && (
            <Badge
              variant="secondary"
              className={cn(
                report.workspaceMissingCount > 0 && 'bg-destructive/10 text-destructive',
              )}
            >
              {t('assets.missingCount', { count: report.workspaceMissingCount })}
            </Badge>
          )}
        </div>

        {error && (
          <AppAlert tone="destructive" className="px-2 py-1.5 text-[11px]">
            {error}
          </AppAlert>
        )}

        {!report.indexed ? (
          <InspectorEmptyState
            icon={<ImageOff className="size-4" />}
            title={t('assets.indexUnavailableTitle')}
            description={t('assets.indexUnavailableDescription')}
          />
        ) : (
          <>
            <AssetSection
              title={t('assets.currentFileAssets', { count: report.currentMissingCount })}
              count={report.currentAssetCount}
              emptyTitle={report.currentPath ? t('assets.noLocalAssets') : t('assets.noActiveFile')}
              emptyDescription={report.currentPath ?? t('assets.openFileToInspect')}
              limit={report.limit}
              assets={report.currentAssets}
              pendingAction={pendingAction}
              onCopyPath={handleCopyPath}
              onOpenAsset={handleOpenAsset}
              onRevealAsset={handleRevealAsset}
            />

            <AssetSection
              title={t('assets.workspaceMissingAssets')}
              count={report.workspaceMissingCount}
              emptyTitle={t('assets.noMissingAssets')}
              emptyDescription={t('assets.noMissingAssetsDescription')}
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
