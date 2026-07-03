import { FileText, FolderOpen, Layers3, Network, Search } from 'lucide-react'
import AppLogo from '@/components/AppLogo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useI18n } from '@/i18n/useI18n'

type WorkspaceHomeHeroProps = {
  firstDocument?: string
  indexReady: boolean
  singleFileMode: boolean
  workspaceName: string
  workspacePath: string
  onOpenAllPages: () => void
  onOpenFile: (path: string) => void
  onOpenFilePicker: () => void
  onOpenProjectPicker: () => void
  onOpenWorkspaceGraph: () => void
  onSearch: () => void
}

const WorkspaceHomeHero = ({
  firstDocument,
  indexReady,
  singleFileMode,
  workspaceName,
  workspacePath,
  onOpenAllPages,
  onOpenFile,
  onOpenFilePicker,
  onOpenProjectPicker,
  onOpenWorkspaceGraph,
  onSearch,
}: WorkspaceHomeHeroProps) => {
  const { t } = useI18n()

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardContent className="relative p-6 md:p-8">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 bg-gradient-to-l from-primary/10 to-transparent md:block" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <div className="flex items-center gap-3">
              <AppLogo className="size-11" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    {singleFileMode ? t('workspaceHome.singleEyebrow') : t('workspaceHome.eyebrow')}
                  </div>
                  <Badge variant={indexReady ? 'secondary' : 'outline'}>
                    {indexReady ? t('workspaceHome.indexReady') : t('workspaceHome.indexing')}
                  </Badge>
                </div>
                <h1 className="mt-1 truncate text-3xl font-semibold tracking-tight md:text-4xl">
                  {workspaceName}
                </h1>
              </div>
            </div>
            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              {singleFileMode
                ? t('workspaceHome.singleDescription')
                : t('workspaceHome.description')}
            </p>
            <div className="mt-4 rounded-lg border border-border/80 bg-muted/30 p-4 text-xs leading-5 text-muted-foreground">
              <span className="block font-medium text-foreground">{workspaceName}</span>
              <span className="break-all">{workspacePath}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {singleFileMode ? (
              <>
                <Button
                  className="rounded-md"
                  disabled={!firstDocument}
                  onClick={() => firstDocument && onOpenFile(firstDocument)}
                >
                  <FileText data-icon="inline-start" />
                  {t('workspaceHome.openSingleDocument')}
                </Button>
                <Button variant="secondary" className="rounded-md" onClick={onSearch}>
                  <Search data-icon="inline-start" />
                  {t('workspaceHome.showInSidebar')}
                </Button>
                <Button variant="ghost" className="rounded-md" onClick={onOpenFilePicker}>
                  <FolderOpen data-icon="inline-start" />
                  {t('actions.openFile')}
                </Button>
              </>
            ) : (
              <>
                <Button className="rounded-md" onClick={onSearch}>
                  <Search data-icon="inline-start" />
                  {t('workspaceHome.searchWorkspace')}
                </Button>
                <Button variant="secondary" className="rounded-md" onClick={onOpenAllPages}>
                  <Layers3 data-icon="inline-start" />
                  {t('workspaceHome.allPages')}
                </Button>
                <Button variant="secondary" className="rounded-md" onClick={onOpenWorkspaceGraph}>
                  <Network data-icon="inline-start" />
                  {t('workspaceHome.workspaceGraph')}
                </Button>
                <Button variant="ghost" className="rounded-md" onClick={onOpenProjectPicker}>
                  <FolderOpen data-icon="inline-start" />
                  {t('actions.openProject')}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default WorkspaceHomeHero
