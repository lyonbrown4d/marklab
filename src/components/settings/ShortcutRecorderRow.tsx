import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react'
import { detectPlatform, useHotkeyRecorder } from '@tanstack/react-hotkeys'
import { useI18n } from '@/i18n/useI18n'
import { formatShortcutList, type ShortcutActionId, type ShortcutBindings } from '@/logic/shortcuts'
import {
  SettingsActionButton,
  SettingsField,
  SettingsIconButton,
} from '@/components/settings/SettingsRow'

type ShortcutRecorderRowProps = {
  action: ShortcutActionId
  label: string
  bindings: string[]
  defaultBindings: string[]
  conflictLabels?: string[]
  overrides: ShortcutBindings
  onChange: (action: ShortcutActionId, bindings: string[] | null) => void
}

const ShortcutRecorderRow = ({
  action,
  label,
  bindings,
  defaultBindings,
  conflictLabels,
  overrides,
  onChange,
}: ShortcutRecorderRowProps) => {
  const { t } = useI18n()
  const platform = detectPlatform()
  const hasOverride = Object.prototype.hasOwnProperty.call(overrides, action)
  const recorder = useHotkeyRecorder({
    ignoreInputs: false,
    onRecord: (hotkey) => {
      onChange(action, hotkey ? [hotkey] : [])
    },
  })
  const display = recorder.isRecording
    ? t('shortcuts.recording')
    : formatShortcutList(bindings, platform)
  const defaultDisplay = formatShortcutList(defaultBindings, platform)
  const hasConflict = Boolean(conflictLabels && conflictLabels.length > 0)
  const conflictDescription = hasConflict
    ? t('shortcuts.conflict', { actions: conflictLabels?.join(', ') })
    : ''

  const description = (
    <>
      <span>
        {hasOverride
          ? t('shortcuts.defaultValue', { value: defaultDisplay })
          : t('shortcuts.default')}
      </span>
      {hasConflict && (
        <span className="settings-shortcut-conflict mt-1 flex items-start gap-1.5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{conflictDescription}</span>
        </span>
      )}
    </>
  )

  return (
    <SettingsField
      title={label}
      description={description}
      className="settings-shortcut-row"
      control={
        <div
          className="flex min-w-0 items-center justify-end gap-1.5"
          data-marklab-shortcut-recorder="true"
        >
          <SettingsActionButton
            variant={recorder.isRecording ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 min-w-[112px] max-w-full justify-center rounded-md font-mono text-xs"
            onClick={recorder.startRecording}
          >
            {display}
          </SettingsActionButton>
          <SettingsIconButton
            variant="ghost"
            size="icon"
            className="size-8 rounded-md"
            disabled={bindings.length === 0}
            aria-label={t('shortcuts.clear')}
            onClick={() => onChange(action, [])}
          >
            <Trash2 />
          </SettingsIconButton>
          <SettingsIconButton
            variant="ghost"
            size="icon"
            className="size-8 rounded-md"
            disabled={!hasOverride}
            aria-label={t('shortcuts.reset')}
            onClick={() => onChange(action, null)}
          >
            <RotateCcw />
          </SettingsIconButton>
        </div>
      }
    />
  )
}

export default ShortcutRecorderRow
