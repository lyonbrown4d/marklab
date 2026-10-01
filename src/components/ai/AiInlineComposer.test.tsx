import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AiInlineComposer } from '@/components/ai/AiInlineComposer'

const labels = {
  accept: 'Accept',
  abandon: 'Abandon',
  concise: 'Make concise',
  dialog: 'AI writing assistant',
  diff: 'AI proposal diff',
  explain: 'Explain',
  findingModel: 'Finding model…',
  generate: 'Generate',
  instruction: 'AI instruction',
  placeholder: 'Tell AI what to change…',
  retry: 'Try again',
  rewrite: 'Rewrite',
  stop: 'Stop generation',
}

const baseProps = {
  anchor: { left: 24, top: 48 },
  error: null,
  instruction: '',
  labels,
  modelLabel: 'OpenAI · gpt-5-mini',
  onAccept: vi.fn(),
  onDismiss: vi.fn(),
  onInstructionChange: vi.fn(),
  onQuickAction: vi.fn(),
  onRetry: vi.fn(),
  onStop: vi.fn(),
  onSubmit: vi.fn(),
  phase: 'prompt' as const,
  proposal: '',
  sourceText: 'Original words',
}

describe('AiInlineComposer', () => {
  it('submits with Enter, closes with Escape, and exposes quick actions', () => {
    const onSubmit = vi.fn()
    const onDismiss = vi.fn()
    render(
      <AiInlineComposer
        {...baseProps}
        instruction="Make this clearer"
        onDismiss={onDismiss}
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByRole('textbox', { name: labels.instruction })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('Make this clearer')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: labels.concise }))
    expect(baseProps.onQuickAction).toHaveBeenCalledWith('concise')
  })

  it('shows a visible stop action while output is streaming', () => {
    const onStop = vi.fn()
    render(
      <AiInlineComposer
        {...baseProps}
        phase="streaming"
        proposal="A partial answer"
        onStop={onStop}
      />,
    )

    expect(screen.getByText('A partial answer')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: labels.stop }))
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('renders a text-only diff with accept, abandon, and retry actions', () => {
    render(
      <AiInlineComposer
        {...baseProps}
        phase="proposal"
        proposal={'<img src=x onerror="alert(1)"> Clear words'}
      />,
    )

    expect(screen.getByLabelText(labels.diff)).toHaveTextContent(
      '<img src=x onerror="alert(1)"> Clear words',
    )
    expect(document.querySelector('img')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: labels.accept }))
    fireEvent.click(screen.getByRole('button', { name: labels.abandon }))
    fireEvent.click(screen.getByRole('button', { name: labels.retry }))
    expect(baseProps.onAccept).toHaveBeenCalled()
    expect(baseProps.onDismiss).toHaveBeenCalled()
    expect(baseProps.onRetry).toHaveBeenCalled()
  })

  it('announces provider and request errors without losing the prompt', () => {
    render(
      <AiInlineComposer
        {...baseProps}
        phase="error"
        instruction="Keep this instruction"
        error="请先配置 AI 提供商"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('请先配置 AI 提供商')
    expect(screen.getByRole('textbox')).toHaveValue('Keep this instruction')
  })

  it('handles Escape from the whole panel and focuses stop while pending', () => {
    const onDismiss = vi.fn()
    const { rerender } = render(
      <AiInlineComposer {...baseProps} onDismiss={onDismiss} phase="prompt" />,
    )
    fireEvent.keyDown(screen.getByRole('button', { name: labels.rewrite }), { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledOnce()

    rerender(<AiInlineComposer {...baseProps} onDismiss={onDismiss} phase="streaming" />)
    expect(screen.getByRole('button', { name: labels.stop })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: labels.stop }))
    expect(baseProps.onStop).toHaveBeenCalled()
  })
})
