import { expect, test } from '@playwright/test'
// eslint-disable-next-line no-restricted-imports -- Performance E2E helpers are Node-run siblings.
import { observeLocalHistoryRestore } from './localHistoryRestoreObserver.js'

test('observes the restore marker when loading starts and ends before observer delivery', async ({
  page,
}) => {
  const marker = 'RESTORED_MARKER'
  const selector = '[data-testid="restore-surface"]'
  await page.setContent(
    `<div data-testid="restore-surface" data-state="ready"><span>Current</span></div>`,
  )

  const observation = await observeLocalHistoryRestore({
    action: () =>
      page.evaluate((restoredMarker) => {
        const surface = document.querySelector<HTMLElement>('[data-testid="restore-surface"]')
        if (!surface) throw new Error('Missing restore surface')
        surface.dataset.state = 'loading'
        const content = surface.querySelector('span')
        if (!content) throw new Error('Missing restore content')
        content.textContent = restoredMarker
        surface.dataset.state = 'ready'
      }, marker),
    marker,
    page,
    selector,
    timeoutMs: 1_000,
  })

  expect(observation.markerObserved).toBe(true)
  expect(observation.initialState).toBe('ready')
  expect(observation.finalState).toBe('ready')
  expect(observation.stateMutationCount).toBe(2)
  expect(observation.durationMs).toBeGreaterThanOrEqual(0)
  await expect(page.locator(selector)).toHaveAttribute('data-state', 'ready')
})
