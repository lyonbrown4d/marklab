import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MermaidPreview from '@/components/previews/MermaidPreview'

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }))

vi.mock('mermaid', () => ({ default: mermaid }))

describe('MermaidPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mermaid.initialize.mockReset()
    mermaid.render.mockReset().mockResolvedValue({
      svg: '<svg><text>Diagram</text></svg>',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lazily renders with strict security after the debounce', async () => {
    render(<MermaidPreview source={'graph TD\nA --> B'} />)

    expect(screen.getByText(/Loading diagram/)).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('Diagram')).toHaveTextContent('Diagram')
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: 'strict', startOnLoad: false }),
    )
  })

  it('shows a text-only error without injecting rejected content', async () => {
    mermaid.render.mockRejectedValueOnce(new Error('<img src=x onerror=alert(1)>'))
    render(<MermaidPreview source="invalid" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByRole('alert')).toHaveTextContent('<img src=x onerror=alert(1)>')
    expect(document.querySelector('img')).toBeNull()
  })
})
