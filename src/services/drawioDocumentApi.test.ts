import { expect, it, vi } from 'vitest'
import { createDrawioDocumentSession } from '@/services/drawioDocumentApi'
import { fsApi } from '@/services/fsApi'
vi.mock('@/services/fsApi', () => ({ fsApi: { updateBuffer: vi.fn(), flushBuffers: vi.fn() } }))

it('keeps diagram revisions independent across editors and serializes their own saves', async () => {
  const first = createDrawioDocumentSession('workspace', 'diagram.drawio')
  const second = createDrawioDocumentSession('workspace', 'diagram.drawio')
  const loaded = {
    path: 'diagram.drawio',
    content: '<old/>',
    revision: 0,
    dirty: false,
    session_generation: 2,
  }
  first.seed(loaded)
  second.seed(loaded)
  vi.mocked(fsApi.updateBuffer).mockImplementation(async (path, _xml, status) => {
    if (status.revision === 0 && vi.mocked(fsApi.updateBuffer).mock.calls.length > 1)
      throw new Error('Document changed in another editor')
    return { path, revision: status.revision + 1, dirty: true, session_generation: 2 }
  })
  await first.save('<first/>', false)
  await expect(second.save('<stale/>', false)).rejects.toThrow(/another editor/)
  await expect(second.save('<still-stale/>', false)).rejects.toThrow(/another editor/)
  expect(fsApi.updateBuffer).toHaveBeenCalledTimes(2)
  await first.save('<next/>', false)
  expect(vi.mocked(fsApi.updateBuffer).mock.calls[2]?.[2].revision).toBe(1)
})

it('does not replace a freshly loaded revision with a late acknowledgement', async () => {
  let finish!: (status: Awaited<ReturnType<typeof fsApi.updateBuffer>>) => void
  vi.mocked(fsApi.updateBuffer)
    .mockReset()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
  const session = createDrawioDocumentSession('workspace', 'diagram.drawio')
  const snapshot = {
    path: 'diagram.drawio',
    content: '<loaded/>',
    revision: 0,
    dirty: false,
    session_generation: 2,
  }
  session.seed(snapshot)
  const saving = session.save('<old/>', false)
  await Promise.resolve()
  session.seed({ ...snapshot, content: '<fresh/>', revision: 2 })
  finish({ ...snapshot, revision: 1, dirty: true })
  await expect(saving).rejects.toThrow(/reloaded/)
  vi.mocked(fsApi.updateBuffer).mockResolvedValue({ ...snapshot, revision: 3, dirty: true })
  await session.save('<new/>', false)
  expect(vi.mocked(fsApi.updateBuffer).mock.calls[1]?.[2].revision).toBe(2)
})
