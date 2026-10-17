import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/i18n/useI18n'
import { gitCredentialsApi, type GitCredentials } from '@/services/gitCredentialsApi'

type CredentialAction =
  { type: 'save'; credentials: GitCredentials } | { type: 'remove'; url: string }

export const GitCredentialForm = ({ url }: { url: string }) => {
  const { t } = useI18n()
  const [username, setUsername] = useState('')
  const [token, setToken] = useState('')
  const submitting = useRef(false)
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: async (action: CredentialAction) => {
      if (action.type === 'remove') return gitCredentialsApi.remove(action.url)
      try {
        return await gitCredentialsApi.save(action.credentials)
      } finally {
        // Do not retain the token in TanStack's mutation variables after IPC completes.
        action.credentials.token = ''
      }
    },
    onSuccess: () => setToken(''),
  })
  const run = async (action: CredentialAction) => {
    if (submitting.current) return
    submitting.current = true
    try {
      await mutation.mutateAsync(action)
    } catch {
      // The mutation owns the visible error; credentials remain available to correct.
    } finally {
      submitting.current = false
    }
  }
  let origin: string | null = null
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) origin = parsed.origin
  } catch {
    // Remote editing can contain an incomplete URL.
  }
  if (!gitCredentialsApi.available() || !origin) return null

  return (
    <details className="border-t border-border pt-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">
        {t('scm.credentials.title')}
      </summary>
      <form
        className="mt-3 flex flex-col gap-2"
        aria-busy={mutation.isPending}
        onSubmit={(event) => {
          event.preventDefault()
          if (username.trim() && token.trim()) {
            void run({ type: 'save', credentials: { url, username, token } })
          }
        }}
      >
        <p className="break-all text-xs text-muted-foreground">{origin}</p>
        <Label htmlFor="git-credential-username">{t('scm.credentials.username')}</Label>
        <Input
          id="git-credential-username"
          autoComplete="username"
          value={username}
          disabled={mutation.isPending}
          onChange={(event) => setUsername(event.target.value)}
        />
        <Label htmlFor="git-credential-token">{t('scm.credentials.token')}</Label>
        <Input
          id="git-credential-token"
          type="password"
          autoComplete="new-password"
          value={token}
          disabled={mutation.isPending}
          onChange={(event) => setToken(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t('scm.credentials.storage')}</p>
        <div className="flex gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={mutation.isPending || !username.trim() || !token.trim()}
          >
            {t('scm.credentials.save')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => void run({ type: 'remove', url })}
          >
            {t('scm.credentials.remove')}
          </Button>
        </div>
        {mutation.isError && (
          <p role="alert" className="text-xs text-destructive">
            {mutation.error.message}
          </p>
        )}
        {mutation.isSuccess && (
          <p role="status" className="text-xs text-muted-foreground">
            {t('scm.credentials.saved')}
          </p>
        )}
      </form>
    </details>
  )
}
