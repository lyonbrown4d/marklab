import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'
import { useI18n } from '@/i18n/useI18n'
import type { GitRemoteStatus } from '@/services/gitApi'
import { GitCredentialForm } from '@/features/git/worktree/GitCredentialForm'
import { gitCredentialsApi } from '@/services/gitCredentialsApi'

export const GitRemoteDialog = ({
  open,
  onOpenChange,
  status,
  busy,
  error,
  onSave,
  onRemove,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: GitRemoteStatus | undefined
  busy: boolean
  error: unknown
  onSave: (name: string, url: string) => void
  onRemove: (name: string) => void
}) => {
  const { t } = useI18n()
  useNativeSurfaceOcclusion('git-remote-dialog', open, { blocksCommandPalette: true })
  const [name, setName] = useState('origin')
  const [url, setUrl] = useState('')
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <DialogContent
        aria-busy={busy}
        className="max-h-[85vh] max-w-md overflow-y-auto border-border"
      >
        <DialogHeader>
          <DialogTitle>{t('scm.remotes')}</DialogTitle>
          <DialogDescription>{t('scm.remoteHelp')}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-48 overflow-auto text-xs">
          {status?.remotes.map((remote) => (
            <li key={remote.name} className="flex items-center gap-2 border-b border-border py-2">
              <div className="min-w-0 flex-1">
                <span className="font-medium">{remote.name}</span>
                <p className="truncate text-muted-foreground">{remote.fetch_url}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setName(remote.name)
                  setUrl(remote.fetch_url ?? '')
                }}
              >
                {t('scm.editRemote')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onRemove(remote.name)}
                aria-label={`${t('scm.removeRemote')}: ${remote.name}`}
              >
                {t('scm.removeRemote')}
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!busy && name.trim() && url.trim()) onSave(name.trim(), url.trim())
          }}
        >
          <Label htmlFor="git-remote-name">{t('scm.remoteName')}</Label>
          <Input
            id="git-remote-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
          />
          <Label htmlFor="git-remote-url">{t('scm.remoteUrl')}</Label>
          <Input
            id="git-remote-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !name.trim() || !url.trim()}>
            {t('scm.saveRemote')}
          </Button>
        </form>
        {gitCredentialsApi.available() && (
          <GitCredentialForm key={url} url={url || status?.remotes[0]?.fetch_url || ''} />
        )}
        {error ? (
          <p role="alert" className="break-words text-xs text-destructive">
            {String(error)}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
