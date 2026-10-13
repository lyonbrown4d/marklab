import { expect, type Locator } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const createStatisticsDocument = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'marklab-statistics-'))
  const file = path.join(directory, 'Statistics.md')
  fs.writeFileSync(file, '')
  return { file, dispose: () => fs.rmSync(directory, { recursive: true, force: true }) }
}

export const expectCenteredInViewport = async (dialog: Locator) => {
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        const box = element.getBoundingClientRect()
        return Math.max(
          Math.abs(box.x - (window.innerWidth - box.width) / 2),
          Math.abs(box.y - (window.innerHeight - box.height) / 2),
        )
      }),
    )
    .toBeLessThanOrEqual(1)
}
