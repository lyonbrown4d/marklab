import { useId, useState, type FormEvent } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SettingsActionButton } from '@/components/settings/SettingsButtons'
import { useI18n } from '@/i18n/useI18n'
import type { AiProviderUpdate, PublicAiProvider } from '@/services/aiApi'
import { createAiProviderId, isLoopbackHttpUrl } from '@/components/settings/aiProviderUtils'

type ProviderFormProps = {
  mode: 'ollama' | 'compatible' | 'cloud'
  provider?: PublicAiProvider
  pending: boolean
  error?: string
  onCancel: () => void
  onSave: (input: AiProviderUpdate) => Promise<void>
}

const fieldClassName = 'grid gap-1.5'

export const AiProviderForm = ({
  mode,
  provider,
  pending,
  error,
  onCancel,
  onSave,
}: ProviderFormProps) => {
  const { t } = useI18n()
  const formId = useId()
  const labelId = `${formId}-label`
  const kindId = `${formId}-kind`
  const modelId = `${formId}-model`
  const baseUrlId = `${formId}-url`
  const apiKeyId = `${formId}-key`
  const [label, setLabel] = useState(provider?.label ?? (mode === 'ollama' ? 'Ollama' : ''))
  const [kind, setKind] = useState<AiProviderUpdate['kind']>(provider?.kind ?? 'openai')
  const [model, setModel] = useState(provider?.model ?? '')
  const [baseUrl, setBaseUrl] = useState(
    provider?.baseUrl ?? (mode === 'ollama' ? 'http://127.0.0.1:11434/v1' : ''),
  )
  const [apiKey, setApiKey] = useState('')
  const [newProviderId] = useState(() => createAiProviderId(mode))

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return
    const input: AiProviderUpdate = {
      id: provider?.id ?? newProviderId,
      label: label.trim(),
      kind: mode === 'cloud' ? kind : 'openai-compatible',
      model: model.trim(),
      ...(mode !== 'cloud' ? { baseUrl: baseUrl.trim() } : {}),
      ...(mode === 'ollama' ? { apiKey: null } : apiKey ? { apiKey } : {}),
    }
    void onSave(input)
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className={fieldClassName}>
        <Label htmlFor={labelId}>{t('settings.aiProviderName')}</Label>
        <Input
          id={labelId}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          required
        />
      </div>
      {mode === 'cloud' && !provider && (
        <div className={fieldClassName}>
          <Label htmlFor={kindId}>{t('settings.aiProviderKind')}</Label>
          <Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
            <SelectTrigger id={kindId} aria-label={t('settings.aiProviderKind')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="google">Google</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <div className={fieldClassName}>
        <Label htmlFor={modelId}>{t('settings.aiModel')}</Label>
        <Input
          id={modelId}
          value={model}
          onChange={(event) => setModel(event.target.value)}
          required
        />
      </div>
      {mode !== 'cloud' && (
        <div className={fieldClassName}>
          <Label htmlFor={baseUrlId}>{t('settings.aiBaseUrl')}</Label>
          <Input
            id={baseUrlId}
            type="url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            required
          />
        </div>
      )}
      {mode !== 'ollama' && (
        <div className={fieldClassName}>
          <Label htmlFor={apiKeyId}>{t('settings.aiApiKey')}</Label>
          <Input
            id={apiKeyId}
            type="password"
            autoComplete="new-password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              provider?.apiKeySource === 'environment'
                ? t('settings.aiKeepEnvironmentKey')
                : provider?.hasApiKey
                  ? t('settings.aiKeepStoredKey')
                  : undefined
            }
          />
          <p className="text-xs text-muted-foreground">
            {provider?.apiKeySource === 'environment'
              ? t('settings.aiApiKeyEnvironmentSecurity')
              : t('settings.aiApiKeySecurity')}
          </p>
        </div>
      )}
      {mode === 'compatible' && baseUrl.trim() && (
        <p className="text-xs text-muted-foreground">
          {isLoopbackHttpUrl(baseUrl)
            ? t('settings.aiLoopbackPrivacy')
            : t('settings.aiCompatibleRemoteWarning')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <SettingsActionButton type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          {t('settings.cancel')}
        </SettingsActionButton>
        <SettingsActionButton type="submit" disabled={pending || !label.trim() || !model.trim()}>
          {t('settings.save')}
        </SettingsActionButton>
      </div>
    </form>
  )
}
