import { act, renderHook } from '@testing-library/react'
import { createPlateEditor } from 'platejs/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlateDocumentFindMatches } from '@/components/plate/usePlateDocumentFindMatches'
import { PlateDocumentFindWorkerClient } from '@/services/plateDocumentFindWorkerClient'
import { createComlinkTestWorker } from '@/test/comlinkTestWorker'
import type {
  PlateDocumentFindWorkerMatch,
  PlateDocumentFindWorkerScan,
} from '@/workers/plateDocumentFindWorkerProtocol'

const createDeferredWorker = () => {
  let respond!: (matches: PlateDocumentFindWorkerMatch[]) => void
  let started!: (request: PlateDocumentFindWorkerScan) => void
  const request = new Promise<PlateDocumentFindWorkerScan>((resolve) => {
    started = resolve
  })
  const { worker } = createComlinkTestWorker({
    scan: (input: PlateDocumentFindWorkerScan) => {
      started(input)
      return new Promise<PlateDocumentFindWorkerMatch[]>((resolve) => {
        respond = resolve
      })
    },
  })
  return { worker, request, respond: (matches: PlateDocumentFindWorkerMatch[]) => respond(matches) }
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
    const workers: ReturnType<typeof createDeferredWorker>[] = []
    const client = new PlateDocumentFindWorkerClient(() => {
      const next = createDeferredWorker()
      workers.push(next)
      return next.worker
    })
    const hook = renderHook(
      ({ active, query }) =>
        usePlateDocumentFindMatches(editor, query, regexOptions, 1, active, client),
      { initialProps: { active: true, query: 'alpha' } },
    )
    expect(workers).toHaveLength(1)
    const firstSource = (await workers[0]!.request).source

    hook.rerender({ active: true, query: 'beta' })
    expect(workers[0]!.worker.terminate).toHaveBeenCalledOnce()
    expect(workers).toHaveLength(2)
    expect((await workers[1]!.request).source).toEqual(firstSource)
    act(() => workers[0]!.respond([match('stale')]))
    await act(async () => {
      workers[1]!.respond([match('beta')])
      await new Promise((resolve) => setImmediate(resolve))
    })
    expect(hook.result.current.matches[0]?.regex?.match).toBe('beta')

    hook.rerender({ active: false, query: 'beta' })
    act(() => vi.runOnlyPendingTimers())
    expect(workers[1]!.worker.terminate).toHaveBeenCalledOnce()

    hook.rerender({ active: true, query: 'gamma' })
    expect(workers).toHaveLength(3)
    await act(async () => {
      await workers[2]!.request
      workers[2]!.respond([match('gamma')])
      await new Promise((resolve) => setImmediate(resolve))
    })
    expect(hook.result.current.matches[0]?.regex?.match).toBe('gamma')

    hook.rerender({ active: false, query: '' })
    act(() => vi.runOnlyPendingTimers())
    workers.forEach(({ worker }) => expect(worker.terminate).toHaveBeenCalledOnce())
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
    const testWorker = createDeferredWorker()
    const client = new PlateDocumentFindWorkerClient(() => testWorker.worker)
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

    await testWorker.request
    hook.rerender(next)
    expect(testWorker.worker.terminate).toHaveBeenCalledOnce()
    act(() => testWorker.respond([match('stale')]))
    await act(async () => Promise.resolve())
    expect(hook.result.current.matches).toHaveLength(expectedMatches)
    expect(hook.result.current.matches[0]?.regex).toBeUndefined()
    hook.unmount()
  })
})
