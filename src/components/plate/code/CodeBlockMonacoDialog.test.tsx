import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CodeBlockMonacoDialog from '@/components/plate/code/CodeBlockMonacoDialog'

const monacoState = vi.hoisted(() => ({ error: null as unknown, ready: false }))
vi.mock('@/components/source-code/useConfiguredMonaco', () => ({
  useConfiguredMonaco: () => monacoState,
}))
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea aria-label="Code" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}))

const renderDialog = () => {
  const onApply = vi.fn()
  const onCancel = vi.fn()
  return {
    ...render(
      <CodeBlockMonacoDialog
        applyLabel="Apply"
        cancelLabel="Cancel"
        description="Edit source"
        language="typescript"
        loadingLabel="Loading code"
        source="const value = 1"
        title="Code editor"
        onApply={onApply}
        onCancel={onCancel}
      />,
    ),
    onApply,
    onCancel,
  }
}

describe('CodeBlockMonacoDialog', () => {
  beforeEach(() => {
    monacoState.error = null
    monacoState.ready = false
  })

  it('announces one document loading state, gates apply and preserves cancel', () => {
    const { onCancel } = renderDialog()
    const status = screen.getByRole('status', { name: 'Loading code' })
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status.querySelectorAll('[data-splash-line]')).toHaveLength(3)
    expect(status.querySelector('[data-document-loading]')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('shows configuration failures without a busy state', () => {
    monacoState.error = new Error('Code editor unavailable')
    const { container } = renderDialog()
    expect(screen.getByRole('alert')).toHaveTextContent('Code editor unavailable')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
  })

  it('applies edited content once the editor is ready', () => {
    monacoState.ready = true
    const { onApply } = renderDialog()
    fireEvent.change(screen.getByRole('textbox', { name: 'Code' }), {
      target: { value: 'const value = 2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledWith('const value = 2')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
