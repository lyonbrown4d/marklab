import { act, fireEvent, render, screen } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { registerVimKeyboardScope } from '@/components/vim/vimKeyboardScope'
import type { VimCommandHandlers } from '@/components/vim/vimCommands'
import { executeVimCommand } from '@/components/vim/vimCommands'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CodeBlockMonacoDialog from '@/components/plate/code/CodeBlockMonacoDialog'

const state = vi.hoisted(() => ({
  createCommands: null as null | ((isCurrent: () => boolean) => VimCommandHandlers),
  value: '',
  flush: vi.fn(),
  enabled: true,
}))
vi.mock('@/app/editorCloseLifecycle', () => ({ flushEditorChanges: state.flush }))
vi.mock('@/components/source-code/useConfiguredMonaco', () => ({
  useConfiguredMonaco: () => ({ error: null, ready: true }),
}))
vi.mock('@/components/vim/useEditorVimMode', () => ({
  useCurrentTabVimModeEnabled: () => state.enabled,
}))
vi.mock('@/components/vim/useMonacoVim', () => ({
  useMonacoVim: ({
    createCommands,
    rootRef,
    enabled,
  }: {
    createCommands: typeof state.createCommands
    rootRef: { current: HTMLDivElement | null }
    enabled: boolean
  }) => {
    state.createCommands = createCommands
    useLayoutEffect(() => {
      if (enabled) rootRef.current?.setAttribute('data-vim-active', 'true')
      else rootRef.current?.removeAttribute('data-vim-active')
    }, [enabled, rootRef])
    return null
  },
}))
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
    state.value = value
    return (
      <textarea
        aria-label="Code"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  },
}))
const setup = () => {
  const onWrite = vi.fn()
  const onCancel = vi.fn()
  const onApply = vi.fn()
  render(
    <CodeBlockMonacoDialog
      applyLabel="Apply"
      cancelLabel="Cancel"
      description="Edit code"
      language="typescript"
      loadingLabel="Loading"
      source="old"
      title="Code editor"
      onWrite={onWrite}
      onCancel={onCancel}
      onApply={onApply}
    />,
  )
  const input = screen.getByRole('textbox', { name: 'Code' })
  const edit = () => fireEvent.change(input, { target: { value: 'new' } })
  const handlers = () => state.createCommands!(() => true)
  return { onWrite, onCancel, onApply, input, edit, handlers }
}

beforeEach(() => {
  state.enabled = true
  state.flush.mockReset().mockResolvedValue(undefined)
})

describe('Expanded code block Vim commands', () => {
  it('applies :w without closing, flushes persistence, and then allows :q', async () => {
    const { edit, handlers, onWrite, onCancel, onApply } = setup()
    edit()
    expect(() => handlers().quit()).toThrow()
    expect(onCancel).not.toHaveBeenCalled()
    await act(async () => {
      await executeVimCommand('write', handlers())
    })
    expect(onWrite).toHaveBeenCalledWith('new')
    expect(state.flush).toHaveBeenCalledOnce()
    expect(onApply).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
    await act(async () => {
      await executeVimCommand('quit', handlers())
    })
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('keeps unsaved edits open when persistence fails during :wq', async () => {
    const { edit, handlers, onWrite, onCancel } = setup()
    edit()
    state.flush.mockRejectedValue(new Error('Disk unavailable'))
    await expect(executeVimCommand('writeQuit', handlers())).rejects.toThrow('Disk unavailable')
    expect(onWrite).toHaveBeenCalledWith('new')
    expect(onCancel).not.toHaveBeenCalled()
    expect(() => handlers().quit()).toThrow()
  })

  it('applies and closes :wq in order', async () => {
    const { edit, handlers, onWrite, onCancel } = setup()
    edit()
    await act(async () => {
      await executeVimCommand('writeQuit', handlers())
    })
    expect(onWrite).toHaveBeenCalledWith('new')
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onWrite.mock.invocationCallOrder[0]).toBeLessThan(onCancel.mock.invocationCallOrder[0])
  })

  it('keeps Escape inside the Vim editor and preserves dialog Escape when Vim is disabled', () => {
    const { input, onCancel } = setup()
    const region = input.parentElement!.parentElement!
    const releaseScope = registerVimKeyboardScope(region)
    input.focus()
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
    releaseScope()
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
