import { useState } from 'react'
import { ArrowDown, ArrowUp, Download, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useI18n } from '@/i18n/useI18n'
import type { GitRemoteStatus } from '@/services/gitApi'
import type { WorktreeCommand } from '@/features/git/worktree/useGitWorktree'

export const GitRemoteToolbar = ({
  status,
  busy,
  loading,
  error,
  onRun,
  onManage,
}: {
  status: GitRemoteStatus | undefined
  busy: boolean
  loading: boolean
  error: unknown
  onRun: (command: WorktreeCommand) => void
  onManage: () => void
}) => {
  const { t } = useI18n()
  const [chosenRemote, setChosenRemote] = useState('')
  const remote = status?.remotes.some(({ name }) => name === chosenRemote)
    ? chosenRemote
    : (status?.remotes.find(({ name }) => name === 'origin')?.name ??
      status?.remotes[0]?.name ??
      '')
  const disabled = busy || loading || !status
  return (
    <div className="flex flex-col gap-1 px-2 text-xs" aria-busy={loading || busy}>
      <div className="flex items-center gap-1">
        <Select value={remote} onValueChange={setChosenRemote} disabled={disabled || !remote}>
          <SelectTrigger aria-label={t('scm.remote')} className="h-7 min-w-0 flex-1 text-xs">
            <SelectValue placeholder={t('scm.noRemote')} />
          </SelectTrigger>
          <SelectContent>
            {status?.remotes.map(({ name }) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t('scm.remotes')}
          disabled={busy}
          onClick={onManage}
        >
          <Settings2 />
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 flex-1 px-1 text-xs"
          disabled={disabled || !remote}
          onClick={() => onRun({ type: 'fetch', remote })}
        >
          <Download />
          {t('scm.fetch')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 flex-1 px-1 text-xs"
          disabled={disabled || !status?.upstream || status.detached}
          onClick={() => onRun({ type: 'pull' })}
        >
          <ArrowDown />
          {t('scm.pull')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 flex-1 px-1 text-xs"
          disabled={disabled || !remote || status?.detached}
          onClick={() => onRun({ type: 'push', remote, setUpstream: !status?.upstream })}
        >
          <ArrowUp />
          {t(status?.upstream ? 'scm.push' : 'scm.publishBranch')}
        </Button>
      </div>
      {status && (
        <span className="text-[11px] text-muted-foreground">
          {t('scm.aheadBehind', { ahead: String(status.ahead), behind: String(status.behind) })}
          {status.upstream ? ` · ${status.upstream}` : ''}
        </span>
      )}
      {error ? (
        <p role="alert" className="break-words text-destructive">
          {String(error)}
        </p>
      ) : null}
    </div>
  )
}
