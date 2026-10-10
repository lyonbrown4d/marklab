import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {} }))

import { createInitialNativeOpenPresentationGate } from '@electron/main/singleInstance'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

describe('initial native-open presentation gate ordering', () => {
  it('ignores a superseded gate and presents only when the active gate settles', async () => {
    const present = vi.fn()
    const gate = createInitialNativeOpenPresentationGate(present)
    const superseded = deferred()
    const active = deferred()
    gate.holdUntil(superseded.promise)
    gate.holdUntil(active.promise)
    gate.requestPresentation()

    superseded.resolve()
    await superseded.promise
    await Promise.resolve()
    expect(present).not.toHaveBeenCalled()

    active.resolve()
    await active.promise
    await Promise.resolve()
    expect(present).toHaveBeenCalledOnce()
  })

  it('settles silently when presentation was never requested', async () => {
    const present = vi.fn()
    const gate = createInitialNativeOpenPresentationGate(present)
    const active = deferred()
    gate.holdUntil(active.promise)

    active.resolve()
    await active.promise
    await Promise.resolve()

    expect(present).not.toHaveBeenCalled()
  })
})
