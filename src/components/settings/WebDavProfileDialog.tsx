import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SettingsSwitch } from '@/components/settings/SettingsSwitch'
import { useI18n } from '@/i18n/useI18n'
import type { WebDavProfile, WebDavProfileInput } from '@/types/workspaceSync'

type WebDavProfileDialogProps = {
  open: boolean
  profile: WebDavProfile | null
  pending: boolean
  error?: string
  onOpenChange: (open: boolean) => void
  onSubmit: (input: WebDavProfileInput) => void
}

const emptyForm = (): WebDavProfileInput => ({
  id: crypto.randomUUID(),
  label: '',
  endpoint: '',
  basePath: '/',
  username: '',
  password: '',
  allowInsecureLocal: false,
  sessionOnly: false,
})

const fromProfile = (profile: WebDavProfile): WebDavProfileInput => ({
  id: profile.id,
  label: profile.label,
  endpoint: profile.endpoint,
  basePath: profile.basePath,
  username: profile.username,
  password: undefined,
  allowInsecureLocal: profile.allowInsecureLocal,
  sessionOnly: profile.sessionOnly,
})

export const WebDavProfileDialog = ({
  open,
  profile,
  pending,
  error,
  onOpenChange,
  onSubmit,
}: WebDavProfileDialogProps) => {
  const { t } = useI18n()
  const [form, setForm] = useState<WebDavProfileInput>(() =>
    profile ? fromProfile(profile) : emptyForm(),
  )

  const update = <Key extends keyof WebDavProfileInput>(key: Key, value: WebDavProfileInput[Key]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const insecureEndpoint = /^http:\/\//i.test(form.endpoint.trim())
  const valid = Boolean(
    form.label.trim() &&
    form.endpoint.trim() &&
    form.username.trim() &&
    (profile || form.password?.trim()) &&
    (!insecureEndpoint || form.allowInsecureLocal),
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(profile ? 'sync.settings.editConnection' : 'sync.settings.addConnection')}
          </DialogTitle>
          <DialogDescription>{t('sync.settings.connectionDescription')}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (valid && !pending) {
              onSubmit({
                ...form,
                password: form.password?.length
                  ? form.password
                  : profile
                    ? undefined
                    : form.password,
              })
            }
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="webdav-label">{t('sync.settings.name')}</FieldLabel>
              <Input
                id="webdav-label"
                value={form.label}
                onChange={(event) => update('label', event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="webdav-endpoint">{t('sync.settings.endpoint')}</FieldLabel>
              <Input
                id="webdav-endpoint"
                inputMode="url"
                placeholder="https://dav.example.com"
                value={form.endpoint}
                onChange={(event) => update('endpoint', event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="webdav-path">{t('sync.settings.basePath')}</FieldLabel>
              <Input
                id="webdav-path"
                value={form.basePath ?? ''}
                onChange={(event) => update('basePath', event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="webdav-username">{t('sync.settings.username')}</FieldLabel>
              <Input
                id="webdav-username"
                autoComplete="username"
                value={form.username}
                onChange={(event) => update('username', event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="webdav-password">{t('sync.settings.password')}</FieldLabel>
              <Input
                id="webdav-password"
                type="password"
                autoComplete="current-password"
                placeholder={profile?.hasPassword ? t('sync.settings.passwordUnchanged') : ''}
                value={form.password ?? ''}
                onChange={(event) => update('password', event.target.value)}
              />
              <FieldDescription>{t('sync.settings.passwordDescription')}</FieldDescription>
            </Field>
            {insecureEndpoint ? (
              <Field orientation="horizontal" data-invalid={!form.allowInsecureLocal}>
                <div className="min-w-0 flex-1">
                  <FieldLabel htmlFor="webdav-insecure">
                    {t('sync.settings.allowInsecureLocal')}
                  </FieldLabel>
                  <FieldDescription>{t('sync.settings.insecureWarning')}</FieldDescription>
                </div>
                <SettingsSwitch
                  id="webdav-insecure"
                  aria-invalid={!form.allowInsecureLocal}
                  checked={Boolean(form.allowInsecureLocal)}
                  onCheckedChange={(checked) => update('allowInsecureLocal', checked)}
                />
              </Field>
            ) : null}
            <Field orientation="horizontal">
              <div className="min-w-0 flex-1">
                <FieldLabel htmlFor="webdav-session-only">
                  {t('sync.settings.sessionOnly')}
                </FieldLabel>
                <FieldDescription>{t('sync.settings.sessionOnlyDescription')}</FieldDescription>
              </div>
              <SettingsSwitch
                id="webdav-session-only"
                checked={Boolean(form.sessionOnly)}
                onCheckedChange={(checked) => update('sessionOnly', checked)}
              />
            </Field>
          </FieldGroup>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!valid || pending}>
              {pending ? <LoaderCircle aria-hidden="true" data-icon="inline-start" /> : null}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
