import { useId, useMemo, useState } from 'react'
import {
  ScmCollapsedButton,
  ScmRepositoryPanel,
  ScmSingleFilePanel,
} from '@/components/ScmPanelContent'
import type { ScmChangeGroup } from '@/components/ScmChangeGroups'
import { GitCommitDialog } from '@/components/GitCommitDialog'
import { GitInitDialog } from '@/components/GitInitDialog'
import { GitManagementDialog } from '@/components/git/GitManagementDialog'
import type { GitDiffRequest } from '@/services/gitApi'
import { isDesktopRuntime } from '@/runtime/environment'
import { useI18n } from '@/i18n/useI18n'
import { countChangedFiles } from '@/logic/gitStatus'
import { useGitWorktree, type WorktreeCommand } from '@/features/git/worktree/useGitWorktree'
import { GitRemoteToolbar } from '@/features/git/worktree/GitRemoteToolbar'
import { GitRemoteDialog } from '@/features/git/worktree/GitRemoteDialog'
import {
  GitWorktreeConfirm,
  type GitConfirmation,
} from '@/features/git/worktree/GitWorktreeConfirm'
import { useGitStatus } from '@/features/git/worktree/useGitStatus'
import { GitOperationControls } from '@/features/git/worktree/GitOperationControls'

type ScmPanelProps = {
  rootPath: string
  rootKind: 'internal' | 'external' | 'single'
  collapsed: boolean
  onOpenDiff: (request: GitDiffRequest) => void
  onOpenFile?: (path: string) => void
}

const ScmWorkspacePanel = ({
  rootPath,
  rootKind,
  collapsed,
  onOpenDiff,
  onOpenFile,
}: ScmPanelProps) => {
  const { t } = useI18n()
  const commitDisabledReasonId = useId()
  const [commitMessage, setCommitMessage] = useState('')
  const [commitDialogOpen, setCommitDialogOpen] = useState(false)
  const [initDialogOpen, setInitDialogOpen] = useState(false)
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false)
  const [managementOpen, setManagementOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<GitConfirmation | null>(null)
  const enabled = isDesktopRuntime() && rootKind !== 'single' && Boolean(rootPath)
  const { statusQuery, invalidateStatus } = useGitStatus(rootPath, enabled)
  const isRepository = Boolean(statusQuery.data?.repo.is_repository)
  const actions = useGitWorktree(rootPath, enabled, isRepository)
  const { mutation, busy, run, remoteQuery, operationQuery } = actions
  const isCommitting = mutation.isPending && mutation.variables?.command.type === 'commit'
  const groups = useMemo<ScmChangeGroup[]>(() => {
    const snapshot = statusQuery.data
    if (!snapshot?.repo.is_repository) return []
    return [
      { id: 'conflicts' as const, label: t('scm.conflicts'), changes: snapshot.conflicts },
      { id: 'staged' as const, label: t('scm.staged'), changes: snapshot.staged },
      { id: 'unstaged' as const, label: t('scm.changes'), changes: snapshot.unstaged },
      { id: 'untracked' as const, label: t('scm.untracked'), changes: snapshot.untracked },
    ].filter(({ changes }) => changes.length > 0)
  }, [statusQuery.data, t])
  const runCommand = (command: WorktreeCommand) => {
    void run(command)
  }
  const openConfirmation = (next: GitConfirmation) => {
    if (busy) return
    mutation.reset()
    setConfirmation(next)
  }
  const confirm = async () => {
    if (!confirmation || busy) return
    const command: WorktreeCommand =
      confirmation.type === 'discard'
        ? { type: 'discard', paths: confirmation.paths }
        : confirmation.type === 'abort'
          ? { type: 'abort' }
          : confirmation.type === 'setRemote'
            ? confirmation
            : { type: 'removeRemote', name: confirmation.name }
    if (await run(command)) setConfirmation(null)
  }
  if (rootKind === 'single') {
    const title = t('scm.singleFileTitle')
    return collapsed ? (
      <ScmCollapsedButton label={title} disabled />
    ) : (
      <ScmSingleFilePanel
        regionLabel={t('scm.title')}
        title={title}
        description={t('scm.singleFileHelp')}
      />
    )
  }
  if (!enabled) return null
  const totalChanges = countChangedFiles(statusQuery.data)
  const stagedCount = statusQuery.data?.staged.length ?? 0
  const branch = statusQuery.data?.repo.branch ?? t('scm.noBranch')
  const hasConflicts = Boolean(statusQuery.data?.conflicts.length)
  const operation = operationQuery.data?.operation
  const commitDisabledReason = operation
    ? t('scm.operationPending', { operation: t(`scm.management.operation.${operation}`) })
    : hasConflicts
      ? t('scm.commitBlockedConflicts')
      : stagedCount === 0
        ? t('scm.noStagedChanges')
        : operationQuery.isPending
          ? t('scm.loading')
          : operationQuery.error
            ? String(operationQuery.error)
            : undefined
  const canCommit =
    stagedCount > 0 &&
    !hasConflicts &&
    !operation &&
    !operationQuery.isPending &&
    !operationQuery.isError &&
    !busy &&
    commitMessage.trim().length > 0
  if (collapsed)
    return (
      <ScmCollapsedButton
        label={
          isRepository
            ? t('scm.collapsedStatus', { count: String(totalChanges) })
            : t('scm.notRepository')
        }
        busy={statusQuery.isFetching || busy}
        disabled={statusQuery.isFetching || busy}
        variant={totalChanges > 0 ? 'secondary' : 'ghost'}
        onClick={invalidateStatus}
      />
    )
  const commit = async () => {
    if (!canCommit) return
    if (await run({ type: 'commit', message: commitMessage.trim() })) {
      setCommitMessage('')
      setCommitDialogOpen(false)
    }
  }
  return (
    <>
      <GitCommitDialog
        open={commitDialogOpen}
        onOpenChange={(open) => {
          if (!busy) setCommitDialogOpen(open)
        }}
        branch={branch}
        changedFilesCount={stagedCount}
        message={commitMessage}
        onMessageChange={setCommitMessage}
        onCommit={() => {
          void commit()
        }}
        canCommit={canCommit}
        isCommitting={isCommitting}
        error={mutation.error}
        disabledReason={commitDisabledReason}
      />
      <GitInitDialog
        open={initDialogOpen}
        onOpenChange={(open) => {
          if (!busy) setInitDialogOpen(open)
        }}
        onConfirm={() => {
          void run({ type: 'init' }).then((success) => {
            if (success) setInitDialogOpen(false)
          })
        }}
        isInitializing={busy}
        error={mutation.error}
      />
      <GitRemoteDialog
        open={remoteDialogOpen}
        onOpenChange={setRemoteDialogOpen}
        status={remoteQuery.data}
        busy={busy}
        error={mutation.error}
        onSave={(name, url) => openConfirmation({ type: 'setRemote', name, url })}
        onRemove={(name) => openConfirmation({ type: 'removeRemote', name })}
      />
      <GitWorktreeConfirm
        confirmation={confirmation}
        busy={busy}
        error={mutation.error}
        onClose={() => setConfirmation(null)}
        onConfirm={() => {
          void confirm()
        }}
      />
      <GitManagementDialog
        open={managementOpen}
        onOpenChange={setManagementOpen}
        rootPath={rootPath}
      />
      <ScmRepositoryPanel
        branch={branch}
        stagedCount={stagedCount}
        commitDisabledReason={commitDisabledReason}
        commitDisabledReasonId={commitDisabledReasonId}
        groups={groups}
        hasConflicts={
          hasConflicts || Boolean(operation) || operationQuery.isPending || operationQuery.isError
        }
        initError={mutation.error}
        isCommitting={isCommitting}
        isInitializing={busy}
        isRepository={isRepository}
        isStatusError={statusQuery.isError}
        isStatusFetching={statusQuery.isFetching}
        isStatusLoading={statusQuery.isLoading}
        statusError={statusQuery.error}
        totalChanges={totalChanges}
        onOpenDiff={onOpenDiff}
        onOpenFile={onOpenFile}
        onRefresh={invalidateStatus}
        busy={busy}
        actionError={mutation.error}
        onStage={(paths) => runCommand({ type: 'stage', paths })}
        onUnstage={(paths) => runCommand({ type: 'unstage', paths })}
        onDiscard={(paths) =>
          openConfirmation({
            type: 'discard',
            paths,
            deletesUntracked:
              statusQuery.data?.untracked.some(({ path }) => paths.includes(path)) ?? false,
          })
        }
        onOpenCommitDialog={() => {
          mutation.reset()
          setCommitDialogOpen(true)
        }}
        onOpenInitDialog={() => {
          mutation.reset()
          setInitDialogOpen(true)
        }}
        onOpenManagement={() => setManagementOpen(true)}
        toolbar={
          <GitRemoteToolbar
            status={remoteQuery.data}
            loading={remoteQuery.isLoading}
            error={remoteQuery.error}
            busy={busy}
            onRun={runCommand}
            onManage={() => {
              mutation.reset()
              setRemoteDialogOpen(true)
            }}
          />
        }
        operationControls={
          <GitOperationControls
            operation={operation}
            busy={busy}
            hasConflicts={hasConflicts}
            error={operationQuery.error}
            onContinue={() => runCommand({ type: 'continue' })}
            onAbort={(operation) => openConfirmation({ type: 'abort', operation })}
          />
        }
      />
    </>
  )
}

const ScmPanel = (props: ScmPanelProps) => (
  <ScmWorkspacePanel key={`${props.rootKind}:${props.rootPath}`} {...props} />
)
export default ScmPanel
