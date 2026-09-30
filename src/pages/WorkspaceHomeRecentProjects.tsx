import { FolderOpen } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { EmptyBlock, ListButton, Panel } from '@/pages/workspaceHomeUi'

type WorkspaceHomeRecentProjectsProps = {
  onOpenProject: (path: string) => void
  onUseInternalRoot: () => void
  recentProjects: string[]
}

const pathName = (path: string) => {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

const WorkspaceHomeRecentProjects = ({
  onOpenProject,
  onUseInternalRoot,
  recentProjects,
}: WorkspaceHomeRecentProjectsProps) => {
  const { t } = useI18n()

  return (
    <Panel title={t('workspaceHome.recentProjects')} subtitle={t('workspaceHome.recentSubtitle')}>
      <ListButton
        description={t('workspaceHome.builtInWorkspace')}
        icon={FolderOpen}
        title={t('sidebar.localWorkspace')}
        onClick={onUseInternalRoot}
      />
      {recentProjects.length > 0 ? (
        recentProjects
          .slice(0, 4)
          .map((project) => (
            <ListButton
              key={project}
              ariaLabel={t('workspace.openRecentInNewWindow', { name: pathName(project) })}
              description={project}
              icon={FolderOpen}
              title={pathName(project)}
              onClick={() => onOpenProject(project)}
            />
          ))
      ) : (
        <EmptyBlock icon={FolderOpen}>{t('workspaceHome.noRecentProjects')}</EmptyBlock>
      )}
    </Panel>
  )
}

export default WorkspaceHomeRecentProjects
