import { expect, type Browser, type Page, type TestInfo } from '@playwright/test'
import type { DesktopRuntimeApi } from '@/runtime/desktop'
// eslint-disable-next-line no-restricted-imports -- Node-run test modules are colocated.
import { createFixtureBackend } from './fixtureBackend.js'
// eslint-disable-next-line no-restricted-imports -- Test-only SDK injection is not a production resource.
import { installNativeFixture } from './nativeFixture.js'
/* eslint-disable no-restricted-imports -- Reuse the existing browser-only production-renderer probes. */
import { installPlateReadyProbeInPage } from '../performance/plateReadyProbeBrowser.js'
import { waitForPlateReadyProbe } from '../performance/plateReadyProbe.js'
/* eslint-enable no-restricted-imports */

export const launchRendererSession = async (
  browser: Browser,
  url: string,
  root: string,
  file: string,
  allowedRoots = [root],
) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    colorScheme: 'light',
    serviceWorkers: 'block',
  })
  try {
    const page = await context.newPage()
    const errors: string[] = []
    const logs: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (logs.length < 1000) logs.push(`${message.type()}: ${message.text().slice(0, 2000)}`)
      if (message.type() === 'error' && errors.length < 100)
        errors.push(message.text().slice(0, 2000))
    })
    const backend = await createFixtureBackend(root, file, allowedRoots)
    const origin = new URL(url).origin
    await page.route('**/*', async (route) => {
      const request = new URL(route.request().url())
      if (request.protocol === 'marklab-asset:') {
        const body = await backend.assets.read(request.href).catch(() => null)
        return body
          ? route.fulfill({
              status: 200,
              body,
              contentType: 'text/plain; charset=utf-8',
              headers: { 'Access-Control-Allow-Origin': origin },
            })
          : route.abort('blockedbyclient')
      }
      return ['data:', 'blob:'].includes(request.protocol) || request.origin === origin
        ? route.continue()
        : route.abort('blockedbyclient')
    })
    await installNativeFixture(page, backend.invoke)
    await page.addInitScript(installPlateReadyProbeInPage)
    const navigationStartedAt = Date.now()
    await page.goto(url)
    const probe = await waitForPlateReadyProbe(page, 90_000)
    await expect(page.getByTestId('markdown-editor')).toHaveAttribute('data-state', 'ready')
    await expect
      .poll(() => backend.phases.some((signal) => signal.phase === 'workspace-interactive'))
      .toBe(true)
    return {
      backend,
      context,
      errors,
      logs,
      page,
      initialization: { ...probe, navigationToReadyMs: probe.readyAtEpochMs - navigationStartedAt },
    }
  } catch (error) {
    await context.close()
    throw error
  }
}

export type RendererSession = Awaited<ReturnType<typeof launchRendererSession>>

export const assertRendererHealthy = (session: RendererSession) => {
  expect(session.errors, 'production renderer emitted runtime errors').toEqual([])
  expect(
    session.backend.diagnostics.filter((entry) => entry.level === 'error'),
    'renderer reported an application error',
  ).toEqual([])
}

export const attachRendererDiagnostics = async (
  session: RendererSession,
  info: TestInfo,
  name = 'renderer-fixture-diagnostics',
) => {
  await info.attach(`${name}.json`, {
    body: JSON.stringify(
      {
        errors: session.errors,
        logs: session.logs,
        diagnostics: session.backend.diagnostics,
        readyPhases: session.backend.phases,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  })
}

export const flushRendererFixture = (page: Page) =>
  page.evaluate(async () => {
    const runtime: DesktopRuntimeApi | undefined = window.marklabTauri
    if (!runtime) throw new Error('Tauri renderer adapter was not initialized')
    return runtime.commands.invoke<number>('fs_flush_buffers')
  })
