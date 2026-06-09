import { FileText, FolderOpen, Hash, Link2, Network, Search, TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLogo from '@/components/AppLogo'
import { Button } from '@/components/ui/button'
import { pathToWorkspaceGraphRoute } from '@/logic/routing'
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
  window.dispatchEvent(new CustomEvent('marklab:menu-action', { detail: 'file.open_project' }))
}

const WorkspaceHomePage = () => {
  const navigate = useNavigate()
  const { files, workspaceIndex, rootPath, recentProjects, onOpenFile, onOpenProject } =
    useLayoutContext()
  const metrics = useMemo(() => getMetrics(files, workspaceIndex), [files, workspaceIndex])
  const documents = useMemo(() => getDocuments(files, workspaceIndex), [files, workspaceIndex])
  const firstDocument = documents[0]?.path
  const workspaceName = rootPath ? pathName(rootPath) : 'Internal workspace'
  const workspacePath = rootPath || 'Built-in local workspace'
  const indexCaption = metrics.indexReady
    ? `${count(metrics.indexedFiles)} indexed Markdown files`
    : 'Workspace index pending'
  const stats = [
    {
      label: 'Files',
      value: count(metrics.files),
      caption: `${count(metrics.folders)} folders tracked`,
      icon: <FileText className="h-5 w-5 text-sky-600" />,
    },
    {
      label: 'Titles',
      value: metrics.indexReady ? count(metrics.headings) : '...',
      caption: indexCaption,
      icon: <Hash className="h-5 w-5 text-emerald-600" />,
    },
    {
      label: 'Links',
      value: metrics.indexReady ? count(metrics.links) : '...',
      caption: 'Markdown and wiki references',
      icon: <Link2 className="h-5 w-5 text-amber-600" />,
    },
    {
      label: 'Issues',
      value: metrics.indexReady ? count(metrics.issues) : '...',
      caption: 'Missing files, anchors, or assets',
      icon: <TriangleAlert className="h-5 w-5 text-rose-600" />,
    },
  ]

  return (
    <div className="h-full overflow-auto bg-background p-4 text-foreground md:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <section className="rounded-lg border border-border/80 bg-background p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-2xl">
              <div className="flex items-center gap-3">
                <AppLogo className="h-11 w-11" />
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    Workspace home
                  </div>
                  <h1 className="mt-1 truncate text-3xl font-semibold tracking-tight md:text-4xl">
                    {workspaceName}
                  </h1>
                </div>
              </div>
              <p className="mt-5 text-sm leading-6 text-muted-foreground">
                A fast overview of your current workspace, recent projects, indexed structure, and
                the most useful next actions.
              </p>
              <div className="mt-4 rounded-md border border-border/80 bg-muted/30 p-4 text-xs leading-5 text-muted-foreground">
                <span className="block font-medium text-foreground">{workspaceName}</span>
                <span className="break-all">{workspacePath}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="rounded-md" onClick={() => requestFileSearchFocus()}>
                <Search className="h-4 w-4" />
                Search workspace
              </Button>
              <Button
                variant="secondary"
                className="rounded-md"
                onClick={() => navigate(pathToWorkspaceGraphRoute())}
              >
                <Network className="h-4 w-4" />
                Workspace graph
              </Button>
              <Button variant="ghost" className="rounded-md" onClick={openProjectPicker}>
                <FolderOpen className="h-4 w-4" />
                Open project
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-md border border-border/80 bg-background p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="rounded-md bg-muted p-2">{stat.icon}</div>
                <div className="text-right text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {stat.label}
                </div>
              </div>
              <div className="mt-4 text-3xl font-semibold tracking-tight">{stat.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{stat.caption}</div>
            </div>
          ))}
        </section>

        <section className="grid min-h-[320px] gap-5 lg:grid-cols-[0.85fr_1fr_0.85fr]">
          <Panel title="Quick entries" subtitle="Jump into the next useful view.">
            <QuickButton icon={<Search className="h-4 w-4" />} onClick={requestFileSearchFocus}>
              Find a file or note
            </QuickButton>
            <QuickButton
              icon={<Network className="h-4 w-4" />}
              onClick={() => navigate(pathToWorkspaceGraphRoute())}
            >
              Explore workspace graph
            </QuickButton>
            <QuickButton
              disabled={!firstDocument}
              icon={<FileText className="h-4 w-4" />}
              onClick={() => firstDocument && onOpenFile(firstDocument)}
            >
              {firstDocument ? `Open ${pathName(firstDocument)}` : 'No document yet'}
            </QuickButton>
          </Panel>

          <Panel title="Workspace documents" subtitle={indexCaption}>
            {documents.length > 0 ? (
              documents.map((document) => (
                <ListButton key={document.path} onClick={() => onOpenFile(document.path)}>
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{document.path}</span>
                    <span className="block text-xs text-muted-foreground">
                      {document.headings === null
                        ? 'Waiting for workspace index'
                        : `${count(document.headings)} titles, ${count(document.links ?? 0)} links`}
                    </span>
                  </span>
                </ListButton>
              ))
            ) : (
              <EmptyBlock>No files are available in this workspace yet.</EmptyBlock>
            )}
          </Panel>

          <Panel title="Recent projects" subtitle="Open a known workspace quickly.">
            {recentProjects.length > 0 ? (
              recentProjects.slice(0, 4).map((project) => (
                <ListButton key={project} onClick={() => onOpenProject(project)}>
                  <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{pathName(project)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{project}</span>
                  </span>
                </ListButton>
              ))
            ) : (
              <EmptyBlock>Recent projects will appear after you open a workspace.</EmptyBlock>
            )}
          </Panel>
        </section>
      </div>
    </div>
  )
}

export default WorkspaceHomePage
