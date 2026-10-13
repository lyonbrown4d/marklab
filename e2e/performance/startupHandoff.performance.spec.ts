import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
// eslint-disable-next-line no-restricted-imports -- Native verification shares the isolated renderer server.
import {
  closeElectronTestSession,
  closeRendererServer,
  repoRoot,
  startRendererServer,
} from '../electron/electronTestHarness.js'

for (const mode of ['built', 'development'] as const) {
  // eslint-disable-next-line no-empty-pattern -- This test controls native Electron, not a browser fixture.
  test(`reveals the ready workspace after splash (${mode}) and preserves native bounds`, async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'native-gpu')
    const renderer = await startRendererServer()
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-handoff-'))
    let app: ElectronApplication | undefined
    let development: ViteDevServer | undefined
    let releaseEntry: () => void = () => undefined
    let entryRequested: () => void = () => undefined
    const entryGate = new Promise<void>((resolve) => {
      releaseEntry = resolve
    })
    const entrySeen = new Promise<void>((resolve) => {
      entryRequested = resolve
    })
    const html = await fs.readFile(path.join(repoRoot, 'dist/index.html'), 'utf8')
    const entryPath =
      mode === 'development'
        ? '/src/main.tsx'
        : new URL(html.match(/src="([^"]+\.js)"/)![1], renderer.url).pathname
    const builtServe = renderer.server.listeners('request')[0] as http.RequestListener
    renderer.server.removeListener('request', builtServe)
    if (mode === 'development') {
      development = await createServer({
        mode: 'perf',
        server: { middlewareMode: true, hmr: false },
      })
    }
    const serve: http.RequestListener = development
      ? (request, response) => development!.middlewares(request, response)
      : builtServe
    renderer.server.on('request', (request, response) => {
      if (new URL(request.url ?? '/', renderer.url).pathname === entryPath) {
        entryRequested()
        void entryGate.then(() => serve(request, response))
      } else serve(request, response)
    })
    try {
      const env: Record<string, string> = {}
      for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC']) {
        if (process.env[key]) env[key] = process.env[key]!
      }
      app = await electron.launch({
        args: [
          `--user-data-dir=${path.join(root, 'user-data')}`,
          path.join(repoRoot, 'dist-electron/main.js'),
        ],
        cwd: repoRoot,
        env: {
          ...env,
          HOME: root,
          USERPROFILE: root,
          APPDATA: path.join(root, 'appdata'),
          LOCALAPPDATA: path.join(root, 'localappdata'),
          XDG_CONFIG_HOME: path.join(root, 'appdata'),
          XDG_CACHE_HOME: path.join(root, 'cache'),
          TEMP: root,
          TMP: root,
          VITE_DEV_SERVER_URL: renderer.url,
        },
      })
      let entryTimeout: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          entrySeen,
          new Promise((_, reject) => {
            entryTimeout = setTimeout(
              () => reject(new Error('Renderer entry not requested')),
              15_000,
            )
          }),
        ])
      } finally {
        clearTimeout(entryTimeout)
      }
      const probe = await app.evaluateHandle(({ BrowserWindow, systemPreferences }, url) => {
        const windows = BrowserWindow.getAllWindows()
        const main = windows.find(
          (window) => window.webContents.getURL() === new URL(url).toString(),
        )
        const splash = windows.find((window) =>
          window.webContents.getURL().endsWith('splashscreen.html'),
        )
        if (!main || !splash) throw new Error('Expected native startup windows')
        const data = {
          initialMainVisible: main.isVisible(),
          initialSplashVisible: splash.isVisible(),
          initialBounds: main.getBounds(),
          finalBounds: main.getBounds(),
          mainShownAt: null as number | null,
          splashClosedAt: null as number | null,
          mainVisibleAtSplashClose: false,
          opacityAtSplashClose: null as number | null,
          animationSettings: systemPreferences.getAnimationSettings(),
          opacitySamples: [] as Array<{ elapsedMs: number; opacity: number }>,
        }
        let interval: ReturnType<typeof setInterval> | undefined
        main.once('show', () => {
          data.mainShownAt = Date.now()
          if (process.platform !== 'linux') {
            interval = setInterval(() => {
              if (!main.isDestroyed())
                data.opacitySamples.push({
                  elapsedMs: Date.now() - data.mainShownAt!,
                  opacity: main.getOpacity(),
                })
            }, 16)
          }
        })
        splash.once('closed', () => {
          clearInterval(interval)
          data.splashClosedAt = Date.now()
          if (!main.isDestroyed()) {
            data.mainVisibleAtSplashClose = main.isVisible()
            data.opacityAtSplashClose = process.platform === 'linux' ? null : main.getOpacity()
            data.finalBounds = main.getBounds()
          }
        })
        main.once('closed', () => clearInterval(interval))
        return data
      }, renderer.url)
      const before = await probe.jsonValue()
      expect(before.initialMainVisible).toBe(false)
      expect(before.initialSplashVisible).toBe(true)
      const splashPage = app.windows().find((page) => page.url().endsWith('splashscreen.html'))!
      await splashPage.screenshot({ path: testInfo.outputPath('01-splash.png') })
      // CSS reduction stops all document motion without removing its loading feedback.
      await splashPage.emulateMedia({ reducedMotion: 'reduce' })
      const reduced = await splashPage.locator('[data-splash-line]').evaluateAll((lines) =>
        lines.map((line) => ({
          animation: getComputedStyle(line).animationName,
          transform: getComputedStyle(line).transform,
        })),
      )
      expect(reduced).toHaveLength(3)
      for (const line of reduced) expect(line.animation).toBe('none')
      await splashPage.emulateMedia({ reducedMotion: 'no-preference' })
      const page = app
        .windows()
        .find((candidate) => candidate.url() === new URL(renderer.url).toString())!
      await page.evaluate(() => {
        const timeline: Array<{ type: string; at: number; animation: string; duration: string }> =
          []
        const tracked = window as typeof window & { handoffTimeline: typeof timeline }
        tracked.handoffTimeline = timeline
        for (const type of ['animationstart', 'animationend']) {
          document.addEventListener(
            type,
            (event) => {
              const animation = event as AnimationEvent
              if (animation.animationName !== 'window-presentation-enter') return
              timeline.push({
                type,
                at: Date.now(),
                animation: animation.animationName,
                duration: getComputedStyle(animation.target as Element).animationDuration,
              })
            },
            true,
          )
        }
      })
      releaseEntry()
      await expect.poll(() => probe.evaluate((data) => data.splashClosedAt)).not.toBeNull()
      const result = await probe.jsonValue()
      expect(result.mainShownAt).not.toBeNull()
      expect(result.mainShownAt!).toBeLessThanOrEqual(result.splashClosedAt!)
      expect(result.mainVisibleAtSplashClose).toBe(true)
      expect(result.finalBounds).toEqual(result.initialBounds)
      if (process.platform !== 'linux') expect(result.opacityAtSplashClose).toBe(1)
      await expect(page.getByTestId('markdown-editor')).toHaveAttribute('data-state', 'ready')
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window as typeof window & { handoffTimeline: Array<{ type: string }> }
              ).handoffTimeline.filter((event) => event.type === 'animationend').length,
          ),
        )
        .toBe(1)
      const contentMotion = await page.evaluate(
        () =>
          (
            window as typeof window & {
              handoffTimeline: Array<{ type: string; at: number; duration: string }>
            }
          ).handoffTimeline,
      )
      expect(contentMotion.map((event) => event.type)).toEqual(['animationstart', 'animationend'])
      expect(contentMotion[0].duration).toBe('0.26s')
      expect(contentMotion[0].at).toBeGreaterThanOrEqual(result.splashClosedAt!)
      expect(contentMotion[1].at - contentMotion[0].at).toBeGreaterThanOrEqual(220)
      await page.screenshot({ path: testInfo.outputPath('02-main.png') })
      await fs.writeFile(
        testInfo.outputPath('native-handoff.json'),
        JSON.stringify({ mode, ...result, contentMotion }, null, 2),
      )
      await testInfo.attach('native-handoff', {
        path: testInfo.outputPath('native-handoff.json'),
        contentType: 'application/json',
      })
      await probe.dispose()
    } finally {
      releaseEntry()
      if (app) await closeElectronTestSession({ app, testRunRoot: root })
      else await fs.rm(root, { recursive: true, force: true })
      await closeRendererServer(renderer.server)
      await development?.close()
    }
  })
}
