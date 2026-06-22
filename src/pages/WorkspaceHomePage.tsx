import {
  FileText,
  FolderOpen,
  Hash,
  Layers3,
  Link2,
  Network,
  Search,
  TriangleAlert,
} from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLogo from '@/components/AppLogo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useI18n } from '@/i18n/useI18n'
import { pathToAllPagesRoute, pathToWorkspaceGraphRoute } from '@/logic/routing'
import { appApi } from '@/services/appApi'
import type { FsIndexedMarkdownFile, FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry } from '@/store/appTypes'
import { requestFileSearchFocus } from '@/utils/appEvents'
import { useLayoutContext } from '@/pages/useLayoutContext'
import { EmptyBlock, ListButton, Panel, QuickButton } from '@/pages/workspaceHomeUi'

type Metrics = {
  files: number
  folders: number
  indexedFiles: number
  headings: number
  links: number
  issues: number
  indexReady: boolean
}

type DocumentSummary = {
  path: string
  headings: number | null
  links: number | null
}

const formatter = new Intl.NumberFormat()

const count = (value: number) => formatter.format(value)

const pathName = (path: string) => {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

const hasBrokenLink = (link: FsIndexedMarkdownFile['links'][number]) => {
  if (link.is_external || !link.target.trim()) return false
  if (!link.target_path) return true
  return Boolean(link.target_anchor && !link.target_heading_slug)
}

const hasBrokenAsset = (asset: NonNullable<FsIndexedMarkdownFile['assets']>[number]) =>
  !asset.is_external && asset.target.trim().length > 0 && !asset.target_path

const getMetrics = (entries: FileEntry[], workspaceIndex: FsWorkspaceIndex | null): Metrics => {
  const indexedFiles = workspaceIndex?.files ?? []
  const indexed = indexedFiles.reduce(
    (next, file) => ({
      headings: next.headings + file.headings.length,
      links: next.links + file.links.length,
      issues:
        next.issues +
        file.links.filter(hasBrokenLink).length +
        (file.assets ?? []).filter(hasBrokenAsset).length,
    }),
    { headings: 0, links: 0, issues: 0 },
  )

  return {
    files: entries.filter((entry) => entry.kind === 'file').length,
    folders: entries.filter((entry) => entry.kind === 'folder').length,
    indexedFiles: indexedFiles.length,
    headings: indexed.headings,
    links: indexed.links,
    issues: indexed.issues,
    indexReady: Boolean(workspaceIndex),
  }
}

const getDocuments = (
  files: FileEntry[],
  workspaceIndex: FsWorkspaceIndex | null,
): DocumentSummary[] => {
  const indexedFiles = workspaceIndex?.files ?? []
  if (indexedFiles.length > 0) {
    return indexedFiles.slice(0, 5).map((file) => ({
      path: file.path,
      headings: file.headings.length,
      links: file.links.length,
    }))
  }

  return files
    .filter((entry) => entry.kind === 'file')
    .slice(0, 5)
    .map((file) => ({ path: file.path, headings: null, links: null }))
}

const openProjectPicker = () => {
  void appApi.menuDispatch('file.open_project')
}

const WorkspaceHomePage = () => {
  const navigate = useNavigate()
  const { t } = useI18n()
  const { files, workspaceIndex, rootPath, recentProjects, onOpenFile, onOpenProject } =
    useLayoutContext()
  const metrics = useMemo(() => getMetrics(files, workspaceIndex), [files, workspaceIndex])
  const documents = useMemo(() => getDocuments(files, workspaceIndex), [files, workspaceIndex])
  const firstDocument = documents[0]?.path
  const workspaceName = rootPath ? pathName(rootPath) : t('workspaceHome.internalWorkspace')
  const workspacePath = rootPath || t('workspaceHome.builtInWorkspace')
  const indexCaption = metrics.indexReady
    ? t('workspaceHome.indexedMarkdownFiles', { count: count(metrics.indexedFiles) })
    : t('workspaceHome.indexPending')
  const stats = [
    {
      label: t('workspaceHome.files'),
      value: count(metrics.files),
      caption: t('workspaceHome.foldersTracked', { count: count(metrics.folders) }),
      icon: <FileText className="size-5 text-muted-foreground" />,
    },
    {
      label: t('workspaceHome.titles'),
      value: metrics.indexReady ? count(metrics.headings) : '...',
      caption: indexCaption,
      icon: <Hash className="size-5 text-muted-foreground" />,
    },
    {
      label: t('workspaceHome.links'),
      value: metrics.indexReady ? count(metrics.links) : '...',
      caption: t('workspaceHome.linksCaption'),
      icon: <Link2 className="size-5 text-muted-foreground" />,
    },
    {
      label: t('workspaceHome.issues'),
      value: metrics.indexReady ? count(metrics.issues) : '...',
      caption: t('workspaceHome.issuesCaption'),
      icon: <TriangleAlert className="size-5 text-destructive" />,
    },
  ]

  return (
    <div className="h-full overflow-auto bg-background p-4 text-foreground md:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <Card className="gap-0 py-0">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 max-w-2xl">
                <div className="flex items-center gap-3">
                  <AppLogo className="h-11 w-11" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                        {t('workspaceHome.eyebrow')}
                      </div>
                      <Badge variant={metrics.indexReady ? 'secondary' : 'outline'}>
                        {metrics.indexReady
                          ? t('workspaceHome.indexReady')
                          : t('workspaceHome.indexing')}
                      </Badge>
                    </div>
                    <h1 className="mt-1 truncate text-3xl font-semibold tracking-tight md:text-4xl">
                      {workspaceName}
                    </h1>
                  </div>
                </div>
                <p className="mt-5 text-sm leading-6 text-muted-foreground">
                  {t('workspaceHome.description')}
                </p>
                <div className="mt-4 rounded-lg border border-border/80 bg-muted/30 p-4 text-xs leading-5 text-muted-foreground">
                  <span className="block font-medium text-foreground">{workspaceName}</span>
                  <span className="break-all">{workspacePath}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button className="rounded-md" onClick={() => requestFileSearchFocus()}>
                  <Search data-icon="inline-start" />
                  {t('workspaceHome.searchWorkspace')}
                </Button>
                <Button
                  variant="secondary"
                  className="rounded-md"
                  onClick={() => navigate(pathToAllPagesRoute())}
                >
                  <Layers3 data-icon="inline-start" />
                  {t('workspaceHome.allPages')}
                </Button>
                <Button
                  variant="secondary"
                  className="rounded-md"
                  onClick={() => navigate(pathToWorkspaceGraphRoute())}
                >
                  <Network data-icon="inline-start" />
                  {t('workspaceHome.workspaceGraph')}
                </Button>
                <Button variant="ghost" className="rounded-md" onClick={openProjectPicker}>
                  <FolderOpen data-icon="inline-start" />
                  {t('actions.openProject')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="gap-0 py-0">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="rounded-lg bg-muted p-2">{stat.icon}</div>
                  <div className="text-right text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {stat.label}
                  </div>
                </div>
                <div className="mt-4 text-3xl font-semibold tracking-tight">{stat.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{stat.caption}</div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid min-h-[320px] gap-5 lg:grid-cols-[0.85fr_1fr_0.85fr]">
          <Panel
            title={t('workspaceHome.quickEntries')}
            subtitle={t('workspaceHome.quickSubtitle')}
          >
            <QuickButton icon={<Search />} onClick={requestFileSearchFocus}>
              {t('workspaceHome.findFileOrNote')}
            </QuickButton>
            <QuickButton icon={<Network />} onClick={() => navigate(pathToWorkspaceGraphRoute())}>
              {t('workspaceHome.exploreGraph')}
            </QuickButton>
            <QuickButton icon={<Layers3 />} onClick={() => navigate(pathToAllPagesRoute())}>
              {t('workspaceHome.browseAllPages')}
            </QuickButton>
            <QuickButton
              disabled={!firstDocument}
              icon={<FileText />}
              onClick={() => firstDocument && onOpenFile(firstDocument)}
            >
              {firstDocument
                ? t('workspaceHome.openDocument', { name: pathName(firstDocument) })
                : t('workspaceHome.noDocumentYet')}
            </QuickButton>
          </Panel>

          <Panel title={t('workspaceHome.documents')} subtitle={indexCaption}>
            {documents.length > 0 ? (
              documents.map((document) => (
                <ListButton key={document.path} onClick={() => onOpenFile(document.path)}>
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{document.path}</span>
                    <span className="block text-xs text-muted-foreground">
                      {document.headings === null
                        ? t('workspaceHome.waitingForIndex')
                        : t('workspaceHome.documentStats', {
                            headings: count(document.headings),
                            links: count(document.links ?? 0),
                          })}
                    </span>
                  </span>
                </ListButton>
              ))
            ) : (
              <EmptyBlock>{t('workspaceHome.noFiles')}</EmptyBlock>
            )}
          </Panel>

          <Panel
            title={t('workspaceHome.recentProjects')}
            subtitle={t('workspaceHome.recentSubtitle')}
          >
            {recentProjects.length > 0 ? (
              recentProjects.slice(0, 4).map((project) => (
                <ListButton key={project} onClick={() => onOpenProject(project)}>
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{pathName(project)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{project}</span>
                  </span>
                </ListButton>
              ))
            ) : (
              <EmptyBlock>{t('workspaceHome.noRecentProjects')}</EmptyBlock>
            )}
          </Panel>
        </section>
      </div>
    </div>
  )
}

export default WorkspaceHomePage
