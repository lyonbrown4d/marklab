import { describe, expect, it, vi } from 'vitest'
import { plantumlApi } from '@/services/plantumlApi'
import { invoke } from '@/runtime/ipc'

vi.mock('@/runtime/ipc', () => ({ invoke: vi.fn() }))
const result = {
  engineVersion: 'puml-0.2.6',
  pages: [{ url: `marklab-asset://local/v1/${'a'.repeat(43)}`, expires_at_ms: 1000 }],
  warnings: [],
}

describe('plantumlApi', () => {
  it('validates native preview capabilities and keeps source text unchanged', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(result)
    const source = '@startuml\nAlice -> Bob: 你好\n@enduml'
    expect(await plantumlApi.render(source, new AbortController().signal)).toEqual(result)
    expect(invoke).toHaveBeenLastCalledWith('plantuml_render', {
      requestId: expect.any(String),
      source,
    })
    vi.mocked(invoke).mockResolvedValueOnce({
      ...result,
      pages: [{ url: 'https://example.com/unsafe.svg', expires_at_ms: 1000 }],
    })
    await expect(plantumlApi.render(source, new AbortController().signal)).rejects.toThrow()
  })

  it('cancels abandoned work and never applies a late response', async () => {
    const abort = new AbortController()
    let complete: (value: unknown) => void = () => undefined
    vi.mocked(invoke).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    vi.mocked(invoke).mockResolvedValueOnce(undefined)
    const pending = plantumlApi.render('Alice -> Bob', abort.signal)
    abort.abort()
    complete(result)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(invoke).toHaveBeenLastCalledWith('plantuml_cancel', { requestId: expect.any(String) })
  })

  it('preserves native errors and avoids submitting an already cancelled request', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Unsupported syntax'))
    await expect(plantumlApi.render('invalid', new AbortController().signal)).rejects.toThrow(
      'Unsupported syntax',
    )
    vi.mocked(invoke).mockClear()
    await expect(plantumlApi.render('invalid', AbortSignal.abort())).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(invoke).not.toHaveBeenCalled()
  })
})
