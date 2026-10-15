import { useMemo, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useI18n } from '@/i18n/useI18n'
import { gitApiForWorkspace } from '@/services/gitApi'
import type { GitCommitSummary, GitResetMode } from '@/types/gitOperations'
import type { GitManagementActions } from '@/features/git/management/useGitManagement'
import { GitActionDialog } from '@/components/git/GitActionDialog'

export type GitCommitAction = { type: 'reset' | 'revert' | 'cherryPick'; commit: GitCommitSummary }
type Props = GitManagementActions & {
  action: GitCommitAction
  onClose: () => void
  onBackup: (branch: string) => void
}

export const GitCommitActionDialog = ({
  action,
  rootPath,
  disabled,
  pending,
  error,
  run,
  onClose,
  onBackup,
}: Props) => {
  const { t } = useI18n()
  const api = useMemo(() => gitApiForWorkspace(rootPath), [rootPath])
  const [mode, setMode] = useState<GitResetMode>('soft')
  const [mainline, setMainline] = useState<string>('')
  const [hardConfirmed, setHardConfirmed] = useState(false)
  const mergeCommit = action.commit.parents.length > 1
  const blocked =
    disabled ||
    (action.type === 'reset' && mode === 'hard' && !hardConfirmed) ||
    (action.type === 'revert' && mergeCommit && !mainline)
  const confirm = async () => {
    if (blocked) return
    const successful = await run(async () => {
      if (action.type === 'reset') {
        const result = await api.reset(action.commit.hash, mode)
        onBackup(result.backupBranch)
      } else if (action.type === 'revert') {
        await api.revert(action.commit.hash, mergeCommit ? Number(mainline) : undefined)
      } else await api.cherryPick(action.commit.hash)
    })
    if (successful) onClose()
  }
  const title = t(action.type === 'reset' ? 'scm.reset.title' : `scm.history.${action.type}`)
  return (
    <GitActionDialog
      title={title}
      description={t(
        action.type === 'reset' ? 'scm.reset.warning' : `scm.history.${action.type}Confirm`,
        { commit: action.commit.shortHash },
      )}
      destructive={action.type === 'reset'}
      pending={pending}
      error={error}
      confirmDisabled={blocked}
      onCancel={onClose}
      onConfirm={() => {
        void confirm()
      }}
    >
      <p className="break-all font-mono text-xs">
        {action.commit.shortHash} · {action.commit.subject}
      </p>
      {action.type === 'reset' && (
        <div className="space-y-3">
          <Select
            value={mode}
            disabled={pending}
            onValueChange={(value: GitResetMode) => {
              setMode(value)
              setHardConfirmed(false)
            }}
          >
            <SelectTrigger aria-label={t('scm.reset.mode')} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['soft', 'mixed', 'hard'] as const).map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`scm.reset.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t('scm.reset.backupHelp')}</p>
          {mode === 'hard' && (
            <label className="flex items-start gap-2 text-xs text-destructive">
              <Checkbox
                disabled={pending}
                checked={hardConfirmed}
                onCheckedChange={(value) => setHardConfirmed(value === true)}
              />
              {t('scm.reset.hardConfirm')}
            </label>
          )}
        </div>
      )}
      {action.type === 'revert' && mergeCommit && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t('scm.history.mainlineHelp')}</p>
          <Select value={mainline} disabled={pending} onValueChange={setMainline}>
            <SelectTrigger aria-label={t('scm.history.mainline')} className="w-full">
              <SelectValue placeholder={t('scm.history.mainline')} />
            </SelectTrigger>
            <SelectContent>
              {action.commit.parents.map((parent, index) => (
                <SelectItem key={`${index}:${parent}`} value={String(index + 1)}>
                  {t('scm.history.parent', { number: index + 1, hash: parent.slice(0, 8) })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </GitActionDialog>
  )
}
