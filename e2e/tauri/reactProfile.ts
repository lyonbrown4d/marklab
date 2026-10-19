import assert from 'node:assert/strict'
import { browser } from '@wdio/globals'

type Summary = {
  roots: number
  commits: number
  skippedCommits: number
  totalCommitMs: number
  p95CommitMs: number
  maxCommitMs: number
  components: Array<{
    name: string
    renders: number
    selfMs: number
    inclusiveMs: number
    maxSelfMs: number
  }>
}

declare global {
  interface Window {
    /** Supplied exclusively by the temporary official DevTools diagnostic bundle. */
    __MARKLAB_LOCAL_REACT_PROFILER__?: {
      status: () => { supportsProfiling: boolean; profiling: boolean }
      start: () => void
      stop: () => void
      read: () => Summary | null
    }
  }
}

export const startReactProfile = async () => {
  await browser.waitUntil(
    () =>
      browser.execute(
        () => window.__MARKLAB_LOCAL_REACT_PROFILER__?.status().supportsProfiling === true,
      ),
    { timeout: 20_000, timeoutMsg: 'Official React DevTools found no profiling-capable root' },
  )
  await browser.execute(() => window.__MARKLAB_LOCAL_REACT_PROFILER__?.start())
  await browser.waitUntil(
    () =>
      browser.execute(() => window.__MARKLAB_LOCAL_REACT_PROFILER__?.status().profiling === true),
    { timeout: 10_000, timeoutMsg: 'Official React DevTools did not begin recording' },
  )
}

export const stopReactProfile = async () => {
  await browser.execute(() => window.__MARKLAB_LOCAL_REACT_PROFILER__?.stop())
  await browser.waitUntil(
    () => browser.execute(() => window.__MARKLAB_LOCAL_REACT_PROFILER__?.read() != null),
    {
      timeout: 20_000,
      timeoutMsg: 'Official React DevTools did not finish processing the recording',
    },
  )
  const summary = await browser.execute(() => window.__MARKLAB_LOCAL_REACT_PROFILER__?.read())
  assert.ok(summary && summary.roots > 0)
  return summary
}
