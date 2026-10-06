import { expect, type Page, type TestInfo } from '@playwright/test'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers are colocated outside application aliases.
import type { ElectronTestSession } from './electronTestHarness.js'

export type RuntimeDiagnostics = { consoleErrors: string[]; pageErrors: string[] }

export const monitorRuntime = (session: ElectronTestSession): RuntimeDiagnostics => {
  const diagnostics: RuntimeDiagnostics = { consoleErrors: [], pageErrors: [] }
  const monitorPage = (page: Page) => {
    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => diagnostics.pageErrors.push(error.stack ?? error.message))
  }
  session.app.windows().forEach(monitorPage)
  session.app.on('window', monitorPage)
  return diagnostics
}

export const attachDiagnostics = async (
  session: ElectronTestSession,
  diagnostics: RuntimeDiagnostics,
  testInfo: TestInfo,
) => {
  await testInfo.attach('electron-output.txt', {
    body: session.output.join('\n') || '(no Electron process output)',
    contentType: 'text/plain',
  })
  await testInfo.attach('renderer-errors.json', {
    body: JSON.stringify(diagnostics, null, 2),
    contentType: 'application/json',
  })
}

export const assertNoRuntimeErrors = (diagnostics: RuntimeDiagnostics) => {
  expect(
    diagnostics.pageErrors,
    `Uncaught renderer errors:\n${diagnostics.pageErrors.join('\n')}`,
  ).toHaveLength(0)
  expect(
    diagnostics.consoleErrors,
    `Console errors:\n${diagnostics.consoleErrors.join('\n')}`,
  ).toHaveLength(0)
}
