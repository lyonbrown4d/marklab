import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ShortcutRecorderRow from '@/components/settings/ShortcutRecorderRow'
import type { ShortcutActionId, ShortcutBindings } from '@/logic/shortcuts'

const recorderMock = vi.hoisted(() => ({
  isRecording: false,
  startRecording: vi.fn(),
}))

vi.mock('@tanstack/react-hotkeys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-hotkeys')>()

  return {
    ...actual,
    detectPlatform: () => 'windows',
    useHotkeyRecorder: () => ({
      isRecording: recorderMock.isRecording,
      startRecording: recorderMock.startRecording,
    }),
  }
})

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const labels: Record<string, string> = {
        'shortcuts.clear': 'Clear shortcut',
        'shortcuts.conflict': `Conflicts with ${values?.actions ?? ''}`,
        'shortcuts.default': 'Default shortcut',
        'shortcuts.defaultValue': `Default: ${values?.value ?? ''}`,
        'shortcuts.recording': 'Recording shortcut',
        'shortcuts.reset': 'Reset shortcut',
      }

      return labels[key] ?? key
    },
  }),
}))

const action = 'commandPalette' as ShortcutActionId

const renderShortcutRecorderRow = (props?: {
  bindings?: string[]
  defaultBindings?: string[]
  conflictLabels?: string[]
  overrides?: ShortcutBindings
  onChange?: (action: ShortcutActionId, bindings: string[] | null) => void
}) => {
  const onChange = props?.onChange ?? vi.fn()

  render(
    <ShortcutRecorderRow
      action={action}
      label="Open Command Palette"
      bindings={props?.bindings ?? ['F1']}
      defaultBindings={props?.defaultBindings ?? ['F2']}
      conflictLabels={props?.conflictLabels}
      overrides={props?.overrides ?? ({ [action]: props?.bindings ?? ['F1'] } as ShortcutBindings)}
      onChange={onChange}
    />,
  )

  return { onChange }
}

describe('ShortcutRecorderRow', () => {
  beforeEach(() => {
    recorderMock.isRecording = false
    recorderMock.startRecording.mockReset()
  })

  it('labels shortcut controls with the action name and current value', async () => {
    const user = userEvent.setup()
    const { onChange } = renderShortcutRecorderRow()

    const recorder = screen.getByRole('button', { name: 'Open Command Palette, F1' })
    expect(recorder).toHaveAttribute('type', 'button')
    const descriptionId = recorder.getAttribute('aria-describedby')
    expect(descriptionId).toBeTruthy()
    expect(document.getElementById(descriptionId ?? '')).toHaveTextContent('Default: F2')

    await user.click(recorder)
    expect(recorderMock.startRecording).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Open Command Palette, Clear shortcut' }))
    expect(onChange).toHaveBeenCalledWith(action, [])

    await user.click(screen.getByRole('button', { name: 'Open Command Palette, Reset shortcut' }))
    expect(onChange).toHaveBeenCalledWith(action, null)
  })

  it('announces recording state through the recorder button name', () => {
    recorderMock.isRecording = true

    renderShortcutRecorderRow()

    const recorder = screen.getByRole('button', {
      name: 'Open Command Palette, Recording shortcut',
    })

    expect(recorder).toHaveAttribute('data-recording', 'true')
    expect(recorder).toHaveTextContent('Recording shortcut')
  })

  it('announces shortcut conflicts and disables unavailable actions', () => {
    renderShortcutRecorderRow({
      bindings: [],
      conflictLabels: ['Toggle Terminal'],
      overrides: {} as ShortcutBindings,
    })

    const conflict = screen.getByRole('alert')

    expect(conflict).toHaveTextContent('Conflicts with Toggle Terminal')
    expect(conflict).toHaveClass('settings-shortcut-conflict', 'text-destructive')
    expect(
      screen.getByRole('button', { name: 'Open Command Palette, Clear shortcut' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Open Command Palette, Reset shortcut' }),
    ).toBeDisabled()
  })
})
