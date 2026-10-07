import { useId, useState, type SubmitEvent } from 'react'
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
import {
  aiProviderOptions,
  aiProviderUsesBaseUrl,
  createAiProviderId,
  getAiProviderOption,
  type AiProviderKind,
} from '@/components/settings/aiProviderUtils'

type ProviderFormProps = {
  provider?: PublicAiProvider
  pending: boolean
  error?: string
  onCancel: () => void
  onSave: (input: AiProviderUpdate) => Promise<void>
}

const fieldClassName = 'grid gap-1.5'

export const AiProviderForm = ({
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
  const initialKind = provider?.kind ?? 'openai'
  const initialOption = getAiProviderOption(initialKind)
  const [label, setLabel] = useState(provider?.label ?? initialOption.label)
  const [kind, setKind] = useState<AiProviderKind>(initialKind)
  const [model, setModel] = useState(provider?.model ?? '')
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? initialOption.defaultBaseUrl ?? '')
  const [apiKey, setApiKey] = useState('')
  const [newProviderSuffix] = useState(() => crypto.randomUUID())
  const usesBaseUrl = aiProviderUsesBaseUrl(kind)

  const handleKindChange = (nextKind: AiProviderKind) => {
    const currentOption = getAiProviderOption(kind)
    const nextOption = getAiProviderOption(nextKind)
    if (label === currentOption.label) setLabel(nextOption.label)
    if (!baseUrl || baseUrl === currentOption.defaultBaseUrl) {
      setBaseUrl(nextOption.defaultBaseUrl ?? '')
    }
    setKind(nextKind)
  }

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return
    const input: AiProviderUpdate = {
      id: provider?.id ?? createAiProviderId(kind, newProviderSuffix),
      label: label.trim(),
      kind,
      model: model.trim(),
      ...(usesBaseUrl ? { baseUrl: baseUrl.trim() } : {}),
      ...(kind === 'ollama' ? { apiKey: null } : apiKey ? { apiKey } : {}),
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
      {!provider && (
        <div className={fieldClassName}>
          <Label htmlFor={kindId}>{t('settings.aiProviderKind')}</Label>
          <Select value={kind} onValueChange={(value) => handleKindChange(value as AiProviderKind)}>
            <SelectTrigger id={kindId} aria-label={t('settings.aiProviderKind')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {aiProviderOptions.map((option) => (
                <SelectItem key={option.kind} value={option.kind}>
                  {option.label}
                </SelectItem>
              ))}
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
      {usesBaseUrl && (
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
      {kind !== 'ollama' && (
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
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <SettingsActionButton type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          {t('settings.cancel')}
        </SettingsActionButton>
        <SettingsActionButton
          type="submit"
          disabled={pending || !label.trim() || !model.trim() || (usesBaseUrl && !baseUrl.trim())}
        >
          {t('settings.save')}
        </SettingsActionButton>
      </div>
    </form>
  )
}
