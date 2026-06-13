import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react'
import { detectPlatform, useHotkeyRecorder } from '@tanstack/react-hotkeys'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import { formatShortcutList, type ShortcutActionId, type ShortcutBindings } from '@/logic/shortcuts'

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

  return (
    <div className="grid grid-cols-1 gap-3 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {hasOverride
            ? t('shortcuts.defaultValue', { value: defaultDisplay })
            : t('shortcuts.default')}
        </div>
        {hasConflict && (
          <div className="mt-1 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{conflictDescription}</span>
          </div>
        )}
      </div>
      <div
        className="flex min-w-0 items-center justify-end gap-1.5"
        data-marklab-shortcut-recorder="true"
      >
        <Button
          variant={recorder.isRecording ? 'secondary' : 'outline'}
          size="sm"
          className="h-8 min-w-[112px] max-w-full justify-center rounded-md font-mono text-xs"
          onClick={recorder.startRecording}
        >
          {display}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-md"
          disabled={bindings.length === 0}
          aria-label={t('shortcuts.clear')}
          onClick={() => onChange(action, [])}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-md"
          disabled={!hasOverride}
          aria-label={t('shortcuts.reset')}
          onClick={() => onChange(action, null)}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

export default ShortcutRecorderRow
