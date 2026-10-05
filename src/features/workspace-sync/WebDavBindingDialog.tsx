import { useState } from 'react'
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useI18n } from '@/i18n/useI18n'
import type { WebDavProfile } from '@/types/workspaceSync'

type WebDavBindingDialogProps = {
  open: boolean
  profiles: WebDavProfile[]
  pending: boolean
  error?: string
  initialProfileId?: string
  initialRemoteRoot?: string
  onOpenChange: (open: boolean) => void
  onSubmit: (value: { profileId: string; remoteRoot: string }) => void
}

export const WebDavBindingDialog = ({
  open,
  profiles,
  pending,
  error,
  initialProfileId,
  initialRemoteRoot,
  onOpenChange,
  onSubmit,
}: WebDavBindingDialogProps) => {
  const { t } = useI18n()
  const [profileId, setProfileId] = useState(initialProfileId ?? profiles[0]?.id ?? '')
  const [remoteRoot, setRemoteRoot] = useState(initialRemoteRoot ?? '/')
  const validProfile = profiles.some((profile) => profile.id === profileId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('sync.binding.title')}</DialogTitle>
          <DialogDescription>{t('sync.binding.description')}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (validProfile && !pending) onSubmit({ profileId, remoteRoot })
          }}
        >
          <FieldGroup>
            {profiles.length === 0 ? (
              <Alert>
                <AlertDescription>{t('sync.binding.noProfiles')}</AlertDescription>
              </Alert>
            ) : null}
            <Field>
              <FieldLabel>{t('sync.binding.profile')}</FieldLabel>
              <Select value={profileId} onValueChange={setProfileId}>
                <SelectTrigger aria-label={t('sync.binding.profile')}>
                  <SelectValue placeholder={t('sync.binding.selectProfile')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {profiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="webdav-remote-root">{t('sync.binding.remoteRoot')}</FieldLabel>
              <Input
                id="webdav-remote-root"
                value={remoteRoot}
                onChange={(event) => setRemoteRoot(event.target.value)}
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
            <Button type="submit" disabled={!validProfile || pending}>
              {t('sync.binding.bind')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
