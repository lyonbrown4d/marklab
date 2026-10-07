import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Cloud, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { WebDavProfileDialog } from '@/components/settings/WebDavProfileDialog'
import { SettingsEmptyState, SettingsIconButton } from '@/components/settings/SettingsButtons'
import { SettingsPageStack, SettingsSection } from '@/components/settings/SettingsRow'
import { syncQueryKeys, useWebDavProfiles } from '@/features/workspace-sync/syncQueries'
import { useI18n } from '@/i18n/useI18n'
import { workspaceSyncApi } from '@/services/workspaceSyncApi'
import type { WebDavProfile, WebDavProfileInput } from '@/types/workspaceSync'

const WorkspaceSyncSettingsPage = () => {
  const { t } = useI18n()
  const client = useQueryClient()
  const profiles = useWebDavProfiles()
  const [editing, setEditing] = useState<WebDavProfile | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean } | null>(null)

  const refresh = () => client.invalidateQueries({ queryKey: syncQueryKeys.profiles })
  const save = useMutation({
    mutationFn: (input: WebDavProfileInput) => workspaceSyncApi.saveWebDavProfile(input),
    onSuccess: () => {
      setDialogOpen(false)
      void refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => workspaceSyncApi.deleteWebDavProfile(id),
    onSuccess: () => void refresh(),
  })
  const test = useMutation({
    mutationFn: (id: string) => workspaceSyncApi.testWebDavProfile(id),
    onSuccess: (result, id) => setTestResult({ id, ok: result.ok }),
    onError: (_error, id) => setTestResult({ id, ok: false }),
  })

  const openEditor = (profile: WebDavProfile | null) => {
    setEditing(profile)
    setDialogOpen(true)
  }

  return (
    <SettingsPageStack>
      <SettingsSection
        targetId="settings-workspace-sync"
        title={t('sync.settings.title')}
        description={t('sync.settings.description')}
        icon={Cloud}
      >
        <div className="flex items-center justify-between gap-3 pb-3">
          <span className="text-xs font-medium">{t('sync.settings.webdavConnections')}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => openEditor(null)}>
            <Plus aria-hidden="true" data-icon="inline-start" />
            {t('sync.settings.addConnection')}
          </Button>
        </div>
        {remove.isError ? (
          <Alert variant="destructive" className="mb-2">
            <AlertDescription>{t('sync.settings.deleteFailed')}</AlertDescription>
          </Alert>
        ) : null}
        {profiles.isLoading ? (
          <div
            aria-label={t('sync.settings.loading')}
            className="flex flex-col gap-2"
            role="status"
          >
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : profiles.isError ? (
          <Alert variant="destructive">
            <AlertTitle>{t('sync.settings.loadFailed')}</AlertTitle>
            <AlertDescription className="mt-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void refresh()}>
                <RefreshCw aria-hidden="true" data-icon="inline-start" />
                {t('actions.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        ) : profiles.data?.length ? (
          <div className="flex flex-col gap-1">
            {profiles.data.map((profile) => (
              <div
                key={profile.id}
                className="flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50"
              >
                <Cloud aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{profile.label}</span>
                    {profile.sessionOnly ? (
                      <Badge variant="outline">{t('sync.settings.sessionBadge')}</Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {profile.endpoint} · {profile.username}
                  </p>
                  {profile.sessionOnly && !profile.hasPassword ? (
                    <p className="text-xs text-status-warning">
                      {t('sync.settings.reauthRequired')}
                    </p>
                  ) : null}
                  {testResult?.id === profile.id ? (
                    <p className="text-xs" role="status">
                      {t(
                        testResult.ok ? 'sync.settings.testSucceeded' : 'sync.settings.testFailed',
                      )}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={test.isPending}
                  onClick={() => test.mutate(profile.id)}
                >
                  {t('sync.settings.testConnection')}
                </Button>
                <SettingsIconButton
                  aria-label={t('sync.settings.editConnection')}
                  onClick={() => openEditor(profile)}
                >
                  <Pencil aria-hidden="true" />
                </SettingsIconButton>
                <SettingsIconButton
                  aria-label={t('sync.settings.deleteConnection')}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(profile.id)}
                >
                  <Trash2 aria-hidden="true" />
                </SettingsIconButton>
              </div>
            ))}
          </div>
        ) : (
          <SettingsEmptyState>{t('sync.settings.noConnections')}</SettingsEmptyState>
        )}
      </SettingsSection>
      {dialogOpen ? (
        <WebDavProfileDialog
          key={editing?.id ?? 'new-profile'}
          open
          profile={editing}
          pending={save.isPending}
          error={save.isError ? t('sync.settings.saveFailed') : undefined}
          onOpenChange={setDialogOpen}
          onSubmit={(input: WebDavProfileInput) => save.mutate(input)}
        />
      ) : null}
    </SettingsPageStack>
  )
}

export default WorkspaceSyncSettingsPage
