import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { InspectorEmptyState, PropertyCell } from '@/components/RightSidebarPrimitives'
import { RightSidebarCollapsedRail } from '@/components/RightSidebarCollapsedRail'
import { RightSidebarAssetsPanel } from '@/components/assets/RightSidebarAssetsPanel'
import { RightSidebarProblemsPanel } from '@/components/RightSidebarProblemsPanel'
import { RightSidebarSummary } from '@/components/RightSidebarSummary'
import { useI18n } from '@/i18n/useI18n'
import type { BacklinkReference } from '@/logic/backlinks'
import type { MarkdownAssetReport } from '@/logic/assets'
import type { MarkdownSourceDiagnostic } from '@/logic/markdownDiagnostics'
import { createFileLabel } from '@/logic/paths'
import type { FsPathMetadata } from '@/services/fsApi'
import type { ViewMode } from '@/store/useAppStore'
import { CircleAlert, FileText, ImageIcon, Link2, ListTree } from 'lucide-react'

type SidebarHeading = {
  level: number
  text: string
  slug: string
}

export type SidebarBacklink = BacklinkReference

type RightSidebarContentProps = {
  activePath: string | null
  targetPath: string | null
  targetLabel: string
  viewMode: ViewMode
  outline: SidebarHeading[]
  backlinks: SidebarBacklink[]
  problems: MarkdownSourceDiagnostic[]
  errorProblems: MarkdownSourceDiagnostic[]
  warningProblems: MarkdownSourceDiagnostic[]
  documentStats: {
    lines: number
    words: number
  }
  displayMetadata: FsPathMetadata | null
  loadingMetadata: boolean
  assetReport: MarkdownAssetReport
  onOpenHeading: (slug: string) => void
  onOpenBacklink: (backlink: SidebarBacklink) => void
  onOpenProblem: (problem: MarkdownSourceDiagnostic) => void
}

type RightSidebarCollapsedProps = {
  tabs: string[]
  totalFiles: number
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

export const RightSidebarContent = ({
  activePath,
  targetPath,
  targetLabel,
  viewMode,
  outline,
  backlinks,
  problems,
  errorProblems,
  warningProblems,
  documentStats,
  displayMetadata,
  loadingMetadata,
  assetReport,
  onOpenHeading,
  onOpenBacklink,
  onOpenProblem,
}: RightSidebarContentProps) => {
  const { t } = useI18n()

  return (
    <div className="flex h-full flex-col p-1.5">
      <RightSidebarSummary
        activePath={activePath}
        targetPath={targetPath}
        targetLabel={targetLabel}
        viewMode={viewMode}
        outlineCount={outline.length}
        backlinksCount={backlinks.length}
        problemsCount={problems.length}
        lineCount={documentStats.lines}
      />

      <Tabs defaultValue="outline" className="mt-1.5 flex min-h-0 flex-1 flex-col">
        <TabsList className="grid h-8 w-full grid-cols-5 rounded-md border border-sidebar-border bg-background/65 p-0.5">
          <TabsTrigger value="outline" className="gap-1 rounded px-1 text-[11px]">
            <ListTree className="h-3.5 w-3.5" />
            {t('inspector.outline')}
          </TabsTrigger>
          <TabsTrigger value="backlinks" className="gap-1 rounded px-1 text-[11px]">
            <Link2 className="h-3.5 w-3.5" />
            {t('inspector.backlinks')}
          </TabsTrigger>
          <TabsTrigger value="problems" className="gap-1 rounded px-1 text-[11px]">
            <CircleAlert className="h-3.5 w-3.5" />
            {t('inspector.problems')}
          </TabsTrigger>
          <TabsTrigger value="assets" className="gap-1 rounded px-1 text-[11px]">
            <ImageIcon className="h-3.5 w-3.5" />
            {t('inspector.assets')}
          </TabsTrigger>
          <TabsTrigger value="properties" className="gap-1 rounded px-1 text-[11px]">
            <FileText className="h-3.5 w-3.5" />
            {t('inspector.properties')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="outline" className="mt-1 min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full" viewportClassName="p-1">
            {!targetPath ? (
              <InspectorEmptyState
                icon={<FileText className="h-4 w-4" />}
                title={t('inspector.none')}
                description={t('editor.empty')}
              />
            ) : outline.length === 0 ? (
              <InspectorEmptyState
                icon={<ListTree className="h-4 w-4" />}
                title={t('inspector.noOutline')}
                description={targetLabel}
              />
            ) : (
              <div className="flex flex-col gap-1.5">
                {outline.map((heading) => (
                  <Button
                    key={`${heading.slug}-${heading.level}`}
                    variant="ghost"
                    size="sm"
                    className="inspector-row h-7 w-full justify-start rounded-md px-2 text-xs"
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
        </TabsContent>

        <TabsContent value="backlinks" className="mt-1 min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full" viewportClassName="p-1">
            {!targetPath ? (
              <InspectorEmptyState
                icon={<FileText className="h-4 w-4" />}
                title={t('inspector.none')}
                description={t('editor.empty')}
              />
            ) : backlinks.length === 0 ? (
              <InspectorEmptyState
                icon={<Link2 className="h-4 w-4" />}
                title={t('inspector.noBacklinks')}
                description={targetLabel}
              />
            ) : (
              <div className="flex flex-col gap-1.5">
                {backlinks.map((backlink, index) => (
                  <Button
                    key={`${backlink.sourcePath}-${index}`}
                    variant="ghost"
                    size="sm"
                    className="inspector-row h-auto min-h-11 w-full items-start justify-start rounded-md px-2 py-1.5 text-left"
                    onClick={() => onOpenBacklink(backlink)}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        {createFileLabel(backlink.sourcePath)}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[11px] text-muted-foreground">
                          {backlink.text}
                        </span>
                        <Badge
                          variant="secondary"
                          className="shrink-0 rounded px-1 py-0 text-[10px]"
                        >
                          L{backlink.line}:{backlink.column}
                        </Badge>
                      </span>
                      {backlink.targetAnchor && (
                        <span className="block truncate text-[10px] text-muted-foreground/70">
                          #{backlink.targetAnchor}
                        </span>
                      )}
                      {backlink.context && (
                        <span className="mt-0.5 block whitespace-normal text-[11px] leading-4 text-muted-foreground/80">
                          {backlink.context}
                        </span>
                      )}
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="problems" className="mt-1 min-h-0 flex-1 overflow-hidden">
          <RightSidebarProblemsPanel
            targetPath={targetPath}
            targetLabel={targetLabel}
            problems={problems}
            errorProblems={errorProblems}
            warningProblems={warningProblems}
            onOpenProblem={onOpenProblem}
          />
        </TabsContent>

        <TabsContent value="assets" className="mt-1 min-h-0 flex-1 overflow-hidden">
          <RightSidebarAssetsPanel report={assetReport} />
        </TabsContent>

        <TabsContent value="properties" className="mt-1 min-h-0 flex-1 overflow-hidden">
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
            {!displayMetadata ? (
              <div className="text-xs text-muted-foreground">{t('inspector.none')}</div>
            ) : (
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <PropertyCell label={t('status.lines')} value={documentStats.lines} />
                  <PropertyCell label={t('status.words')} value={documentStats.words} />
                  <PropertyCell label={t('inspector.outline')} value={outline.length} />
                  <PropertyCell label={t('inspector.backlinks')} value={backlinks.length} />
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
        </TabsContent>
      </Tabs>
    </div>
  )
}

export const RightSidebarCollapsed = ({ tabs, totalFiles }: RightSidebarCollapsedProps) => {
  return <RightSidebarCollapsedRail tabs={tabs} totalFiles={totalFiles} />
}
