import { expect, test } from '@playwright/test'
import type http from 'node:http'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers stay outside production bundles.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'

test.describe('Native window drag opacity', () => {
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined

  test.afterAll(async () => {
    await closeElectronTestSession(session)
    await closeRendererServer(server)
  })

  test('applies opacity in the real main window and restores after movement or interruption', async () => {
    test.skip(process.platform !== 'darwin' && process.platform !== 'win32')
    const renderer = await startRendererServer()
    server = renderer.server
    session = await launchElectronTestSession(renderer.url)
    const handle = await session.app.browserWindow(session.page)
    try {
      // Programmatic geometry changes must not activate manual-drag opacity.
      const initial = await handle.evaluate((window) => {
        const [x, y] = window.getPosition()
        window.setPosition(x + 10, y + 10)
        return window.getOpacity()
      })
      expect(initial).toBe(1)
      const dragging = await handle.evaluate((window) => {
        window.emit('will-move', {}, window.getBounds())
        window.emit('move')
        window.emit('moved')
        return window.getOpacity()
      })
      if (process.platform === 'darwin') {
        expect(dragging).toBeCloseTo(0.85, 2)
        await expect.poll(() => handle.evaluate((window) => window.getOpacity())).toBe(1)
      } else {
        expect(dragging).toBe(1)
      }
      const interrupted = await handle.evaluate((window) => {
        window.emit('will-move', {}, window.getBounds())
        const duringDrag = window.getOpacity()
        window.emit('blur')
        return { duringDrag, restored: window.getOpacity() }
      })
      expect(interrupted.duringDrag).toBeCloseTo(0.85, 2)
      expect(interrupted.restored).toBe(1)
      await expect(
        session.page.getByRole('button', { name: /^(Workspace|工作区):/i }),
      ).toBeVisible()
    } finally {
      await handle.dispose()
    }
  })
})
