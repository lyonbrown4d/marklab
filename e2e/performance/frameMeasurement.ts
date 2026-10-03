import type { Page } from '@playwright/test'
// eslint-disable-next-line no-restricted-imports -- Performance E2E helpers are Node-run siblings.
import { startFrameProbe, stopFrameProbe } from './frameProbe.js'

const waitForAnimationFrames = async (page: Page, count: number) => {
  await page.evaluate(
    (frameCount) =>
      new Promise<void>((resolve) => {
        let remaining = frameCount
        const tick = () => {
          remaining -= 1
          if (remaining <= 0) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    count,
  )
}

export const measureFrames = async (
  page: Page,
  interaction: () => Promise<void>,
  minimumFrameCount = 12,
) => {
  await startFrameProbe(page)
  await interaction()
  await waitForAnimationFrames(page, minimumFrameCount)
  return stopFrameProbe(page)
}
