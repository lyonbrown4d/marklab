import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  scheduleMarkdownEditorCreate,
  scheduleMicrotask,
} from '@/components/milkdown/markdownCrepeScheduling'

const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
const flushFrame = () => {
  const pending = [...frames.values()]
  frames.clear()
  pending.forEach((callback) => callback(0))
}

beforeEach(() => {
  frames.clear()
  vi.useFakeTimers()
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = ++frameId
    frames.set(id, callback)
    return id
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id)
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Crepe creation scheduling', () => {
  it('creates a small document on the next frame', () => {
    const task = vi.fn()
    scheduleMarkdownEditorCreate('note', task)
    expect(task).not.toHaveBeenCalled()
    flushFrame()
    expect(task).toHaveBeenCalledOnce()
  })
  it('cancels a small document before its frame', () => {
    const task = vi.fn()
    const cancel = scheduleMarkdownEditorCreate('note', task)
    cancel()
    flushFrame()
    expect(task).not.toHaveBeenCalled()
  })
  it('defers a large document across two frames and a timer', () => {
    const task = vi.fn()
    scheduleMarkdownEditorCreate('x'.repeat(30_001), task)
    flushFrame()
    flushFrame()
    expect(task).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(task).toHaveBeenCalledOnce()
  })
  it.each([0, 1, 2])('cancels a large document after %i frames', (count) => {
    const task = vi.fn()
    const cancel = scheduleMarkdownEditorCreate('x'.repeat(30_001), task)
    for (let index = 0; index < count; index += 1) flushFrame()
    cancel()
    flushFrame()
    flushFrame()
    vi.runAllTimers()
    expect(task).not.toHaveBeenCalled()
  })
  it('falls back to a Promise when queueMicrotask is unavailable', async () => {
    vi.stubGlobal('queueMicrotask', undefined)
    const task = vi.fn()
    scheduleMicrotask(task)
    expect(task).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(task).toHaveBeenCalledOnce()
  })
})
