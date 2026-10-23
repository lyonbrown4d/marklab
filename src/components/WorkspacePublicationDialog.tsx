import { useCallback } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { DocumentLoadingState } from '@/components/loading/DocumentLoadingState'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WorkspacePublicationChapterPanel } from '@/components/workspace-publication/WorkspacePublicationChapterPanel'
import { WorkspacePublicationPreview } from '@/components/workspace-publication/WorkspacePublicationPreview'
import { WorkspacePublicationSettingsPanel } from '@/components/workspace-publication/WorkspacePublicationSettingsPanel'
import { useWorkspacePublicationDialog } from '@/components/workspace-publication/useWorkspacePublicationDialog'
import { useI18n } from '@/i18n/useI18n'

type WorkspacePublicationDialogProps = {
  onOpenChange: (open: boolean) => void
  open: boolean
  rootPath: string
}

const WorkspacePublicationDialog = ({
  onOpenChange,
  open,
  rootPath,
}: WorkspacePublicationDialogProps) => {
  const { t } = useI18n()
  const handleExportQueued = useCallback(() => {
    onOpenChange(false)
    toast.success(t('workspaceExport.exportQueued'))
  }, [onOpenChange, t])
  const controller = useWorkspacePublicationDialog({
    onExportQueued: handleExportQueued,
    rootPath,
  })

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="flex flex-col h-[min(920px,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)] 2xl:max-w-[1460px]"
        showCloseButton
      >
        <header className="flex h-16 items-center gap-4 border-b px-6 pr-14">
          <DialogTitle className="shrink-0 text-base">{t('workspaceExport.title')}</DialogTitle>
          <div className="h-5 w-px bg-border" />
          <span className="min-w-0 truncate text-sm text-muted-foreground">
            {controller.options.title || t('workspaceExport.preparing')}
          </span>
          {!controller.loading && controller.chapters.length > 0 ? (
            <span className="ml-auto hidden shrink-0 items-center gap-1.5 text-xs text-emerald-600 lg:flex dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              {t('workspaceExport.linkAnalysisComplete')}
            </span>
          ) : null}
          <DialogDescription className="sr-only">
            {t('workspaceExport.description')}
          </DialogDescription>
        </header>
        {controller.loading ? (
          <DocumentLoadingState
            className="min-h-0 flex-1 p-6"
            label={t('workspaceExport.preparing')}
          />
        ) : controller.chapters.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-medium">
              {controller.error ? t('workspaceExport.loadFailed') : t('workspaceExport.empty')}
            </p>
            {controller.error ? (
              <p className="max-w-xl text-xs text-destructive">{controller.error}</p>
            ) : null}
          </div>
        ) : (
          <Tabs
            defaultValue="chapters"
            className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-0 lg:grid-cols-[minmax(230px,280px)_minmax(360px,1fr)_minmax(250px,290px)] lg:grid-rows-1"
          >
            <TabsList
              className="mx-4 my-2 w-auto lg:hidden"
              aria-label={t('workspaceExport.title')}
            >
              <TabsTrigger value="chapters">{t('workspaceExport.chapters')}</TabsTrigger>
              <TabsTrigger value="preview">{t('workspaceExport.preview')}</TabsTrigger>
              <TabsTrigger value="settings">{t('workspaceExport.printSettings')}</TabsTrigger>
            </TabsList>
            <TabsContent
              forceMount
              value="chapters"
              className="col-start-1 row-start-2 flex min-h-0 min-w-0 data-[state=inactive]:hidden lg:row-start-1 lg:data-[state=inactive]:flex [&>aside]:min-w-0 [&>aside]:flex-1"
            >
              <WorkspacePublicationChapterPanel
                chapters={controller.chapters}
                onMove={controller.moveChapter}
                onMoveBy={controller.moveChapterBy}
                onQueryChange={controller.setQuery}
                onSelect={controller.setSelectedPath}
                onToggle={controller.toggleChapter}
                onToggleAll={controller.toggleAll}
                orphanCount={controller.orphanCount}
                query={controller.query}
                selectedPath={controller.selectedPath}
              />
            </TabsContent>
            <TabsContent
              forceMount
              value="preview"
              className="col-start-1 row-start-2 flex min-h-0 min-w-0 data-[state=inactive]:hidden lg:col-start-2 lg:row-start-1 lg:data-[state=inactive]:flex [&>section]:min-w-0 [&>section]:flex-1"
            >
              <WorkspacePublicationPreview
                options={controller.options}
                orphanCount={controller.orphanCount}
                pages={controller.previewPages}
                selectedPath={controller.selectedPath}
              />
            </TabsContent>
            <TabsContent
              forceMount
              value="settings"
              className="col-start-1 row-start-2 flex min-h-0 min-w-0 data-[state=inactive]:hidden lg:col-start-3 lg:row-start-1 lg:data-[state=inactive]:flex [&>aside]:min-w-0 [&>aside]:flex-1"
            >
              <WorkspacePublicationSettingsPanel
                estimatedPages={controller.estimatedPages}
                exporting={controller.exporting}
                onCancel={() => onOpenChange(false)}
                onExport={() => void controller.exportPublication()}
                onOptionChange={controller.setOption}
                options={controller.options}
                selectedCount={controller.includedChapters.length}
                totalWords={controller.totalWords}
              />
            </TabsContent>
          </Tabs>
        )}
        {controller.error && controller.chapters.length > 0 ? (
          <div
            role="alert"
            className="shrink-0 border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive"
          >
            {t('workspaceExport.exportFailed')}: {controller.error}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export default WorkspacePublicationDialog
