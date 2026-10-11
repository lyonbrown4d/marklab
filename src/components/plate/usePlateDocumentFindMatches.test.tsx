import { act, renderHook } from '@testing-library/react'
import { createPlateEditor } from 'platejs/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlateDocumentFindMatches } from '@/components/plate/usePlateDocumentFindMatches'
import {
  PlateDocumentFindWorkerClient,
  type PlateDocumentFindWorkerPort,
} from '@/services/plateDocumentFindWorkerClient'

class FakeWorker implements PlateDocumentFindWorkerPort {
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  readonly sent: Array<{ id: number; query: string; source: unknown }> = []
  terminated = false

  postMessage(message: unknown) {
    this.sent.push(message as { id: number; query: string; source: unknown })
  }

  terminate() {
    this.terminated = true
  }

  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent<unknown>)
  }
}

const regexOptions = { matchCase: false, useRegex: true as const, wholeWord: false }
const match = (text: string) => ({
  anchor: { offset: 0, path: [0, 0] },
  focus: { offset: text.length, path: [0, 0] },
  regex: { captures: [], groups: {}, match: text, prefix: '', suffix: '' },
})

describe('usePlateDocumentFindMatches worker lifecycle', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['clearTimeout', 'setTimeout'] }))
  afterEach(() => vi.useRealTimers())

  it('releases a keep-alive tab worker after idle and lazily recreates it without stale results', async () => {
    const editor = createPlateEditor({
      value: [{ children: [{ text: 'alpha beta gamma' }], type: 'p' }],
    })
    const workers: FakeWorker[] = []
    const client = new PlateDocumentFindWorkerClient(() => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    })
    const hook = renderHook(
      ({ active, query }) =>
        usePlateDocumentFindMatches(editor, query, regexOptions, 1, active, client),
      { initialProps: { active: true, query: 'alpha' } },
    )
    expect(workers).toHaveLength(1)
    const firstSource = workers[0]!.sent[0]!.source

    hook.rerender({ active: true, query: 'beta' })
    expect(workers[0]!.terminated).toBe(true)
    expect(workers).toHaveLength(2)
    expect(workers[1]!.sent[0]!.source).toBe(firstSource)
    act(() => workers[0]!.emit({ id: 1, matches: [match('stale')], ok: true }))
    await act(async () => {
      workers[1]!.emit({ id: 2, matches: [match('beta')], ok: true })
      await Promise.resolve()
    })
    expect(hook.result.current.matches[0]?.regex?.match).toBe('beta')

    hook.rerender({ active: false, query: 'beta' })
    act(() => vi.runOnlyPendingTimers())
    expect(workers[1]!.terminated).toBe(true)

    hook.rerender({ active: true, query: 'gamma' })
    expect(workers).toHaveLength(3)
    await act(async () => {
      workers[2]!.emit({ id: 3, matches: [match('gamma')], ok: true })
      await Promise.resolve()
    })
    expect(hook.result.current.matches[0]?.regex?.match).toBe('gamma')

    hook.rerender({ active: false, query: '' })
    act(() => vi.runOnlyPendingTimers())
    expect(workers.every((worker) => worker.terminated)).toBe(true)
    hook.unmount()
  })

  it.each([
    ['the find surface closes', { active: false, query: 'alpha', useRegex: true }, 0],
    ['the query is cleared', { active: true, query: '', useRegex: true }, 0],
    ['regex mode is disabled', { active: true, query: 'alpha', useRegex: false }, 1],
  ])('cancels a pending scan when %s', async (_, next, expectedMatches) => {
    const editor = createPlateEditor({
      value: [{ children: [{ text: 'alpha beta gamma' }], type: 'p' }],
    })
    const worker = new FakeWorker()
    const client = new PlateDocumentFindWorkerClient(() => worker)
    const hook = renderHook(
      ({ active, query, useRegex }) =>
        usePlateDocumentFindMatches(
          editor,
          query,
          { ...regexOptions, useRegex },
          1,
          active,
          client,
        ),
      { initialProps: { active: true, query: 'alpha', useRegex: true } },
    )

    hook.rerender(next)
    expect(worker.terminated).toBe(true)
    act(() => worker.emit({ id: 1, matches: [match('stale')], ok: true }))
    await act(async () => Promise.resolve())
    expect(hook.result.current.matches).toHaveLength(expectedMatches)
    expect(hook.result.current.matches[0]?.regex).toBeUndefined()
    hook.unmount()
  })
})
