import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n/useI18n'
import { gitApiForWorkspace } from '@/services/gitApi'
import type { GitStashEntry } from '@/types/gitOperations'
import type { GitManagementActions } from '@/features/git/management/useGitManagement'
import { GitActionDialog } from '@/components/git/GitActionDialog'
import { GitQueryState } from '@/components/git/GitQueryState'
import { useGitRefreshOptions } from '@/features/git/useGitRefreshOptions'

export const GitStashTab = ({ rootPath, disabled, pending, error, run }: GitManagementActions) => {
  const { t } = useI18n()
  const api = useMemo(() => gitApiForWorkspace(rootPath), [rootPath])
  const [message, setMessage] = useState('')
  const [drop, setDrop] = useState<GitStashEntry | null>(null)
  const refresh = useGitRefreshOptions(rootPath)
  const query = useQuery({
    ...refresh,
    queryKey: ['git-stashes', rootPath],
    queryFn: () => api.getStashes(),
  })
  return (
    <div className="space-y-3 text-xs">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (disabled) return
          void run(() => api.saveStash(message.trim() || undefined)).then((success) => {
            if (success) setMessage('')
          })
        }}
      >
        <Input
          aria-label={t('scm.stash.message')}
          placeholder={t('scm.stash.message')}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          disabled={disabled}
          className="h-8 text-xs"
        />
        <Button size="sm" type="submit" disabled={disabled}>
          {t('scm.stash.save')}
        </Button>
      </form>
      <p className="text-muted-foreground">{t('scm.stash.help')}</p>
      <GitQueryState
        loading={query.isLoading}
        error={query.error}
        empty={query.data?.length === 0}
        onRetry={() => {
          void query.refetch()
        }}
      />
      <ul className="divide-y divide-border">
        {query.data?.map((stash) => (
          <li key={stash.ref} className="flex flex-wrap items-center gap-2 py-2">
            <span className="font-mono">{stash.ref}</span>
            <span className="min-w-32 flex-1 break-all">{stash.subject}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                void run(() => api.applyStash(stash.ref, stash.hash))
              }}
            >
              {t('scm.stash.apply')}
            </Button>
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setDrop(stash)}>
              {t('scm.stash.drop')}
            </Button>
          </li>
        ))}
      </ul>
      {drop && (
        <GitActionDialog
          title={t('scm.stash.drop')}
          description={t('scm.stash.dropConfirm', { ref: drop.ref })}
          pending={pending}
          error={error}
          confirmDisabled={disabled}
          destructive
          onCancel={() => setDrop(null)}
          onConfirm={() => {
            if (disabled) return
            void run(() => api.dropStash(drop.ref, drop.hash)).then((success) => {
              if (success) setDrop(null)
            })
          }}
        />
      )}
    </div>
  )
}
