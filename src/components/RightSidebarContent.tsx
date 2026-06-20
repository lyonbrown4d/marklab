import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { InspectorEmptyState } from '@/components/RightSidebarPrimitives'
import { RightSidebarCollapsedRail } from '@/components/RightSidebarCollapsedRail'
import { RightSidebarAssetsPanel } from '@/components/assets/RightSidebarAssetsPanel'
import { RightSidebarKnowledgePanel } from '@/components/RightSidebarKnowledgePanel'
import { RightSidebarPropertiesPanel } from '@/components/RightSidebarPropertiesPanel'
import { RightSidebarProblemsPanel } from '@/components/RightSidebarProblemsPanel'
import { RightSidebarSummary } from '@/components/RightSidebarSummary'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import type { BacklinkReference } from '@/logic/backlinks'
import type { MarkdownAssetReport } from '@/logic/assets'
import type {
  KnowledgeInsights,
  KnowledgeLinkReference,
  KnowledgeMissingReference,
} from '@/logic/knowledge'
import type { MarkdownSourceDiagnostic } from '@/logic/markdownDiagnostics'
import { createFileLabel } from '@/logic/paths'
import type { FsPathMetadata } from '@/services/fsApi'
import type { ViewMode } from '@/store/appTypes'
import { Badge } from '@/components/ui/badge'
import { CircleAlert, FileText, ImageIcon, Link2, ListTree, Network } from 'lucide-react'

const inspectorTabs = [
  { value: 'outline', labelKey: 'inspector.outline', icon: ListTree },
  { value: 'backlinks', labelKey: 'inspector.backlinks', icon: Link2 },
  { value: 'knowledge', labelKey: 'inspector.knowledge', icon: Network },
  { value: 'problems', labelKey: 'inspector.problems', icon: CircleAlert },
  { value: 'assets', labelKey: 'inspector.assets', icon: ImageIcon },
  { value: 'properties', labelKey: 'inspector.properties', icon: FileText },
] as const

type InspectorTabValue = (typeof inspectorTabs)[number]['value']

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
  knowledge: KnowledgeInsights
  documentStats: {
    lines: number
    words: number
  }
  displayMetadata: FsPathMetadata | null
  loadingMetadata: boolean
  assetReport: MarkdownAssetReport
  onOpenHeading: (slug: string) => void
  onOpenBacklink: (backlink: SidebarBacklink) => void
  onOpenKnowledgeFile: (path: string) => void
  onOpenKnowledgeReference: (reference: KnowledgeLinkReference) => void
  onOpenMissingLink: (reference: KnowledgeMissingReference) => void
  onOpenProblem: (problem: MarkdownSourceDiagnostic) => void
}

type RightSidebarCollapsedProps = {
  tabs: string[]
  totalFiles: number
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
  knowledge,
  documentStats,
  displayMetadata,
  loadingMetadata,
  assetReport,
  onOpenHeading,
  onOpenBacklink,
  onOpenKnowledgeFile,
  onOpenKnowledgeReference,
  onOpenMissingLink,
  onOpenProblem,
}: RightSidebarContentProps) => {
  const { t } = useI18n()
  const getTabCount = (value: InspectorTabValue) => {
    if (value === 'outline') {
      return outline.length
    }

    if (value === 'backlinks') {
      return backlinks.length
    }

    if (value === 'problems') {
      return problems.length
    }

    return null
  }

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

      {!targetPath ? (
        <div className="mt-1.5 min-h-0 flex-1 p-1">
          <InspectorEmptyState
            icon={<FileText className="size-4" aria-hidden="true" />}
            title={t('inspector.none')}
            description={t('editor.empty')}
          />
        </div>
      ) : (
        <Tabs defaultValue="outline" className="mt-1.5 flex min-h-0 flex-1 flex-col gap-1.5">
          <TooltipProvider>
            <TabsList className="flex h-9 w-full min-w-0 gap-0.5 rounded-lg border border-sidebar-border bg-background/70 p-0.5">
              {inspectorTabs.map(({ value, labelKey, icon: Icon }) => {
                const label = t(labelKey)
                const count = getTabCount(value)
                const hasCount = count !== null && count > 0

                return (
                  <Tooltip key={value}>
                    <TooltipTrigger asChild>
                      <TabsTrigger
                        value={value}
                        aria-label={label}
                        className={cn(
                          'group h-8 min-w-0 flex-1 gap-1 rounded-md px-1 text-[11px] font-medium text-muted-foreground transition-colors',
                          'hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground',
                          'focus-visible:ring-1 focus-visible:ring-ring',
                          'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
                          '[&_svg]:size-3.5 [&_svg]:shrink-0',
                        )}
                      >
                        <Icon aria-hidden="true" />
                        <span className="hidden truncate min-[1360px]:inline">{label}</span>
                        {hasCount && (
                          <Badge
                            variant="secondary"
                            className="h-4 min-w-4 rounded px-1 text-[10px] leading-none"
                          >
                            {count}
                          </Badge>
                        )}
                      </TabsTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="center">
                      {label}
                      {hasCount ? ` · ${count}` : ''}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </TabsList>
          </TooltipProvider>

          <TabsContent value="outline" className="m-0 min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full" viewportClassName="p-1">
              {outline.length === 0 ? (
                <InspectorEmptyState
                  icon={<ListTree className="size-4" aria-hidden="true" />}
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
          </TabsContent>

          <TabsContent value="backlinks" className="m-0 min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full" viewportClassName="p-1">
              {backlinks.length === 0 ? (
                <InspectorEmptyState
                  icon={<Link2 className="size-4" aria-hidden="true" />}
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

          <TabsContent value="knowledge" className="m-0 min-h-0 flex-1 overflow-hidden">
            <RightSidebarKnowledgePanel
              targetPath={targetPath}
              targetLabel={targetLabel}
              knowledge={knowledge}
              onOpenFile={onOpenKnowledgeFile}
              onOpenReference={onOpenKnowledgeReference}
              onOpenMissing={onOpenMissingLink}
            />
          </TabsContent>

          <TabsContent value="problems" className="m-0 min-h-0 flex-1 overflow-hidden">
            <RightSidebarProblemsPanel
              targetPath={targetPath}
              targetLabel={targetLabel}
              problems={problems}
              errorProblems={errorProblems}
              warningProblems={warningProblems}
              onOpenProblem={onOpenProblem}
            />
          </TabsContent>

          <TabsContent value="assets" className="m-0 min-h-0 flex-1 overflow-hidden">
            <RightSidebarAssetsPanel report={assetReport} />
          </TabsContent>

          <TabsContent value="properties" className="m-0 min-h-0 flex-1 overflow-hidden">
            <RightSidebarPropertiesPanel
              outlineCount={outline.length}
              backlinksCount={backlinks.length}
              documentStats={documentStats}
              displayMetadata={displayMetadata}
              loadingMetadata={loadingMetadata}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

export const RightSidebarCollapsed = ({ tabs, totalFiles }: RightSidebarCollapsedProps) => {
  return <RightSidebarCollapsedRail tabs={tabs} totalFiles={totalFiles} />
}
