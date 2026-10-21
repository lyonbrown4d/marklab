import { describe, expect, it, vi } from 'vitest'
import { plantumlApi } from '@/services/plantumlApi'
import { invoke } from '@/runtime/ipc'

// Native responses stay unknown so malformed-payload cases exercise runtime validation.
const nativeIpc = vi.hoisted(() => ({
  invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('@/runtime/ipc', () => nativeIpc)
const result = {
  engineVersion: 'puml-0.2.6',
  pages: [{ url: `marklab-asset://local/v1/${'a'.repeat(43)}`, expires_at_ms: 1000 }],
  warnings: [],
}

describe('plantumlApi', () => {
  it('validates native preview capabilities and keeps source text unchanged', async () => {
    nativeIpc.invoke.mockResolvedValueOnce(result)
    const source = '@startuml\nAlice -> Bob: 你好\n@enduml'
    expect(await plantumlApi.render(source, new AbortController().signal)).toEqual(result)
    expect(invoke).toHaveBeenLastCalledWith('plantuml_render', {
      requestId: expect.any(String),
      source,
    })
    nativeIpc.invoke.mockResolvedValueOnce({
      ...result,
      pages: [{ url: 'https://example.com/unsafe.svg', expires_at_ms: 1000 }],
    })
    await expect(plantumlApi.render(source, new AbortController().signal)).rejects.toThrow()
  })

  it('cancels abandoned work and never applies a late response', async () => {
    const abort = new AbortController()
    let complete: (value: unknown) => void = () => undefined
    nativeIpc.invoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    nativeIpc.invoke.mockResolvedValueOnce(undefined)
    const pending = plantumlApi.render('Alice -> Bob', abort.signal)
    abort.abort()
    complete(result)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(invoke).toHaveBeenLastCalledWith('plantuml_cancel', { requestId: expect.any(String) })
  })

  it('preserves native errors and avoids submitting an already cancelled request', async () => {
    nativeIpc.invoke.mockRejectedValueOnce(new Error('Unsupported syntax'))
    await expect(plantumlApi.render('invalid', new AbortController().signal)).rejects.toThrow(
      'Unsupported syntax',
    )
    nativeIpc.invoke.mockClear()
    await expect(plantumlApi.render('invalid', AbortSignal.abort())).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(invoke).not.toHaveBeenCalled()
  })
})
